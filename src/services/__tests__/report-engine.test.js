import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportEngine } from '../report-engine.js';
import { JiraService } from '../jira.js';

vi.mock('../jira.js');

const SP_FIELD = 'customfield_10014';
const HOURS_PER_POINT = 4;

function makeConfig(overrides = {}) {
  return {
    domain: 'test.atlassian.net',
    myId: 'user-123',
    targetDate: '2026-04-08',
    baseDate: new Date(2026, 3, 9),
    spField: SP_FIELD,
    hoursPerPoint: HOURS_PER_POINT,
    ...overrides,
  };
}

function makeIssue(key, { summary, status, parentSummary, worklogs, sp } = {}) {
  return {
    key,
    fields: {
      summary: summary || `Task ${key}`,
      status: { name: status || 'In Progress' },
      parent: parentSummary ? { fields: { summary: parentSummary } } : null,
      worklog: {
        worklogs: worklogs || [],
      },
      timetracking: {},
      [SP_FIELD]: sp ?? 2,
    },
  };
}

function makeWorklog(accountId, started, timeSpentSeconds) {
  return {
    author: { accountId },
    started,
    timeSpentSeconds,
  };
}

describe('ReportEngine.generate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: pass issues through unchanged (no 20-cap fallback needed).
    JiraService.resolveWorklogsForDate.mockImplementation((_, issues) => Promise.resolve(issues));
  });

  it('categorizes first-time logged issues as "Done Yesterday"', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T09:00:00.000+0700', 3600),
    ];
    const logIssue = makeIssue('UP-1', { worklogs, status: 'QA READY', sp: 1 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [logIssue] })  // log query
      .mockResolvedValueOnce({ issues: [] });          // plan query

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Done Yesterday']).toHaveLength(1);
    expect(report['Done Yesterday'][0].Title).toBe('Task UP-1');
    expect(report['Progress Changed']).toHaveLength(0);
  });

  it('categorizes issues with prior logs as "Progress Changed"', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-07T09:00:00.000+0700', 3600), // previous day
      makeWorklog('user-123', '2026-04-08T09:00:00.000+0700', 1800), // target day
    ];
    const logIssue = makeIssue('UP-2', { worklogs, sp: 2 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [logIssue] })
      .mockResolvedValueOnce({ issues: [] });

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Progress Changed']).toHaveLength(1);
    expect(report['Done Yesterday']).toHaveLength(0);
  });

  it('puts unlogged sprint issues into "Plan for Today"', async () => {
    const planIssue = makeIssue('UP-3', { status: 'In Progress', sp: 3 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [] })           // no logged issues
      .mockResolvedValueOnce({ issues: [planIssue] }); // plan query

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Plan for Today']).toHaveLength(1);
    expect(report['Plan for Today'][0].Title).toBe('Task UP-3');
  });

  it('excludes logged non-"In Progress" issues from "Plan for Today" (deduplication)', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T10:00:00.000+0700', 7200),
    ];
    const issue = makeIssue('UP-4', { worklogs, status: 'In Review', sp: 2 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })  // logged
      .mockResolvedValueOnce({ issues: [issue] }); // also in plan

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Done Yesterday']).toHaveLength(1);
    expect(report['Plan for Today']).toHaveLength(0);
  });

  it('always keeps "In Progress" issues in "Plan for Today" even when logged today', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T10:00:00.000+0700', 7200),
    ];
    const issue = makeIssue('UP-7', { worklogs, status: 'In Progress', sp: 2 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })  // logged
      .mockResolvedValueOnce({ issues: [issue] }); // also in plan

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Done Yesterday']).toHaveLength(1);
    expect(report['Plan for Today']).toHaveLength(1);
    expect(report['Plan for Today'][0].Title).toBe('Task UP-7');
  });

  it('skips issues where no actual time logged on targetDate', async () => {
    // Jira JQL worklogDate may return issues whose started timestamp
    // resolves to a different local date after timezone conversion
    const worklogs = [
      // This is April 7 in GMT+7 (even though JQL matched for April 8)
      makeWorklog('user-123', '2026-04-07T09:00:00.000+0700', 3600),
    ];
    const issue = makeIssue('UP-5', { worklogs, sp: 1 });
    const planIssue = makeIssue('UP-5', { status: 'In Progress', sp: 1 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })
      .mockResolvedValueOnce({ issues: [planIssue] });

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    // UP-5 should NOT be in Done/Progress (no time on target date)
    expect(report['Done Yesterday']).toHaveLength(0);
    expect(report['Progress Changed']).toHaveLength(0);
    // And it should still appear in Plan for Today (not blocked by loggedIssueKeys)
    expect(report['Plan for Today']).toHaveLength(1);
  });

  it('uses local timezone parsing for worklog dates (+0700 offset)', async () => {
    // 2026-04-08T23:30:00.000+0700 = still April 8 in GMT+7
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T23:30:00.000+0700', 1800),
    ];
    const issue = makeIssue('UP-6', { worklogs, sp: 1 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })
      .mockResolvedValueOnce({ issues: [] });

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Done Yesterday']).toHaveLength(1);
  });

  it('only counts MY worklogs, ignoring other users', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T09:00:00.000+0700', 3600),
      makeWorklog('other-user', '2026-04-08T09:00:00.000+0700', 7200), // QA's log
    ];
    const issue = makeIssue('UP-7', { worklogs, sp: 2 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })
      .mockResolvedValueOnce({ issues: [] });

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    // Time should be 1h (only my log), not 3h
    expect(report['Done Yesterday'][0].Time).toBe('1.00h');
  });

  it('uses parent summary for grouping', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T09:00:00.000+0700', 3600),
    ];
    const issue = makeIssue('UP-8', {
      worklogs,
      parentSummary: 'Epic: User Authentication',
      sp: 1,
    });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })
      .mockResolvedValueOnce({ issues: [] });

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Done Yesterday'][0].ParentSummary).toBe('Epic: User Authentication');
  });

  it('defaults to "General Tasks" when no parent', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T09:00:00.000+0700', 3600),
    ];
    const issue = makeIssue('UP-9', { worklogs, sp: 1 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })
      .mockResolvedValueOnce({ issues: [] });

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Done Yesterday'][0].ParentSummary).toBe('General Tasks');
  });

  it('constructs correct task link', async () => {
    const worklogs = [
      makeWorklog('user-123', '2026-04-08T09:00:00.000+0700', 3600),
    ];
    const issue = makeIssue('UP-10', { worklogs, sp: 1 });

    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [issue] })
      .mockResolvedValueOnce({ issues: [] });

    const engine = new ReportEngine(makeConfig());
    const report = await engine.generate();

    expect(report['Done Yesterday'][0].TaskLink).toBe(
      'https://test.atlassian.net/browse/UP-10'
    );
  });

  it('includes correct JQL with "In Progress" having no date filter', async () => {
    JiraService.searchJql
      .mockResolvedValueOnce({ issues: [] })
      .mockResolvedValueOnce({ issues: [] });

    const engine = new ReportEngine(makeConfig());
    await engine.generate();

    // Check the plan query JQL (second call)
    const planJql = JiraService.searchJql.mock.calls[1][1];
    expect(planJql).toContain('status = "In Progress"');
    expect(planJql).toContain('status in ("In Review", "QA FAILED")');
    expect(planJql).toContain('created >=');
    // "In Progress" should be OR'd without created filter
    expect(planJql).toMatch(/status = "In Progress" OR \(status in/);
  });
});

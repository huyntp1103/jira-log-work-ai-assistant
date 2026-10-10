import { describe, it, expect } from 'vitest';
import { LocalFormatter } from '../local-formatter.js';

const baseContext = {
  displayName: 'Nhat Huy',
  platform: 'Backend',
  targetDate: '2026-05-18', // Monday
};

function emptyReport(overrides = {}) {
  return {
    'Done Yesterday': [],
    'Progress Changed': [],
    'Plan for Today': [],
    ...overrides,
  };
}

describe('LocalFormatter.formatReport', () => {
  it('renders header with human-readable date, name, and platform', () => {
    const out = LocalFormatter.formatReport(emptyReport(), baseContext);
    expect(out).toContain('DAILY REPORT — 18 May 2026');
    expect(out).toContain('Name: Nhat Huy');
    expect(out).toContain('Platform: Backend');
  });

  it('omits a category section entirely when its array is empty', () => {
    const out = LocalFormatter.formatReport(emptyReport(), baseContext);
    expect(out).not.toContain('DONE YESTERDAY');
    expect(out).not.toContain('PROGRESS CHANGED');
    expect(out).not.toContain('PLAN FOR TODAY');
  });

  it('includes Blocker / At-risk / Question footer', () => {
    const out = LocalFormatter.formatReport(emptyReport(), baseContext);
    expect(out).toContain('Blocker: None');
    expect(out).toContain('At-risk: None');
    expect(out).toContain('Question: None');
  });

  it('renders Done Yesterday rows grouped by ParentSummary', () => {
    const report = emptyReport({
      'Done Yesterday': [
        {
          TaskLink: 'https://x.atlassian.net/browse/UP-1',
          Title: 'Implement A',
          ParentSummary: 'Epic A',
          Progress: '100%',
        },
        {
          TaskLink: 'https://x.atlassian.net/browse/UP-2',
          Title: 'Implement B',
          ParentSummary: 'Epic A',
          Progress: '60%',
        },
        {
          TaskLink: 'https://x.atlassian.net/browse/UP-3',
          Title: 'Implement C',
          ParentSummary: 'Epic B',
          Progress: '100%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('DONE YESTERDAY');
    expect(out).toContain('Epic A');
    expect(out).toContain('Epic B');
    // Each row prints its link + title and progress
    expect(out).toContain('UP-1');
    expect(out).toContain('Implement A');
    expect(out).toContain('Progress: 100%');
    // < 100% rows include the Remaining placeholder
    expect(out).toContain('Remaining: <FILL REMAINING>');
  });

  it('omits the Remaining line when progress is 100%', () => {
    const report = emptyReport({
      'Done Yesterday': [
        {
          TaskLink: 'https://x/UP-9',
          Title: 'Done task',
          ParentSummary: 'Epic',
          Progress: '100%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).not.toContain('Remaining:');
  });

  it('renders Progress Changed Reason from row.Reason (the worklog comment)', () => {
    const report = emptyReport({
      'Progress Changed': [
        {
          TaskLink: 'https://x/UP-5',
          Title: 'Migrate worklog',
          ParentSummary: 'Epic Q',
          Progress: '30% ➔ 50%',
          Reason: 'Resolved review feedback and added unit tests',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('PROGRESS CHANGED');
    expect(out).toContain('Epic Q');
    expect(out).toContain('Progress: 30% ➔ 50%');
    expect(out).toContain('Reason: Resolved review feedback and added unit tests');
  });

  it('falls back to a placeholder when Reason is empty', () => {
    const report = emptyReport({
      'Progress Changed': [
        {
          TaskLink: 'https://x/UP-6',
          Title: 'No comment',
          ParentSummary: 'Epic Q',
          Progress: '40% ➔ 50%',
          Reason: '',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('Reason: <fill in brief technical summary>');
  });

  it('renders Plan for Today rows with EOD progress and weekday-aware completion date', () => {
    // Monday 2026-05-18, SP=3, current 0% → need 3 SP / 1.5 = 2 weekdays → Wednesday 2026-05-20
    const report = emptyReport({
      'Plan for Today': [
        {
          TaskLink: 'https://x/UP-7',
          Title: 'Bigger plan',
          ParentSummary: 'Epic Plan',
          Status: 'In Progress',
          SP: 3,
          Progress: '0%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('PLAN FOR TODAY');
    expect(out).toContain('Bigger plan');
    expect(out).toContain('Progress: 0% by EOD');
    expect(out).toContain('Full task done: 20 May 2026');
    // AI line uses the Backend default from PLATFORM_AI_USAGE.
    expect(out).toContain('AI: Write solution design & implementation plan, generate code, generate tests');
  });

  it('uses the Backend Bug variant when IssueType is "Bug"', () => {
    const report = emptyReport({
      'Plan for Today': [
        {
          TaskLink: 'https://x/UP-42',
          Title: 'Fix flaky thing',
          ParentSummary: 'Epic',
          Status: 'In Progress',
          IssueType: 'Bug',
          SP: 1,
          Progress: '0%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain(
      'AI: Scan current code to understand business logic, investigate issue, write code to fix issue and fix data if necessary'
    );
  });

  it('uses the Backend Task variant when IssueType is "Task"', () => {
    const report = emptyReport({
      'Plan for Today': [
        {
          TaskLink: 'https://x/UP-43',
          Title: 'Build feature',
          ParentSummary: 'Epic',
          Status: 'In Progress',
          IssueType: 'Task',
          SP: 1,
          Progress: '0%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('AI: Write solution design & implementation plan, generate code, generate tests');
  });

  it('falls back to the Backend default when IssueType is missing or unknown', () => {
    const report = emptyReport({
      'Plan for Today': [
        {
          TaskLink: 'x', Title: 't', ParentSummary: 'E',
          Status: 'In Progress', SP: 1, Progress: '0%',
          // no IssueType
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('AI: Write solution design & implementation plan, generate code, generate tests');
  });

  it('uses the QA AI-usage default when platform is QA', () => {
    const report = emptyReport({
      'Plan for Today': [
        { TaskLink: 'x', Title: 't', ParentSummary: 'E', Status: 'In Progress', SP: 1, Progress: '0%' },
      ],
    });
    const out = LocalFormatter.formatReport(report, { ...baseContext, platform: 'QA' });
    expect(out).toContain('AI: Generate test cases for new API endpoints, write automation scripts for regression suite');
  });

  it('falls back to the Backend AI default when platform is unknown', () => {
    const report = emptyReport({
      'Plan for Today': [
        { TaskLink: 'x', Title: 't', ParentSummary: 'E', Status: 'In Progress', SP: 1, Progress: '0%' },
      ],
    });
    const out = LocalFormatter.formatReport(report, { ...baseContext, platform: 'Marketing' });
    expect(out).toContain('AI: Write solution design & implementation plan, generate code, generate tests');
  });

  it('skips weekends when projecting completion date', () => {
    // Thursday 2026-05-14, SP=3, current 0% → 2 weekdays from Thu → Mon May 18
    const report = emptyReport({
      'Plan for Today': [
        {
          TaskLink: 'https://x/UP-8',
          Title: 'Cross-weekend plan',
          ParentSummary: 'Epic Plan',
          Status: 'In Progress',
          SP: 3,
          Progress: '0%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, { ...baseContext, targetDate: '2026-05-14' });
    expect(out).toContain('Full task done: 18 May 2026');
  });

  it('falls back to TBD when SP is missing on a Plan-for-Today row', () => {
    const report = emptyReport({
      'Plan for Today': [
        {
          TaskLink: 'https://x/UP-10',
          Title: 'No SP',
          ParentSummary: 'Epic',
          Status: 'In Progress',
          SP: 0,
          Progress: '0%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('Full task done: TBD');
  });

  it('falls back to "General Tasks" when ParentSummary is missing', () => {
    const report = emptyReport({
      'Done Yesterday': [
        {
          TaskLink: 'https://x/UP-99',
          Title: 'Orphan',
          Progress: '100%',
        },
      ],
    });
    const out = LocalFormatter.formatReport(report, baseContext);
    expect(out).toContain('General Tasks');
  });
});

describe('LocalFormatter.formatReport — Backend Marketplace layout', () => {
  const ctx = { displayName: 'Huy', platform: 'Backend', targetDate: '2026-05-18', templateId: 'default-backend-marketplace', hoursPerPoint: 4 };
  const link = (k) => `https://everfit.atlassian.net/browse/${k}`;
  const report = {
    'Done Yesterday': [
      { TaskLink: link('MP-1'), Title: 'Build API', ParentSummary: 'Feature A', TimeSeconds: 5400, Status: 'In Review', Reason: 'Implemented endpoint', Progress: '100%' },
      { TaskLink: link('MP-9665'), Title: '[MP] General Task', ParentSummary: '[MP] General Tasks', TimeSeconds: 1800, Status: 'To Do', Reason: 'Standup', Progress: 'N/A' },
    ],
    'Progress Changed': [
      { TaskLink: link('MP-1'), Title: 'Build API', ParentSummary: 'Feature A', Progress: '30% ➔ 60%' },
      { TaskLink: link('MP-3'), Title: 'No pct', ParentSummary: 'Feature B', Progress: 'N/A' },
    ],
    'Plan for Today': [
      { TaskLink: link('MP-2'), Title: 'Add tests', ParentSummary: 'Feature A', SP: 2, Progress: '50%' },
    ],
  };

  it('renders header, Done (with Others group), Progress, Plan and footer', () => {
    const out = LocalFormatter.formatReport(report, ctx);
    expect(out).toContain('DAILY REPORT — 18 May 2026\nName: Huy\nPlatform: BE\n`I\'ve already logged the time in Jira.`');
    expect(out).toContain('• Feature A\n    ◦ https://everfit.atlassian.net/browse/MP-1|MP-1 — Implemented endpoint - `1h 30m` - In Review');
    expect(out).toContain('• Others — https://everfit.atlassian.net/browse/MP-9665|MP-9665\n    ◦ Standup - `30m`');
    expect(out).toContain('• Feature A — https://everfit.atlassian.net/browse/MP-1|MP-1: 30% → 60%');
    expect(out).not.toContain('MP-3');
    // 2 SP * 50% remaining * 4h = 4h
    expect(out).toContain('◦ https://everfit.atlassian.net/browse/MP-2|MP-2 — Add tests - Est `4h`');
    expect(out).toMatch(/Blockers: None\nAt-risk: None\nQuestions: None$/);
  });

  it('uses the Core layout for other templates', () => {
    const out = LocalFormatter.formatReport(report, { ...ctx, templateId: 'default-backend-core' });
    expect(out).toContain('Platform: Backend');
    expect(out).toContain('Blocker: None');
  });
});

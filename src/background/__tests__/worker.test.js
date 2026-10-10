import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// chrome must be defined before worker.js executes at module load time
const { chromeMock } = vi.hoisted(() => {
  const chromeMock = { runtime: { onMessage: { addListener: vi.fn() } } };
  globalThis.chrome = chromeMock;
  return { chromeMock };
});

// Mock all external dependencies before importing the worker
vi.mock('../../services/storage.js', () => ({
  StorageService: {
    getSettings: vi.fn(),
    getTemplates: vi.fn(),
    getJiraDomain: vi.fn(),
    getGitHubCredentials: vi.fn(),
  },
  buildInstruction: vi.fn(() => 'system instruction'),
  MARKETPLACE_TEMPLATE_ID: 'default-backend-marketplace',
}));

vi.mock('../../services/jira.js', () => ({
  JiraService: {
    getMyProfile: vi.fn(),
    fetchJira: vi.fn(),
    searchJql: vi.fn(),
    getIssue: vi.fn(),
    getVersion: vi.fn(),
    getBoard: vi.fn(),
  },
}));

vi.mock('../../services/gemini.js', () => ({
  GeminiService: {
    generateReport: vi.fn(),
  },
}));

vi.mock('../../services/report-engine.js', () => ({
  ReportEngine: vi.fn(),
}));

vi.mock('../../services/github.js', () => ({
  GitHubService: {
    fetchEventsForDate: vi.fn(),
    extractTicketMap: vi.fn(),
    isSynced: vi.fn(),
  },
}));

import { handleGenerateReport, handleGitHubSyncPreview, handleJiraTrackerTasks, handleJiraTrackerDetect } from '../worker.js';
import { StorageService } from '../../services/storage.js';
import { JiraService } from '../../services/jira.js';
import { GeminiService } from '../../services/gemini.js';
import { ReportEngine } from '../../services/report-engine.js';
import { GitHubService } from '../../services/github.js';

const SETTINGS = { geminiKey: 'key', spField: 'story_points', hoursPerPoint: 4, timeCommit: 1800, timeApprove: 900, timeComment: 300, reportEngine: 'gemini' };
const TEMPLATES = [{ id: 'tpl1', name: 'Slack', format: 'slack format', isDefault: true }];
const PROFILE = { accountId: 'user-1', displayName: 'Huy' };

beforeEach(() => {
  vi.clearAllMocks();
  StorageService.getSettings.mockResolvedValue(SETTINGS);
  StorageService.getTemplates.mockResolvedValue(TEMPLATES);
  StorageService.getJiraDomain.mockResolvedValue('myorg.atlassian.net');
  JiraService.getMyProfile.mockResolvedValue(PROFILE);
  GeminiService.generateReport.mockResolvedValue('formatted report text');
  ReportEngine.mockImplementation(function (config) {
    this.config = config;
    this.generate = vi.fn().mockResolvedValue({ done: [], progress: [], plan: [] });
  });
});


// ─── handleGenerateReport ─────────────────────────────────────────────────────

describe('handleGenerateReport — date used as-is (no getTargetDate conversion)', () => {
  it('passes the picked date directly to ReportEngine as targetDate', async () => {
    await handleGenerateReport({ date: '2026-04-08', templateId: 'tpl1' });

    const constructorArg = ReportEngine.mock.calls[0][0];
    expect(constructorArg.targetDate).toBe('2026-04-08');
  });

  it('does NOT shift Monday to Friday (old getTargetDate behavior)', async () => {
    // Monday 2026-04-06 — old behavior would have converted this to 2026-04-03 (Friday)
    await handleGenerateReport({ date: '2026-04-06', templateId: 'tpl1' });

    const constructorArg = ReportEngine.mock.calls[0][0];
    expect(constructorArg.targetDate).toBe('2026-04-06');
    expect(constructorArg.targetDate).not.toBe('2026-04-03');
  });

  it('does NOT shift Sunday to Friday (old getTargetDate behavior)', async () => {
    // Sunday 2026-04-05 — old behavior would have converted this to 2026-04-03 (Friday)
    await handleGenerateReport({ date: '2026-04-05', templateId: 'tpl1' });

    const constructorArg = ReportEngine.mock.calls[0][0];
    expect(constructorArg.targetDate).toBe('2026-04-05');
    expect(constructorArg.targetDate).not.toBe('2026-04-03');
  });

  it('does NOT shift a weekday to yesterday (old getTargetDate behavior)', async () => {
    // Wednesday 2026-04-08 — old behavior would have converted this to 2026-04-07 (Tuesday)
    await handleGenerateReport({ date: '2026-04-08', templateId: 'tpl1' });

    const constructorArg = ReportEngine.mock.calls[0][0];
    expect(constructorArg.targetDate).toBe('2026-04-08');
    expect(constructorArg.targetDate).not.toBe('2026-04-07');
  });

  it('baseDate is derived from the same targetDate', async () => {
    await handleGenerateReport({ date: '2026-04-08', templateId: 'tpl1' });

    const constructorArg = ReportEngine.mock.calls[0][0];
    // baseDate should be midnight of targetDate in local time
    expect(constructorArg.baseDate).toEqual(new Date('2026-04-08T00:00:00'));
  });

  it('falls back to today when no date is provided', async () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const expectedToday = `${yyyy}-${mm}-${dd}`;

    await handleGenerateReport({ templateId: 'tpl1' });

    const constructorArg = ReportEngine.mock.calls[0][0];
    expect(constructorArg.targetDate).toBe(expectedToday);
  });

  it('throws if domain is not configured', async () => {
    StorageService.getJiraDomain.mockResolvedValue(null);
    await expect(handleGenerateReport({ date: '2026-04-08' }))
      .rejects.toThrow('Please open a Jira tab first');
  });

  it('throws if Gemini API key is missing', async () => {
    StorageService.getSettings.mockResolvedValue({ ...SETTINGS, geminiKey: '' });
    await expect(handleGenerateReport({ date: '2026-04-08' }))
      .rejects.toThrow('Please enter your Gemini API key');
  });
});

// ─── handleGitHubSyncPreview — date parity with Generate Report ───────────────

describe('handleGitHubSyncPreview — date used as-is (same behavior as Generate Report)', () => {
  beforeEach(() => {
    StorageService.getGitHubCredentials.mockResolvedValue({
      githubToken: 'ghp_token',
      githubUsername: 'huyntp',
      allowedRepos: 'org/repo',
    });
    GitHubService.fetchEventsForDate.mockResolvedValue([]);
    GitHubService.extractTicketMap.mockReturnValue(new Map());
  });

  it('passes the picked date directly to GitHubService.fetchEventsForDate', async () => {
    await handleGitHubSyncPreview({ date: '2026-04-08' });

    expect(GitHubService.fetchEventsForDate).toHaveBeenCalledWith(
      'huyntp', '2026-04-08', 'ghp_token', ['org/repo']
    );
  });

  it('Generate Report and GitHub Sync use identical targetDate for the same picked date', async () => {
    const pickedDate = '2026-04-06'; // Monday

    await handleGenerateReport({ date: pickedDate, templateId: 'tpl1' });
    await handleGitHubSyncPreview({ date: pickedDate });

    const reportTargetDate = ReportEngine.mock.calls[0][0].targetDate;
    const githubTargetDate = GitHubService.fetchEventsForDate.mock.calls[0][1];

    expect(reportTargetDate).toBe(githubTargetDate);
  });
});

// ─── handleGenerateReport — engine switch ─────────────────────────────────────

describe('handleGenerateReport — reportEngine setting switch', () => {
  it('local mode skips Gemini, does not require an API key, and uses LocalFormatter output', async () => {
    StorageService.getSettings.mockResolvedValue({ ...SETTINGS, geminiKey: '', reportEngine: 'local' });

    const result = await handleGenerateReport({ date: '2026-05-18', templateId: 'tpl1' });

    expect(GeminiService.generateReport).not.toHaveBeenCalled();
    expect(result.formattedText).toContain('DAILY REPORT');
    expect(result.formattedText).toContain('Name: Huy');
  });

  it('gemini mode still throws when no API key is configured', async () => {
    StorageService.getSettings.mockResolvedValue({ ...SETTINGS, geminiKey: '', reportEngine: 'gemini' });

    await expect(handleGenerateReport({ date: '2026-04-08' }))
      .rejects.toThrow('Please enter your Gemini API key');
  });
});

describe('handleJiraTrackerTasks — logged time', () => {
  it('requests timespent and maps it to spentSeconds', async () => {
    StorageService.getJiraDomain.mockResolvedValue('x.atlassian.net');
    JiraService.searchJql.mockResolvedValue({
      issues: [
        { key: 'UP-1', fields: { summary: 'A', status: { name: 'To Do' }, timespent: 5400, story_points: 1 } },
        { key: 'UP-2', fields: { summary: 'B', status: { name: 'To Do' }, timespent: null } },
      ],
    });
    const { rows } = await handleJiraTrackerTasks({ tracker: { type: 'epic', id: 'UP-9' } });
    expect(JiraService.searchJql.mock.calls[0][2]).toContain('timespent');
    expect(rows.map((r) => r.spentSeconds)).toEqual([5400, 0]);
  });
});

describe('product selection', () => {
  const epic = { fields: { summary: 'Epic' } };

  it('bare number resolves to MP-<n> on Marketplace', async () => {
    StorageService.getSettings.mockResolvedValue({ ...SETTINGS, product: 'marketplace' });
    JiraService.getVersion.mockResolvedValue(null);
    JiraService.getIssue.mockResolvedValue(epic);
    const { tracker } = await handleJiraTrackerDetect({ input: '9665' });
    expect(JiraService.getIssue).toHaveBeenCalledWith('myorg.atlassian.net', 'MP-9665', 'Epic');
    expect(tracker).toMatchObject({ id: 'MP-9665', type: 'epic', projectKey: 'MP' });
  });

  it('bare number resolves to UP-<n> when product is missing', async () => {
    JiraService.getVersion.mockResolvedValue(null);
    JiraService.getIssue.mockResolvedValue(epic);
    const { tracker } = await handleJiraTrackerDetect({ input: '9665' });
    expect(tracker.id).toBe('UP-9665');
  });

  it('full key keeps its own project key', async () => {
    StorageService.getSettings.mockResolvedValue({ ...SETTINGS, product: 'marketplace' });
    JiraService.getIssue.mockResolvedValue(epic);
    const { tracker } = await handleJiraTrackerDetect({ input: 'UP-1' });
    expect(tracker).toMatchObject({ id: 'UP-1', projectKey: 'UP' });
  });

  it('passes the product project key to ReportEngine', async () => {
    StorageService.getSettings.mockResolvedValue({ ...SETTINGS, product: 'marketplace' });
    await handleGenerateReport({ date: '2026-04-08', templateId: 'tpl1' });
    expect(ReportEngine.mock.calls[0][0].projectKey).toBe('MP');
  });

  it('GitHub Sync drops tickets from the other product', async () => {
    StorageService.getSettings.mockResolvedValue({ ...SETTINGS, product: 'marketplace' });
    StorageService.getGitHubCredentials.mockResolvedValue({ githubToken: 't', githubUsername: 'u', allowedRepos: '' });
    GitHubService.fetchEventsForDate.mockResolvedValue([{ type: 'PushEvent', payload: {}, created_at: '2026-04-08T01:00:00Z' }]);
    GitHubService.extractTicketMap.mockResolvedValue(new Map([
      ['UP-1', { seconds: 60, description: 'x' }],
      ['MP-2', { seconds: 60, description: 'y' }],
    ]));
    GitHubService.isSynced.mockResolvedValue(false);
    JiraService.fetchJira.mockResolvedValue({ fields: { summary: 's' } });
    const { rows } = await handleGitHubSyncPreview({ date: '2026-04-08' });
    expect(rows.map((r) => r.key)).toEqual(['MP-2']);
  });
});

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
}));

vi.mock('../../services/jira.js', () => ({
  JiraService: {
    getMyProfile: vi.fn(),
    fetchJira: vi.fn(),
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

import { handleGenerateReport, handleGitHubSyncPreview } from '../worker.js';
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

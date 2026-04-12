import { StorageService, buildInstruction } from '../services/storage.js';
import { JiraService } from '../services/jira.js';
import { GeminiService } from '../services/gemini.js';
import { ReportEngine } from '../services/report-engine.js';
import { GitHubService } from '../services/github.js';
import { DateHelper } from '../utils/date.js';

console.log('[BG] Service worker started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG] Message received:', message.type);

  if (message.type === 'GENERATE_REPORT') {
    handleGenerateReport(message)
      .then((result) => {
        console.log('[BG] Report generated successfully');
        sendResponse({ type: 'REPORT_RESULT', ...result });
      })
      .catch((error) => {
        console.error('[BG] Report generation failed:', error);
        sendResponse({ type: 'REPORT_ERROR', error: error.message });
      });
    return true;
  }

  if (message.type === 'TEST_GEMINI') {
    GeminiService.testConnection(message.apiKey)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'GITHUB_SYNC_PREVIEW') {
    handleGitHubSyncPreview(message)
      .then((result) => sendResponse({ type: 'GITHUB_SYNC_DATA', ...result }))
      .catch((error) => sendResponse({ type: 'GITHUB_SYNC_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'GITHUB_SYNC_CONFIRM') {
    handleGitHubSyncConfirm(message)
      .then((result) => sendResponse({ type: 'GITHUB_SYNC_DONE', ...result }))
      .catch((error) => sendResponse({ type: 'GITHUB_SYNC_ERROR', error: error.message }));
    return true;
  }
});

export async function handleGenerateReport({ date, templateId }) {
  const settings = await StorageService.getSettings();
  const templates = await StorageService.getTemplates();
  const domain = await StorageService.getJiraDomain();

  console.log('[BG] Config:', { domain, hasKey: !!settings.geminiKey, templateId });

  if (!domain) throw new Error('Please open a Jira tab first so the extension can detect your domain.');
  if (!settings.geminiKey) throw new Error('Please enter your Gemini API key in Settings.');

  const template = templates.find((t) => t.id === templateId)
    || templates.find((t) => t.isDefault)
    || templates[0];
  if (!template) throw new Error('No template found. Please create one in Settings.');

  const targetDate = date || DateHelper.formatDate(new Date());
  const baseDate = new Date(targetDate + 'T00:00:00');
  console.log('[BG] Target date:', targetDate);

  // Step 1: Fetch user profile
  console.log('[BG] Step 1: Fetching user profile...');
  const profile = await JiraService.getMyProfile(domain);

  // Step 2: Fetch and categorize Jira data
  console.log('[BG] Step 2: Fetching Jira data...');
  const engine = new ReportEngine({
    domain,
    myId: profile.accountId,
    targetDate,
    baseDate,
    spField: settings.spField,
    hoursPerPoint: settings.hoursPerPoint,
  });
  const report = await engine.generate();
  console.log('[BG] Report data:', JSON.stringify(report).substring(0, 200));

  // Step 3: Format with Gemini AI
  console.log('[BG] Step 3: Sending to Gemini...');
  const formattedText = await GeminiService.generateReport(
    report,
    settings.geminiKey,
    buildInstruction(template.format, template.name.split(/\s/)[0]),
    {
      displayName: profile.displayName,
      platform: template.name.split(/\s/)[0],
      targetDate: date || DateHelper.formatDate(new Date()),
    }
  );
  console.log('[BG] Gemini response received, length:', formattedText.length);

  return { report, formattedText };
}

export async function handleGitHubSyncPreview({ date }) {
  const [settings, { githubToken, githubUsername, allowedRepos }, domain] = await Promise.all([
    StorageService.getSettings(),
    StorageService.getGitHubCredentials(),
    StorageService.getJiraDomain(),
  ]);

  if (!githubToken || !githubUsername) throw new Error('GitHub credentials not configured. Please add your username and PAT in Settings.');
  if (!domain) throw new Error('Please open a Jira tab first so the extension can detect your domain.');

  const targetDate = date || DateHelper.formatDate(new Date());
  const timeConfig = {
    timeCommit: settings.timeCommit,
    timeApprove: settings.timeApprove,
    timeComment: settings.timeComment,
  };

  const repoList = allowedRepos
    ? allowedRepos.split(',').map((r) => r.trim()).filter(Boolean)
    : [];

  const [events, profile] = await Promise.all([
    GitHubService.fetchEventsForDate(githubUsername, targetDate, githubToken, repoList),
    JiraService.getMyProfile(domain),
  ]);

  // Oldest-first so first-occurrence logic picks the earliest action
  const ticketMap = GitHubService.extractTicketMap([...events].reverse(), timeConfig);

  if (ticketMap.size === 0) {
    return { rows: [] };
  }

  // Filter out already-synced tickets (parallel checks)
  const keys = [...ticketMap.keys()];
  const syncedFlags = await Promise.all(
    keys.map((key) => GitHubService.isSynced(domain, key, targetDate, profile.accountId))
  );

  const unsyncedKeys = keys.filter((_, i) => !syncedFlags[i]);

  // Fetch issue summaries in parallel
  const summaries = await Promise.all(
    unsyncedKeys.map((key) =>
      JiraService.fetchJira(domain, `/rest/api/3/issue/${key}?fields=summary`)
        .then((issue) => issue.fields?.summary || '')
        .catch(() => '')
    )
  );

  const rows = unsyncedKeys.map((key, i) => {
    const { seconds, description } = ticketMap.get(key);
    return { key, summary: summaries[i], seconds, description };
  });

  return { rows };
}

async function handleGitHubSyncConfirm({ worklogs, date }) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');

  const targetDate = date || DateHelper.formatDate(new Date());

  await Promise.all(
    worklogs.map(({ key, seconds, description }) =>
      JiraService.createWorklog(domain, key, { timeSpentSeconds: seconds, targetDate, description })
    )
  );

  return { count: worklogs.length };
}

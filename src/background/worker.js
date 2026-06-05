import { StorageService, buildInstruction } from '../services/storage.js';
import { JiraService } from '../services/jira.js';
import { GeminiService } from '../services/gemini.js';
import { LocalFormatter } from '../services/local-formatter.js';
import { ReportEngine } from '../services/report-engine.js';
import { GitHubService } from '../services/github.js';
import { DateHelper } from '../utils/date.js';

console.log('[BG] Service worker started');

// Open side panel when the toolbar icon is clicked
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('[BG] setPanelBehavior failed:', err));

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

  if (message.type === 'JIRA_TRACKER_DETECT') {
    handleJiraTrackerDetect(message)
      .then((result) => sendResponse({ type: 'JIRA_TRACKER_DETECTED', ...result }))
      .catch((error) => sendResponse({ type: 'JIRA_TRACKER_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_TRACKER_TASKS') {
    handleJiraTrackerTasks(message)
      .then((result) => sendResponse({ type: 'JIRA_TRACKER_TASKS_DATA', ...result }))
      .catch((error) => sendResponse({ type: 'JIRA_TRACKER_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_TRANSITIONS_LIST') {
    handleJiraTransitionsList(message)
      .then((result) => sendResponse({ type: 'JIRA_TRANSITIONS_DATA', ...result }))
      .catch((error) => sendResponse({ type: 'JIRA_TRACKER_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_TRANSITION_EXECUTE') {
    handleJiraTransitionExecute(message)
      .then(() => sendResponse({ type: 'JIRA_TRANSITION_DONE' }))
      .catch((error) => sendResponse({ type: 'JIRA_TRACKER_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_ISSUE_CREATE') {
    handleJiraIssueCreate(message)
      .then((result) => sendResponse({ type: 'JIRA_ISSUE_CREATED', ...result }))
      .catch((error) => sendResponse({ type: 'JIRA_TRACKER_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_RECENT_TICKETS') {
    handleJiraRecentTickets(message)
      .then((result) => sendResponse({ type: 'JIRA_RECENT_TICKETS_DATA', ...result }))
      .catch((error) => sendResponse({ type: 'JIRA_WORKLOG_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_WORKLOG_MOVE') {
    handleJiraWorklogMove(message)
      .then((result) => sendResponse({ type: 'JIRA_WORKLOG_MOVED', ...result }))
      .catch((error) => sendResponse({ type: 'JIRA_WORKLOG_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_WORKLOG_CREATE') {
    handleJiraWorklogCreate(message)
      .then(() => sendResponse({ type: 'JIRA_WORKLOG_CREATED' }))
      .catch((error) => sendResponse({ type: 'JIRA_WORKLOG_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_WORKLOG_UPDATE') {
    handleJiraWorklogUpdate(message)
      .then(() => sendResponse({ type: 'JIRA_WORKLOG_UPDATED' }))
      .catch((error) => sendResponse({ type: 'JIRA_WORKLOG_ERROR', error: error.message }));
    return true;
  }

  if (message.type === 'JIRA_WORKLOG_PREVIEW') {
    handleJiraWorklogPreview(message)
      .then((result) => sendResponse({ type: 'JIRA_WORKLOG_DATA', ...result }))
      .catch((error) => sendResponse({ type: 'JIRA_WORKLOG_ERROR', error: error.message }));
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
  const reportEngine = (settings.reportEngine || 'gemini').toLowerCase();
  if (reportEngine === 'gemini' && !settings.geminiKey) {
    throw new Error('Please enter your Gemini API key in Settings.');
  }

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

  // Step 3: Format — either Gemini AI or the deterministic LocalFormatter,
  // depending on settings.reportEngine.
  const platform = template.name.split(/\s/)[0];
  const reportDate = DateHelper.getReportDate(targetDate);
  let formattedText;
  if (reportEngine === 'local') {
    console.log('[BG] Step 3: Formatting locally (no Gemini call)...');
    formattedText = LocalFormatter.formatReport(report, {
      displayName: profile.displayName,
      platform,
      targetDate: reportDate,
    });
  } else {
    console.log('[BG] Step 3: Sending to Gemini...');
    formattedText = await GeminiService.generateReport(
      report,
      settings.geminiKey,
      buildInstruction(template.format, platform),
      { displayName: profile.displayName, platform, targetDate: reportDate }
    );
    console.log('[BG] Gemini response received, length:', formattedText.length);
  }

  return { report, formattedText };
}

const DEFAULT_PROJECT_KEY = 'UP';

/**
 * Detect whether a user-entered identifier refers to a Jira release (version)
 * or an Epic issue. Accepts:
 *   - a bare numeric id ("27643") — tries /version/{id} and /issue/UP-{id}
 *   - a full issue key ("UP-68179") — verified as an Epic via /issue/{key}
 */
export async function handleJiraTrackerDetect({ input }) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first so the extension can detect your domain.');

  const original = String(input || '').trim();
  if (!original) throw new Error('Please enter a release number, epic key, or board URL.');

  // Board URL — e.g. https://<domain>/jira/software/c/projects/UP/boards/26?...
  const boardMatch = original.match(/\/boards\/(\d+)/);
  if (boardMatch) {
    const boardId = boardMatch[1];
    const board = await JiraService.getBoard(domain, boardId);
    if (!board) throw new Error(`Could not find board ${boardId} (or you don't have access).`);
    return {
      tracker: {
        id: boardId,
        type: 'board',
        label: board.name || `Board ${boardId}`,
        url: original,
      },
    };
  }

  const raw = original.toUpperCase();

  // Full issue key form
  if (/^[A-Z]+-\d+$/.test(raw)) {
    const issue = await JiraService.getIssue(domain, raw, 'Epic');
    if (!issue) throw new Error(`${raw} is not an Epic (or you don't have access).`);
    return {
      tracker: {
        id: raw,
        type: 'epic',
        label: issue.fields.summary,
      },
    };
  }

  // Bare numeric form — try version and issue in parallel
  if (/^\d+$/.test(raw)) {
    const epicKey = `${DEFAULT_PROJECT_KEY}-${raw}`;
    const [version, issue] = await Promise.all([
      JiraService.getVersion(domain, raw),
      JiraService.getIssue(domain, epicKey, 'Epic'),
    ]);
    if (issue) {
      return {
        tracker: {
          id: epicKey,
          type: 'epic',
          label: issue.fields.summary,
        },
      };
    }
    if (version) {
      return {
        tracker: {
          id: raw,
          type: 'version',
          label: version.name || `Release ${raw}`,
        },
      };
    }
    throw new Error(`Could not find a release or epic for "${raw}".`);
  }

  throw new Error(`"${raw}" is not a valid id. Use a number (e.g. 27643) or a key (e.g. UP-68179).`);
}

/**
 * Fetch the current user's tasks under a tracker.
 * Returns rows with key, summary, status, sp, progress (%, integer).
 */
export async function handleJiraTrackerTasks({ tracker, allAssignees = false }) {
  const settings = await StorageService.getSettings();
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');

  const assigneeClause = allAssignees ? '' : 'assignee = currentUser() AND ';
  let scope;
  if (tracker.type === 'version') {
    scope = `fixVersion = ${tracker.id}`;
  } else if (tracker.type === 'board') {
    const sprint = await JiraService.getActiveSprintForBoard(domain, tracker.id);
    if (!sprint) throw new Error('This board has no active sprint right now.');
    scope = `sprint = ${sprint.id}`;
  } else {
    scope = `parent = ${tracker.id}`;
  }
  const jql = `${assigneeClause}${scope} ORDER BY status, key`;

  const data = await JiraService.searchJql(
    domain,
    jql,
    ['summary', 'status', settings.spField]
  );

  const rows = (data.issues || []).map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary || '',
    status: issue.fields.status?.name || '',
    sp: issue.fields[settings.spField] || 0,
  }));

  return { rows, domain };
}

export async function handleJiraTransitionsList({ key }) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');
  if (!key) throw new Error('Missing issue key.');
  const transitions = await JiraService.getTransitions(domain, key);
  return { transitions };
}

export async function handleJiraTransitionExecute({ key, transitionId }) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');
  if (!key || !transitionId) throw new Error('Missing key or transitionId.');
  await JiraService.transitionIssue(domain, key, transitionId);
}

/**
 * Create a Jira issue inside an Epic. Used by the "+ Add task" button on
 * Epic trackers in the Jira Tasks tab.
 *
 * Resolves "To be confirmed" version by name (case-insensitive) from the
 * project's versions; falls back to no fixVersion if not present.
 */
export async function handleJiraIssueCreate({
  epicKey,
  issueType = 'Task',
  summary,
  description = '',
  storyPoints = 0.5,
  priorityName = 'Medium',
  fixVersionId,
}) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');
  if (!epicKey) throw new Error('Missing epic key.');
  if (!summary?.trim()) throw new Error('Title is required.');

  const projectKey = String(epicKey).split('-')[0];
  if (!projectKey) throw new Error(`Could not derive project key from "${epicKey}".`);

  const settings = await StorageService.getSettings();
  const profile = await JiraService.getMyProfile(domain);

  const fixVersionIds = fixVersionId ? [String(fixVersionId)] : [];

  const createPayload = {
    projectKey,
    summary: summary.trim(),
    description,
    issueType,
    priorityName,
    assigneeAccountId: profile.accountId,
    parentKey: epicKey,
    storyPoints,
    spField: settings.spField,
    fixVersionIds,
  };
  console.log('[BG] handleJiraIssueCreate payload:', createPayload);

  const created = await JiraService.createIssue(domain, createPayload);
  console.log('[BG] handleJiraIssueCreate response:', created);

  return { key: created.key, id: created.id };
}

export async function handleJiraRecentTickets({ days = 7 } = {}) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');
  const profile = await JiraService.getMyProfile(domain);
  const tickets = await JiraService.fetchRecentTickets(domain, profile.accountId, days);
  return { tickets };
}

/**
 * Move a worklog from one Jira issue to another. Jira has no native "move"
 * API, so this is create-then-delete:
 *   1. Create a new worklog on the target ticket with the same time + comment.
 *   2. Delete the original worklog from the source ticket.
 *
 * Order matters: if step 1 fails, the original is untouched. If step 2 fails
 * after step 1 succeeded, the user sees both worklogs and can delete the old
 * one manually — much safer than data loss from doing delete-first.
 *
 * `addToolPrefix` is forced to `false` so the existing comment text is sent
 * through verbatim (the prefix, if any, is already part of `description`).
 */
export async function handleJiraWorklogMove({
  fromKey,
  worklogId,
  toKey,
  timeSpentSeconds,
  description,
  date,
}) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');
  if (!fromKey || !worklogId) throw new Error('Missing source worklog.');
  if (!toKey) throw new Error('Pick a target ticket.');
  if (fromKey === toKey) throw new Error('Source and target tickets are the same.');
  if (!timeSpentSeconds || timeSpentSeconds <= 0) throw new Error('Invalid time.');

  const targetDate = date || DateHelper.formatDate(new Date());

  await JiraService.createWorklog(domain, toKey, {
    timeSpentSeconds,
    targetDate,
    description: description || '',
    addToolPrefix: false,
  });

  try {
    await JiraService.deleteWorklog(domain, fromKey, worklogId);
  } catch (err) {
    throw new Error(
      `New worklog created on ${toKey}, but failed to delete the original on ${fromKey}: ${err.message}. Please remove it manually.`
    );
  }

  return { toKey };
}

export async function handleJiraWorklogCreate({ issueKey, timeSpentSeconds, description, date }) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');
  if (!issueKey) throw new Error('Pick a ticket first.');
  if (!timeSpentSeconds || timeSpentSeconds <= 0) throw new Error('Time must be greater than 0.');

  const targetDate = date || DateHelper.formatDate(new Date());
  await JiraService.createWorklog(domain, issueKey, {
    timeSpentSeconds,
    targetDate,
    description: description || '',
  });
}

export async function handleJiraWorklogUpdate({ issueKey, worklogId, timeSpentSeconds, comment }) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first.');
  await JiraService.updateWorklog(domain, issueKey, worklogId, { timeSpentSeconds, comment });
}

export async function handleJiraWorklogPreview({ date }) {
  const domain = await StorageService.getJiraDomain();
  if (!domain) throw new Error('Please open a Jira tab first so the extension can detect your domain.');

  const targetDate = date || DateHelper.formatDate(new Date());
  const profile = await JiraService.getMyProfile(domain);
  const rows = await JiraService.fetchMyWorklogs(domain, profile.accountId, targetDate);
  return { rows, domain };
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

  // ─── DIAGNOSTIC: events overview ───────────────────────────────────────────
  const typeCounts = events.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});
  console.log('[BG][gh-sync] events fetched:', events.length, 'by type:', typeCounts);
  // Surface PR-review-style events specifically so it's obvious whether the
  // approval event made it past the GitHub feed + allowedRepos filter.
  const prEvents = events.filter((e) =>
    e.type === 'PullRequestEvent'
    || e.type === 'PullRequestReviewEvent'
    || e.type === 'PullRequestReviewCommentEvent'
  );
  console.log('[BG][gh-sync] PR-related events:', prEvents.map((e) => ({
    type: e.type,
    repo: e.repo?.name,
    action: e.payload?.action,
    reviewState: e.payload?.review?.state,
    prNumber: e.payload?.pull_request?.number,
    prTitle: e.payload?.pull_request?.title,
    branch: e.payload?.pull_request?.head?.ref,
    created_at: e.created_at,
  })));

  // Oldest-first so first-occurrence logic picks the earliest action
  const ticketMap = await GitHubService.extractTicketMap([...events].reverse(), timeConfig, githubToken);
  console.log('[BG][gh-sync] ticketMap after extraction:', [...ticketMap.entries()].map(
    ([k, v]) => ({ key: k, seconds: v.seconds, description: v.description })
  ));

  if (ticketMap.size === 0) {
    console.log('[BG][gh-sync] no tickets extracted — nothing to suggest.');
    return { rows: [] };
  }

  // Filter out already-synced tickets (parallel checks)
  const keys = [...ticketMap.keys()];
  const syncedFlags = await Promise.all(
    keys.map((key) => GitHubService.isSynced(domain, key, targetDate, profile.accountId))
  );
  const droppedAsSynced = keys.filter((_, i) => syncedFlags[i]);
  if (droppedAsSynced.length) {
    console.log('[BG][gh-sync] dropped (already synced with tool prefix):', droppedAsSynced);
  }

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
      JiraService.createWorklog(domain, key, { timeSpentSeconds: seconds, targetDate, description, addToolPrefix: true })
    )
  );

  return { count: worklogs.length };
}

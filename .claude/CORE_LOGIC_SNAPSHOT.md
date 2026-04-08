# Core Logic Snapshot

> **Purpose:** Paste into browser DevTools console to test core logic manually without rebuilding the extension.
> Last updated: 2026-04-08

---

## How to use

1. Open any `https://*.atlassian.net` tab (Jira).
2. Open DevTools → Console.
3. Paste the entire snippet below and press Enter.
4. Call `runDailyTool()` to generate + format a report.
5. Call `runGitHubSync(date, previewOnly)` to preview or execute GitHub → Jira worklog sync.

---

```javascript
/* ================================================================
   CORE LOGIC SNAPSHOT — Jira Daily Report AI Assistant
   Tech: Jira REST API v3, GitHub REST API, Gemini API
   ================================================================ */

const CONFIG = {
  // --- Jira ---
  DOMAIN: window.location.hostname,          // auto-detected from active Jira tab
  SP_FIELD: 'customfield_10014',
  HOURS_PER_POINT: 4,

  // --- Gemini ---
  GEMINI_KEY: 'AIzaSyCVqN9dIgzWhTeDQy7q5gBBMEjh7mElc_w',         // replace with your key
  GEMINI_MODELS: ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'],
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models',

  // --- GitHub Sync ---
  GITHUB_TOKEN: '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',           // replace with your PAT (repo + read:user)
  GITHUB_USERNAME: 'huynguyen-everfit',   // replace with your GitHub username

  // FOCUS REPOS
  ALLOWED_REPOS: ['Everfit-io/everfit-api', 'Everfit-io/everfit-scripts'],

  // Time budget per GitHub event type (seconds)
  TIME_COMMIT: 3600,   // 1h
  TIME_APPROVE: 900,   // 15min
  TIME_COMMENT: 900,   // 15min
};

// ----------------------------------------------------------------
// DATE HELPER
// ----------------------------------------------------------------
const DateHelper = {
  /**
   * Returns the "target date" for the daily report.
   * Mon → previous Fri; Sun → previous Fri; otherwise → yesterday.
   * Returns YYYY-MM-DD in LOCAL time (no UTC shift).
   */
  getTargetDate(baseDate = new Date()) {
    const target = new Date(baseDate);
    const day = target.getDay();
    if (day === 1)      target.setDate(target.getDate() - 3); // Mon → Fri
    else if (day === 0) target.setDate(target.getDate() - 2); // Sun → Fri
    else                target.setDate(target.getDate() - 1);
    const yyyy = target.getFullYear();
    const mm   = String(target.getMonth() + 1).padStart(2, '0');
    const dd   = String(target.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  formatDate(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },
};

// ----------------------------------------------------------------
// JIRA SERVICE
// ----------------------------------------------------------------
const JiraService = {
  async fetch(endpoint, method = 'GET', body = null) {
    const url = `https://${CONFIG.DOMAIN}${endpoint}`;
    const opts = {
      method,
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check',
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
    return res.json();
  },

  async getMyProfile() {
    const user = await this.fetch('/rest/api/3/myself');
    return {
      accountId: user.accountId,
      displayName: (user.displayName || 'Unknown').split('(')[0].trim(),
    };
  },

  async searchJql(jql, fields = []) {
    return this.fetch('/rest/api/3/search/jql', 'POST', { jql, fields, maxResults: 50 });
  },

  /**
   * Create a worklog on a Jira issue.
   * Comment is prefixed with [AI] so GitHubService.isSynced can detect it.
   */
  async createWorklog(issueKey, { timeSpentSeconds, targetDate, description }) {
    return this.fetch(`/rest/api/3/issue/${issueKey}/worklog`, 'POST', {
      timeSpentSeconds,
      started: `${targetDate}T09:00:00.000+0700`,
      comment: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: `[AI] ${description}` }],
        }],
      },
    });
  },
};

// ----------------------------------------------------------------
// REPORT ENGINE
// ----------------------------------------------------------------
const ReportEngine = {
  /**
   * Fetch Jira issues and categorize them into:
   *   "Done Yesterday", "Progress Changed", "Plan for Today"
   */
  async generate(myId, targetDate, baseDate = new Date()) {
    const twoWeeksAgo = new Date(baseDate);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = DateHelper.formatDate(twoWeeksAgo);

    const fields = ['summary', 'status', 'worklog', 'timetracking', 'parent', CONFIG.SP_FIELD];

    const [logData, planData] = await Promise.all([
      JiraService.searchJql(
        `worklogAuthor = currentUser() AND worklogDate = "${targetDate}"`,
        fields
      ),
      JiraService.searchJql(
        `assignee = currentUser() AND sprint in openSprints() AND status in ("In Progress", "In Review", "QA FAILED") AND created >= "${twoWeeksAgoStr}"`,
        fields
      ),
    ]);

    const report = { 'Done Yesterday': [], 'Progress Changed': [], 'Plan for Today': [] };
    const loggedKeys = new Set();

    const getParent = (issue) =>
      issue.fields.parent?.fields?.summary || 'General Tasks';

    const calcProgress = (issue, secondsToday) => {
      const sp   = issue.fields[CONFIG.SP_FIELD] || 0;
      const goal = sp * CONFIG.HOURS_PER_POINT;
      if (goal === 0) return 'N/A';
      const totalSpent = (issue.fields.timetracking.timeSpentSeconds || 0) / 3600;
      const current = (totalSpent / goal) * 100;
      const prev    = ((totalSpent - secondsToday / 3600) / goal) * 100;
      return `${Math.round(prev)}% ➔ ${Math.round(current)}%`;
    };

    logData.issues.forEach((issue) => {
      loggedKeys.add(issue.key);
      const myLogs     = issue.fields.worklog.worklogs.filter((l) => l.author.accountId === myId);
      const targetLogs = myLogs.filter((l) => l.started.startsWith(targetDate));
      const hasLoggedBefore = myLogs.some((l) => l.started.split('T')[0] < targetDate);
      const secondsToday = targetLogs.reduce((acc, l) => acc + l.timeSpentSeconds, 0);
      const category = hasLoggedBefore ? 'Progress Changed' : 'Done Yesterday';

      report[category].push({
        TaskLink: `https://${CONFIG.DOMAIN}/browse/${issue.key}`,
        Title: issue.fields.summary,
        ParentSummary: getParent(issue),
        Time: (secondsToday / 3600).toFixed(2) + 'h',
        Progress: calcProgress(issue, secondsToday),
        Status: issue.fields.status.name,
      });
    });

    planData.issues.forEach((issue) => {
      if (!loggedKeys.has(issue.key)) {
        report['Plan for Today'].push({
          TaskLink: `https://${CONFIG.DOMAIN}/browse/${issue.key}`,
          Title: issue.fields.summary,
          ParentSummary: getParent(issue),
          Status: issue.fields.status.name,
          SP: issue.fields[CONFIG.SP_FIELD] || 0,
        });
      }
    });

    return report;
  },
};

// ----------------------------------------------------------------
// GEMINI SERVICE
// ----------------------------------------------------------------
const GeminiService = {
  SYSTEM_INSTRUCTION: `
📌 Role & Context
You are a Senior Backend Developer Assistant. Your primary goal is to transform raw Jira worklog data (JSON or lists) into a professional, highly structured Daily Report for the Backend team on the Core project. The output is specifically designed for Slack communication.

📋 Output Format (STRICT ADHERENCE REQUIRED)
You MUST follow this exact template and character styling:

DAILY REPORT — [Date, e.g., 4 Apr 2026]
Name: Nhat Huy
Platform: Backend

——————————————————
DONE YESTERDAY
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: 100% (or X%)
    ◦ Remaining: [If < 100%, describe specific remaining actions]

PROGRESS CHANGED
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: X% → Y%
    ◦ Reason: [Brief technical summary of work done based on logs]

PLAN FOR TODAY
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: X% by EOD | Full task done: [Estimated completion date]
    ◦ AI: [Describe AI usage, e.g., "Write solution design, generate code, review code"]

Blocker: None (or describe blockers)
At-risk: None (or describe risks)
Question: None (or describe questions)

🧠 Data Processing Logic
Jira Links: Always format links as https://everfit.atlassian.net/browse/[KEY].
DONE YESTERDAY: tasks that reached 100% OR had significant worklogs yesterday. If Progress < 100%, Remaining is mandatory.
PROGRESS CHANGED: ongoing tasks with a percentage increase. Reason must be in professional technical English.
PLAN FOR TODAY: tasks in "In Progress", "In Review", or "QA FAILED" not completed yesterday.
Grouping: Always group sub-tasks under their Parent/Epic.

✍️ Tone & Style
Professional, concise, action-oriented. Use technical terminology. Use 🎉 Done, 🚀 Progress, 📅 Plan.
  `,

  /**
   * Send report data to Gemini with model fallback.
   * Tries GEMINI_MODELS[0] first; falls back to [1] on error (e.g. high demand).
   */
  async generateReport(jsonData, displayName, targetDate) {
    const contextLine = `Reporter Name: ${displayName}\nPlatform: Backend\nReport Date: ${targetDate}`;
    const prompt = `${contextLine}\n\nPlease generate a Daily Report based on this JSON data: ${JSON.stringify(jsonData)}`;

    const body = {
      system_instruction: { parts: [{ text: this.SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, topP: 0.8, topK: 40 },
    };

    let lastError;
    for (const model of CONFIG.GEMINI_MODELS) {
      try {
        const url = `${CONFIG.GEMINI_BASE_URL}/${model}:generateContent?key=${CONFIG.GEMINI_KEY}`;
        const res  = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) throw new Error(`Gemini API: ${data.error.message}`);
        if (!data.candidates?.length) throw new Error('Gemini returned no results (safety filter?).');
        return data.candidates[0].content.parts[0].text;
      } catch (err) {
        console.warn(`[Gemini] model ${model} failed:`, err.message);
        lastError = err;
      }
    }
    throw lastError;
  },
};

// ----------------------------------------------------------------
// GITHUB SERVICE
// ----------------------------------------------------------------
const JIRA_ID_RE = /[A-Z]+-\d+/g;

function toGmt7DateStr(utcStr) {
  const gmt7 = new Date(new Date(utcStr).getTime() + 7 * 60 * 60 * 1000);
  return gmt7.toISOString().slice(0, 10);
}

function extractIds(str) {
  return [...new Set([...(str || '').matchAll(JIRA_ID_RE)].map((m) => m[0]))];
}

const GitHubService = {
  /**
   * Fetch GitHub events for CONFIG.GITHUB_USERNAME on a given date (GMT+7).
   * Returns newest-first (as GitHub returns them).
   */
  async fetchEventsForDate(targetDate) {
    const res = await fetch(
      `https://api.github.com/users/${CONFIG.GITHUB_USERNAME}/events?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${CONFIG.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!res.ok) {
      const msg = res.status === 401
        ? 'Invalid GitHub token. Please check your PAT.'
        : `GitHub API error: ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    const events = await res.json();
    
    return events.filter((e) => {
      // 1. Filter by date (GMT+7)
      const isCorrectDate = toGmt7DateStr(e.created_at) === targetDate;
      // 2. Filter by Repo name
      const isAllowedRepo = CONFIG.ALLOWED_REPOS.includes(e.repo.name);
      
      return isCorrectDate && isAllowedRepo;
    });
  },

  /**
   * Extract a Map<ticketId, { seconds, description }> from events.
   * - events must be OLDEST-FIRST (caller reverses fetchEventsForDate result)
   * - First event per ticket wins
   * - Two-pass: pass 1 collects "review tickets", pass 2 assigns descriptions
   *
   * Description rules:
   *   review event  → "Review code"
   *   commit + ticket was also reviewed → "Resolve comment feedbacks, write tests, write API docs, self-test"
   *   commit only   → "Implement based on solution design & implementation plan, self-review, self-test"
   */
  extractTicketMap(events) {
    const timeConfig = {
      timeCommit:  CONFIG.TIME_COMMIT,
      timeApprove: CONFIG.TIME_APPROVE,
      timeComment: CONFIG.TIME_COMMENT,
    };

    // Pass 1: Collect all tickets that appear in any review-related events (PR opened, merged, review)
    const reviewTickets = new Set();
    for (const ev of events) {
      if (['PullRequestReviewEvent', 'PullRequestReviewCommentEvent', 'PullRequestEvent'].includes(ev.type)) {
        const pr = ev.payload.pull_request;
        const text = (pr?.title || '') + ' ' + (pr?.head?.ref || '');
        extractIds(text).forEach(id => reviewTickets.add(id));
      }
    }

    const result = new Map();
    for (const ev of events) {
      let ticketIds = [];
      let eventType = null;
      let seconds   = 0;

      // CASE 1: PUSH CODE
      if (ev.type === 'PushEvent') {
        eventType = 'commit';
        seconds   = timeConfig.timeCommit;
        const ref  = ev.payload.ref || '';
        const msgs = (ev.payload.commits || []).map((c) => c.message).join(' ');
        ticketIds  = extractIds(ref + ' ' + msgs);
      } 
      // CASE 2: CREATE BRANCH
      else if (ev.type === 'CreateEvent' && ev.payload.ref_type === 'branch') {
        eventType = 'commit';
        seconds   = timeConfig.timeCommit;
        ticketIds = extractIds(ev.payload.ref || '');
      }
      // CASE 3: PR ACTIONS
      else if (ev.type === 'PullRequestEvent') {
        const action = ev.payload.action;
        // Chúng ta quan tâm khi mở PR hoặc Merge PR
        if (['opened', 'merged', 'reopened'].includes(action)) {
          eventType = 'review'; // PR actions tính vào quỹ review/admin
          seconds   = timeConfig.timeApprove;
          const pr = ev.payload.pull_request;
          ticketIds = extractIds((pr?.title || '') + ' ' + (pr?.head?.ref || ''));
        }
      }
      // CASE 4: REVIEW & COMMENT
      else if (ev.type === 'PullRequestReviewEvent') {
        eventType = 'review';
        seconds   = ev.payload.review?.state === 'approved' ? timeConfig.timeApprove : timeConfig.timeComment;
        const pr = ev.payload.pull_request;
        ticketIds = extractIds((pr?.title || '') + ' ' + (pr?.head?.ref || ''));
      }
      else if (ev.type === 'PullRequestReviewCommentEvent') {
        eventType = 'review';
        seconds   = timeConfig.timeComment;
        ticketIds = extractIds(ev.payload.pull_request?.title || '');
      }

      // First-occurrence wins logic
      for (const id of ticketIds) {
        if (result.has(id)) continue; 

        const description =
          eventType === 'review' ? 'Review code, discuss technical solutions' :
          reviewTickets.has(id)  ? 'Resolve comment feedbacks, write tests, write API docs, self-test' :
                                   'Implement based on solution design & implementation plan, self-review, self-test';
        
        result.set(id, { seconds, description });
      }
    }

    return result;
  },

  /**
   * Check whether a Jira ticket already has an [AI] worklog on targetDate for current user.
   * Prevents duplicate syncs.
   */
  async isSynced(issueKey, targetDate, myAccountId) {
    const res = await fetch(
      `https://${CONFIG.DOMAIN}/rest/api/3/issue/${issueKey}/worklog`,
      { credentials: 'include' }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return (data.worklogs || []).some(
      (l) =>
        l.author.accountId === myAccountId &&
        l.started.startsWith(targetDate) &&
        (l.comment?.content?.[0]?.content?.[0]?.text || '').includes('[AI]')
    );
  },
};

// ----------------------------------------------------------------
// RUNNER — Daily Report
// ----------------------------------------------------------------
async function runDailyTool(dateStr = null) {
  const baseDate  = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const targetDate = DateHelper.getTargetDate(baseDate);
  console.log(`⏳ [1/3] Fetching Jira data for ${targetDate}...`);

  const profile    = await JiraService.getMyProfile();
  const reportData = await ReportEngine.generate(profile.accountId, targetDate, baseDate);
  console.log('✅ Raw report:');
  console.dir(reportData, { depth: null });

  console.log('⏳ [2/3] Sending to Gemini AI...');
  const slackReport = await GeminiService.generateReport(reportData, profile.displayName, targetDate);

  console.log(`%c🚀 FINAL SLACK REPORT — ${targetDate}`, 'color:#00ff00;font-size:18px;font-weight:bold');
  console.log('--------------------------------------------------');
  console.log(slackReport);
  console.log('--------------------------------------------------');
  return slackReport;
}

// ----------------------------------------------------------------
// RUNNER — GitHub Sync
// ----------------------------------------------------------------
/**
 * Preview or execute GitHub → Jira worklog sync.
 * @param {string|null} dateStr  - YYYY-MM-DD (defaults to today in GMT+7)
 * @param {boolean}     dryRun   - true = preview only, false = create worklogs
 */
async function runGitHubSync(dateStr = null, dryRun = true) {
  const targetDate = dateStr || DateHelper.formatDate(new Date());
  console.log(`⏳ Fetching GitHub events for ${targetDate} (dryRun=${dryRun})...`);

  const [events, profile] = await Promise.all([
    GitHubService.fetchEventsForDate(targetDate),
    JiraService.getMyProfile(),
  ]);

  console.log(`   GitHub events on this date: ${events.length}`);
  console.log('events:', events);
    
  // Oldest-first for first-occurrence logic
  const ticketMap = GitHubService.extractTicketMap([...events].reverse());

  if (ticketMap.size === 0) {
    console.log('ℹ️  No Jira tickets found in today\'s GitHub events.');
    return;
  }

  // Check for already-synced tickets (parallel)
  const keys       = [...ticketMap.keys()];
  const syncedFlags = await Promise.all(
    keys.map((k) => GitHubService.isSynced(k, targetDate, profile.accountId))
  );

  const pending = keys.filter((_, i) => !syncedFlags[i]);
  const skipped = keys.filter((_, i) =>  syncedFlags[i]);

  console.log('\n📋 Tickets to sync:');
  pending.forEach((k) => {
    const { seconds, description } = ticketMap.get(k);
    console.log(`  ✅ ${k}  ${(seconds/3600).toFixed(2)}h  "${description}"`);
  });
  if (skipped.length) {
    console.log('\n⏭️  Already synced (skipped):');
    skipped.forEach((k) => console.log(`  — ${k}`));
  }

  if (dryRun) {
    console.log('\n🔍 DRY RUN — no worklogs created. Call runGitHubSync(date, false) to commit.');
    return;
  }

  console.log(`\n⏳ Creating ${pending.length} worklog(s)...`);
  await Promise.all(
    pending.map((k) => {
      const { seconds, description } = ticketMap.get(k);
      return JiraService.createWorklog(k, { timeSpentSeconds: seconds, targetDate, description });
    })
  );
  console.log(`✅ Done! Created ${pending.length} worklog(s).`);
}

// ----------------------------------------------------------------
console.log('✅ Core logic loaded.');
console.log('   runDailyTool()             — generate & format daily report');
console.log('   runGitHubSync()            — preview GitHub sync (dry run)');
console.log('   runGitHubSync(date, false) — execute GitHub sync');

runGitHubSync();
```
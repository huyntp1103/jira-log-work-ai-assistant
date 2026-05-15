# Functional Spec & Technical Architecture

## 1. System Components & Project Structure

```text
src/
├── background/
│   └── worker.js               # Service worker (Manifest V3 required)
├── content/
│   └── main.js                 # Injected into Jira tabs (captures jiraDomain)
├── popup/
│   ├── App.jsx                 # Root component (tab routing, shared state)
│   ├── index.jsx               # Entry point (ReactDOM + ErrorBoundary)
│   ├── index.html              # HTML shell
│   ├── index.css               # Tailwind imports + custom styles
│   ├── ErrorBoundary.jsx       # Crash recovery UI
│   └── components/
│       ├── JiraTrackerPanel.jsx   # Jira Tasks tab (default)
│       ├── GitHubSyncPanel.jsx    # GitHub Sync tab
│       ├── WorklogPreview.jsx     # Editable worklog list in Daily Report tab
│       ├── ReportPreview.jsx      # Gemini output + Copy to Clipboard
│       ├── DatePicker.jsx         # Shared date picker (hidden on Jira Tasks)
│       ├── Settings.jsx
│       └── TemplateSelector.jsx
├── services/
│   ├── jira.js                 # JiraService: REST API v3 wrapper
│   ├── gemini.js               # GeminiService: AI formatting + connection test
│   ├── storage.js              # chrome.storage wrapper + buildInstruction()
│   └── report-engine.js        # ReportEngine: Jira data → categorised JSON
├── hooks/
│   └── useReport.js            # Popup ↔ background messaging for GENERATE_REPORT
└── utils/
    ├── date.js                 # formatDate, getReportDate, (legacy) getTargetDate
    ├── time.js                 # fmtTime, parseTime (shared by GitHub Sync + Worklog Preview)
    └── progress.js             # Progress % calc with status-based scaling
```

### Component Roles

- **`popup/`** — The only React surface, rendered in the Chrome **side panel**. The folder name is historical (predates the side panel migration).
  - Three-tab layout (order, left → right): **Jira Tasks** (default) | **GitHub Sync** | **Daily Report**.
  - Shared DatePicker + Save button — hidden on the Jira Tasks tab.
  - Per-tab cache state with auto-load on date change.
- **`content/main.js`** — Captures `window.location.hostname` on Jira tabs, writes to `chrome.storage.sync` as `jiraDomain`.
- **`background/worker.js`** — Listens for messages, orchestrates: storage → Jira → ReportEngine → Gemini → respond.
- **`services/`** — Service layer. Each service is a class with static methods.
- **`hooks/`** — Thin wrapper around `chrome.runtime.sendMessage`.
- **`utils/`** — Pure functions. No side effects, testable in isolation.

### Message Protocol (Popup ↔ Background)

```text
# Daily Report
Popup → Background: { type: 'GENERATE_REPORT', date, templateId }
Background → Popup: { type: 'REPORT_RESULT', report, formattedText }
Background → Popup: { type: 'REPORT_ERROR', error }

# Settings
Popup → Background: { type: 'TEST_GEMINI', apiKey }

# GitHub Sync
Popup → Background: { type: 'GITHUB_SYNC_PREVIEW', date }
Background → Popup: { type: 'GITHUB_SYNC_DATA', rows }
Background → Popup: { type: 'GITHUB_SYNC_ERROR', error }
Popup → Background: { type: 'GITHUB_SYNC_CONFIRM', worklogs, date }
Background → Popup: { type: 'GITHUB_SYNC_DONE', count }

# Daily Report → Worklog Preview
Popup → Background: { type: 'JIRA_WORKLOG_PREVIEW', date }
Background → Popup: { type: 'JIRA_WORKLOG_DATA', rows, domain }
Popup → Background: { type: 'JIRA_WORKLOG_UPDATE', issueKey, worklogId, timeSpentSeconds?, comment? }
Background → Popup: { type: 'JIRA_WORKLOG_UPDATED' }
Background → Popup: { type: 'JIRA_WORKLOG_ERROR', error }

# Jira Tasks tab
Popup → Background: { type: 'JIRA_TRACKER_DETECT', input }
Background → Popup: { type: 'JIRA_TRACKER_DETECTED', tracker }
Popup → Background: { type: 'JIRA_TRACKER_TASKS', tracker, allAssignees }
Background → Popup: { type: 'JIRA_TRACKER_TASKS_DATA', rows, domain }
Background → Popup: { type: 'JIRA_TRACKER_ERROR', error }
```

## 2. Data Fetching Logic (Jira API)

### A. Target Date

- The picked date is used **directly** as `targetDate` — no automatic conversion.
- Both Generate Report and GitHub Sync use the same date.
- DatePicker `max` is capped at today.
- Use local time formatting (`formatDate`), never `toISOString()`.
- `DateHelper.getTargetDate()` (legacy Mon→Fri logic) still exists but is no longer called.
- **Report date** (the date Gemini writes in the report header) is the **next working day** computed via `DateHelper.getReportDate(workDateStr)` — Fri/Sat/Sun → Mon, otherwise +1 day.

### B. Worklog 20-item cap (critical)

JQL search returns up to **20 embedded worklogs per issue, oldest-first**. For issues with more history, recent worklogs can be truncated. To prevent the preview and the data sent to Gemini from disagreeing:

- `JiraService.resolveWorklogsForDate(domain, issues, date)` re-fetches each issue's worklogs via `/rest/api/3/issue/{key}/worklog?startedAfter=...&startedBefore=...` (GMT+7 day window) when `embedded.length >= 20`.
- Both `JiraService.fetchMyWorklogs` (preview) and `ReportEngine.generate` route issues through this helper.

### C. "Done Yesterday" & "Progress Changed"

- **JQL:** `worklogAuthor = currentUser() AND worklogDate = "{targetDate}"`
- After resolving the 20-cap fallback, each user worklog is filtered to ones whose `started` parses to `targetDate` in local time.
- **Category:** Has prior logs → "Progress Changed". Else → "Done Yesterday".

### D. "Plan for Today"

```
assignee = currentUser() AND sprint in openSprints()
AND (
  status = "In Progress"
  OR (status in ("In Review", "QA FAILED") AND created >= "-14d")
)
```
- `In Progress` issues are **always** in Plan for Today (even when logged today).
- Other statuses (`In Review`, `QA FAILED`) are excluded if logged today (deduplication via `loggedIssueKeys`).

### E. Required fields on JQL search

`summary`, `status`, `worklog`, `timetracking`, `parent`, `customfield_10014` (SP).

### F. User Profile

- **Endpoint:** `/rest/api/3/myself`
- **Returns:** `{ accountId, displayName }`. `displayName` is cleaned to strip platform suffixes — e.g. `"Nhat Huy (BE)"` → `"Nhat Huy"`.
- **Platform/Role** for Gemini context is derived from the first word of the active template name (e.g. "Backend Core" → "Backend").

### G. Worklog editing

- **Endpoint:** `PUT /rest/api/3/issue/{key}/worklog/{id}`
- Used by the **editable Worklog Preview** on the Daily Report tab.
- The `[Generated by Log Work tool]` prefix is intentionally NOT added by `updateWorklog` — preserves user-authored comments.

### H. Jira Tasks tab (Releases & Epics)

- **Detect** (worker `handleJiraTrackerDetect`):
  - `^[A-Z]+-\d+$` → `/rest/api/3/issue/{key}`, require `issuetype.name === 'Epic'`.
  - `^\d+$` → `/rest/api/3/version/{id}` AND `/rest/api/3/issue/UP-{id}` in parallel. Epic wins if both resolve.
  - Default project key for bare numbers: **`UP`** (hardcoded).
- **Task JQL** (worker `handleJiraTrackerTasks`):
  - Release: `[assignee = currentUser() AND ]fixVersion = {id} ORDER BY status, key`
  - Epic:    `[assignee = currentUser() AND ]parent = {key} ORDER BY status, key`
  - The `assignee` clause is dropped when the **All assignees** toggle is on.
- **Status grouping order:** QA Failed → To Do → In Progress → In Review → QA Ready → In Test → QA Success → Other.
- **Hide QA Success** is a client-side filter (no re-fetch needed).

### I. GitHub Sync — PR-body fallback

`GitHubService.extractTicketMap` is async. When a PR-related event lacks a Jira ID in `pr.title + pr.head.ref` (common for `PullRequestReviewEvent` — title isn't present in the events feed), it fetches the PR via `pr.url` and scans `title + body`. Per-URL caching avoids duplicate fetches across both passes.

## 3. Progress Calculation

- **Rule:** 1 Story Point (SP) = `hoursPerPoint` working hours (default `4`).
- **Formula:** `Current Progress (%) = (Total Time Spent / (SP * hoursPerPoint)) * 100`
- **Change Detection:** `Previous % = ((Total Spent - Today's Log) / (SP * hoursPerPoint)) * 100`
- If SP = 0 or missing → return `"N/A"`.
- **Velocity:** User completes ~1.5 SP/day (Gemini uses this for EOD estimates).

### Status-based scaling

Raw progress is scaled proportionally when it exceeds the status cap:

| Status     | Max Progress |
| ---------- | ------------ |
| `QA READY` | 100%         |
| All others | 90%          |

Both `prev` and `current` values use the same ratio (`cap / rawMax`) so relative change is preserved. Example: raw 100% → 150% with cap 90% becomes 60% → 90%.

The Jira Tasks tab does **not** display progress — it shows status + SP only.

## 4. Data Structure & Grouping (Daily Report)

- Every task is linked to its **Parent/Epic Summary** (text only, not link).
- Grouping level: `Parent (Text)` → `Sub-tasks (Link + Summary)`.
- Fallback parent name: `"General Tasks"`.

## 5. Reporting Targets

- **Slack:** Rich formatting with Markdown and emojis.
- **Spreadsheet:** Plain text, no Markdown, double newlines, optimised for single-cell display.

## 6. AI Processing Strategy

### Template wrapper (`buildInstruction(format, platform)`)

`buildInstruction` in `storage.js` wraps a user's desired format into a full Gemini instruction. It adds:

- Role & context prompt
- Data processing rules (categorisation, grouping)
- Velocity-based progress estimation rules (1.5 SP/day)
- Platform-specific tone hints (Backend, QA, Android, iOS, Web, BA)

### Context injection

The Gemini prompt receives dynamic context from the worker:

```text
Reporter Name: {displayName from Jira profile}
Platform/Role: {first word of template name}
Report Date: {next working day after the picked date}
```

### API integration

- Uses `system_instruction` field (snake_case, not camelCase) for the REST API.
- Model fallback array: `['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite']` — primary first, falls back on error.
- Engine provides `ParentSummary` for each task so the AI can group correctly.

## 7. Storage Schema

### chrome.storage.sync

```json
{
  "settings": {
    "geminiKey": "STRING",
    "spField": "customfield_10014",
    "hoursPerPoint": 4,
    "timeCommit": 3600,
    "timeApprove": 900,
    "timeComment": 900
  },
  "templates": [
    {
      "id": "UUID",
      "name": "Backend Core (Default)",
      "format": "STRING (output format)",
      "isDefault": true
    }
  ],
  "jiraDomain": "company.atlassian.net",
  "jiraTrackers": [
    { "id": "27643",    "type": "version", "label": "Client Report (TBD)" },
    { "id": "UP-68179", "type": "epic",    "label": "Queue improvement (API)" }
  ],
  "jiraTrackerOptions": {
    "allAssignees": false,
    "hideQaSuccess": true
  }
}
```

### chrome.storage.local

```json
{
  "githubToken":     "STRING (PAT)",
  "githubUsername":  "STRING",
  "allowedRepos":    "comma,separated,Org/repo,list",
  "dailyCache": {
    "2026-05-12": {
      "reportText": "STRING",
      "githubRows": [{ "key": "...", "summary": "...", "seconds": 3600, "description": "..." }],
      "savedAt":    "ISO-8601"
    }
  }
}
```

`dailyCache` is pruned to the last 30 entries on save.

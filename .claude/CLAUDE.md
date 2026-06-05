# Daily Report AI Assistant (Browser Extension)

## Project Vision
A "frictionless" Chrome Extension that automates daily reporting and Jira admin work for engineering teams.
It bridges Jira activity (worklogs, sprints, releases, epics) and communication platforms (Slack, spreadsheets) using Gemini AI, plus surfaces a portfolio view of tracked releases/epics so users can monitor their workload without leaving the tab.

## Target Users
- **Primary:** Backend Developers (Core Project, Everfit "UP" project).
- **Secondary:** Non-technical teammates (QA, BA, Android/iOS, Web) who need customised report formats.

## Tech Stack (Manifest V3)
- **Core Architecture:** Chrome Extension Manifest V3.
- **UI Surface:** Chrome Side Panel API (Chrome 114+). Opens via toolbar icon (`openPanelOnActionClick: true`); persistent across tab navigation.
- **Build Tool:** Vite + `@crxjs/vite-plugin`.
- **Frontend:** React + Tailwind CSS. Fluid layout with `max-w-[520px]` content cap.
- **State/Storage:** `chrome.storage.sync` for settings, templates, Jira domain, trackers; `chrome.storage.local` for GitHub credentials and the daily cache.
- **AI Engine:** Gemini API with model fallback array `['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite']` — primary first, falls back on error. Can be swapped at runtime for a deterministic local renderer via the **Report Engine** toggle in Settings (persisted as `settings.reportEngine`, values `gemini` | `local`).
- **Language:** JavaScript (ES6+).

## Core Features

### Three-tab UX
Tab order (left → right) and default: **Jira Tasks** (default) | **GitHub Sync** | **Daily Report**.

1. **Jira Tasks** — Portfolio view of tracked Jira **Releases** (versions), **Epics**, and **Boards**.
   - User types a bare numeric id (e.g. `27643`), a full issue key (e.g. `UP-68179`), **or pastes a board URL** (e.g. `https://<domain>/jira/software/c/projects/UP/boards/26?...`).
     - URL with `/boards/{N}` → board tracker. The original URL is stored under `tracker.url` so the open-in-Jira link preserves the user's filters.
     - Bare number → worker probes `/rest/api/3/version/{id}` and `/rest/api/3/issue/UP-{id}` in parallel; epic wins if both resolve.
     - `XX-NNN` → required to be an Epic.
   - Trackers are persisted to `chrome.storage.sync` under `jiraTrackers` and can be reordered via drag-and-drop.
   - Each tracker expands inline to show tasks grouped by status in this order: **QA Failed → To Do → In Progress → In Review → QA Ready → In Test → Other** (any unrecognised status — including `QA Success` — falls into the **Other** bucket).
   - Two global toggles (persisted under `jiraTrackerOptions`): **All assignees** (default off — drops `assignee = currentUser()` from JQL) and **Hide other status** (default on — client-side filter hiding the `Other` bucket, which is where `QA Success` lives).
   - **Tracker header:** chevron + type badge toggles expand; the tracker label itself is a link that opens it in Jira; refresh + remove icons on the right. The done/total count counts rows whose raw status is `QA Success`.
   - **Per-task status pill** is a click-to-open dropdown listing the issue's Jira workflow transitions (loaded on demand via `JIRA_TRANSITIONS_LIST`); selecting one calls `JIRA_TRANSITION_EXECUTE` and reloads the tracker.
   - **Create task in an Epic:** Epic trackers show a `+` button in the header. It expands an inline form scoped to that Epic with fields: **Type** (Task / Bug, default Task), **Title** (required), **Description** (optional), **Story Points** (default `0.5`), **Priority** (Highest / High / Medium / Low / Lowest, default Medium), **Fix versions** (default "To be confirmed", or "N/A" — see below). The assignee is auto-set to the current Jira user, and the new ticket is linked to the Epic via the `parent` field. On submit, the worker calls `JIRA_ISSUE_CREATE` and the tracker reloads so the new ticket appears.
   - Default project key for bare-number lookups is hardcoded `UP`.
   - Default Jira domain (when none has been captured from a tab yet) is hardcoded `everfit.atlassian.net` in `StorageService.getJiraDomain`.

2. **GitHub Sync** — Auto-create Jira worklogs from GitHub activity.
   - Fetch user events for the picked date, extract Jira ticket IDs from commits/branches/PR titles/PR bodies, build a preview table, then bulk-create worklogs.
   - Deduplication: existing worklogs prefixed with `[Tool]` are filtered out before the preview is shown and re-checked at sync time.
   - **PR-event ID priority:** `title` > `head.ref` (branch) > PR body. Title wins outright when it contains any `XX-NNN`, so a branch-only ID never gets picked up alongside.
   - **Push/Create branch-name override:** a pre-pass over the same batch builds a `branch → title-IDs` map from PR/Review events. Push and Create events on those branches use the PR title's IDs (plus any IDs explicitly typed into commit messages) instead of mining the branch name. So a PR titled `UP-70323 ...` on branch `feat/UP-70470-2` resolves to `UP-70323`, not `UP-70470`.
   - PR-body fallback (only used when both title and branch produce no IDs, common for `PullRequestReviewEvent`): the worker fetches the PR and scans `title + body`, with per-URL caching.

3. **Daily Report** — AI-formatted daily report for Slack/etc.
   - **Worklog Preview** at the top: shows the user's Jira worklogs for the picked date with **editable** time + description per row. Per-row Save icon updates the worklog in Jira (`PUT /rest/api/3/issue/{key}/worklog/{id}`). Auto-collapses when **Generate Report** is clicked.
   - **Log new time** dashed button beneath the list opens an inline form. Ticket dropdown lists issues the user has logged on in the **last 7 days** (via `JiraService.fetchRecentTickets`). On submit, `JiraService.createWorklog` is called with `addToolPrefix: false` so user-authored comments stay clean. The list refreshes automatically afterwards.
   - **Generate Report** sends the categorised report data to Gemini using the active template.
   - Categories: "Done Yesterday" (logged today, no prior logs), "Progress Changed" (logged today, has prior logs), "Plan for Today" (open sprint issues).
   - `In Progress` Plan-for-Today issues are always kept even if logged today; other statuses are deduplicated against logged keys.

### Shared
- **Daily Cache** — Save/load per date (`chrome.storage.local` key `dailyCache`, 30-day retention). Stores `{ reportText, savedAt }` only — `githubRows` is no longer persisted (the GitHub Sync tab refetches on demand). Auto-loads on date change. The "Restored from cache" banner has a Refresh button per tab. Date picker is hidden on the Jira Tasks tab.
- **Multi-Platform Templates** — Users define their preferred format; Gemini is given platform-specific processing rules (Backend, QA, BA, Android, iOS, Web).

## Project Layout

### Services
- **`src/services/jira.js`** — Jira REST API v3 + Agile API (`/rest/agile/1.0/...`).
  - `fetchJira`, `getMyProfile`, `searchJql`
  - `getVersion(id)`, `getIssue(key, requiredType)` — used for tracker detection.
  - `getBoard(id)`, `getActiveSprintForBoard(boardId)` — used for board tracker detection and to scope its task list to the currently active sprint.
  - `getTransitions(domain, key)` / `transitionIssue(domain, key, transitionId)` — list workflow transitions and execute one. Powers the per-task status dropdown in the Jira Tasks tab. `transitionIssue` bypasses `fetchJira` (Jira returns 204 No Content on success).
  - `createIssue(domain, opts)` — POST `/rest/api/3/issue`. Used by the **Create task in Epic** feature. Wraps the description in ADF, sets the Epic link via `parent: { key: epicKey }` (Jira Cloud), sets Story Points via the configured `spField` custom field, and accepts an array of `fixVersionIds`.
  - `fetchMyWorklogs(domain, accountId, date)` — flat user worklogs for a date, sorted ascending. Falls back to `/issue/{key}/worklog?startedAfter=...&startedBefore=...` when the embedded array hits the 20-item cap (Jira truncates oldest-first).
  - `resolveWorklogsForDate(domain, issues, date)` — shared 20-cap fallback used by both the preview and the report engine, so totals match.
  - `fetchRecentTickets(domain, accountId, days = 7)` — deduplicated `[{key, summary}]` for tickets the user has worklogged in the window, most-recent-activity first. Powers the **Log new time** dropdown.
  - `createWorklog` — accepts an `addToolPrefix` flag (default `false`). The GitHub Sync caller passes `true` so dedup via `[Tool]` still works; user-created worklogs from the Daily Report tab leave it `false`.
  - `updateWorklog` — used by the editable preview; does NOT add the prefix (preserves user-authored comments).
- **`src/services/gemini.js`** — Gemini API; `generateReport` + `testConnection` with model fallback loop.
- **`src/services/local-formatter.js`** — `LocalFormatter.formatReport(report, context)`: deterministic, no-AI renderer that produces the same Slack-friendly text the Gemini path returns. Used when the **Report Engine** setting is `local`. Subjective fields (Reason / Remaining / AI usage) are emitted as `<fill in …>` placeholders; the rest (Title, Link, Progress, parent grouping, EOD-completion date via 1.5 SP/day weekday velocity) is computed.
- **`src/services/github.js`** — GitHub Events API.
  - `fetchEventsForDate` (filter by GMT+7 date + `allowedRepos`).
  - `extractTicketMap` — async, multi-pass:
    1. Pre-pass: build a `branch → title-IDs` map from PR/Review events.
    2. Review pass: collect tickets that appear in any review-type event (used to label `Resolve comment feedbacks ...` later).
    3. Main pass: per event, extract IDs with the priority above (title > branch > PR body for PR events; commit-message + mapped-title-IDs for Push, mapped-title-IDs for Create when branch is known). First occurrence per ticket wins.
  - PR fetches for the title+body fallback are cached per PR URL.
  - `isSynced` — detects `[Tool]` worklogs on a given date.
- **`src/services/storage.js`** — All `chrome.storage` access. Settings, templates, Jira domain, GitHub credentials, daily cache, trackers, tracker options. Also `buildInstruction(format, platform)` for the Gemini system prompt, plus `getStorageUsage()` (used by Settings → Local Storage card) and `clearDailyCache()`.
- **`src/services/report-engine.js`** — Fetches Jira data, categorises into the three buckets, runs the 20-cap fallback via `resolveWorklogsForDate`.

### React UI (rendered in the Chrome side panel)
The `src/popup/` folder name is historical (predates the side panel migration). All UI lives here.
- **`src/popup/App.jsx`** — Tab routing (`tasks` | `github` | `report`), DatePicker, Save, cache banners, settings entry.
- **`src/popup/components/JiraTrackerPanel.jsx`** — Jira Tasks tab. Tracker list with drag-and-drop, global toggles, status-grouped task lists.
- **`src/popup/components/GitHubSyncPanel.jsx`** — GitHub Sync tab. Editable time + description, bulk sync.
- **`src/popup/components/WorklogPreview.jsx`** — Editable Jira worklog list at the top of the Daily Report tab. Per-row Save icon.
- **`src/popup/components/ReportPreview.jsx`** — Gemini output with Copy-to-Clipboard button.
- **`src/popup/components/DatePicker.jsx`** — Shared date picker. Capped at today.
- **`src/popup/components/Settings.jsx`**, **`TemplateSelector.jsx`** — Settings page.
- **`src/popup/ErrorBoundary.jsx`** — Wraps the app.

### Hooks & utils
- **`src/hooks/useReport.js`** — Wires `GENERATE_REPORT` to React state.
- **`src/utils/date.js`** — `formatDate` (local time, no UTC shift), `getReportDate` (next working day), `getTargetDate` (legacy Mon→Fri logic, kept but unused by the worker).
- **`src/utils/time.js`** — Shared `fmtTime` / `parseTime` (used by both GitHubSyncPanel and WorklogPreview).
- **`src/utils/progress.js`** — Progress % helpers used by `report-engine`.

### Background & content
- **`src/background/worker.js`** — Service worker. Message handlers:
  - `GENERATE_REPORT`, `TEST_GEMINI`
  - `GITHUB_SYNC_PREVIEW`, `GITHUB_SYNC_CONFIRM`
  - `JIRA_WORKLOG_PREVIEW`, `JIRA_WORKLOG_UPDATE`, `JIRA_WORKLOG_CREATE`, `JIRA_RECENT_TICKETS`
  - `JIRA_TRACKER_DETECT`, `JIRA_TRACKER_TASKS`
  - `JIRA_TRANSITIONS_LIST`, `JIRA_TRANSITION_EXECUTE`
  - `JIRA_ISSUE_CREATE` — creates a Jira issue inside an Epic (used by the "+ Add task" button on Epic trackers).
- **`src/content/main.js`** — Captures `window.location.hostname` on Jira tabs and writes `jiraDomain` to storage.

## Key Implementation Details

### Date behaviour
- The picked date is used **directly** as `targetDate` for all per-date features. No automatic Mon→Fri conversion.
- DatePicker `max` is capped at today.
- The **report date** (the date written in the report header) is the next working day after the work date (Fri→Mon, Sat→Mon, Sun→Mon, else +1). Computed via `DateHelper.getReportDate`.

### Timezone handling
- Jira profile timezone is **GMT+7**. Worklog `started` strings carry a `+0700` offset.
- Always parse `l.started` with `new Date(isoStr)` and extract local date parts. Never use `.startsWith(date)` or `.split('T')[0]`.
- GitHub events are in UTC; convert to GMT+7 via `utcMs + 7*3600*1000` before date comparison.
- Worklog `started` sent to Jira: `${targetDate}T12:00:00.000+0700`.

### Storage separation
- `chrome.storage.sync` — `settings` (incl. `reportEngine`), `templates`, `jiraDomain`, `jiraTrackers`, `jiraTrackerOptions` (`{ allAssignees, hideOther }`).
- `chrome.storage.local` — `githubToken`, `githubUsername`, `allowedRepos`, `dailyCache` (per-date `{ reportText, savedAt }`, 30-day ring buffer).
- Settings → **Local Storage** card surfaces both areas with per-key sizes and a **Clear daily cache** button (backed by `StorageService.getStorageUsage` / `clearDailyCache`).

### Worklog 20-item cap
JQL search returns up to 20 embedded worklogs per issue, oldest-first. For issues with more history, the recent ones get truncated. Both the Worklog Preview and ReportEngine route issues through `JiraService.resolveWorklogsForDate`, which re-fetches via `/rest/api/3/issue/{key}/worklog?startedAfter=...&startedBefore=...` (GMT+7 day window) when `embedded.length >= 20`. This guarantees the preview and the data sent to Gemini agree on log count and durations.

### GitHub Sync idempotency
- Existing worklogs are checked for the `[Tool]` prefix in `comment.content[0].content[0].text`.
- Already-synced tickets are filtered out before the preview is shown.
- Caching writes ALL preview rows (including already-synced); deduplication runs again at sync time.

### Tracker detection
Worker `handleJiraTrackerDetect`:
- Input contains `/boards/{N}` (URL paste) → fetch `/rest/agile/1.0/board/{N}` for the board name. The original URL is stored under `tracker.url` so the open-in-Jira link preserves the user's filters (e.g. `assignee=...&issueType=...`).
- `^[A-Z]+-\d+$` → fetch `/rest/api/3/issue/{key}` and require `issuetype.name === 'Epic'`.
- `^\d+$` → fetch `/rest/api/3/version/{id}` AND `/rest/api/3/issue/UP-{id}` in parallel. Epic wins if both resolve.
- Anything else → error.

### Tracker task JQL
- Release: `[assignee = currentUser() AND ]fixVersion = {id} ORDER BY status, key`
- Epic:    `[assignee = currentUser() AND ]parent = {key} ORDER BY status, key`
- Board:   resolve active sprint via `/rest/agile/1.0/board/{id}/sprint?state=active`, then `[assignee = currentUser() AND ]sprint = {sprintId} ORDER BY status, key`. Errors with a friendly message if the board has no active sprint.

The `assignee` clause is dropped when the **All assignees** toggle is on.

### Create task in Epic (worker `handleJiraIssueCreate`)

- Triggered by the "+ Add task" button on Epic-type trackers in the Jira Tasks tab.
- **Project key** is derived from the Epic key by splitting on `-` (e.g. `UP-68179` → `UP`). Tickets in an Epic must belong to the same project, so no further lookup is needed.
- **Assignee** is hardcoded to the current user (`accountId` from `JiraService.getMyProfile`).
- **Epic linkage** uses `fields.parent.key = epicKey` (Jira Cloud's modern Epic link). The old `customfield_10008` is not used.
- **Story Points** uses the configured `settings.spField` (default `customfield_10014`); UI default is `0.5`.
- **Priority** is sent as `fields.priority.name` (e.g. `"Medium"`).
- **Fix versions** is a hardcoded two-option dropdown in the form, sourced from the Atlassian "recommend/fields" API response observed on `everfit.atlassian.net`:
  - `12023` → `"To be confirmed"` (default)
  - `10244` → `"N/A"`
  These ids are environment-specific (Everfit's `UP` project). If the extension is ever used in another Jira tenant, the constants in `JiraTrackerPanel.jsx` (`FIX_VERSION_OPTIONS`) need updating. The worker just forwards the picked id into `fields.fixVersions: [{ id }]`.
- **Description** is wrapped into ADF (`type: 'doc'` / `paragraph` / `text`) before being sent.

### Plan for Today JQL
```
assignee = currentUser() AND sprint in openSprints()
AND (
  status = "In Progress"
  OR (status = "QA FAILED" AND created >= twoWeeksAgo)
)
```
"In Progress" has no `created` filter; other statuses are capped at 14 days. `In Progress` tickets stay in Plan for Today even when logged today (other statuses are deduplicated).

## Security & Privacy
- **No hardcoded keys:** users provide their own Gemini API key and GitHub PAT via Settings.
- **Domain scoping:** host permissions limited to `*.atlassian.net` and `generativelanguage.googleapis.com`. GitHub fetches are allowed via the fetch API with the user's PAT.

## Development Rules

- **Report engine toggle** — exposed in Settings as **Report Engine** (Gemini AI / Local Formatter), persisted as `settings.reportEngine` in `chrome.storage.sync`. `gemini` calls the Gemini API; `local` renders deterministically via `LocalFormatter` (no API key required). Switching takes effect immediately — no rebuild needed.

- **After every code change, run this exact sequence:**
  1. `nvm use` — switch to the project's Node version.
  2. `npm run test` — write or update Vitest specs first when relevant. All tests must pass before continuing.
  3. `npm run build` — produce the extension bundle in `dist/`.

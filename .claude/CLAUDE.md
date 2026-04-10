# Jira Daily Report AI Assistant (Browser Extension)

## Project Vision
Build a "Frictionless" Chrome Extension that automates the daily reporting process for Jira users.
It bridges the gap between Jira activity (worklogs/sprints) and communication platforms (Slack/Spreadsheets) using Gemini AI.

## Target Users
- **Primary:** Backend Developers (Core Project).
- **Secondary:** Non-technical teammates (QA, BA, Android/iOS Devs) who need customized report formats.

## Tech Stack (Manifest V3)
- **Core Architecture:** Chrome Extension Manifest V3 (required for modern Chrome Extensions).
- **Build Tool:** Vite + @crxjs/vite-plugin (Fast bundling, HMR support).
- **Frontend:** React + Tailwind CSS (Modern, responsive Popup UI).
- **State/Storage:** `chrome.storage.sync` for settings & templates (synced across devices); `chrome.storage.local` for sensitive credentials (GitHub PAT, token) and daily cache.
- **AI Engine:** Gemini API with model fallback array: `['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite']` — tries primary first, falls back on error (e.g. high demand).
- **Language:** JavaScript (ES6+).

## Core Features
- **Daily Report Generation:** Fetch Jira worklogs, categorize into "Done Yesterday" / "Progress Changed" / "Plan for Today", format with Gemini AI.
- **GitHub Activity Sync:** Fetch GitHub events for a date, extract Jira ticket IDs, create Jira worklogs automatically. Deduplication via `[AI]` tag check on existing worklogs.
- **Daily Cache:** Explicit save/load per date (`chrome.storage.local`, key `dailyCache`, 30-day retention). User saves with floppy icon; restores with clock icon next to DatePicker.
- **Multi-Platform Templates:** Users define report format templates; Gemini wraps them with platform-specific processing rules.
- **Frictionless UX:** Generate + GitHub Sync side-by-side buttons, auto-copy to clipboard.

## Project Layout

- **`src/services/jira.js`** — Jira REST API v3: fetch profile, search JQL, create worklog (ADF comment format, `[AI]` prefix tag).
- **`src/services/gemini.js`** — Gemini API with model fallback loop; `generateReport` + `testConnection`.
- **`src/services/github.js`** — GitHub Events API: `fetchEventsForDate` (filter by date GMT+7 + allowedRepos), `extractTicketMap` (two-pass: review heuristic + first-occurrence-wins), `isSynced`.
- **`src/services/storage.js`** — All `chrome.storage` access: settings, templates, domain, GitHub credentials, daily cache.
- **`src/services/report-engine.js`** — Fetches Jira data, categorizes issues, calculates progress.
- **`src/popup/`** — React UI (App.jsx + components: DatePicker, ReportPreview, GitHubSyncPanel, Settings, TemplateSelector).
- **`src/hooks/useReport.js`** — Thin hook wiring report generation to React state.
- **`src/utils/date.js`** — `getTargetDate` (Mon→Fri logic), `formatDate` (local time, no UTC shift).
- **`src/utils/progress.js`** — Progress % calculation helpers.
- **`src/background/worker.js`** — Service worker: handles `GENERATE_REPORT`, `TEST_GEMINI`, `GITHUB_SYNC_PREVIEW`, `GITHUB_SYNC_CONFIRM` messages.
- **`src/content/`** — Content script injected into Jira tabs (detects domain).
- **`.claude/CORE_LOGIC_SNAPSHOT.md`** — Standalone browser-console version of core logic for manual testing. **Must be kept in sync** when modifying report engine, GitHub sync, or Jira service logic.

## Key Implementation Details

### Timezone handling
- Jira profile timezone is set to **GMT+7**. Worklog `started` strings carry a `+0700` offset.
- Always parse `l.started` with `new Date(isoStr)` and extract local date parts — never use `.startsWith(date)` or `.split('T')[0]` string slicing.
- GitHub events are in UTC; convert to GMT+7 via `utcMs + 7*3600*1000` before date comparison.
- Worklog `started` field sent to Jira: `${targetDate}T09:00:00.000+0700`.

### Storage separation
- `chrome.storage.sync` — `settings`, `templates`, `jiraDomain`
- `chrome.storage.local` — `githubToken`, `githubUsername`, `allowedRepos`, `dailyCache`

### GitHub Sync idempotency
- Existing worklogs are checked for `[AI]` prefix in `comment.content[0].content[0].text`.
- Already-synced tickets are filtered out before showing the preview table.
- Saving rows to cache saves ALL rows (including already-synced); deduplication runs again at sync time.

### Plan for Today JQL
```
assignee = currentUser() AND sprint in openSprints()
AND (
  status = "In Progress"
  OR (status in ("In Review", "QA FAILED") AND created >= twoWeeksAgo)
)
```
"In Progress" has no `created` date filter; other statuses are capped at 14 days.

## Security & Privacy
- **No Hardcoded Keys:** Users provide their own Gemini API key and GitHub PAT via Settings UI.
- **Domain Scoping:** Permissions limited to `*.atlassian.net` and `generativelanguage.googleapis.com`.

## Development Rules
- **No auto build:** Do not run `npm run build` after code changes. The user rebuilds manually.
- **Sync the snapshot:** When modifying `report-engine.js`, `github.js`, or `jira.js` core logic, apply the same change to `.claude/CORE_LOGIC_SNAPSHOT.md`.

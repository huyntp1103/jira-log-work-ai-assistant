# GitHub Activity Sync — Implementation Plan

## Goal

Add a "Sync from GitHub" panel to the existing popup that auto-creates Jira worklogs based on the user's GitHub activity for the selected date.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/services/github.js` | Pure service: fetch events, extract ticket map, check isSynced, write worklog |

## Files to Modify

| File | What Changes |
|------|-------------|
| `src/services/storage.js` | Add `timeCommit`, `timeApprove`, `timeComment` to `DEFAULT_SETTINGS`; add `getGitHubCredentials` / `setGitHubCredentials` using `chrome.storage.local` |
| `src/services/jira.js` | Add `createWorklog(domain, issueKey, payload)` static method |
| `src/background/worker.js` | Add `GITHUB_SYNC_PREVIEW` and `GITHUB_SYNC_CONFIRM` message handlers |
| `src/popup/components/Settings.jsx` | Add "GitHub" section: PAT field + username field + time config inputs |
| `src/popup/App.jsx` | Add GitHub Sync tab/panel next to the existing main view; import `GitHubSyncPanel` |
| `src/popup/components/GitHubSyncPanel.jsx` | **New** — preview table + Sync to Jira button (create this file) |

---

## Step-by-Step Plan

### Step 1 — `src/services/github.js` (new, pure, no Chrome APIs)

Three exported functions:

**`fetchEventsForDate(username, targetDate, token)`**
- `GET https://api.github.com/users/{username}/events?per_page=100`
- Header: `Authorization: Bearer {token}`
- Filter: convert each event's `created_at` (UTC) → GMT+7, keep only events matching `targetDate`
- Return filtered events array (newest-first from GitHub — reverse before passing to extractTicketMap)

**`extractTicketMap(events, timeConfig)`**
- Accepts events in oldest-first order (caller must reverse)
- Regex `[A-Z]+-\d+` on: branch ref, commit messages (PushEvent), PR title + head branch (PullRequestReviewEvent, PullRequestReviewCommentEvent)
- First occurrence per ticket wins — skip if key already in map
- Event type → seconds: `PushEvent` → `timeCommit`, `PullRequestReviewEvent approved` → `timeApprove`, others → `timeComment`
- Event type stored as `'commit'` or `'review'`
- Description logic (applied here, not in worker):
  - `'review'` → `"Review code"`
  - `'commit'` AND ticket already has a review event in the same events list → `"Resolve comment feedbacks, write tests, write API docs, self-test"`
  - `'commit'` AND no review event → `"Implement based on solution design & implementation plan, self-review, self-test"`
- Returns `Map<ticketId, { seconds, description }>`

**`isSynced(domain, issueKey, targetDate, myAccountId)`**
- `GET https://{domain}/rest/api/3/issue/{issueKey}/worklog` with `credentials: 'include'`
- Returns `true` if any worklog has: same `author.accountId`, `started` starting with `targetDate`, and comment text containing `[Everport-Sync]`
- Comment text path: `l.comment?.content?.[0]?.content?.[0]?.text`

---

### Step 2 — `src/services/storage.js` (modify)

**Add to `DEFAULT_SETTINGS`:**
```js
timeCommit: 3600,   // 60 min
timeApprove: 1200,  // 20 min
timeComment: 900,   // 15 min
```

**Add two new static methods to `StorageService`:**
```js
static async getGitHubCredentials() {
  const result = await chrome.storage.local.get(['githubToken', 'githubUsername']);
  return { githubToken: result.githubToken || '', githubUsername: result.githubUsername || '' };
}

static async setGitHubCredentials({ githubToken, githubUsername }) {
  await chrome.storage.local.set({ githubToken, githubUsername });
}
```

---

### Step 3 — `src/services/jira.js` (modify)

Add one static method:
```js
static async createWorklog(domain, issueKey, { timeSpentSeconds, started, description }) {
  return this.fetchJira(
    domain,
    `/rest/api/3/issue/${issueKey}/worklog`,
    'POST',
    {
      timeSpentSeconds,
      started,
      comment: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `${description} [Everport-Sync]` }] }],
      },
    }
  );
}
```

`started` value: `${targetDate}T09:00:00.000+0700`

---

### Step 4 — `src/background/worker.js` (modify)

Add two new message handlers inside the existing `onMessage.addListener`:

**`GITHUB_SYNC_PREVIEW`** handler:
1. Load settings, GitHub credentials, Jira domain, user profile (accountId) from storage/Jira
2. Call `GitHubService.fetchEventsForDate(username, date, token)` → reverse array → call `extractTicketMap(events, timeConfig)`
3. For each ticket in map: call `GitHubService.isSynced(domain, key, date, accountId)` — filter out already-synced tickets
4. `sendResponse({ type: 'GITHUB_SYNC_DATA', rows: [{key, seconds, description}] })`

**`GITHUB_SYNC_CONFIRM`** handler:
1. Receive `worklogs: [{key, seconds, description}]` from popup
2. For each: call `JiraService.createWorklog(domain, key, { timeSpentSeconds, started, description })`
3. `sendResponse({ type: 'GITHUB_SYNC_DONE', count })`

Both handlers must `return true` to keep message channel open.

---

### Step 5 — `src/popup/components/Settings.jsx` (modify)

Add a new "GitHub Sync" card below the existing "Advanced" card:

- **GitHub Username** — text input, saved to `chrome.storage.local` via `StorageService.setGitHubCredentials`
- **GitHub PAT** — password input with Show/Hide toggle, saved to `chrome.storage.local`
- **Time Config** — three number inputs (minutes): "Commit", "PR Approved", "PR Comment" — saved to `chrome.storage.sync` settings (convert to seconds before saving: `value * 60`)

These fields load from storage on mount alongside existing settings. Save button covers all fields (existing behavior extended).

---

### Step 6 — `src/popup/components/GitHubSyncPanel.jsx` (new)

```
Props: { date: string }
```

State: `rows` (array of `{key, seconds, description}`), `loading`, `error`, `syncing`, `syncDone`

**UI structure:**
```
[Sync from GitHub]  ← button, triggers GITHUB_SYNC_PREVIEW
  ↓ (after response)
Table:
  Ticket ID (editable input) | Time (editable, display as "Xh Ym") | Description (read-only)
  ...one row per ticket...

[Sync to Jira]  ← button, triggers GITHUB_SYNC_CONFIRM with current row values
```

Time display helper: `seconds → "1h 30m"` / `"45m"` / `"1h"`
Time edit: parse input back to seconds (accept "1h", "45m", "1h 30m")

States to handle:
- No GitHub credentials set → show "Configure GitHub token in Settings"
- Loading preview → spinner
- Empty result → "No GitHub activity found for this date"
- Already all synced → "All tickets already synced for this date"
- Sync in progress → disabled button + spinner
- Sync done → "X worklogs created"

---

### Step 7 — `src/popup/App.jsx` (modify)

Add a tab toggle between "Daily Report" and "GitHub Sync" views within the main view (not a separate route):

```
[Daily Report] [GitHub Sync]   ← tab bar below header
```

- Tab state: `activeTab` (`'report'` | `'github'`)
- When `activeTab === 'github'`, render `<GitHubSyncPanel date={date} />` instead of the Generate button + ReportPreview
- `DatePicker` and `TemplateSelector` stay visible only on the `'report'` tab
- `DatePicker` stays visible on both tabs (date is shared — user picks once)

---

## Data Flow Summary

```
User clicks "Sync from GitHub"
  → Popup sends GITHUB_SYNC_PREVIEW { date }
  → Worker: loads config → fetches GitHub events → extracts tickets → checks isSynced → returns rows
  → Popup renders preview table

User edits rows, clicks "Sync to Jira"
  → Popup sends GITHUB_SYNC_CONFIRM { worklogs: [{key, seconds, description}] }
  → Worker: createWorklog for each → returns count
  → Popup shows "X worklogs created"
```

---

## Commit Order

1. `github.js` + `storage.js` changes + `jira.js` changes (pure logic, no UI)
2. `worker.js` changes (background handlers)
3. `Settings.jsx` changes (GitHub credentials + time config UI)
4. `GitHubSyncPanel.jsx` (new component)
5. `App.jsx` changes (tab bar)

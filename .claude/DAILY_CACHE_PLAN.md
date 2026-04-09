# Daily Cache — Implementation Plan

## Problem
Popup state is lost when the user clicks outside, switches tabs, or closes the popup.
Both "Generate Report" and "GitHub Sync" results need to be re-fetched every time.

## Goal
Give the user explicit **Save** and **Load** controls per date, so they can save results they are happy with and restore them later without re-fetching.

---

## Storage Design

Use `chrome.storage.local`.

**Key:** `dailyCache`  
**Shape:**
```json
{
  "2026-04-09": {
    "reportText": "DAILY REPORT — 9 Apr 2026\n...",
    "githubRows": [
      { "key": "UP-12345", "summary": "Fix login bug", "seconds": 3600, "description": "Implement based on..." }
    ],
    "savedAt": "2026-04-09T14:32:00.000Z"
  }
}
```

- One entry per date (YYYY-MM-DD key).
- Old dates are **pruned** to keep last **30 days** on every write.
- Both `reportText` and `githubRows` are saved together per date — a save always writes the current state of both.

---

## UI Changes

### Date Picker row — Load icon
Add a small **clock/history icon button** (🕐) next to the date picker.
- Visible always.
- On click: load `dailyCache[date]` and populate both report text and GitHub rows.
- If no cache for that date: show a brief inline toast "No saved result for this date".
- Tooltip: "Load saved result".

### Report Preview — Save icon
Add a small **save/floppy icon button** (💾) in the top-right corner of the ReportPreview card.
- Only visible when `formattedText` is non-empty.
- On click: save current `formattedText` + current `githubRows` (if any) to `dailyCache[date]`.
- After save: show brief inline "Saved!" confirmation next to the icon (fades after 2s).
- Tooltip: "Save result for this date".

### GitHub Sync Panel — Save icon
Add a small **save icon button** in the panel header / top-right of the rows card.
- Only visible when rows are present (not loading, not empty, not after sync).
- On click: save current `githubRows` + current `formattedText` (if any) to `dailyCache[date]`.
- After save: same "Saved!" flash.
- Tooltip: "Save GitHub rows for this date".

---

## Data Flow

```
User clicks Save (Report or GitHub)
  → StorageService.setDailyCache(date, { reportText, githubRows })
  → Prune entries older than 30 days
  → Show "Saved!" flash

User clicks Load (date picker clock icon)
  → StorageService.getDailyCache(date)
  → If found: populate formattedText + githubRows in App state → both panels render
  → If not found: show toast "No saved result for this date"
```

---

## Files to Change

### 1. `src/services/storage.js`
Add two static methods:
```js
static async getDailyCache(date)
// returns { reportText, githubRows, savedAt } | null

static async setDailyCache(date, { reportText, githubRows })
// deep-merges with existing entry, sets savedAt = now, prunes to 30 days
```

### 2. `src/popup/App.jsx`
- Add `githubRows` state (lifted from `GitHubSyncPanel` — see below).
- Add `handleLoadCache(date)` — calls `getDailyCache`, populates `formattedText` + `githubRows`.
- Add `handleSaveCache()` — calls `setDailyCache(date, { reportText: formattedText, githubRows })`.
- Pass `savedRows` + `onRowsChange` down to `GitHubSyncPanel`.
- Pass `onSave` down to `ReportPreview`.
- Render the **Load icon** next to `DatePicker`.

### 3. `src/hooks/useReport.js`
- Expose `formattedText` setter so `App.jsx` can populate it from cache.
  (Already exposed as `setFormattedText` — no change needed.)

### 4. `src/popup/components/ReportPreview.jsx`
- Accept new `onSave` prop.
- Render a small save icon button (top-right of card), visible when text is non-empty.
- Show "Saved!" flash state internally after `onSave()` resolves.

### 5. `src/popup/components/GitHubSyncPanel.jsx`
- Accept `savedRows` prop (array | null). When non-null, skip auto-fetch and render directly.
- Accept `onRowsChange` prop — call it whenever `rows` state changes so App can track current rows.
- Render a small save icon button in the rows card header, always visible when rows are present (regardless of sync state).
- Save captures ALL current rows in state (including already-synced ones) — deduplication is handled at sync time by the `isSynced` check, not at save time.
- Calls `onSave()` prop (passed from App) on click.

### 6. `src/popup/components/DatePicker.jsx` (or inline in App.jsx)
- Add small clock icon button next to the date input.
- Calls `onLoadCache()` prop on click.

---

## UX Behaviour

| Scenario | Behaviour |
|---|---|
| Generate report → click Save | reportText cached for that date |
| GitHub Sync → click Save | ALL current rows cached (including already-synced ones) |
| Click Save on either | Both reportText + githubRows saved together |
| Load cached rows → click Sync | `isSynced` check deduplicates at sync time, so re-syncing is safe |
| Change date → click Load | Restores both panels from cache for that date |
| Load on date with no cache | Inline toast: "No saved result for this date" |
| Load overwrites current unsaved state | Expected — no confirmation dialog needed |
| 31st day entry | Auto-pruned on next save |

---

## Out of Scope
- No auto-save (user controls when to save).
- No cache management UI (browse/delete old entries).
- User edits to ReportPreview text ARE saved when user clicks Save (since we save current `formattedText`).

# User Flow & UI/UX Specifications

## 1. Workflow Overview

1. **Setup:** User enters Gemini API key, GitHub PAT, and manages report templates in the Settings page.
2. **Day-to-day use:** Open the side panel and choose a tab:
   - **Jira Tasks** (default) — portfolio view of tracked Releases/Epics.
   - **GitHub Sync** — auto-create Jira worklogs from GitHub activity for the picked date.
   - **Daily Report** — review/edit your Jira worklogs for the picked date, then generate the AI-formatted report.
3. **Review & share:** Preview AI output → edit if needed → click Copy. Save results with the Save button for future retrieval.

## 2. Side Panel Screens

> The UI renders inside the Chrome **side panel** (Chrome 114+). Open it by clicking the toolbar icon. Width is user-resizable; content caps at `max-w-[520px]` with `mx-auto` centring so it stays readable in wide panels.

### A. Main view (Home)

Three-tab layout with shared header controls:

- **Tab Bar (order):** "Jira Tasks" (emerald) | "GitHub Sync" (violet) | "Daily Report" (blue). Independent state per tab. **Default tab: Jira Tasks.**
- **Date Picker + Save:** Shown for GitHub Sync and Daily Report tabs only — hidden on Jira Tasks. Defaults to today, capped at today (no future dates). Changing the date auto-loads cache for both date-bound tabs.
- **Cache Badge:** Shows "Saved HH:MM" next to DatePicker when a cache entry exists for the picked date.
- **Save Button:** Appears on the Daily Report tab when it has report text. Saves report text only — GitHub Sync rows are no longer cached (the tab refetches on demand).

### Jira Tasks tab (default)

- **Track input row:** Compact `Track:` label + 160px input + Add button. Accepts:
  - Bare numeric id (e.g. `27643`) → release or epic (worker probes both).
  - Full key (e.g. `UP-68179`) → epic.
  - Board URL (e.g. `https://<domain>/jira/software/c/projects/UP/boards/26?...`) → board. The pasted URL is stored under `tracker.url` so the open-in-Jira link preserves your `assignee` / `issueType` filters.
- **Global toggles** below a thin divider:
  - **All assignees** — default off. When on, the worker drops `assignee = currentUser()` from the JQL.
  - **Hide other status** — default on. Client-side filter that hides the `Other` bucket (no re-fetch). `QA Success` lives in `Other` now, so this toggle hides QA-completed tickets along with anything else off the canonical list.
- **Tracker header:** drag handle (6-dot grip), expand chevron + type badge (`EPIC` violet / `RELEASE` amber / `BOARD` cyan) — these together toggle expand. The tracker label is itself a link that opens it in Jira (board URL preserved when present); `done/total` count (counts raw `QA Success`); **"+ Add task" icon (Epic trackers only)**; refresh icon (reloads tasks; only enabled when expanded); remove icon.
- **Board scope:** an expanded board tracker shows tasks from the board's **active sprint** (resolved via `/rest/agile/1.0/board/{id}/sprint?state=active`). If no active sprint exists, an inline error is shown.
- **Reordering:** Drag the grip to reorder. Dragged card fades to 40% opacity; drop target shows a blue ring. Order persists to `chrome.storage.sync`.
- **Expanded tracker:** Tasks are grouped by status in this fixed order — **QA Failed → To Do → In Progress → In Review → QA Ready → In Test → Other**. Each group has a colored pill header matching its status palette.
- **Task row:** Single-line layout — Key + Title (2-line clamp before ellipsis) on the left, **clickable status pill** that opens a dropdown of available Jira workflow transitions, then SP on the right. Selecting a transition calls Jira's transitions API and reloads the tracker.
- **Create task in Epic:** Clicking the `+` icon on an Epic tracker's header (also auto-expands the tracker if collapsed) opens an inline dashed-teal form scoped to that Epic:
  - **Type:** `Task` (default) | `Bug`.
  - **Priority:** `Highest` | `High` | `Medium` (default) | `Low` | `Lowest`.
  - **Title:** required text input. The **Create** button is disabled until non-empty.
  - **Description:** optional 2-row textarea.
  - **Story Points:** number input with `step=0.5`, default `0.5`.
  - **Fix versions:** dropdown with two hardcoded options — `"To be confirmed"` (default) and `"N/A"` (Everfit-tenant ids).
  - Assignee is implicit (always the current user) and is not shown in the form.
  - **Buttons:** `Cancel` (text) + `Create` (teal primary). During submit the button shows `Creating…` and both are disabled. On success the form closes and the tracker's task list refreshes so the new ticket appears in the relevant status group.
  - Errors (validation or Jira API) appear inline above the buttons in red.

### GitHub Sync tab

- "Fetch GitHub Activity" button triggers a live fetch.
- Preview table of tickets with editable key, time, and description fields. Rows can be deleted.
- "Sync N worklogs to Jira" button creates Jira worklogs.
- If cache exists: shows "Restored from cache" banner (violet) with Refresh button instead of fetch button. Sync button stays visible.

### Daily Report tab

- **Worklog Preview** (collapsible card at the top, expanded by default):
  - Auto-loads the user's Jira worklogs for the picked date.
  - Each row shows: Key (link) + Title (2-line clamp), editable **time** input (e.g. `1h 30m`), editable **description** textarea.
  - **Per-row Save icon** next to the time input — only enabled when the row has unsaved changes. States: idle (slate floppy) → has-changes (blue floppy) → saving (spinner) → saved (green check, auto-clears after 1.5s) → error (inline red message).
  - **Log new time** dashed button beneath the list expands an inline form: ticket dropdown (issues the user has worklogged in the last 7 days), time input, optional description, **Create worklog** button. On success the form closes and the list refreshes.
  - Auto-collapses when **Generate Report** is clicked.
- **Generate Report button:** Triggers Gemini AI report generation.
- **Editable textarea preview** of the AI output + **Copy to Clipboard** button (turns green on copy).
- If cache exists: shows "Restored from cache" banner (blue) with Refresh button instead of generate button.

### B. Settings view

- **Templates:** CRUD via `TemplateSelector` (see Template editor below).
- **Report Engine toggle:** segmented control — **Gemini AI** vs **Local Formatter**. Persisted as `settings.reportEngine`. When `local` is selected the Gemini key field becomes optional and no Gemini API call is made on **Generate Report**.
- **API Key Input:** Password-type field with "Show/Hide" toggle. Inline connection status indicator after **Save** (green/red dot).
- **Advanced:** Story Point field ID + Hours per Story Point.
- **GitHub credentials:** Username, PAT (with Show/Hide), and optional comma-separated allowed-repos filter. Per-event time defaults (Commit / PR Approved / PR Comment) live here too.
- **Local Storage card:** total bytes per area (`chrome.storage.sync` + `chrome.storage.local`) plus a per-key breakdown sorted largest-first. **Refresh** button re-reads usage; **Clear daily cache** removes the `dailyCache` key. Helps users see where storage is going and prune it without leaving the side panel.

### C. Template editor

- Simple CRUD interface for non-tech users.
- Fields: Name, Desired Format (Textarea).
- **Template wrapper:** Non-tech users can create templates by just pasting their "Desired Format" without writing prompts. The system wraps it into a proper AI instruction automatically.

## 3. UX States

- **Loading:** Spinner while AI is processing, GitHub is fetching, or Jira is loading. Skeleton placeholders for list views.
- **Cache restored:** Blue "Restored from cache · HH:MM" banner with Refresh button per tab.
- **Error handling:** Clear messages near the problem — "Invalid API Key", "Jira Session Expired", "Gemini Quota Exceeded", per-row save error in Worklog Preview, inline detection error in tracker input.
- **Empty state:** Action button shown when no content exists yet. Tracker empty state nudges the user to add a release/epic.
- **Save flash:** Save button briefly shows "Saved ✓" (green) for 2s after saving.
- **Drag-and-drop:** Source card 40% opacity; hovered target has blue ring + 2px shadow.

## 4. Design System

### Color palette

Per-tab accent scheme. Each tab owns a color; its primary CTAs use the same color so you always know what context an action lives in.

- **Header:** `bg-slate-900` (solid, no gradient). Settings icon: `text-slate-300 hover:text-white`.
- **Tab accents (active):**
  - Jira Tasks → `bg-teal-600 text-white`
  - GitHub Sync → `bg-orange-500 text-white`
  - Daily Report → `bg-indigo-600 text-white`
- **Inactive tab:** `text-slate-500 hover:text-slate-700`.
- **Primary CTAs (per tab):**
  - Jira Tasks tab — Add tracker: `bg-teal-600 hover:bg-teal-700`
  - GitHub Sync tab — Fetch / Sync to Jira: `bg-orange-500 hover:bg-orange-600`
  - Daily Report tab — Generate Report / Copy to Clipboard / Create worklog: `bg-indigo-600 hover:bg-indigo-700`
  - Shared (DatePicker Save, Settings Save, Template Save, ErrorBoundary): `bg-indigo-600 hover:bg-indigo-700`
- **Success state:** `bg-emerald-600` (Saved!, Copied!) / `bg-emerald-50 border-emerald-300 text-emerald-600` (Save flash, GitHub sync done banner)
- **Error:** `bg-red-50 text-red-700 border-red-200` (or `bg-rose-50` if a softer red is preferred — currently using red)
- **Cache banner colors** (per tab context):
  - Jira Tasks tab: n/a (no cache banner)
  - GitHub Sync tab → `orange` (`bg-orange-50 border-orange-200 text-orange-700`)
  - Daily Report tab → `indigo` (`bg-indigo-50 border-indigo-200 text-indigo-700`)
  - Save flash banner → `amber` (unchanged)
- **Focus rings:**
  - Inside Jira Tasks tab → `ring-teal-500`
  - Inside GitHub Sync tab → `ring-orange-500`
  - Inside Daily Report tab (incl. Settings, DatePicker, Templates) → `ring-indigo-500`
- **Ticket key links:** `text-indigo-600 hover:underline` (universal across tabs — close to the conventional "blue link" affordance while staying within the new palette).
- **Background:** `bg-slate-50`
- **Cards:** `bg-white border-slate-200`
- **Inputs:** `bg-slate-50 border-slate-200`
- **Primary text:** `text-slate-800`
- **Secondary text:** `text-slate-500`
- **Toggle switches** (Jira Tasks tab): on = `bg-teal-600`, off = `bg-slate-300`.
- **Drag-and-drop highlight** (Jira Tasks tab): `border-teal-400 ring-2 ring-teal-200`.

### Status palette (Jira Tasks tab)

Same palette is used for both the group header pill and the per-row status chip:

| Status        | Classes                              |
| ------------- | ------------------------------------ |
| QA Failed     | `bg-red-100 text-red-700`            |
| To Do         | `bg-slate-100 text-slate-600`        |
| In Progress   | `bg-blue-100 text-blue-700`          |
| In Review     | `bg-violet-100 text-violet-700`      |
| QA Ready      | `bg-amber-100 text-amber-700`        |
| In Test       | `bg-cyan-100 text-cyan-700`          |
| Other         | `bg-slate-100 text-slate-600`        |

`QA Success` is intentionally not its own group — it falls into **Other** (kept out of the way of in-flight work). The done/total counter in the tracker header still counts raw `QA Success` rows so you can see completion at a glance.

### Typography

- **Font:** Inter — clean, minimal, WCAG-friendly.
- **Import:** `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`
- **Tailwind:** `fontFamily: { sans: ['Inter', 'sans-serif'] }`
- **Side panel sizing:** smaller body sizes (11–13px) appropriate for a dense, narrow panel; max-w-[520px] cap on content.

### Interaction guidelines

- **Touch targets:** min 32x32px for icon buttons inside the dense panel; min 44x44px on standalone CTAs.
- **Micro-interactions:** 150–300ms duration, ease-out for enter / ease-in for exit.
- **Focus states:** Visible focus ring (`ring-2 ring-blue-500`) on all interactive elements.
- **Hover states:** Subtle bg/text-color change + `cursor-pointer` on clickable elements; `cursor-grab` / `cursor-grabbing` on drag handles.
- **Active states:** `active:scale-[0.98]` press feedback on CTAs.
- **Disabled states:** `opacity-50 cursor-not-allowed` (CTAs) or `text-slate-300 cursor-not-allowed` (icon buttons).
- **Loading buttons:** Disable + show spinner during async actions (prevent double-submit).
- **Success feedback:** Button or icon turns green with confirmation text.
- **Confirmation dialogs:** Required before destructive actions on shared state. Per-tracker delete is single-click (low blast radius).
- **Reduced motion:** Respect `prefers-reduced-motion`.

### React patterns

- `useState` for local state, `useReducer` for complex multi-field state.
- Clean up effects (return cleanup in `useEffect` for subscriptions/timers, cancellation flags for in-flight fetches).
- Stable keys on list items (use IDs, not array index).
- Controlled components for all form inputs (`value` + `onChange`).
- Error boundaries wrapping the app.
- For trackers and worklog rows: state owned by the parent (so reordering, options, and key-changes can re-trigger child fetches via `useEffect` deps or `key` props).

### Accessibility checklist

- Color contrast minimum 4.5:1 for normal text.
- Don't convey info by color alone — pair status pill with the status name text.
- `aria-label` on icon-only buttons (drag handle, move, remove, save, expand).
- `aria-expanded` on collapsible toggles.
- `htmlFor` on all form labels (no placeholder-only inputs).
- Keyboard navigation: logical tab order, no traps.
- Semantic HTML: `<button>`, `<nav>`, `<main>`; never `<div onClick>` for actions.

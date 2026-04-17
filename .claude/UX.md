# User Flow & UI/UX Specifications

## 1. Three-Stage Workflow
1. **Setup:** User enters Gemini API Key and manages report templates in the Settings page.
2. **Execution:** User opens the popup on a Jira tab -> Picks a date -> Uses "GitHub Sync" tab to fetch & sync GitHub activity, or "Daily Report" tab to generate the AI report.
3. **Review:** User previews the AI output -> Edits if necessary -> Clicks "Copy" to clipboard. Saves results with the Save button for future retrieval.

## 2. Side Panel Screens

> The UI renders inside the Chrome **side panel** (Chrome 114+). Users open it by clicking the toolbar icon. Width is user-resizable; content caps at `max-w-[520px]` with `mx-auto` centering so it stays readable in wide panels.


### A. Main View (Home)

Two-tab layout with shared header controls:

- **Tab Bar:** "GitHub Sync" (violet) | "Daily Report" (blue) — independent state per tab.
- **Date Picker:** Defaults to today. Capped at today (no future dates). Changing date auto-loads cache for both tabs.
- **Cache Badge:** Shows "Saved HH:MM" next to DatePicker when a cache entry exists for the picked date.
- **Save Button:** Appears when either tab has content. Saves both report text and GitHub rows together.

**GitHub Sync tab:**
- "Fetch GitHub Activity" button triggers a live fetch.
- Preview table of tickets with editable key, time, and description fields. Rows can be deleted.
- "Sync N worklogs to Jira" button creates Jira worklogs.
- If cache exists: shows "Restored from cache" banner (blue) with Refresh button instead of fetch button. Sync button still visible.

**Daily Report tab:**
- "Generate Report" button triggers Gemini AI report generation.
- Editable textarea preview + "Copy to Clipboard" button (turns green on copy).
- If cache exists: shows "Restored from cache" banner (blue) with Refresh button instead of generate button.

### B. Settings View

- **API Key Input:** Password-type field with "Show/Hide" toggle.
- **SP Configuration:** Customize Story Point to Hours ratio.
- **API Status Check:** Real-time indicator of Gemini API connectivity/quota status.

### C. Template Editor

- Simple CRUD interface for non-tech users.
- Fields: Name, Desired Format (Textarea).
- **Template Wrapper:** Non-tech users can create templates by just pasting their "Desired Format" without writing prompts. The system wraps it into a proper AI instruction automatically.

## 3. UX States

- **Loading State:** Spinner while AI is processing or GitHub is fetching.
- **Cache Restored:** Blue "Restored from cache · HH:MM" banner with Refresh button per tab.
- **Error Handling:** Clear messages near the problem — "Invalid API Key", "Jira Session Expired", or "Gemini Quota Exceeded".
- **Empty State:** Action button shown when no content exists yet.
- **Save Flash:** Save button briefly shows "Saved ✓" (green) for 2s after saving.

## 4. Design System

### Color Palette (Everfit Brand)

Uses standard Tailwind colors matching the Everfit logo gradient (purple → blue):

- **Header:** `bg-gradient-to-r from-violet-600 to-blue-500` (Everfit logo gradient)
- **Generate button:** `bg-blue-600` (primary CTA)
- **Copy button:** `bg-violet-600` (secondary CTA)
- **Save button:** `bg-blue-600`
- **Success state:** `bg-green-600` ("Saved!", "Copied!")
- **Focus rings:** `ring-blue-500`
- **Background:** `bg-slate-50`
- **Cards:** `bg-white border-slate-200`
- **Inputs:** `bg-slate-50 border-slate-200`
- **Primary text:** `text-slate-800`
- **Secondary text:** `text-slate-500`
- **Error:** `bg-red-50 text-red-700 border-red-200`
- **Edit active:** `text-violet-600 bg-violet-50`

### Typography
- **Font:** Inter (single family, weight variations) — clean, minimal, WCAG-friendly.
- **Import:** `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`
- **Tailwind:** `fontFamily: { sans: ['Inter', 'sans-serif'] }`
- **Body:** min 16px, line-height 1.5–1.75, max-width 65–75ch for readability.
- **Hierarchy:** Clear size/weight difference between headings and body.

### Interaction Guidelines
- **Touch targets:** min 44x44px, min 8px gap between adjacent targets.
- **Micro-interactions:** 150–300ms duration, ease-out for enter / ease-in for exit.
- **Focus states:** Visible focus ring (`ring-2 ring-blue-500`) on all interactive elements.
- **Hover states:** Subtle bg change + cursor-pointer on clickable elements.
- **Active states:** `active:scale-95` press feedback.
- **Disabled states:** `opacity-50 cursor-not-allowed`.
- **Loading buttons:** Disable + show spinner during async actions (prevent double-submit).
- **Success feedback:** Button turns green with "Copied!" text, or toast notification.
- **Confirmation dialogs:** Required before destructive actions (e.g., delete template).
- **Reduced motion:** Respect `prefers-reduced-motion` media query.

### React Patterns
- `useState` for local state, `useReducer` for complex multi-field state.
- Clean up effects (return cleanup in `useEffect` for subscriptions/timers).
- Lazy state init: `useState(() => expensiveComputation())`.
- Stable keys on list items (use IDs, not array index).
- `useMemo` for expensive filtering/sorting, `useCallback` for handlers passed to memoized children.
- Controlled components for all form inputs (`value` + `onChange`).
- Error boundaries wrapping the app.
- Destructure props, provide default values.
- Debounce rapid input changes with `useDeferredValue`.

### Accessibility Checklist
- Color contrast minimum 4.5:1 for normal text.
- Don't convey info by color alone — use icons/text alongside.
- `aria-label` on icon-only buttons.
- `htmlFor` on all form labels (no placeholder-only inputs).
- `aria-live="polite"` for dynamic status updates.
- Keyboard navigation: logical tab order, no traps.
- Semantic HTML: `<button>`, `<nav>`, `<main>`, not `<div onClick>`.

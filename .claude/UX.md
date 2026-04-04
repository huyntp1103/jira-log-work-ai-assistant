# User Flow & UI/UX Specifications

## 1. Three-Stage Workflow
1. **Setup:** User enters Gemini API Key and manages report templates in the Settings page.
2. **Execution:** User opens the popup on a Jira tab -> Selects a Template (e.g., Backend Core) -> Clicks "Generate".
3. **Review:** User previews the AI output -> Edits if necessary -> Clicks "Copy" to clipboard.

## 2. Popup Screens

### A. Main View (Home)
- **Template Dropdown:** Choose between saved templates.
- **Date Picker:** Defaults to "Today" (logic handles target date automatically). Allows selecting a specific date for past reports.
- **Generate Button:** Primary Action.
- **Preview Area:** Real-time editable text area showing AI output. Supports in-popup editing for final polish before copying.
- **Copy Button:** Success feedback (e.g., button turns green with "Copied!" text).

### B. Settings View
- **API Key Input:** Password-type field with "Show/Hide" toggle.
- **SP Configuration:** Customize Story Point to Hours ratio.
- **API Status Check:** Real-time indicator of Gemini API connectivity/quota status.

### C. Template Editor
- Simple CRUD interface for non-tech users.
- Fields: Name, Desired Format (Textarea).
- **Template Wrapper:** Non-tech users can create templates by just pasting their "Desired Format" without writing prompts. The system wraps it into a proper AI instruction automatically.

## 3. UX States
- **Loading State:** Shimmer effect or Spinner while AI is processing (show for operations >300ms).
- **Error Handling:** Clear messages near the problem — "Invalid API Key", "Jira Session Expired", or "Gemini Quota Exceeded".
- **Empty State:** Helpful message + CTA when no report exists yet.
- **Connectivity Indicator:** A small dot (Green/Red) checking Gemini API availability.

## 4. Design System

### Color Palette (Productivity Tool)
| Token | Value | Usage |
|---|---|---|
| Primary | `#0D9488` (Teal) | Brand, focus elements |
| On Primary | `#FFFFFF` | Text on primary |
| Secondary | `#14B8A6` | Secondary actions |
| Accent | `#EA580C` (Orange) | CTA buttons (Generate, Copy) |
| Background | `#F0FDFA` | Page background |
| Foreground | `#134E4A` | Primary text |
| Card | `#FFFFFF` | Card/panel backgrounds |
| Muted | `#64748B` | Secondary text, placeholders |
| Border | `#99F6E4` | Borders, dividers |
| Destructive | `#DC2626` | Errors, destructive actions |
| Ring | `#0D9488` | Focus rings |

### Typography
- **Font:** Inter (single family, weight variations) — clean, minimal, WCAG-friendly.
- **Import:** `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');`
- **Tailwind:** `fontFamily: { sans: ['Inter', 'sans-serif'] }`
- **Body:** min 16px, line-height 1.5–1.75, max-width 65–75ch for readability.
- **Hierarchy:** Clear size/weight difference between headings and body.

### Interaction Guidelines
- **Touch targets:** min 44x44px, min 8px gap between adjacent targets.
- **Micro-interactions:** 150–300ms duration, ease-out for enter / ease-in for exit.
- **Focus states:** Visible focus ring (`ring-2 ring-teal-500`) on all interactive elements.
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

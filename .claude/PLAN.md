# Implementation Plan: Scaffold Jira Daily Report Chrome Extension

## Context

The project has full documentation in `.claude/` and a tested JS prototype in `CORE_LOGIC_SNAPSHOT.md`, but zero source code. We need to scaffold a complete Chrome Extension (Manifest V3) with React + Tailwind popup UI, porting the existing business logic into a proper extension architecture.

The user is a Node.js backend developer — the plan uses an incremental approach with verification checkpoints after each phase so nothing breaks silently.

---

## Phase 0: Project Tooling & Minimal Loadable Extension

**Goal:** `npm run dev` produces an extension that loads in Chrome with a blank popup.

**Files (9):**

| # | File | Purpose |
|---|------|---------|
| 1 | `package.json` | Dependencies: react, react-dom, vite, @crxjs/vite-plugin@beta, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite |
| 2 | `manifest.json` | Manifest V3 — permissions: storage, activeTab. Host permissions: `*.atlassian.net`, `generativelanguage.googleapis.com` |
| 3 | `vite.config.js` | Vite + React + CRXJS + Tailwind plugins |
| 4 | `tailwind.config.js` | Design system tokens (teal primary, orange accent, Inter font) |
| 5 | `src/popup/index.html` | HTML shell with Inter font import |
| 6 | `src/popup/index.jsx` | React entry point |
| 7 | `src/popup/index.css` | Tailwind imports |
| 8 | `src/popup/App.jsx` | Stub: shows "Extension loaded" with design tokens |
| 9 | `src/background/index.js` | Stub: `console.log` only |
| 10 | `src/content/index.js` | Stub: `console.log` only |
| 11 | `public/icons/` | Placeholder PNGs (16, 48, 128) |

**Key decisions:**
- `@crxjs/vite-plugin@beta` required for Manifest V3 + Vite 5+
- `manifest.json` at root (CRXJS requirement), paths point to `src/` source files
- Popup dimensions: `w-[400px] min-h-[500px]`

**Verify:** `npm run dev` → Load unpacked in Chrome → Popup shows styled heading.

---

## Phase 1: Pure Utilities (No Chrome APIs)

**Goal:** Port DateHelper and progress calculation as testable pure functions.

| # | File | Ported From |
|---|------|-------------|
| 1 | `src/utils/date.js` | `DateHelper.getTargetDate()` — local time formatting, Mon/Sun → Friday |
| 2 | `src/utils/progress.js` | `ReportEngine.calculateProgress()` — extracted as standalone function |

**Verify:** Import in App.jsx, `console.log(DateHelper.getTargetDate())` → correct date.

---

## Phase 2: Service Layer

**Goal:** Build the 4 service modules. Order matters: storage → jira → gemini → report-engine.

| # | File | Ported From | Key Adaptation |
|---|------|-------------|----------------|
| 1 | `src/services/storage.js` | New | Wraps `chrome.storage.sync` in Promises. Default settings + default "Backend Core" template pre-loaded |
| 2 | `src/services/jira.js` | `JiraService` | Domain passed explicitly (from storage, not `window.location`). Same headers, same JQL |
| 3 | `src/services/gemini.js` | `GeminiService` | API key from storage (NOT `process.env`). Uses `system_instruction` field. Template's instruction used as system prompt |
| 4 | `src/services/report-engine.js` | `ReportEngine` | Takes config object. Uses jira.js + progress.js. Returns categorized JSON only (does NOT call Gemini) |

**Critical: .env → chrome.storage migration**
- `process.env.GEMINI_API_KEY` does NOT exist in extensions
- User enters key in Settings UI → saved to `chrome.storage.sync`
- All services read config from `storage.js`

**Verify:** Wire services in App.jsx with test calls, check console output.

---

## Phase 3: Chrome Plumbing (Content Script + Background + Messaging)

**Goal:** Connect the extension's moving parts.

| # | File | Role |
|---|------|------|
| 1 | `src/content/index.js` | Reads `window.location.hostname` on Jira tabs → saves to `chrome.storage.sync` as `jiraDomain` |
| 2 | `src/background/index.js` | Listens for messages from popup. Orchestrates: storage → jira → report-engine → gemini → respond |

**Message protocol:**
```
Popup → Background: { type: 'GENERATE_REPORT', date, templateId }
Background → Popup: { type: 'REPORT_RESULT', report, formattedText }
Background → Popup: { type: 'REPORT_ERROR', error }
```

**Why background runs the pipeline:** Popup can close mid-operation if user clicks away. Background service worker persists during active operations.

**Pitfall:** MV3 service workers idle after 30s. Use `sendResponse` returning `true` to keep the message channel open for long Gemini calls.

**Verify:** Open Jira tab → check `jiraDomain` in storage → send test message from popup console → get formatted report back.

---

## Phase 4: React UI Components

**Goal:** Build the full popup interface. Settings first (needed to enter API key).

| # | File | Purpose |
|---|------|---------|
| 1 | `src/hooks/useReport.js` | Hook wrapping background messaging. State: `{ report, loading, error }` |
| 2 | `src/popup/components/Settings.jsx` | API key (password + toggle), SP field, hours/point, save, API status dot |
| 3 | `src/popup/components/TemplateSelector.jsx` | Dropdown + CRUD editor for templates |
| 4 | `src/popup/components/DatePicker.jsx` | `<input type="date">` defaulting to today |
| 5 | `src/popup/components/ReportPreview.jsx` | Editable textarea + Copy button with "Copied!" feedback |
| 6 | `src/popup/App.jsx` | Full implementation: routing between main/settings views, wires all components |

**UX states to implement:**
- Loading: spinner after 300ms delay
- Error: message near the problem (not generic toast)
- Empty: "Enter your API key to get started" on first run
- Success: Copy button → green "Copied!" for 2s

**Verify:** Full end-to-end: Settings → Jira tab → Generate → Preview → Copy.

---

## Phase 5: Polish & Edge Cases

| # | Task |
|---|------|
| 1 | Error boundary wrapping `<App>` |
| 2 | First-run detection: auto-show Settings if no API key |
| 3 | Jira 401 handling: "Please log in to Jira first" message |
| 4 | Google Fonts CSP: if blocked, bundle font files instead |
| 5 | Update `.gitignore`: add `dist/`, `node_modules/`, `*.crx`, `*.pem` |

---

## File Count Summary

| Phase | Files | Running Total |
|-------|-------|---------------|
| 0 - Tooling | 11 | 11 |
| 1 - Utils | 2 | 13 |
| 2 - Services | 4 | 17 |
| 3 - Chrome | 2 (update) | 17 |
| 4 - UI | 6 | 23 |
| 5 - Polish | Updates only | 23 |

**Total: ~23 files** to create from scratch.

---

## Pitfalls to Watch

1. **CRXJS version:** Must use `@beta` tag for MV3 support
2. **Popup width:** Set explicit `w-[400px]` — Chrome ignores CSS width if content is narrower
3. **Service worker idle:** Goes to sleep after 30s — keep message channel open with `return true` in `onMessage`
4. **Cookies/auth:** `fetch()` from background includes cookies for `host_permissions` domains only if user is logged in
5. **`system_instruction` not `systemInstruction`:** Snake_case for REST API, camelCase for JS SDK — we use REST
6. **No `process.env`:** Does not exist in Chrome Extension runtime

# Functional Spec & Technical Architecture

## 1. System Components & Project Structure

```text
src/
├── background/
│   └── worker.js           # Service worker (Manifest V3 required)
├── content/
│   └── main.js             # Injected into Jira tabs (capture domain)
├── popup/
│   ├── App.jsx             # Root popup component (view routing, state)
│   ├── index.jsx           # Entry point (ReactDOM + ErrorBoundary)
│   ├── index.html          # Popup HTML shell
│   ├── index.css           # Tailwind imports + custom styles
│   ├── ErrorBoundary.jsx   # Crash recovery UI
│   └── components/
│       ├── ReportPreview.jsx
│       ├── TemplateSelector.jsx
│       ├── DatePicker.jsx
│       └── Settings.jsx
├── services/
│   ├── jira.js             # JiraService (fetch, getMyProfile, searchJql)
│   ├── gemini.js           # GeminiService (AI formatting, connection test)
│   ├── storage.js          # chrome.storage.sync wrapper + buildInstruction()
│   └── report-engine.js    # ReportEngine (orchestrates Jira data → categorized JSON)
├── hooks/
│   └── useReport.js        # React hook: popup → background messaging
└── utils/
    ├── date.js             # DateHelper (target date calc)
    └── progress.js         # Progress % calculation with status-based scaling
```

### Component Roles

- **`popup/`** — The only React surface. Control center (Template selection, Date picker, Preview).
- **`content/main.js`** — Captures `window.location.hostname` on Jira tabs, saves to `chrome.storage.sync`.
- **`background/worker.js`** — Listens for messages from popup, orchestrates full pipeline: storage → Jira → ReportEngine → Gemini → respond.
- **`services/`** — Service layer pattern. Each service is a class with static methods.
- **`hooks/`** — Thin layer: sends `chrome.runtime.sendMessage` to background, manages React state.
- **`utils/`** — Pure functions (DateHelper, progress calc). No side effects, testable in isolation.

### Message Protocol (Popup ↔ Background)

```text
Popup → Background: { type: 'GENERATE_REPORT', date, templateId }
Background → Popup: { type: 'REPORT_RESULT', report, formattedText }
Background → Popup: { type: 'REPORT_ERROR', error }
Popup → Background: { type: 'TEST_GEMINI', apiKey }
```

## 2. Data Fetching Logic (Jira API)

### A. "Target Date" Calculation

- If today is Monday -> Target Date = Friday.
- If today is Sunday -> Target Date = Friday.
- Else -> Target Date = Yesterday.
- **Important:** Use local time formatting (not `toISOString()`) to avoid timezone shift bugs.

### B. "Done Yesterday" & "Progress Changed"

- Fetch worklogs based on `targetDate`.
- **JQL:** `worklogAuthor = currentUser() AND worklogDate = "{targetDate}"`
- **Category logic:** If user has worklogs on the issue *before* `targetDate` -> "Progress Changed", else -> "Done Yesterday".

### C. "Plan for Today" (Smart Filter)

- **JQL:** `assignee = currentUser() AND sprint in openSprints() AND status in ("In Progress", "In Review", "QA FAILED") AND created >= "-14d"`
- **Critical Exclusion:** Filter out issues already worklogged on `targetDate`.

### D. Required Fields

`summary`, `status`, `worklog`, `timetracking`, `parent`, `customfield_10014` (SP)

### E. User Profile

- **Endpoint:** `/rest/api/3/myself`
- **Method:** `JiraService.getMyProfile(domain)` returns `{ accountId, displayName }`
- **Display name cleanup:** Strips platform abbreviation — e.g. `"Nhat Huy (BE)"` → `"Nhat Huy"`
- **Platform/Role:** Derived from the first word of the selected template name (e.g. "Backend Core" → "Backend")

## 3. Progress Calculation

- **Rule:** 1 Story Point (SP) = 4 Working Hours.
- **Formula:** `Current Progress (%) = (Total Time Spent / (SP * 4)) * 100`
- **Change Detection:** `Previous % = ((Total Spent - Today's Log) / (SP * 4)) * 100`
- If SP = 0 or missing -> return "N/A".
- **Velocity:** User completes ~1.5 SP/day (used by Gemini for EOD estimates).

### Status-Based Scaling

Raw progress is scaled proportionally when it exceeds the status cap:

| Status     | Max Progress |
| ---------- | ------------ |
| `QA READY` | 100%         |
| All others | 90%          |

**Scaling logic:** Both `prev` and `current` values use the same ratio (`cap / rawMax`) so relative change is preserved. Example: raw 100%→150% with cap 90% becomes 60%→90%.

## 4. Data Structure & Grouping

- Every task must be linked to its **Parent/Epic Summary** (text only, not link).
- Grouping level: `Parent (Text)` -> `Sub-tasks (Link + Summary)`.
- Fallback parent name: "General Tasks".

## 5. Reporting Targets

- **Slack:** Rich formatting with Markdown and Emojis.
- **Spreadsheet:** Plain text, no Markdown, double newlines, optimized for single-cell display.

## 6. AI Processing Strategy

### Template Wrapper (`buildInstruction`)

The `buildInstruction(format)` function in `storage.js` wraps a user's desired format into a full Gemini instruction. Non-technical users provide only the output format; the system automatically adds:

- Role & context prompt
- Data processing rules (categorization, grouping)
- Velocity-based progress estimation rules (1.5 SP/day)
- Tone & style guidelines

### Context Injection

The Gemini prompt includes dynamic context passed from the background worker:

```text
Reporter Name: {displayName from Jira profile}
Platform/Role: {first word of template name}
Report Date: {date picked by user in calendar}
```

### API Integration

- Uses `system_instruction` field (snake_case, not camelCase) for the REST API.
- Model: `gemini-2.5-flash` with `temperature: 0.1`, `topP: 0.8`, `topK: 40`.
- The Engine provides `ParentSummary` for each task so the AI can group sub-tasks under the correct Epic/Plan.

## 7. Storage Schema (chrome.storage.sync)

```json
{
  "settings": {
    "geminiKey": "STRING",
    "spField": "customfield_10014",
    "hoursPerPoint": 4
  },
  "templates": [
    {
      "id": "UUID",
      "name": "Backend Core (Default)",
      "format": "STRING (Desired output format)",
      "instruction": "STRING (Auto-generated by buildInstruction(format))",
      "isDefault": true
    }
  ],
  "jiraDomain": "company.atlassian.net"
}
```

# Functional Spec & Technical Architecture

## 1. System Components
- **Popup UI:** The control center (Template selection, Date picker, Preview).
- **Content Script:** Injected into Jira tabs to access DOM (current URL, accountId).
- **Service Worker:** Handles long-running API calls if necessary (though Popup can handle most).

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

## 3. Progress Calculation
- **Rule:** 1 Story Point (SP) = 4 Working Hours.
- **Formula:** `Current Progress (%) = (Total Time Spent / (SP * 4)) * 100`
- **Change Detection:** `Previous % = ((Total Spent - Today's Log) / (SP * 4)) * 100`
- If SP = 0 or missing -> return "N/A".

## 4. Data Structure & Grouping
- Every task must be linked to its **Parent/Epic Summary** (text only, not link).
- Grouping level: `Parent (Text)` -> `Sub-tasks (Link + Summary)`.
- Fallback parent name: "General Tasks".

## 5. Reporting Targets
- **Slack:** Rich formatting with Markdown and Emojis.
- **Spreadsheet:** Plain text, no Markdown, double newlines, optimized for single-cell display.

## 6. AI Processing Strategy

### Prompt Engineering
- **Role:** Senior Backend Developer Assistant.
- **Grouping:** Strict grouping by Parent Summary (text-only headers).
- **Tone:** Technical English, concise, action-oriented.

### Template Wrapper Logic
To support non-technical users, the extension wraps their raw "Desired Format" into a Master Instruction:
`"You are a professional assistant... follow this EXACT format: [USER_FORMAT]... Rule: Group by Parent, Use Technical English..."`

### Spreadsheet Optimization
- System Instruction forces **Plain Text ONLY**.
- Eliminates Markdown characters (`**`, `#`, etc.) to keep Spreadsheet cells clean.

### API Integration
- Wrap "Master Instruction" and "Raw JSON" into a single message payload (avoids `systemInstruction` vs `system_instruction` field errors).
- The Engine must provide `ParentSummary` for each task so the AI can group sub-tasks under the correct Epic/Plan.

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
      "format": "STRING (Raw structure for AI to follow)",
      "instruction": "STRING (Internal System Instruction)",
      "isDefault": true
    }
  ]
}
```

# 🏗 Technical Architecture & Business Logic

## 1. System Components
- **Popup UI:** The control center (Template selection, Date picker, Preview).
- **Content Script:** Injected into Jira tabs to access DOM (current URL, accountId).
- **Service Worker:** Handles long-running API calls if necessary (though Popup can handle most).

## 2. Data Extraction Logic (The "ReportEngine")
### A. "Target Date" Calculation
- If today is Monday -> Target Date = Friday.
- If today is Sunday -> Target Date = Friday.
- Else -> Target Date = Yesterday.

### B. "Plan for Today" Smart Filter
- **JQL:** `assignee = currentUser() AND sprint in openSprints() AND status in ("In Progress", "In Review", "QA FAILED") AND created >= "-14d"`
- **Critical Exclusion:** Filter out issues that were already worklogged on the `Target Date`.

### C. Progress Calculation
- **Rule:** 1 Story Point (SP) = 4 Working Hours.
- **Formula:** `Current Progress (%) = (Total Time Spent / (SP * 4)) * 100`.
- **Change Detection:** `Previous % = ((Total Spent - Today's Log) / (SP * 4)) * 100`.

## 3. AI Processing Strategy
- **Prompt Injection:** To avoid API field errors (`systemInstruction` vs `system_instruction`), wrap the "Master Instruction" and "Raw JSON" into a single message payload.
- **Grouping:** The Engine must provide `ParentSummary` for each task so the AI can group sub-tasks under the correct Epic/Plan.
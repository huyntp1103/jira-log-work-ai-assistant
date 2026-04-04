# 📋 Functional Requirements & Business Logic

## 1. Data Fetching Logic (Jira API)
- **Done Yesterday/Progress Changed:** - Fetch worklogs based on `targetDate` (Yesterday or Friday if today is Monday).
  - Distinguish category: If worklogged before `targetDate` -> "Progress Changed", else -> "Done Yesterday".
- **Plan for Today (The "Smart Filter"):**
  - `assignee = currentUser()`
  - `sprint in openSprints()`
  - `status in ("In Progress", "In Review", "QA FAILED")`
  - `created >= "-14d"` (Recency filter).
  - **Exclusion:** Must NOT be in the list of issues already logged yesterday.

## 2. Data Structure
- Grouping: Every task must be linked to its **Parent/Epic Summary**.
- Grouping level: `Parent (Text)` -> `Sub-tasks (Link + Summary)`.

## 3. Reporting Targets
- **Slack:** Rich formatting with Markdown and Emojis.
- **Spreadsheet:** Plain text, no Markdown, double newlines, optimized for single-cell display.

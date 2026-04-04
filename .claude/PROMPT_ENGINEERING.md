# 🧠 Prompt Engineering Strategy

## 1. The "Default" Backend Core Instruction
- **Role:** Senior Backend Developer Assistant.
- **Grouping:** Strict grouping by Parent Summary (Text-only headers).
- **Tone:** Technical English, concise, action-oriented.

## 2. The "Template Wrapper" Logic
To support non-technical users, the extension wraps their raw "Desired Format" into a Master Instruction:
`"You are a professional assistant... follow this EXACT format: [USER_FORMAT]... Rule: Group by Parent, Use Technical English..."`

## 3. Spreadsheet Optimization
- System Instruction forces **Plain Text ONLY**.
- Eliminates Markdown characters (`**`, `#`, etc.) to keep Spreadsheet cells clean.

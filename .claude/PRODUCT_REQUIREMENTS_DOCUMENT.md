# 📑 PRD: Jira Daily Report AI Assistant

## 1. Project Vision
Build a Chrome Extension (Manifest V3) that automates the daily reporting process. It bridges the gap between Jira activity (worklogs/sprints) and communication platforms (Slack/Spreadsheets) using Gemini AI.

## 2. Target Users
- **Primary:** Backend Developers (Core Project).
- **Secondary:** Non-technical teammates (QA, BA, Android/iOS Devs) who need customized report formats.

## 3. Core Requirements (High Level)
- **Automatic Data Extraction:** Fetch Jira issues, worklogs, and parent/epic information.
- **Smart Filtering:** Categorize tasks into "Done Yesterday", "Progress Changed", and "Plan for Today" based on real activity.
- **AI-Powered Formatting:** Use Gemini AI to rewrite technical logs into professional English.
- **Multi-Platform Support:** Toggle between Slack (Markdown/Emoji) and Spreadsheet (Plain text/Single cell) formats.
- **Frictionless UX:** 1-click generation, auto-copy to clipboard.

## 4. Technical Stack
- **Manifest V3:** Required for modern Chrome Extensions.
- **Vite + @crxjs/vite-plugin:** For fast bundling and HMR (Hot Module Replacement).
- **React + Tailwind CSS:** For a modern, responsive Popup UI.
- **Chrome Storage Sync:** To persist settings (API Keys) and custom templates across devices.
- **Gemini API (v1 Stable):** Using `gemini-1.5-flash` for high speed and generous free-tier quota.

## 5. Security & Privacy
- **No Hardcoded Keys:** Users must provide their own Gemini API Key.
- **Domain Scoping:** Permissions limited to `*.atlassian.net` and `generativelanguage.googleapis.com`.
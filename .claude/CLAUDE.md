# Jira Daily Report AI Assistant (Browser Extension)

## Project Vision
Build a "Frictionless" Chrome Extension that automates the daily reporting process for Jira users.
It bridges the gap between Jira activity (worklogs/sprints) and communication platforms (Slack/Spreadsheets) using Gemini AI.

## Target Users
- **Primary:** Backend Developers (Core Project).
- **Secondary:** Non-technical teammates (QA, BA, Android/iOS Devs) who need customized report formats.

## Tech Stack (Manifest V3)
- **Core Architecture:** Chrome Extension Manifest V3 (required for modern Chrome Extensions).
- **Build Tool:** Vite + @crxjs/vite-plugin (Fast bundling, HMR support).
- **Frontend:** React + Tailwind CSS (Modern, responsive Popup UI).
- **State/Storage:** `chrome.storage.sync` (Persist settings & templates across devices).
- **AI Engine:** Gemini API (Model: `gemini-1.5-flash` — high speed, generous free-tier quota).
- **Language:** JavaScript (ES6+) / TypeScript.

## Core Requirements
- **Automatic Data Extraction:** Fetch Jira issues, worklogs, and parent/epic information.
- **Smart Filtering:** Categorize tasks into "Done Yesterday", "Progress Changed", and "Plan for Today" based on real activity.
- **AI-Powered Formatting:** Use Gemini AI to rewrite technical logs into professional English.
- **Multi-Platform Support:** Toggle between Slack (Markdown/Emoji) and Spreadsheet (Plain text/Single cell) formats.
- **Frictionless UX:** 1-click generation, auto-copy to clipboard.

## Project Layout

- **`src/services/`** — Service layer (Jira, Gemini, Storage, ReportEngine).
- **`src/popup/`** — React UI (the only React surface).
- **`src/hooks/`** — Thin React hooks wiring services to state.
- **`src/utils/`** — Pure helper functions (date, progress calc).
- **`src/content/`** — Content script injected into Jira tabs.
- **`src/background/`** — Manifest V3 service worker.
- See `SPEC.md` for full structure and file-level details.

## Security & Privacy
- **No Hardcoded Keys:** Users must provide their own Gemini API Key. Stored in `.env` (gitignored).
- **Domain Scoping:** Permissions limited to `*.atlassian.net` and `generativelanguage.googleapis.com`.

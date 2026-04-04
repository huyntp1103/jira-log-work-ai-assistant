# 🚀 Jira Daily Report AI Assistant (Browser Extension)

## 🎯 Goal
A "Frictionless" Chrome Extension that automates the generation of professional Daily Reports for Jira users by fetching worklogs and sprint data, then processing it via Gemini AI.

## 🛠 Tech Stack (Manifest V3)
- **Core Architecture:** Chrome Extension Manifest V3.
- **Build Tool:** Vite + @crxjs/vite-plugin (Standard for modern extensions).
- **Frontend:** React + Tailwind CSS (Fast UI development).
- **State/Storage:** `chrome.storage.sync` (Synchronize settings & templates across devices).
- **AI Engine:** Gemini API (Model: `gemini-1.5-flash` for stability/quota).
- **Language:** JavaScript (ES6+) / TypeScript.

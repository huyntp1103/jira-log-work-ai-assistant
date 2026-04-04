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
- **Loading State:** Shimmer effect or Spinner while AI is processing.
- **Error Handling:** Clear messages for "Invalid API Key", "Jira Session Expired", or "Gemini Quota Exceeded".
- **Connectivity Indicator:** A small dot (Green/Red) checking Gemini API availability.

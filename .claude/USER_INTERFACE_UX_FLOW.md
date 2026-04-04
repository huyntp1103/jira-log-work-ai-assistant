# 🎨 UI/UX Specifications

## 1. Popup Screens

### A. Main View (Home)
- **Template Dropdown:** Choose between saved templates.
- **Date Picker:** Defaults to "Today" (logic handles target date automatically).
- **Generate Button:** Primary Action.
- **Preview Area:** Real-time editable text area showing AI output.
- **Copy Button:** Success feedback (e.g., button turns green with "Copied!" text).

### B. Settings View
- **API Key Input:** Password-type field with "Show/Hide" toggle.
- **SP Configuration:** Customize Story Point to Hours ratio.

### C. Template Editor
- Simple CRUD interface for non-tech users.
- Fields: Name, Desired Format (Textarea).

## 2. Advanced UX States
- **Loading State:** Shimmer effect or Spinner while AI is processing.
- **Error Handling:** Clear messages for "Invalid API Key", "Jira Session Expired", or "Gemini Quota Exceeded".
- **Connectivity Indicator:** A small dot (Green/Red) checking Gemini API availability.
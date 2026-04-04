# 💾 Storage Schema & Template Management

## 1. Chrome Storage Structure (sync)
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
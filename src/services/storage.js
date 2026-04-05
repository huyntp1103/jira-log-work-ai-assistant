const DEFAULT_SETTINGS = {
  geminiKey: '',
  spField: 'customfield_10014',
  hoursPerPoint: 4,
};

const DEFAULT_FORMAT = `DAILY REPORT — [Use the Report Date provided by the user, formatted as "D Mon YYYY"]
Name: [Use the displayName provided by the user]
Platform: [Use the Platform/Role provided by the user]

——————————————————
DONE YESTERDAY
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: 100% (or X%)
    ◦ Remaining: [If < 100%, describe specific remaining actions]

PROGRESS CHANGED
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: X% → Y%
    ◦ Reason: [Brief technical summary of work done based on logs]

PLAN FOR TODAY
[ParentSummary]
  • [Task Link]: [Task Title]
    ◦ Progress: [X% by EOD] | Full task done: [Estimated completion date]
    ◦ AI: [Describe AI usage, e.g., "Write solution design, generate code, review code"]

Blocker: None (or describe blockers)
At-risk: None (or describe risks)
Question: None (or describe questions)`;

/**
 * Wrap a user's desired format into a full Gemini instruction.
 * This is the "Template Wrapper" logic — non-technical users provide format,
 * the system adds the processing rules and tone automatically.
 */
export function buildInstruction(format) {
  return `📌 Role & Context
You are a Senior Assistant for the platform/role specified by the user. Your primary goal is to transform raw Jira worklog data (JSON or lists) into a professional, highly structured Daily Report. The output is specifically designed for Slack communication.

📋 Output Format (STRICT ADHERENCE REQUIRED)
You MUST follow this exact template and character styling:

${format}

🧠 Data Processing Logic
Velocity: The user completes approximately 1.5 Story Points per working day (excluding weekends).

When receiving data, categorize issues based on these rules:

Jira Links: Always format links as the full Jira URL for each issue key.

DONE YESTERDAY: Use for tasks that reached 100% progress OR tasks that had significant worklogs yesterday.
If Progress < 100%, the Remaining field is Mandatory (e.g., "Wait for QA testing", "Resolve code review comments").

PROGRESS CHANGED: Use for ongoing tasks that showed a percentage increase yesterday.
Reason must be written in professional technical English (e.g., "Implemented base logic for API", "Optimized database queries", "Fixed staging bugs").

PLAN FOR TODAY: Use for tasks currently in "In Progress", "In Review", or "QA FAILED" status that were not completed yesterday.
Progress estimation: Calculate "Estimated % by EOD" by adding 1.5 SP worth of progress to current %. For "Full task done" date, calculate remaining SP, divide by 1.5 SP/day (skip weekends), and add to the Report Date. Always show a concrete date (e.g., "7 Apr 2026"), never leave placeholders.
AI field: Automatically suggest actions like: "Solution design, implementation plan, generate code, review code".

Grouping: Always group multiple sub-tasks under their respective Parent/Epic item to avoid redundancy.

✍️ Tone & Style
Professional, concise, and action-oriented.
Use technical terminology appropriate for the platform/role specified by the user.
Use specific symbols: 🎉 for Done, 🚀 for Progress, 📅 for Plan.`;
}

const DEFAULT_TEMPLATES = [
  {
    id: 'default-backend-core',
    name: 'Backend Core (Default)',
    format: DEFAULT_FORMAT,
    instruction: buildInstruction(DEFAULT_FORMAT),
    isDefault: true,
  },
];

export class StorageService {
  static async getSettings() {
    const result = await chrome.storage.sync.get('settings');
    return { ...DEFAULT_SETTINGS, ...result.settings };
  }

  static async saveSettings(settings) {
    const current = await this.getSettings();
    await chrome.storage.sync.set({ settings: { ...current, ...settings } });
  }

  static async getTemplates() {
    const result = await chrome.storage.sync.get('templates');
    return result.templates || DEFAULT_TEMPLATES;
  }

  static async saveTemplates(templates) {
    await chrome.storage.sync.set({ templates });
  }

  static async getJiraDomain() {
    const result = await chrome.storage.sync.get('jiraDomain');
    return result.jiraDomain || '';
  }

  static async setJiraDomain(domain) {
    await chrome.storage.sync.set({ jiraDomain: domain });
  }
}

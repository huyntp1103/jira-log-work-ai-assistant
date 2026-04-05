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
    ◦ Remaining: [If < 100%, describe specific remaining actions, otherwise omit this line]

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
 * Platform-specific hints for the AI instruction.
 * Add new platforms here as teammates from other teams adopt the extension.
 */
const PLATFORM_HINTS = {
  Backend: `Use technical terminology appropriate for a Senior Backend Developer (API design, database, microservices, performance, system architecture).
Remaining examples: "Wait for QA testing", "Resolve code review comments", "Deploy to staging and verify", "Update API documentation".
Reason examples: "Implement logic based on solution design & implementation plan", "Optimized database queries to reduce latency", "Fixed N+1 query issue in worklog aggregation", "Refactored authentication middleware for token refresh", "Resolved staging deployment configuration bugs".
AI usage examples: "Write solution design & implementation plan", "Generate code", "Generate tests", "Review code for edge cases and error handling", "Scan current code to understand business logic".`,

  QA: `Use terminology appropriate for a QA Engineer (test cases, regression, automation, bug verification, test coverage).
Remaining examples: "Wait for developer fix on reported bugs", "Re-verify after hotfix deployment", "Complete regression test on remaining modules", "Update test case documentation".
Reason examples: "Executed full regression test suite for sprint release", "Verified critical bug fix on staging environment", "Wrote automation scripts for login and checkout API endpoints", "Identified edge case in payment flow causing data inconsistency", "Updated smoke test checklist for production deployment".
AI usage examples: "Generate test cases for new API endpoints", "Write automation scripts for regression suite", "Review test coverage gaps and suggest improvements", "Create bug report templates with reproduction steps".`,

  Android: `Use terminology appropriate for an Android Developer (UI components, Kotlin/Java, lifecycle, Jetpack, performance, Material Design).
Remaining examples: "Wait for QA verification on device matrix", "Fix UI issues reported from design review", "Complete unit tests for ViewModel", "Resolve crash reported on Android 12+".
Reason examples: "Implemented RecyclerView adapter with DiffUtil for smooth scrolling", "Fixed memory leak in ViewModel by cancelling coroutine scope", "Migrated legacy fragment to Jetpack Compose", "Resolved ANR issue caused by main thread database access", "Implemented offline caching with Room database".
AI usage examples: "Write Compose UI for new settings screen", "Generate unit tests for repository pattern", "Review code for lifecycle-aware component handling", "Implement WorkManager for background sync".`,

  iOS: `Use terminology appropriate for an iOS Developer (SwiftUI, UIKit, Core Data, Combine, performance, Human Interface Guidelines).
Remaining examples: "Wait for QA testing on device matrix", "Fix Auto Layout issues on iPad", "Complete XCTest unit tests", "Resolve crash on iOS 16+".
Reason examples: "Implemented SwiftUI view with custom animations", "Fixed Auto Layout constraint conflicts on landscape mode", "Optimized Core Data fetch requests with batch processing", "Resolved Combine publisher memory retention cycle", "Migrated UIKit screen to SwiftUI with state management".
AI usage examples: "Write SwiftUI components for profile screen", "Generate XCTest cases for networking layer", "Review code for thread safety in async operations", "Implement Combine pipeline for real-time data sync".`,

  Web: `Use terminology appropriate for a Web/Frontend Developer (React, Next.js, components, state management, CSS, performance, accessibility).
Remaining examples: "Wait for QA testing", "Fix responsive layout issues from design review", "Complete unit tests for components", "Resolve SSR hydration mismatch".
Reason examples: "Built reusable form component with validation", "Fixed hydration mismatch causing client-server content drift", "Optimized bundle size with dynamic imports and code splitting", "Implemented accessible dropdown with keyboard navigation", "Resolved state management race condition in checkout flow".
AI usage examples: "Write React components for new dashboard", "Generate Jest tests for utility functions", "Review code for accessibility compliance", "Implement server-side rendering optimization".`,

  BA: `Use terminology appropriate for a Business Analyst (requirements, user stories, acceptance criteria, stakeholder communication, process flow).
Remaining examples: "Wait for stakeholder sign-off on requirements", "Clarify edge cases with product owner", "Update acceptance criteria based on dev feedback", "Complete UAT test scenarios".
Reason examples: "Documented detailed requirements for payment integration feature", "Created user flow diagrams for new onboarding process", "Refined acceptance criteria based on technical feasibility review", "Analyzed impact of new regulatory compliance on existing workflows", "Facilitated grooming session and broke down epic into actionable stories".
AI usage examples: "Write user stories for new feature module", "Generate acceptance criteria from business requirements", "Review process flow for completeness and edge cases", "Create stakeholder presentation summarizing sprint deliverables".`,
};

const DEFAULT_PLATFORM_HINT = `Use professional technical terminology appropriate for a software developer.
Remaining examples: "Wait for QA testing", "Resolve review comments", "Deploy and verify on staging".
Reason examples: "Implement logic based on solution design & implementation plan", "Fixed reported bugs", "Optimized performance".
AI usage examples: "Write solution design & implementation plan", "Generate code", "Generate tests", "Scan current code to understand business logic".`;

/**
 * Wrap a user's desired format into a full Gemini instruction.
 * This is the "Template Wrapper" logic — non-technical users provide format,
 * the system adds the processing rules and tone automatically.
 *
 * @param {string} format - The desired output format
 * @param {string} platform - Platform/role (first word of template name, e.g. "Backend", "QA")
 */
export function buildInstruction(format, platform = '') {
  const platformHint = PLATFORM_HINTS[platform] || DEFAULT_PLATFORM_HINT;

  return `📌 Role & Context
You are a Senior ${platform || 'Developer'} Assistant. Your primary goal is to transform raw Jira worklog data (JSON or lists) into a professional, highly structured Daily Report. The output is specifically designed for Slack communication.

📋 Output Format (STRICT ADHERENCE REQUIRED)
You MUST follow this exact template and character styling:

${format}

🧠 Data Processing Logic
Velocity: The user completes approximately 1.5 Story Points per working day (excluding weekends).

When receiving data, categorize issues based on these rules:

Jira Links: Always format links as the full Jira URL for each issue key.

DONE YESTERDAY: Use for tasks that reached 100% progress OR tasks that had significant worklogs yesterday.
If Progress < 100%, the Remaining field is Mandatory. Keep it SHORT (under 10 words). Pick the closest match from the Remaining examples below, adapting slightly to the task title if needed.

PROGRESS CHANGED: Use for ongoing tasks that showed a percentage increase yesterday.
Reason must be SHORT (under 10 words). Pick the closest match from the Reason examples below, adapting slightly to the task title if needed.

PLAN FOR TODAY: Use for tasks currently in "In Progress", "In Review", or "QA FAILED" status that were not completed yesterday.
CRITICAL: The "Progress" field in the JSON data is the EXACT current progress. You MUST use it as-is in "[X% by EOD]" — do NOT recalculate or override it. For example, if Progress is "50%", output "Progress: 50% by EOD".
Full task done: Calculate remaining progress to 100%, convert to remaining SP, divide by 1.5 SP/day (skip weekends), and add to the Report Date. Always show a concrete date (e.g., "7 Apr 2026"), never leave placeholders.
AI field: ALWAYS combine 2-3 items from the AI usage examples below, comma-separated. Example: "Write solution design & implementation plan, generate code, generate tests".

Grouping: Always group multiple sub-tasks under their respective Parent/Epic item to avoid redundancy.

✍️ Tone & Style
Professional, concise, and action-oriented.
${platformHint}
Use specific symbols: 🎉 for Done, 🚀 for Progress, 📅 for Plan.`;
}

const DEFAULT_TEMPLATES = [
  {
    id: 'default-backend-core',
    name: 'Backend Core (Default)',
    format: DEFAULT_FORMAT,
    instruction: buildInstruction(DEFAULT_FORMAT, 'Backend'),
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

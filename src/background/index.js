import { StorageService } from '../services/storage.js';
import { JiraService } from '../services/jira.js';
import { GeminiService } from '../services/gemini.js';
import { ReportEngine } from '../services/report-engine.js';
import { DateHelper } from '../utils/date.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_REPORT') {
    handleGenerateReport(message)
      .then((result) => sendResponse({ type: 'REPORT_RESULT', ...result }))
      .catch((error) => sendResponse({ type: 'REPORT_ERROR', error: error.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'TEST_GEMINI') {
    GeminiService.testConnection(message.apiKey)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function handleGenerateReport({ date, templateId }) {
  const settings = await StorageService.getSettings();
  const templates = await StorageService.getTemplates();
  const domain = await StorageService.getJiraDomain();

  if (!domain) throw new Error('Please open a Jira tab first so the extension can detect your domain.');
  if (!settings.geminiKey) throw new Error('Please enter your Gemini API key in Settings.');

  const template = templates.find((t) => t.id === templateId) || templates[0];
  if (!template) throw new Error('No template found. Please create one in Settings.');

  const baseDate = date ? new Date(date + 'T00:00:00') : new Date();
  const targetDate = DateHelper.getTargetDate(baseDate);

  // Step 1: Fetch and categorize Jira data
  const myId = await JiraService.getMyId(domain);
  const engine = new ReportEngine({
    domain,
    myId,
    targetDate,
    baseDate,
    spField: settings.spField,
    hoursPerPoint: settings.hoursPerPoint,
  });
  const report = await engine.generate();

  // Step 2: Format with Gemini AI
  const formattedText = await GeminiService.generateReport(
    report,
    settings.geminiKey,
    template.instruction
  );

  return { report, formattedText };
}

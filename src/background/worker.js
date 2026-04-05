import { StorageService } from '../services/storage.js';
import { JiraService } from '../services/jira.js';
import { GeminiService } from '../services/gemini.js';
import { ReportEngine } from '../services/report-engine.js';
import { DateHelper } from '../utils/date.js';

console.log('[BG] Service worker started');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BG] Message received:', message.type);

  if (message.type === 'GENERATE_REPORT') {
    handleGenerateReport(message)
      .then((result) => {
        console.log('[BG] Report generated successfully');
        sendResponse({ type: 'REPORT_RESULT', ...result });
      })
      .catch((error) => {
        console.error('[BG] Report generation failed:', error);
        sendResponse({ type: 'REPORT_ERROR', error: error.message });
      });
    return true;
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

  console.log('[BG] Config:', { domain, hasKey: !!settings.geminiKey, templateId });

  if (!domain) throw new Error('Please open a Jira tab first so the extension can detect your domain.');
  if (!settings.geminiKey) throw new Error('Please enter your Gemini API key in Settings.');

  const template = templates.find((t) => t.id === templateId) || templates[0];
  if (!template) throw new Error('No template found. Please create one in Settings.');

  const baseDate = date ? new Date(date + 'T00:00:00') : new Date();
  const targetDate = DateHelper.getTargetDate(baseDate);
  console.log('[BG] Target date:', targetDate);

  // Step 1: Fetch user profile
  console.log('[BG] Step 1: Fetching user profile...');
  const profile = await JiraService.getMyProfile(domain);
  console.log('[BG] User:', profile.displayName);

  // Step 2: Fetch and categorize Jira data
  console.log('[BG] Step 2: Fetching Jira data...');
  const engine = new ReportEngine({
    domain,
    myId: profile.accountId,
    targetDate,
    baseDate,
    spField: settings.spField,
    hoursPerPoint: settings.hoursPerPoint,
  });
  const report = await engine.generate();
  console.log('[BG] Report data:', JSON.stringify(report).substring(0, 200));

  // Step 3: Format with Gemini AI
  console.log('[BG] Step 3: Sending to Gemini...');
  const formattedText = await GeminiService.generateReport(
    report,
    settings.geminiKey,
    template.instruction,
    {
      displayName: profile.displayName,
      platform: template.name.split(/\s/)[0],
      targetDate: date || DateHelper.formatDate(new Date()),
    }
  );
  console.log('[BG] Gemini response received, length:', formattedText.length);

  return { report, formattedText };
}

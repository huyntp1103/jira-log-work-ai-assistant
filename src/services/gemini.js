const MODELS = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'];
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiService {
  /**
   * Send report data to Gemini for AI formatting.
   * @param {object} jsonData - Categorized report data from ReportEngine
   * @param {string} apiKey - Gemini API key
   * @param {string} systemInstruction - Template instruction text
   * @param {object} context - Additional context for the report
   * @param {string} context.displayName - User's display name from Jira
   * @param {string} context.platform - Platform derived from template name (e.g. "Backend")
   * @param {string} context.targetDate - Report date (YYYY-MM-DD)
   */
  static async generateReport(jsonData, apiKey, systemInstruction, context = {}) {
    const contextLine = [
      context.displayName && `Reporter Name: ${context.displayName}`,
      context.platform && `Platform/Role: ${context.platform}`,
      context.targetDate && `Report Date: ${context.targetDate}`,
    ].filter(Boolean).join('\n');

    const prompt = `${contextLine ? contextLine + '\n\n' : ''}Please generate a Daily Report based on this JSON data: ${JSON.stringify(jsonData)}`;

    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, topP: 0.8, topK: 40 },
    };

    let lastError;
    for (const model of MODELS) {
      try {
        const url = `${BASE_URL}/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (data.error) throw new Error(`Gemini API: ${data.error.message}`);
        if (!data.candidates?.length) throw new Error('Gemini returned no results. Content may have been blocked by safety filters.');
        return data.candidates[0].content.parts[0].text;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Quick connectivity check — send a minimal request to verify the API key works.
   */
  static async testConnection(apiKey) {
    const url = `${BASE_URL}/${MODELS[0]}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts: [{ text: 'Say "ok"' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 5 },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    return true;
  }
}

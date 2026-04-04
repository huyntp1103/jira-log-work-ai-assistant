const MODEL = 'gemini-2.5-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiService {
  /**
   * Send report data to Gemini for AI formatting.
   * @param {object} jsonData - Categorized report data from ReportEngine
   * @param {string} apiKey - Gemini API key
   * @param {string} systemInstruction - Template instruction text
   * @returns {string} Formatted report text
   */
  static async generateReport(jsonData, apiKey, systemInstruction) {
    const url = `${API_URL}?key=${apiKey}`;
    const prompt = `Please generate a Daily Report based on this JSON data: ${JSON.stringify(jsonData)}`;

    const body = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        topK: 40,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Gemini API: ${data.error.message}`);
    }

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('Gemini returned no results. Content may have been blocked by safety filters.');
    }

    return data.candidates[0].content.parts[0].text;
  }

  /**
   * Quick connectivity check — send a minimal request to verify the API key works.
   */
  static async testConnection(apiKey) {
    const url = `${API_URL}?key=${apiKey}`;
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

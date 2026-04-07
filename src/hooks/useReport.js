import { useState, useCallback } from 'react';

export function useReport() {
  const [report, setReport] = useState(null);
  const [formattedText, setFormattedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async (date) => {
    setLoading(true);
    setError(null);
    setReport(null);
    setFormattedText('');

    console.log('[Popup] Sending GENERATE_REPORT:', { date });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_REPORT',
        date,
      });

      console.log('[Popup] Response received:', response);

      if (!response) {
        throw new Error('No response from background script. Service worker may not be running.');
      }

      if (response.type === 'REPORT_ERROR') {
        throw new Error(response.error);
      }

      setReport(response.report);
      setFormattedText(response.formattedText);
    } catch (err) {
      console.error('[Popup] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { report, formattedText, setFormattedText, loading, error, generate };
}

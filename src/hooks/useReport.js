import { useState, useCallback } from 'react';

export function useReport() {
  const [report, setReport] = useState(null);
  const [formattedText, setFormattedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generate = useCallback(async (date, templateId) => {
    setLoading(true);
    setError(null);
    setReport(null);
    setFormattedText('');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_REPORT',
        date,
        templateId,
      });

      if (response.type === 'REPORT_ERROR') {
        throw new Error(response.error);
      }

      setReport(response.report);
      setFormattedText(response.formattedText);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { report, formattedText, setFormattedText, loading, error, generate };
}

import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storage.js';
import { useReport } from '../hooks/useReport.js';
import { DateHelper } from '../utils/date.js';
import Settings from './components/Settings.jsx';
import TemplateSelector from './components/TemplateSelector.jsx';
import DatePicker from './components/DatePicker.jsx';
import ReportPreview from './components/ReportPreview.jsx';

export default function App() {
  const [view, setView] = useState('main'); // 'main' | 'settings'
  const [templateId, setTemplateId] = useState(null);
  const [date, setDate] = useState(DateHelper.formatDate(new Date()));
  const [showSpinner, setShowSpinner] = useState(false);
  const { formattedText, setFormattedText, loading, error, generate } = useReport();

  // First-run: show settings if no API key configured
  useEffect(() => {
    StorageService.getSettings().then((s) => {
      if (!s.geminiKey) setView('settings');
    });
  }, []);

  // Delay spinner by 300ms to avoid flash
  useEffect(() => {
    if (!loading) { setShowSpinner(false); return; }
    const timer = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleGenerate = () => {
    if (!templateId) return;
    generate(date, templateId);
  };

  if (view === 'settings') {
    return (
      <div className="w-[400px] min-h-[500px] bg-background text-foreground p-4 font-sans">
        <Settings onBack={() => setView('main')} />
      </div>
    );
  }

  return (
    <div className="w-[400px] min-h-[500px] bg-background text-foreground p-4 font-sans space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-primary text-lg font-bold">Jira Report Assistant</h1>
        <button
          onClick={() => setView('settings')}
          className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-card transition-colors duration-200"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 0 1 .804.98v1.362a1 1 0 0 1-.804.98l-1.473.295c-.144.497-.342.971-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834c-.445.245-.919.443-1.416.587l-.294 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a5.935 5.935 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a5.935 5.935 0 0 1-.587-1.416L1.804 11.66A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.23l1.25.834c.445-.245.919-.443 1.416-.587l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Controls */}
      <TemplateSelector selectedId={templateId} onSelect={setTemplateId} />
      <DatePicker value={date} onChange={setDate} />

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={loading || !templateId}
        className="w-full py-2.5 rounded-lg text-sm font-medium text-on-primary bg-accent hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all duration-200"
      >
        {showSpinner ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </span>
        ) : 'Generate Report'}
      </button>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-destructive text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Preview */}
      <ReportPreview text={formattedText} onChange={setFormattedText} />
    </div>
  );
}

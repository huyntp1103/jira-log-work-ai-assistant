import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storage.js';
import { useReport } from '../hooks/useReport.js';
import { DateHelper } from '../utils/date.js';
import Settings from './components/Settings.jsx';
import TemplateSelector from './components/TemplateSelector.jsx';
import DatePicker from './components/DatePicker.jsx';
import ReportPreview from './components/ReportPreview.jsx';

export default function App() {
  const [view, setView] = useState('main');
  const [templateId, setTemplateId] = useState(null);
  const [date, setDate] = useState(DateHelper.formatDate(new Date()));
  const { formattedText, setFormattedText, loading, error, generate } = useReport();

  useEffect(() => {
    StorageService.getSettings().then((s) => {
      if (!s.geminiKey) setView('settings');
    });
  }, []);

  const handleGenerate = () => {
    if (!templateId) return;
    generate(date, templateId);
  };

  if (view === 'settings') {
    return (
      <div className="w-[420px] min-h-[480px] bg-slate-50">
        <div className="bg-gradient-to-r from-violet-600 to-blue-500 px-5 py-3.5">
          <h1 className="text-white text-sm font-semibold">Settings</h1>
        </div>
        <div className="p-4">
          <Settings onBack={() => setView('main')} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[420px] min-h-[480px] bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-blue-500 px-5 py-3.5 flex items-center justify-between">
        <div>
          <h1 className="text-white text-sm font-semibold">Jira Report Assistant</h1>
          <p className="text-blue-100 text-[11px] mt-0.5">AI-powered daily reports</p>
        </div>
        <button
          onClick={() => setView('settings')}
          className="p-1.5 rounded text-blue-200 hover:text-white hover:bg-white/15 transition-colors"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 0 1 .804.98v1.362a1 1 0 0 1-.804.98l-1.473.295c-.144.497-.342.971-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834c-.445.245-.919.443-1.416.587l-.294 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a5.935 5.935 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a5.935 5.935 0 0 1-.587-1.416L1.804 11.66A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.23l1.25.834c.445-.245.919-.443 1.416-.587l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Controls */}
        <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-3">
          <TemplateSelector selectedId={templateId} onSelect={setTemplateId} />
          <DatePicker value={date} onChange={setDate} />
        </div>

        {/* Generate */}
        <button
          onClick={handleGenerate}
          disabled={loading || !templateId}
          className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating...
            </>
          ) : 'Generate Report'}
        </button>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700" role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5">
              <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Preview */}
        <ReportPreview text={formattedText} onChange={setFormattedText} />
      </div>
    </div>
  );
}

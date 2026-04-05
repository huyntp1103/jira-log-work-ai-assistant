import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storage.js';

export default function Settings({ onBack }) {
  const [settings, setSettings] = useState({
    geminiKey: '',
    spField: 'customfield_10014',
    hoursPerPoint: 4,
  });
  const [showKey, setShowKey] = useState(false);
  const [apiStatus, setApiStatus] = useState(null);
  const [apiError, setApiError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    StorageService.getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    await StorageService.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    if (settings.geminiKey) {
      setApiStatus('checking');
      setApiError('');
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'TEST_GEMINI',
          apiKey: settings.geminiKey,
        });
        setApiStatus(response.success ? 'ok' : 'error');
        if (!response.success) setApiError(response.error);
      } catch {
        setApiStatus('error');
        setApiError('Failed to connect');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* API Key */}
      <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <label htmlFor="gemini-key" className="text-[13px] font-semibold text-slate-800">
            Gemini API Key
          </label>
          {apiStatus && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              apiStatus === 'ok' ? 'text-green-600' : apiStatus === 'error' ? 'text-red-600' : 'text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                apiStatus === 'checking' ? 'bg-yellow-400 animate-pulse' :
                apiStatus === 'ok' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              {apiStatus === 'checking' ? 'Checking...' : apiStatus === 'ok' ? 'Connected' : apiError}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <input
            id="gemini-key"
            type={showKey ? 'text' : 'password'}
            value={settings.geminiKey}
            onChange={(e) => setSettings({ ...settings, geminiKey: e.target.value })}
            placeholder="AIza..."
            className="flex-1 min-w-0 px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-2.5 py-2 text-[11px] font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Advanced */}
      <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5">
        <h3 className="text-[13px] font-semibold text-slate-800">Advanced</h3>
        <div>
          <label htmlFor="sp-field" className="block text-[11px] font-medium text-slate-500 mb-1">
            Story Point Field ID
          </label>
          <input
            id="sp-field"
            type="text"
            value={settings.spField}
            onChange={(e) => setSettings({ ...settings, spField: e.target.value })}
            className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="hours-per-point" className="block text-[11px] font-medium text-slate-500 mb-1">
            Hours per Story Point
          </label>
          <input
            id="hours-per-point"
            type="number"
            min="1"
            value={settings.hoursPerPoint}
            onChange={(e) => setSettings({ ...settings, hoursPerPoint: Number(e.target.value) })}
            className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-2.5 rounded-lg text-[13px] font-medium text-slate-600 border border-slate-200 hover:bg-white active:scale-[0.98] transition-all"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          className={`flex-[2] py-2.5 rounded-lg text-[13px] font-semibold text-white active:scale-[0.98] transition-all ${
            saved ? 'bg-green-600' : 'bg-teal-600 hover:bg-teal-700'
          }`}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

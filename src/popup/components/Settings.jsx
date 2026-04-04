import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storage.js';

export default function Settings({ onBack }) {
  const [settings, setSettings] = useState({
    geminiKey: '',
    spField: 'customfield_10014',
    hoursPerPoint: 4,
  });
  const [showKey, setShowKey] = useState(false);
  const [apiStatus, setApiStatus] = useState(null); // null | 'checking' | 'ok' | 'error'
  const [apiError, setApiError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    StorageService.getSettings().then(setSettings);
  }, []);

  const handleSave = async () => {
    await StorageService.saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Test API connection
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <button
          onClick={onBack}
          className="text-sm text-muted hover:text-foreground transition-colors duration-200"
        >
          Back
        </button>
      </div>

      {/* API Key */}
      <div>
        <label htmlFor="gemini-key" className="block text-sm font-medium text-foreground mb-1">
          Gemini API Key
        </label>
        <div className="flex gap-2">
          <input
            id="gemini-key"
            type={showKey ? 'text' : 'password'}
            value={settings.geminiKey}
            onChange={(e) => setSettings({ ...settings, geminiKey: e.target.value })}
            placeholder="AIza..."
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-3 py-2 text-sm text-muted hover:text-foreground border border-border rounded-lg transition-colors duration-200"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
        {apiStatus && (
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                apiStatus === 'checking' ? 'bg-yellow-400 animate-pulse' :
                apiStatus === 'ok' ? 'bg-green-500' : 'bg-destructive'
              }`}
            />
            <span className={`text-xs ${apiStatus === 'ok' ? 'text-green-600' : apiStatus === 'error' ? 'text-destructive' : 'text-muted'}`}>
              {apiStatus === 'checking' ? 'Checking...' : apiStatus === 'ok' ? 'Connected' : apiError}
            </span>
          </div>
        )}
      </div>

      {/* SP Field */}
      <div>
        <label htmlFor="sp-field" className="block text-sm font-medium text-foreground mb-1">
          Story Point Field
        </label>
        <input
          id="sp-field"
          type="text"
          value={settings.spField}
          onChange={(e) => setSettings({ ...settings, spField: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Hours per Point */}
      <div>
        <label htmlFor="hours-per-point" className="block text-sm font-medium text-foreground mb-1">
          Hours per Story Point
        </label>
        <input
          id="hours-per-point"
          type="number"
          min="1"
          value={settings.hoursPerPoint}
          onChange={(e) => setSettings({ ...settings, hoursPerPoint: Number(e.target.value) })}
          className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className={`w-full py-2 rounded-lg text-sm font-medium text-on-primary transition-all duration-200 active:scale-95 ${
          saved ? 'bg-green-500' : 'bg-primary hover:bg-secondary'
        }`}
      >
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

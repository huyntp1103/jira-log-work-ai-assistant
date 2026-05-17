import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storage.js';
import TemplateSelector from './TemplateSelector.jsx';

export default function Settings({ onBack }) {
  const [settings, setSettings] = useState({
    geminiKey: '',
    spField: 'customfield_10014',
    hoursPerPoint: 4,
    timeCommit: 3600,
    timeApprove: 900,
    timeComment: 900,
    reportEngine: 'gemini',
  });
  const [github, setGithub] = useState({ githubToken: '', githubUsername: '', allowedRepos: '' });
  const [showKey, setShowKey] = useState(false);
  const [showPat, setShowPat] = useState(false);
  const [apiStatus, setApiStatus] = useState(null);
  const [apiError, setApiError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      StorageService.getSettings(),
      StorageService.getGitHubCredentials(),
    ]).then(([s, g]) => {
      setSettings(s);
      setGithub(g);
    });
  }, []);

  const handleSave = async () => {
    await Promise.all([
      StorageService.saveSettings(settings),
      StorageService.setGitHubCredentials(github),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    if (settings.reportEngine !== 'local' && settings.geminiKey) {
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
      {/* Templates */}
      <div className="bg-white rounded-lg border border-slate-200 p-3.5">
        <h3 className="text-[13px] font-semibold text-slate-800 mb-2.5">Templates</h3>
        <TemplateSelector selectedId={null} onSelect={() => {}} />
      </div>

      {/* Report Engine */}
      <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5">
        <div>
          <h3 className="text-[13px] font-semibold text-slate-800">Report Engine</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Choose how the daily report is generated.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
          {[
            { value: 'gemini', label: 'Gemini AI' },
            { value: 'local', label: 'Local Formatter' },
          ].map(({ value, label }) => {
            const active = (settings.reportEngine || 'gemini') === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setSettings({ ...settings, reportEngine: value })}
                className={`py-1.5 rounded-md text-[12px] font-medium transition-all ${
                  active
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* API Key */}
      <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <label htmlFor="gemini-key" className="text-[13px] font-semibold text-slate-800">
            Gemini API Key
          </label>
          {apiStatus && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
              apiStatus === 'ok' ? 'text-emerald-600' : apiStatus === 'error' ? 'text-red-600' : 'text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                apiStatus === 'checking' ? 'bg-yellow-400 animate-pulse' :
                apiStatus === 'ok' ? 'bg-emerald-500' : 'bg-red-500'
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
            className="flex-1 min-w-0 px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
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
            className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* GitHub Sync */}
      <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5">
        <h3 className="text-[13px] font-semibold text-slate-800">GitHub Sync</h3>
        <div>
          <label htmlFor="gh-username" className="block text-[11px] font-medium text-slate-500 mb-1">
            GitHub Username
          </label>
          <input
            id="gh-username"
            type="text"
            value={github.githubUsername}
            onChange={(e) => setGithub({ ...github, githubUsername: e.target.value })}
            placeholder="your-github-username"
            className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="gh-token" className="block text-[11px] font-medium text-slate-500 mb-1">
            Personal Access Token (PAT)
          </label>
          <div className="flex gap-1.5">
            <input
              id="gh-token"
              type={showPat ? 'text' : 'password'}
              value={github.githubToken}
              onChange={(e) => setGithub({ ...github, githubToken: e.target.value })}
              placeholder="ghp_..."
              className="flex-1 min-w-0 px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              onClick={() => setShowPat(!showPat)}
              className="px-2.5 py-2 text-[11px] font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
            >
              {showPat ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="gh-repos" className="block text-[11px] font-medium text-slate-500 mb-1">
            Allowed Repos (comma-separated, leave empty for all)
          </label>
          <input
            id="gh-repos"
            type="text"
            value={github.allowedRepos}
            onChange={(e) => setGithub({ ...github, allowedRepos: e.target.value })}
            placeholder="Org/repo-1, Org/repo-2"
            className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-500 mb-1.5">Log Time (minutes)</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Commit', key: 'timeCommit' },
              { label: 'PR Approved', key: 'timeApprove' },
              { label: 'PR Comment', key: 'timeComment' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-[10px] text-slate-400 mb-1">{label}</label>
                <input
                  type="number"
                  min="1"
                  value={Math.round(settings[key] / 60)}
                  onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) * 60 })}
                  className="w-full px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>
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
            saved ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'
          }`}
        >
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

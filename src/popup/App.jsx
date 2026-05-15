import { useState, useEffect } from 'react';
import { StorageService } from '../services/storage.js';
import { useReport } from '../hooks/useReport.js';
import { DateHelper } from '../utils/date.js';
import Settings from './components/Settings.jsx';
import DatePicker from './components/DatePicker.jsx';
import ReportPreview from './components/ReportPreview.jsx';
import GitHubSyncPanel from './components/GitHubSyncPanel.jsx';
import WorklogPreview from './components/WorklogPreview.jsx';
import JiraTrackerPanel from './components/JiraTrackerPanel.jsx';

export default function App() {
  const [view, setView] = useState('main');
  const [tab, setTab] = useState('tasks'); // 'tasks' | 'github' | 'report'
  const [date, setDate] = useState(DateHelper.formatDate(new Date()));
  const [githubFetchKey, setGithubFetchKey] = useState(0);
  const [githubRows, setGithubRows] = useState(null);
  const [worklogExpanded, setWorklogExpanded] = useState(true);

  const [cacheInfo, setCacheInfo] = useState(null);      // { savedAt } | null
  const [reportFromCache, setReportFromCache] = useState(false);
  const [githubFromCache, setGithubFromCache] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  const { formattedText, setFormattedText, loading, error, generate } = useReport();

  // On date change: check cache and auto-populate both tabs
  useEffect(() => {
    let cancelled = false;
    async function checkAndLoad() {
      const cached = await StorageService.getDailyCache(date);
      if (cancelled) return;

      if (!cached) {
        setCacheInfo(null);
        setFormattedText('');
        setGithubRows(null);
        setGithubFetchKey(0);
        setReportFromCache(false);
        setGithubFromCache(false);
        return;
      }

      setCacheInfo({ savedAt: cached.savedAt });

      if (cached.reportText) {
        setFormattedText(cached.reportText);
        setReportFromCache(true);
      } else {
        setFormattedText('');
        setReportFromCache(false);
      }

      if (cached.githubRows) {
        setGithubRows(cached.githubRows);
        setGithubFetchKey((k) => k + 1);
        setGithubFromCache(true);
      } else {
        setGithubRows(null);
        setGithubFetchKey(0);
        setGithubFromCache(false);
      }
    }
    checkAndLoad();
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    StorageService.getSettings().then((s) => {
      if (!s.geminiKey) setView('settings');
    });
  }, []);

  const hasContent = !!(formattedText || (githubRows && githubRows.length > 0));

  const handleSave = async () => {
    await StorageService.setDailyCache(date, {
      reportText: formattedText || undefined,
      githubRows: githubRows || undefined,
    });
    const saved = await StorageService.getDailyCache(date);
    setCacheInfo({ savedAt: saved.savedAt });
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 2000);
  };

  const handleRefreshReport = () => {
    setReportFromCache(false);
    setFormattedText('');
  };

  const handleRefreshGithub = () => {
    setGithubFromCache(false);
    setGithubRows(null);
    setGithubFetchKey((k) => k + 1);
  };

  if (view === 'settings') {
    return (
      <div className="w-full min-h-screen bg-slate-50">
        <div className="bg-slate-900 px-5 py-3.5">
          <h1 className="text-white text-sm font-semibold">Settings</h1>
        </div>
        <div className="p-4 max-w-[520px] mx-auto">
          <Settings onBack={() => setView('main')} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-5 py-3.5 flex items-center justify-between">
        <div>
          <h1 className="text-white text-sm font-semibold">Daily Report AI Assistant</h1>
          {/* <p className="text-blue-100 text-[11px] mt-0.5">AI-powered daily reports</p> */}
        </div>
        <button
          onClick={() => setView('settings')}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 0 1 1.262.125l.962.962a1 1 0 0 1 .125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.294a1 1 0 0 1 .804.98v1.362a1 1 0 0 1-.804.98l-1.473.295c-.144.497-.342.971-.587 1.416l.834 1.25a1 1 0 0 1-.125 1.262l-.962.962a1 1 0 0 1-1.262.125l-1.25-.834c-.445.245-.919.443-1.416.587l-.294 1.473a1 1 0 0 1-.98.804H9.32a1 1 0 0 1-.98-.804l-.295-1.473a5.935 5.935 0 0 1-1.416-.587l-1.25.834a1 1 0 0 1-1.262-.125l-.962-.962a1 1 0 0 1-.125-1.262l.834-1.25a5.935 5.935 0 0 1-.587-1.416L1.804 11.66A1 1 0 0 1 1 10.68V9.32a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 0 1 .125-1.262l.962-.962A1 1 0 0 1 5.38 3.23l1.25.834c.445-.245.919-.443 1.416-.587l.294-1.473ZM13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 max-w-[520px] mx-auto">
        {/* Tabs */}
        <div className="flex gap-0 bg-white rounded-lg border border-slate-200 p-1">
          <button
            onClick={() => setTab('tasks')}
            className={`flex-1 py-1.5 rounded-md text-[13px] font-semibold transition-all ${
              tab === 'tasks'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Jira Tasks
          </button>
          <button
            onClick={() => setTab('github')}
            className={`flex-1 py-1.5 rounded-md text-[13px] font-semibold transition-all ${
              tab === 'github'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            GitHub Sync
          </button>
          <button
            onClick={() => setTab('report')}
            className={`flex-1 py-1.5 rounded-md text-[13px] font-semibold transition-all ${
              tab === 'report'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Daily Report
          </button>
        </div>

        {/* Date + Save — shown only for GitHub Sync and Daily Report tabs */}
        {tab !== 'tasks' && (
          <div className="bg-white rounded-lg border border-slate-200 p-3.5">
            <DatePicker
              value={date}
              onChange={setDate}
              cacheInfo={cacheInfo}
              hasContent={hasContent}
              saveFlash={saveFlash}
              onSave={handleSave}
            />
          </div>
        )}

        {/* ── Jira Tasks tab ── */}
        {tab === 'tasks' && <JiraTrackerPanel />}

        {/* ── Report tab ── */}
        {tab === 'report' && (
          <div className="space-y-3">
            <WorklogPreview
              key={date}
              date={date}
              expanded={worklogExpanded}
              onToggle={() => setWorklogExpanded((e) => !e)}
            />

            {reportFromCache ? (
              <CacheBanner savedAt={cacheInfo?.savedAt} onRefresh={handleRefreshReport} color="indigo" />
            ) : (
              <button
                onClick={() => { setWorklogExpanded(false); generate(date); }}
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <ReportPreview text={formattedText} onChange={setFormattedText} />
          </div>
        )}

        {/* ── GitHub tab ── */}
        {tab === 'github' && (
          <div className="space-y-3">
            {githubFromCache ? (
              <CacheBanner savedAt={cacheInfo?.savedAt} onRefresh={handleRefreshGithub} color="orange" />
            ) : (
              <button
                onClick={() => { setGithubRows(null); setGithubFetchKey((k) => k + 1); }}
                className="w-full py-2.5 rounded-lg text-[13px] font-semibold text-white bg-orange-500 hover:bg-orange-600 active:scale-[0.98] transition-all"
              >
                Fetch GitHub Activity
              </button>
            )}

            {githubFetchKey > 0 && (
              <GitHubSyncPanel
                key={githubFetchKey}
                date={date}
                autoFetch={!githubFromCache}
                savedRows={githubFromCache ? githubRows : null}
                onRowsChange={setGithubRows}
                fromCache={githubFromCache}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CacheBanner({ savedAt, onRefresh, color = 'amber' }) {
  const styles = {
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  };
  const btnStyles = {
    amber: 'text-amber-600 hover:text-amber-800',
    orange: 'text-orange-600 hover:text-orange-800',
    indigo: 'text-indigo-600 hover:text-indigo-800',
  };
  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-[12px] ${styles[color]}`}>
      <div className="flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
        </svg>
        Restored from cache · {formatSavedAt(savedAt)}
      </div>
      <button
        onClick={onRefresh}
        className={`flex items-center gap-1 font-medium transition-colors ${btnStyles[color]}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
        </svg>
        Refresh
      </button>
    </div>
  );
}

function formatSavedAt(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

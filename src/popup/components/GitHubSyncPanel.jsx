import React, { useState, useEffect } from 'react';

/**
 * Convert seconds to human-readable string: "1h 30m", "45m", "2h"
 */
function fmtTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Parse time string back to seconds. Accepts: "1h 30m", "1h", "45m", "90" (treated as minutes)
 */
function parseTime(str) {
  const hMatch = str.match(/(\d+)\s*h/);
  const mMatch = str.match(/(\d+)\s*m/);
  if (!hMatch && !mMatch) {
    const num = parseInt(str, 10);
    return isNaN(num) ? null : num * 60;
  }
  const h = hMatch ? parseInt(hMatch[1], 10) : 0;
  const m = mMatch ? parseInt(mMatch[1], 10) : 0;
  return (h * 3600) + (m * 60);
}

export default function GitHubSyncPanel({ date, autoFetch = false }) {
  const [rows, setRows] = useState(null); // null = not fetched yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(null); // number of worklogs created

  useEffect(() => {
    if (autoFetch) handlePreview();
  }, []);

  const handlePreview = async () => {
    setLoading(true);
    setError('');
    setRows(null);
    setSyncDone(null);

    try {
      const res = await chrome.runtime.sendMessage({ type: 'GITHUB_SYNC_PREVIEW', date });
      if (res.type === 'GITHUB_SYNC_ERROR') throw new Error(res.error);
      setRows(res.rows.map((r) => ({ ...r, timeStr: fmtTime(r.seconds) })));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError('');

    const worklogs = rows.map((r) => {
      const seconds = parseTime(r.timeStr) ?? r.seconds;
      return { key: r.key, seconds, description: r.description };
    });

    try {
      const res = await chrome.runtime.sendMessage({ type: 'GITHUB_SYNC_CONFIRM', worklogs, date });
      if (res.type === 'GITHUB_SYNC_ERROR') throw new Error(res.error);
      setSyncDone(res.count);
      setRows(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const updateRow = (i, field, value) => {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  return (
    <div className="space-y-3">
      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-[13px] text-slate-400">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Fetching GitHub activity...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700" role="alert">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Sync done */}
      {syncDone !== null && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-[13px] text-green-700">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          {syncDone} worklog{syncDone !== 1 ? 's' : ''} created successfully.
        </div>
      )}

      {/* Empty state */}
      {rows !== null && rows.length === 0 && (
        <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-[13px] text-slate-500 text-center">
          No new GitHub activity found for this date.
        </div>
      )}

      {/* Preview table */}
      {rows !== null && rows.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_70px] gap-0 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 border-b border-slate-100 bg-slate-50">
            <span>Ticket / Description</span>
            <span className="text-right">Time</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <div key={i} className="px-3 py-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={row.key}
                    onChange={(e) => updateRow(i, 'key', e.target.value.toUpperCase())}
                    className="w-24 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[12px] font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                  <input
                    type="text"
                    value={row.timeStr}
                    onChange={(e) => updateRow(i, 'timeStr', e.target.value)}
                    className="ml-auto w-16 px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[12px] text-right text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  />
                  <button
                    onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-0.5 text-slate-300 hover:text-red-500 transition-colors"
                    aria-label="Remove row"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <textarea
                  value={row.description}
                  onChange={(e) => updateRow(i, 'description', e.target.value)}
                  rows={2}
                  className="w-full px-1.5 py-1 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-500 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            ))}
          </div>

          <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="w-full py-2 rounded-lg text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing...
                </>
              ) : `Sync ${rows.length} worklog${rows.length !== 1 ? 's' : ''} to Jira`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

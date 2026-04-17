import { useState, useEffect } from 'react';
import { StorageService } from '../../services/storage.js';

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

export default function GitHubSyncPanel({ date, autoFetch = false, savedRows = null, onRowsChange }) {
  const [rows, setRows] = useState(
    savedRows ? savedRows.map((r) => ({ ...r, timeStr: r.timeStr ?? fmtTime(r.seconds) })) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(null);
  const [jiraDomain, setJiraDomain] = useState('');

  useEffect(() => {
    StorageService.getJiraDomain().then(setJiraDomain);
    if (autoFetch && savedRows === null) handlePreview();
  }, []);

  const handlePreview = async () => {
    setLoading(true);
    setError('');
    setRows(null);
    setSyncDone(null);

    try {
      const res = await chrome.runtime.sendMessage({ type: 'GITHUB_SYNC_PREVIEW', date });
      if (res.type === 'GITHUB_SYNC_ERROR') throw new Error(res.error);
      const fetched = res.rows.map((r) => ({ ...r, timeStr: fmtTime(r.seconds) }));
      setRows(fetched);
      onRowsChange?.(fetched);
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
    setRows((prev) => {
      const next = prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
      onRowsChange?.(next);
      return next;
    });
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
          <div className="grid grid-cols-[1fr_88px] gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 border-b border-slate-100 bg-slate-50">
            <span>Ticket / Description</span>
            <span className="text-center">Logged time</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <div key={i} className="px-3 py-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[12px] leading-snug"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      title={row.summary ? `${row.key}: ${row.summary}` : row.key}
                    >
                      {jiraDomain ? (
                        <a
                          href={`https://${jiraDomain}/browse/${row.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-semibold text-violet-700 hover:text-violet-900 hover:underline"
                        >
                          {row.key}
                        </a>
                      ) : (
                        <span className="font-mono font-semibold text-violet-700">{row.key}</span>
                      )}
                      {row.summary && (
                        <span className="text-slate-600">: {row.summary}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-start gap-1 pt-0.5">
                    <input
                      type="text"
                      value={row.timeStr}
                      onChange={(e) => updateRow(i, 'timeStr', e.target.value)}
                      placeholder="1h 30m"
                      className="w-14 px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    <button
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                      aria-label="Remove row"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                <textarea
                  value={row.description}
                  onChange={(e) => updateRow(i, 'description', e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-[12px] text-slate-600 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 focus:bg-white"
                />
              </div>
            ))}
          </div>

          {/* Sync button */}
          {(
            <div className="px-3 py-2.5 border-t border-slate-100 bg-slate-50">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="w-full py-2 rounded-lg text-[13px] font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
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
          )}
        </div>
      )}
    </div>
  );
}

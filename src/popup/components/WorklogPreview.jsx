import { useEffect, useState } from 'react';
import { fmtTime, parseTime } from '../../utils/time.js';

export default function WorklogPreview({ date, expanded = true, onToggle }) {
  const [rows, setRows] = useState(null);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setRows(null);

    chrome.runtime.sendMessage({ type: 'JIRA_WORKLOG_PREVIEW', date }, (res) => {
      if (cancelled) return;
      setLoading(false);
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message);
        return;
      }
      if (res?.type === 'JIRA_WORKLOG_ERROR') {
        setError(res.error);
        return;
      }
      const initial = (res?.rows || []).map((r) => ({
        ...r,
        timeStr: fmtTime(r.timeSpentSeconds),
        commentDraft: r.comment,
        saveStatus: null, // 'saving' | 'saved' | 'error' | null
        saveError: '',
      }));
      setRows(initial);
      setDomain(res?.domain || '');
    });

    return () => { cancelled = true; };
  }, [date]);

  const totalSeconds = (rows || []).reduce((acc, r) => acc + r.timeSpentSeconds, 0);

  const updateRowById = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const isDirty = (r) => {
    const parsed = parseTime(r.timeStr);
    return (parsed != null && parsed !== r.timeSpentSeconds) || (r.commentDraft !== r.comment);
  };

  const handleSave = (r) => {
    const parsed = parseTime(r.timeStr);
    if (parsed == null || parsed <= 0) {
      updateRowById(r.id, { saveStatus: 'error', saveError: 'Invalid time' });
      return;
    }

    const timeChanged = parsed !== r.timeSpentSeconds;
    const commentChanged = r.commentDraft !== r.comment;
    if (!timeChanged && !commentChanged) return;

    updateRowById(r.id, { saveStatus: 'saving', saveError: '' });

    chrome.runtime.sendMessage(
      {
        type: 'JIRA_WORKLOG_UPDATE',
        issueKey: r.key,
        worklogId: r.id,
        timeSpentSeconds: timeChanged ? parsed : undefined,
        comment: commentChanged ? r.commentDraft : undefined,
      },
      (res) => {
        if (chrome.runtime.lastError) {
          updateRowById(r.id, { saveStatus: 'error', saveError: chrome.runtime.lastError.message });
          return;
        }
        if (res?.type === 'JIRA_WORKLOG_ERROR') {
          updateRowById(r.id, { saveStatus: 'error', saveError: res.error });
          return;
        }
        updateRowById(r.id, {
          saveStatus: 'saved',
          timeSpentSeconds: parsed,
          comment: r.commentDraft,
          timeStr: fmtTime(parsed),
        });
        setTimeout(() => updateRowById(r.id, { saveStatus: null }), 1500);
      }
    );
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse worklogs' : 'Expand worklogs'}
      >
        <h3 className="text-[12px] font-semibold text-slate-700">
          Jira Worklogs
          {!loading && rows && rows.length > 0 && (
            <span className="ml-2 text-slate-400 font-normal">
              {rows.length} {rows.length === 1 ? 'log' : 'logs'} · {fmtTime(totalSeconds)}
            </span>
          )}
        </h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && loading && (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 rounded bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {expanded && error && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-700">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0 mt-0.5">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {expanded && !loading && !error && rows && rows.length === 0 && (
        <div className="text-[12px] text-slate-400 py-2">No worklogs logged on this date.</div>
      )}

      {expanded && !loading && !error && rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => {
            const dirty = isDirty(r);
            const saving = r.saveStatus === 'saving';
            return (
              <li key={r.id} className="py-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <p className="flex-1 min-w-0 text-[12px] text-slate-700 leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    <a
                      href={`https://${domain}/browse/${r.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {r.key}
                    </a>
                    <span className="text-slate-700">: {r.summary}</span>
                  </p>
                  <div className="flex items-start gap-1 pt-0.5">
                    <input
                      type="text"
                      value={r.timeStr}
                      onChange={(e) => updateRowById(r.id, { timeStr: e.target.value, saveStatus: null })}
                      placeholder="1h 30m"
                      className="w-14 px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleSave(r)}
                      disabled={!dirty || saving}
                      className={`p-1 transition-colors ${
                        dirty && !saving
                          ? 'text-blue-500 hover:text-blue-700'
                          : 'text-slate-300 cursor-not-allowed'
                      }`}
                      aria-label="Save changes"
                      title={dirty ? 'Save changes' : 'No changes'}
                    >
                      {saving ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : r.saveStatus === 'saved' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path d="M3 3.75A1.75 1.75 0 0 1 4.75 2h7.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 15.25 18H4.75A1.75 1.75 0 0 1 3 16.25V3.75ZM6 3.5v3.25c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25V3.5H6ZM5 12.75A1.75 1.75 0 0 1 6.75 11h6.5A1.75 1.75 0 0 1 15 12.75v3.75H5v-3.75Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  value={r.commentDraft}
                  onChange={(e) => updateRowById(r.id, { commentDraft: e.target.value, saveStatus: null })}
                  placeholder="Description (optional)"
                  rows={2}
                  className="w-full px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-[12px] text-slate-600 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white"
                />

                {r.saveStatus === 'error' && (
                  <div className="text-[11px] text-red-600 text-right">{r.saveError || 'Save failed'}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

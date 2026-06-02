import { useEffect, useState } from 'react';
import { fmtTime, parseTime } from '../../utils/time.js';

// Default project key for bare-number inputs (e.g. "56789" → "UP-56789").
// Mirrors `DEFAULT_PROJECT_KEY` in the background worker.
const DEFAULT_PROJECT_KEY = 'UP';

/**
 * Resolve a user-typed ticket reference into a Jira issue key.
 *  - Bare digits (e.g. "56789")      → "UP-56789"
 *  - Full key (e.g. "UP-68179")      → uppercased, used as-is
 *  - Anything else (incl. empty)     → "" (caller treats as no input)
 */
function resolveTicketInput(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^\d+$/.test(v)) return `${DEFAULT_PROJECT_KEY}-${v}`;
  if (/^[A-Za-z]+-\d+$/.test(v)) return v.toUpperCase();
  return '';
}

export default function WorklogPreview({ date, expanded = true, onToggle }) {
  const [rows, setRows] = useState(null);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Add-worklog form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [recentTickets, setRecentTickets] = useState(null); // null = not loaded yet
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newKeyTyped, setNewKeyTyped] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadWorklogs = () => {
    setLoading(true);
    setError('');
    chrome.runtime.sendMessage({ type: 'JIRA_WORKLOG_PREVIEW', date }, (res) => {
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
        saveStatus: null,
        saveError: '',
        moveOpen: false,
        moveTargetKey: '',
        moveTypedKey: '',
        moveStatus: null,    // null | 'moving' | 'error'
        moveError: '',
      }));
      setRows(initial);
      setDomain(res?.domain || '');
    });
  };

  useEffect(() => {
    setRows(null);
    loadWorklogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const loadRecentTickets = () => {
    setRecentLoading(true);
    setRecentError('');
    chrome.runtime.sendMessage({ type: 'JIRA_RECENT_TICKETS', days: 7 }, (res) => {
      setRecentLoading(false);
      if (chrome.runtime.lastError) {
        setRecentError(chrome.runtime.lastError.message);
        return;
      }
      if (res?.type === 'JIRA_WORKLOG_ERROR') {
        setRecentError(res.error);
        return;
      }
      setRecentTickets(res?.tickets || []);
    });
  };

  const openAddForm = () => {
    setShowAddForm(true);
    setCreateError('');
    if (recentTickets === null && !recentLoading) loadRecentTickets();
  };

  const closeAddForm = () => {
    setShowAddForm(false);
    setNewKey('');
    setNewKeyTyped('');
    setNewTime('');
    setNewDescription('');
    setCreateError('');
  };

  const handleCreate = () => {
    const parsed = parseTime(newTime);
    const typed = newKeyTyped.trim();
    let issueKey = newKey;
    if (typed) {
      issueKey = resolveTicketInput(typed);
      if (!issueKey) {
        setCreateError('Type a valid ticket (e.g. 56789 or UP-56789).');
        return;
      }
    }
    if (!issueKey) {
      setCreateError('Pick a ticket from the list or type a ticket key.');
      return;
    }
    if (parsed == null || parsed <= 0) {
      setCreateError('Enter a valid time (e.g. 1h 30m).');
      return;
    }
    setCreating(true);
    setCreateError('');
    chrome.runtime.sendMessage(
      {
        type: 'JIRA_WORKLOG_CREATE',
        issueKey,
        timeSpentSeconds: parsed,
        description: newDescription,
        date,
      },
      (res) => {
        setCreating(false);
        if (chrome.runtime.lastError) {
          setCreateError(chrome.runtime.lastError.message);
          return;
        }
        if (res?.type === 'JIRA_WORKLOG_ERROR') {
          setCreateError(res.error);
          return;
        }
        closeAddForm();
        loadWorklogs();
      }
    );
  };

  const openMoveFor = (r) => {
    if (recentTickets === null && !recentLoading) loadRecentTickets();
    updateRowById(r.id, { moveOpen: true, moveTargetKey: '', moveTypedKey: '', moveStatus: null, moveError: '' });
  };

  const closeMoveFor = (r) => {
    updateRowById(r.id, { moveOpen: false, moveTargetKey: '', moveTypedKey: '', moveStatus: null, moveError: '' });
  };

  const handleMove = (r) => {
    const typed = (r.moveTypedKey || '').trim();
    let target = r.moveTargetKey;
    if (typed) {
      target = resolveTicketInput(typed);
      if (!target) {
        updateRowById(r.id, { moveStatus: 'error', moveError: 'Type a valid ticket (e.g. 56789 or UP-56789).' });
        return;
      }
    }
    if (!target) {
      updateRowById(r.id, { moveStatus: 'error', moveError: 'Pick a target ticket or type a key.' });
      return;
    }
    if (target === r.key) {
      updateRowById(r.id, { moveStatus: 'error', moveError: 'Target is the same as the source.' });
      return;
    }
    // Use the latest edited values if the user typed but didn't save first.
    const parsedTime = parseTime(r.timeStr);
    const time = parsedTime != null && parsedTime > 0 ? parsedTime : r.timeSpentSeconds;
    const desc = r.commentDraft;

    updateRowById(r.id, { moveStatus: 'moving', moveError: '' });
    chrome.runtime.sendMessage(
      {
        type: 'JIRA_WORKLOG_MOVE',
        fromKey: r.key,
        worklogId: r.id,
        toKey: target,
        timeSpentSeconds: time,
        description: desc,
        date,
      },
      (res) => {
        if (chrome.runtime.lastError) {
          updateRowById(r.id, { moveStatus: 'error', moveError: chrome.runtime.lastError.message });
          return;
        }
        if (res?.type === 'JIRA_WORKLOG_ERROR') {
          updateRowById(r.id, { moveStatus: 'error', moveError: res.error });
          return;
        }
        loadWorklogs();
      }
    );
  };

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

      {expanded && !loading && !error && rows && rows.length === 0 && !showAddForm && (
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
                      className="text-indigo-600 hover:underline font-medium"
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
                      className="w-14 px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => (r.moveOpen ? closeMoveFor(r) : openMoveFor(r))}
                      disabled={saving || r.moveStatus === 'moving'}
                      className={`p-1 transition-colors ${
                        r.moveOpen ? 'text-indigo-600' : 'text-slate-300 hover:text-indigo-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      aria-label="Move worklog to another ticket"
                      title="Move to another ticket"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M2 10a.75.75 0 0 1 .75-.75h12.59l-2.1-1.95a.75.75 0 1 1 1.02-1.1l3.5 3.25a.75.75 0 0 1 0 1.1l-3.5 3.25a.75.75 0 1 1-1.02-1.1l2.1-1.95H2.75A.75.75 0 0 1 2 10Z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleSave(r)}
                      disabled={!dirty || saving}
                      className={`p-1 transition-colors ${
                        dirty && !saving
                          ? 'text-indigo-500 hover:text-indigo-700'
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
                  className="w-full px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-[12px] text-slate-600 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                />

                {r.moveOpen && (
                  <div className="rounded-md border border-dashed border-indigo-300 bg-indigo-50/40 p-2 space-y-1.5">
                    <div className="text-[11px] font-semibold text-indigo-700">Move to ticket</div>
                    {recentLoading ? (
                      <div className="h-7 rounded bg-slate-200 animate-pulse" />
                    ) : recentError ? (
                      <div className="text-[11px] text-red-600">{recentError}</div>
                    ) : (
                      <select
                        value={r.moveTargetKey}
                        onChange={(e) => updateRowById(r.id, { moveTargetKey: e.target.value, moveTypedKey: '', moveStatus: null, moveError: '' })}
                        className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">— Select a ticket —</option>
                        {(recentTickets || [])
                          .filter((t) => t.key !== r.key)
                          .map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.key}: {t.summary}
                            </option>
                          ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={r.moveTypedKey}
                      onChange={(e) => updateRowById(r.id, { moveTypedKey: e.target.value, moveTargetKey: '', moveStatus: null, moveError: '' })}
                      placeholder="…or type a ticket (e.g. 56789, UP-56789)"
                      className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    {r.moveStatus === 'error' && (
                      <div className="text-[11px] text-red-600">{r.moveError}</div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => closeMoveFor(r)}
                        disabled={r.moveStatus === 'moving'}
                        className="px-2 py-1 rounded text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(r)}
                        disabled={(!r.moveTargetKey && !(r.moveTypedKey || '').trim()) || r.moveStatus === 'moving'}
                        className="px-2.5 py-1 rounded text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                      >
                        {r.moveStatus === 'moving' ? 'Moving…' : 'Move'}
                      </button>
                    </div>
                  </div>
                )}

                {r.saveStatus === 'error' && (
                  <div className="text-[11px] text-red-600 text-right">{r.saveError || 'Save failed'}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {expanded && !loading && !error && !showAddForm && (
        <button
          type="button"
          onClick={openAddForm}
          className="w-full mt-1 py-1.5 rounded border border-dashed border-slate-300 text-[12px] font-medium text-slate-500 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Log new time
        </button>
      )}

      {expanded && showAddForm && (
        <div className="mt-1 p-2.5 rounded-md border border-slate-200 bg-slate-50 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">New worklog</h4>
            <button
              type="button"
              onClick={closeAddForm}
              className="text-[11px] text-slate-400 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-slate-500">Ticket (from your last 7 days)</label>
            {recentLoading ? (
              <div className="h-7 rounded bg-slate-200 animate-pulse" />
            ) : recentError ? (
              <div className="text-[11px] text-red-600">{recentError}</div>
            ) : (
              <select
                value={newKey}
                onChange={(e) => { setNewKey(e.target.value); setNewKeyTyped(''); setCreateError(''); }}
                className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">— Select a ticket —</option>
                {(recentTickets || []).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.key}: {t.summary}
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={newKeyTyped}
              onChange={(e) => { setNewKeyTyped(e.target.value); setNewKey(''); setCreateError(''); }}
              placeholder="…or type a ticket (e.g. 56789, UP-56789)"
              className="w-full px-2 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-500 shrink-0">Time:</label>
            <input
              type="text"
              value={newTime}
              onChange={(e) => { setNewTime(e.target.value); setCreateError(''); }}
              placeholder="1h 30m"
              className="w-20 px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-center font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <textarea
            value={newDescription}
            onChange={(e) => { setNewDescription(e.target.value); setCreateError(''); }}
            placeholder="Description (optional)"
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-slate-200 bg-white text-[12px] text-slate-600 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          {createError && (
            <div className="text-[11px] text-red-600">{createError}</div>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || (!newKey && !newKeyTyped.trim()) || !newTime.trim()}
            className="w-full py-1.5 rounded text-[12px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
          >
            {creating ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating…
              </>
            ) : 'Create worklog'}
          </button>
        </div>
      )}
    </div>
  );
}

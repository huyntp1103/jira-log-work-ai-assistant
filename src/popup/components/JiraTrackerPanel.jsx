import { useEffect, useRef, useState } from 'react';
import { StorageService } from '../../services/storage.js';

export default function JiraTrackerPanel() {
  const [trackers, setTrackers] = useState([]);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [domain, setDomain] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [options, setOptions] = useState({ allAssignees: false, hideOther: true });

  useEffect(() => {
    StorageService.getTrackers().then(setTrackers);
    StorageService.getJiraDomain().then(setDomain);
    StorageService.getTrackerOptions().then(setOptions);
  }, []);

  const toggleOption = (key) => {
    const next = { ...options, [key]: !options[key] };
    setOptions(next);
    StorageService.saveTrackerOptions(next);
  };

  const persist = async (next) => {
    setTrackers(next);
    await StorageService.saveTrackers(next);
  };

  const handleAdd = () => {
    const raw = input.trim();
    if (!raw) return;
    setAdding(true);
    setError('');
    chrome.runtime.sendMessage({ type: 'JIRA_TRACKER_DETECT', input: raw }, (res) => {
      setAdding(false);
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message);
        return;
      }
      if (res?.type === 'JIRA_TRACKER_ERROR') {
        setError(res.error);
        return;
      }
      const t = res?.tracker;
      if (!t) {
        setError('Detection failed.');
        return;
      }
      if (trackers.some((x) => x.id === t.id && x.type === t.type)) {
        setError('Already added.');
        return;
      }
      persist([...trackers, t]);
      setInput('');
    });
  };

  const handleRemove = (tracker) => {
    persist(trackers.filter((t) => !(t.id === tracker.id && t.type === tracker.type)));
  };

  const handleDragStart = (idx) => (e) => {
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox needs data set to start a drag
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragOver = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && idx !== dragOverIndex) setDragOverIndex(idx);
  };

  const handleDrop = (idx) => (e) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === idx) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = trackers.slice();
    const [item] = next.splice(dragIndex, 1);
    next.splice(idx, 0, item);
    persist(next);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-slate-700 shrink-0">Track:</label>
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="27643, UP-68179, or board URL"
            className="w-40 px-2 py-1 rounded border border-slate-200 bg-slate-50 text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-white"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !input.trim()}
            className="px-2.5 py-1 rounded text-[12px] font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {adding ? 'Detecting…' : 'Add'}
          </button>
        </div>
        {error && (
          <div className="text-[11px] text-red-600">{error}</div>
        )}
        <div className="flex items-center gap-4 pt-1 border-t border-slate-100">
          <Toggle
            label="All assignees"
            checked={options.allAssignees}
            onChange={() => toggleOption('allAssignees')}
          />
          <Toggle
            label="Hide other status"
            checked={options.hideOther}
            onChange={() => toggleOption('hideOther')}
          />
        </div>
      </div>

      {trackers.length === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 text-center text-[12px] text-slate-400">
          No trackers yet. Add a release or epic by entering its ID above.
        </div>
      )}

      {trackers.map((t, idx) => (
        <TrackerRow
          key={`${t.type}:${t.id}`}
          tracker={t}
          domain={domain}
          options={options}
          isDragging={dragIndex === idx}
          isDragOver={dragOverIndex === idx && dragIndex !== idx}
          onDragStart={handleDragStart(idx)}
          onDragOver={handleDragOver(idx)}
          onDrop={handleDrop(idx)}
          onDragEnd={handleDragEnd}
          onRemove={() => handleRemove(t)}
        />
      ))}
    </div>
  );
}

// Display order for status groups. Statuses not listed fall under "Other".
const STATUS_ORDER = [
  'QA Failed',
  'To Do',
  'In Progress',
  'In Review',
  'QA Ready',
  'In Test',
];

// Tailwind classes per status (group header and per-row pill share the same palette).
const STATUS_STYLES = {
  'QA Failed':   { pill: 'bg-red-100 text-red-700',         header: 'text-red-700' },
  'To Do':       { pill: 'bg-slate-100 text-slate-600',     header: 'text-slate-600' },
  'In Progress': { pill: 'bg-blue-100 text-blue-700',       header: 'text-blue-700' },
  'In Review':   { pill: 'bg-violet-100 text-violet-700',   header: 'text-violet-700' },
  'QA Ready':    { pill: 'bg-amber-100 text-amber-700',     header: 'text-amber-700' },
  'In Test':     { pill: 'bg-cyan-100 text-cyan-700',       header: 'text-cyan-700' },
  Other:         { pill: 'bg-slate-100 text-slate-600',     header: 'text-slate-500' },
};

function normalizeStatus(status) {
  const match = STATUS_ORDER.find((s) => s.toLowerCase() === status.toLowerCase());
  return match || 'Other';
}

function statusStyle(status) {
  return STATUS_STYLES[normalizeStatus(status)] || STATUS_STYLES.Other;
}

/**
 * Group rows by canonical status name, preserving STATUS_ORDER. Unrecognized
 * statuses fall under "Other" and are appended last.
 */
function groupByStatus(rows) {
  const buckets = new Map();
  for (const r of rows) {
    const bucket = normalizeStatus(r.status);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(r);
  }
  const ordered = [];
  for (const name of STATUS_ORDER) {
    if (buckets.has(name)) ordered.push({ name, rows: buckets.get(name) });
  }
  if (buckets.has('Other')) ordered.push({ name: 'Other', rows: buckets.get('Other') });
  return ordered;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <span
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          checked ? 'bg-teal-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="text-[11px] text-slate-600">{label}</span>
    </label>
  );
}

function TrackerRow({
  tracker,
  domain,
  options,
  onRemove,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  let trackerUrl;
  if (tracker.url) {
    trackerUrl = tracker.url;
  } else if (tracker.type === 'epic') {
    trackerUrl = `https://${domain}/browse/${tracker.id}`;
  } else if (tracker.type === 'board') {
    trackerUrl = `https://${domain}/jira/software/c/projects/UP/boards/${tracker.id}`;
  } else {
    trackerUrl = `https://${domain}/projects/UP/versions/${tracker.id}`;
  }

  const load = () => {
    setLoading(true);
    setError('');
    chrome.runtime.sendMessage(
      { type: 'JIRA_TRACKER_TASKS', tracker, allAssignees: options.allAssignees },
      (res) => {
        setLoading(false);
        if (chrome.runtime.lastError) {
          setError(chrome.runtime.lastError.message);
          return;
        }
        if (res?.type === 'JIRA_TRACKER_ERROR') {
          setError(res.error);
          return;
        }
        setRows(res?.rows || []);
      }
    );
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && rows === null) load();
  };

  // Re-fetch when the all-assignees filter changes for an already-loaded tracker.
  useEffect(() => {
    if (rows !== null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.allAssignees]);

  const visibleRows = rows
    ? rows.filter((r) => !(options.hideOther && normalizeStatus(r.status) === 'Other'))
    : null;
  const total = rows?.length || 0;
  const done = rows?.filter((r) => r.status?.toLowerCase() === 'qa success').length || 0;
  const groups = visibleRows ? groupByStatus(visibleRows) : [];

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`bg-white rounded-lg border transition-all ${
        isDragOver ? 'border-teal-400 ring-2 ring-teal-200' : 'border-slate-200'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-2 p-3">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="p-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M7 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
          </svg>
        </span>
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 text-left shrink-0"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse tracker' : 'Expand tracker'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
          </svg>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${
            tracker.type === 'epic'
              ? 'bg-violet-100 text-violet-700'
              : tracker.type === 'board'
              ? 'bg-cyan-100 text-cyan-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {tracker.type === 'epic' ? 'Epic' : tracker.type === 'board' ? 'Board' : 'Release'}
          </span>
        </button>
        <a
          href={trackerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 text-[12px] font-semibold text-slate-700 truncate hover:text-teal-700 hover:underline"
          title={`Open ${tracker.label} in Jira`}
        >
          {tracker.label}
        </a>
        {rows && (
          <span className="text-[11px] text-slate-400 font-normal shrink-0">
            {done}/{total}
          </span>
        )}
        {tracker.type === 'epic' && (
          <button
            onClick={() => { setShowCreate((v) => !v); if (!expanded) setExpanded(true); }}
            className={`p-1 transition-colors ${showCreate ? 'text-teal-600' : 'text-slate-300 hover:text-teal-600'}`}
            aria-label="Add task to epic"
            title="Add task to this Epic"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
            </svg>
          </button>
        )}
        <button
          onClick={() => { if (expanded) load(); }}
          disabled={!expanded || loading}
          className="p-1 text-slate-300 hover:text-teal-600 transition-colors disabled:opacity-50 disabled:hover:text-slate-300"
          aria-label="Refresh tasks"
          title={expanded ? 'Refresh tasks' : 'Expand to refresh'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
          >
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-slate-300 hover:text-red-500 transition-colors"
          aria-label="Remove tracker"
          title="Remove"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2.5 space-y-2">
          {showCreate && tracker.type === 'epic' && (
            <CreateTaskForm
              epicKey={tracker.id}
              onCancel={() => setShowCreate(false)}
              onCreated={() => { setShowCreate(false); load(); }}
            />
          )}
          {loading && (
            <div className="space-y-1.5">
              {[0, 1, 2].map((i) => <div key={i} className="h-7 rounded bg-slate-100 animate-pulse" />)}
            </div>
          )}
          {error && <div className="text-[11px] text-red-600">{error}</div>}
          {!loading && !error && visibleRows && visibleRows.length === 0 && (
            <div className="text-[12px] text-slate-400 py-1">
              {rows.length === 0
                ? (options.allAssignees ? 'No tasks.' : 'No tasks assigned to you.')
                : 'No tasks match the current filters.'}
            </div>
          )}
          {!loading && !error && visibleRows && visibleRows.length > 0 && (
            <div className="space-y-3">
              {groups.map((group) => {
                const style = statusStyle(group.name);
                return (
                  <div key={group.name}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${style.pill}`}>
                        {group.name}
                      </span>
                      <span className="text-[10px] text-slate-400">({group.rows.length})</span>
                    </div>
                    <ul className="divide-y divide-slate-100 border border-slate-100 rounded-md">
                      {group.rows.map((r) => (
                        <TaskRow
                          key={r.key}
                          row={r}
                          domain={domain}
                          pillClass={style.pill}
                          onTransitioned={load}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Hardcoded fix-version choices for the Create-Task form, sourced from the
// `recommend/fields` API response on everfit.atlassian.net.
const FIX_VERSION_OPTIONS = [
  { id: '12023', label: 'To be confirmed' },
  { id: '10244', label: 'N/A' },
];

function CreateTaskForm({ epicKey, onCancel, onCreated }) {
  const [issueType, setIssueType] = useState('Task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [storyPoints, setStoryPoints] = useState('0.5');
  const [priority, setPriority] = useState('Medium');
  const [fixVersionId, setFixVersionId] = useState(FIX_VERSION_OPTIONS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSubmitting(true);
    setError('');
    const sp = Number(storyPoints);
    chrome.runtime.sendMessage(
      {
        type: 'JIRA_ISSUE_CREATE',
        epicKey,
        issueType,
        summary: title.trim(),
        description,
        storyPoints: Number.isFinite(sp) ? sp : 0.5,
        priorityName: priority,
        fixVersionId,
      },
      (res) => {
        setSubmitting(false);
        if (chrome.runtime.lastError) { setError(chrome.runtime.lastError.message); return; }
        if (res?.type === 'JIRA_TRACKER_ERROR') { setError(res.error); return; }
        onCreated?.(res?.key);
      }
    );
  };

  return (
    <div className="rounded-md border border-dashed border-teal-300 bg-teal-50/40 p-2.5 space-y-2">
      <div className="text-[11px] font-semibold text-teal-700">Create task in {epicKey}</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Type</span>
          <select
            value={issueType}
            onChange={(e) => setIssueType(e.target.value)}
            className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="Task">Task</option>
            <option value="Bug">Bug</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            <option value="Highest">Highest</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
            <option value="Lowest">Lowest</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-slate-500">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError(''); }}
          placeholder="What needs to be done?"
          className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] text-slate-500">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional"
          className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Story Points</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={storyPoints}
            onChange={(e) => setStoryPoints(e.target.value)}
            className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Fix versions</span>
          <select
            value={fixVersionId}
            onChange={(e) => setFixVersionId(e.target.value)}
            className="px-1.5 py-1 rounded border border-slate-200 bg-white text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
          >
            {FIX_VERSION_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-2 py-1 rounded text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !title.trim()}
          className="px-2.5 py-1 rounded text-[11px] font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function TaskRow({ row, domain, pillClass, onTransitioned }) {
  const [open, setOpen] = useState(false);
  const [transitions, setTransitions] = useState(null);
  const [loadingTransitions, setLoadingTransitions] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const fetchTransitions = () => {
    setLoadingTransitions(true);
    setError('');
    chrome.runtime.sendMessage({ type: 'JIRA_TRANSITIONS_LIST', key: row.key }, (res) => {
      setLoadingTransitions(false);
      if (chrome.runtime.lastError) { setError(chrome.runtime.lastError.message); return; }
      if (res?.type === 'JIRA_TRACKER_ERROR') { setError(res.error); return; }
      setTransitions(res?.transitions || []);
    });
  };

  const openDropdown = () => {
    setOpen(true);
    if (transitions === null && !loadingTransitions) fetchTransitions();
  };

  const apply = (transitionId) => {
    setSubmitting(true);
    setError('');
    chrome.runtime.sendMessage(
      { type: 'JIRA_TRANSITION_EXECUTE', key: row.key, transitionId },
      (res) => {
        setSubmitting(false);
        if (chrome.runtime.lastError) { setError(chrome.runtime.lastError.message); return; }
        if (res?.type === 'JIRA_TRACKER_ERROR') { setError(res.error); return; }
        setOpen(false);
        // Invalidate so a fresh status reloads transitions next time.
        setTransitions(null);
        onTransitioned?.();
      }
    );
  };

  return (
    <li className="py-1.5 px-2 flex items-start gap-2">
      <p
        className="flex-1 min-w-0 text-[12px] leading-snug"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={`${row.key}: ${row.summary}`}
      >
        <a
          href={`https://${domain}/browse/${row.key}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:underline font-medium"
        >
          {row.key}
        </a>
        <span className="text-slate-700">: {row.summary}</span>
      </p>
      <div ref={containerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openDropdown())}
          disabled={submitting}
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${pillClass} hover:ring-1 hover:ring-slate-300 transition-shadow disabled:opacity-50 disabled:cursor-wait`}
          title="Change status"
        >
          {submitting ? 'Updating…' : row.status}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] bg-white border border-slate-200 rounded-md shadow-md py-1">
            {loadingTransitions && (
              <div className="px-2 py-1 text-[11px] text-slate-400">Loading…</div>
            )}
            {error && (
              <div className="px-2 py-1 text-[11px] text-red-600 max-w-[220px]">{error}</div>
            )}
            {!loadingTransitions && !error && transitions && transitions.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-slate-400">No transitions available.</div>
            )}
            {!loadingTransitions && !error && transitions && transitions.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => apply(t.id)}
                className="w-full text-left px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="shrink-0 text-[10px] text-slate-400 w-12 text-right">
        SP: {row.sp || '—'}
      </span>
    </li>
  );
}

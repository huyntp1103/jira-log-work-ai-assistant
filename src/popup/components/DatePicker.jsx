import { DateHelper } from '../../utils/date.js';

export default function DatePicker({ value, onChange, cacheInfo, hasContent, saveFlash, onSave }) {
  const today = DateHelper.formatDate(new Date());

  return (
    <div>
      <label htmlFor="report-date" className="block text-[11px] font-medium text-slate-500 mb-1">
        Report Date
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id="report-date"
          type="date"
          value={value || today}
          max={today}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {/* Cache badge — shown when cache exists for this date */}
        {cacheInfo && (
          <span className="flex items-center gap-1 px-2 py-1.5 rounded border border-slate-200 bg-slate-50 text-[11px] text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M5.433 13.917l1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
            </svg>
            {formatSavedAt(cacheInfo.savedAt)}
          </span>
        )}
        {/* Save button — shown when there's content to save */}
        {hasContent && (
          <button
            onClick={onSave}
            title="Save result for this date"
            className={`px-2.5 py-1.5 rounded border text-[12px] font-semibold transition-all active:scale-[0.97] ${
              saveFlash
                ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {saveFlash ? 'Saved ✓' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

function formatSavedAt(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `Saved ${h}:${m}`;
}

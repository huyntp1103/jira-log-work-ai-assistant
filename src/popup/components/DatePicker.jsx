import React from 'react';
import { DateHelper } from '../../utils/date.js';

export default function DatePicker({ value, onChange }) {
  const today = DateHelper.formatDate(new Date());

  return (
    <div>
      <label htmlFor="report-date" className="block text-[11px] font-medium text-slate-500 mb-1">
        Report Date
      </label>
      <input
        id="report-date"
        type="date"
        value={value || today}
        max={today}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}

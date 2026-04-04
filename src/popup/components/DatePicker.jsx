import React from 'react';
import { DateHelper } from '../../utils/date.js';

export default function DatePicker({ value, onChange }) {
  const today = DateHelper.formatDate(new Date());

  return (
    <div>
      <label htmlFor="report-date" className="block text-sm font-medium text-foreground mb-1">
        Date
      </label>
      <input
        id="report-date"
        type="date"
        value={value || today}
        max={today}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

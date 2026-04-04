import React, { useState } from 'react';

export default function ReportPreview({ text, onChange }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!text) return null;

  return (
    <div className="space-y-2">
      <label htmlFor="report-preview" className="block text-sm font-medium text-foreground">
        Report Preview
      </label>
      <textarea
        id="report-preview"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        onClick={handleCopy}
        className={`w-full py-2 rounded-lg text-sm font-medium text-on-primary transition-all duration-200 active:scale-95 ${
          copied ? 'bg-green-500' : 'bg-accent hover:bg-orange-600'
        }`}
      >
        {copied ? 'Copied!' : 'Copy to Clipboard'}
      </button>
    </div>
  );
}

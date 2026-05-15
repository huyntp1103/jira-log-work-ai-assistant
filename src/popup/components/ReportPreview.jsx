import { useState } from 'react';

export default function ReportPreview({ text, onChange, fromCache }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!text) return null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-slate-800">Report Preview</span>
        <span className="text-[11px] text-slate-400">Editable</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={14}
        className="w-full px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-700 text-[12px] leading-relaxed font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      <button
        onClick={handleCopy}
        className={`w-full py-2.5 rounded-lg text-[13px] font-semibold text-white active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 ${
          copied ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'
        }`}
      >
        {copied ? 'Copied!' : 'Copy to Clipboard'}
      </button>
    </div>
  );
}

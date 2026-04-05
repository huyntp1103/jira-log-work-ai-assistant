import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storage.js';

export default function TemplateSelector({ selectedId, onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  useEffect(() => {
    StorageService.getTemplates().then((t) => {
      setTemplates(t);
      if (!selectedId && t.length > 0) {
        onSelect(t.find((tpl) => tpl.isDefault)?.id || t[0].id);
      }
    });
  }, []);

  const handleSave = async (template) => {
    let updated;
    if (templates.find((t) => t.id === template.id)) {
      updated = templates.map((t) => (t.id === template.id ? template : t));
    } else {
      updated = [...templates, template];
    }
    setTemplates(updated);
    await StorageService.saveTemplates(updated);
    setEditing(null);
    setShowEditor(false);
  };

  const handleDelete = async (id) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    await StorageService.saveTemplates(updated);
    if (selectedId === id && updated.length > 0) onSelect(updated[0].id);
  };

  return (
    <div>
      <label htmlFor="template-select" className="block text-[11px] font-medium text-slate-500 mb-1">
        Template
      </label>
      <div className="flex gap-1.5">
        <select
          id="template-select"
          value={selectedId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="flex-1 min-w-0 px-2.5 py-2 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button
          onClick={() => { setEditing(null); setShowEditor(!showEditor); }}
          className={`px-2.5 py-2 rounded border text-[11px] font-medium transition-colors ${
            showEditor
              ? 'text-violet-600 border-violet-300 bg-violet-50'
              : 'text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
          aria-label="Edit templates"
        >
          Edit
        </button>
      </div>

      {showEditor && (
        <div className="mt-2 p-3 rounded-lg border border-slate-200 bg-white space-y-2">
          {!editing ? (
            <>
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 text-[13px]">
                  <span className="text-slate-700 truncate">{t.name}</span>
                  <div className="flex gap-2 shrink-0 ml-2">
                    <button onClick={() => setEditing(t)} className="text-blue-600 text-[11px] font-medium hover:underline">Edit</button>
                    {!t.isDefault && (
                      <button onClick={() => handleDelete(t.id)} className="text-red-500 text-[11px] font-medium hover:underline">Delete</button>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={() => setEditing({ id: null, name: '', format: '', instruction: '', isDefault: false })}
                className="w-full py-1.5 text-[11px] font-medium text-violet-600 border border-dashed border-violet-300 rounded hover:bg-violet-50 transition-colors"
              >
                + New Template
              </button>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="tpl-name" className="block text-[11px] font-medium text-slate-500 mb-1">Name</label>
                <input id="tpl-name" type="text" value={editing.name || ''}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="tpl-format" className="block text-[11px] font-medium text-slate-500 mb-1">Desired Format</label>
                <textarea id="tpl-format" rows={3} value={editing.format || ''}
                  onChange={(e) => setEditing({ ...editing, format: e.target.value })}
                  placeholder="Describe how you want the report formatted..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 text-slate-800 text-[13px] placeholder:text-slate-400 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (!editing.name?.trim()) return;
                    handleSave({
                      id: editing.id || `tpl-${Date.now()}`,
                      name: editing.name.trim(),
                      format: (editing.format || '').trim(),
                      instruction: (editing.format || '').trim(),
                      isDefault: editing.isDefault || false,
                    });
                  }}
                  className="flex-1 py-1.5 rounded text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-3 py-1.5 rounded text-[11px] font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

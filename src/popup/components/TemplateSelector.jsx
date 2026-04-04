import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storage.js';

export default function TemplateSelector({ selectedId, onSelect }) {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // template being edited
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
    if (selectedId === id && updated.length > 0) {
      onSelect(updated[0].id);
    }
  };

  return (
    <div>
      <label htmlFor="template-select" className="block text-sm font-medium text-foreground mb-1">
        Template
      </label>
      <div className="flex gap-2">
        <select
          id="template-select"
          value={selectedId || ''}
          onChange={(e) => onSelect(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button
          onClick={() => {
            setEditing(null);
            setShowEditor(!showEditor);
          }}
          className="px-3 py-2 text-sm text-muted hover:text-foreground border border-border rounded-lg transition-colors duration-200"
          aria-label="Edit templates"
        >
          Edit
        </button>
      </div>

      {showEditor && (
        <TemplateEditor
          templates={templates}
          editing={editing}
          onEdit={setEditing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => { setShowEditor(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ templates, editing, onEdit, onSave, onDelete, onClose }) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState('');

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setFormat(editing.format);
    } else {
      setName('');
      setFormat('');
    }
  }, [editing]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      id: editing?.id || `tpl-${Date.now()}`,
      name: name.trim(),
      format: format.trim(),
      instruction: format.trim(), // For custom templates, format IS the instruction
      isDefault: editing?.isDefault || false,
    });
  };

  return (
    <div className="mt-3 p-3 rounded-lg border border-border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {editing ? 'Edit Template' : 'Templates'}
        </span>
        <button onClick={onClose} className="text-xs text-muted hover:text-foreground" aria-label="Close editor">
          Close
        </button>
      </div>

      {!editing && (
        <div className="space-y-1">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm py-1">
              <span className="text-foreground truncate">{t.name}</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => onEdit(t)} className="text-primary text-xs hover:underline">Edit</button>
                {!t.isDefault && (
                  <button onClick={() => onDelete(t.id)} className="text-destructive text-xs hover:underline">Delete</button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => onEdit({ id: null, name: '', format: '', instruction: '', isDefault: false })}
            className="w-full mt-2 py-1.5 text-sm text-primary border border-dashed border-primary rounded-lg hover:bg-background transition-colors duration-200"
          >
            + New Template
          </button>
        </div>
      )}

      {editing && (
        <>
          <div>
            <label htmlFor="tpl-name" className="block text-xs text-muted mb-1">Name</label>
            <input
              id="tpl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="tpl-format" className="block text-xs text-muted mb-1">Desired Format</label>
            <textarea
              id="tpl-format"
              rows={4}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              placeholder="Describe how you want the report formatted..."
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-foreground text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="flex-1 py-1.5 rounded-lg text-sm font-medium text-on-primary bg-primary hover:bg-secondary active:scale-95 transition-all duration-200"
            >
              Save
            </button>
            <button
              onClick={() => onEdit(null)}
              className="px-3 py-1.5 rounded-lg text-sm text-muted border border-border hover:text-foreground transition-colors duration-200"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

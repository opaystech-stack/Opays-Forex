import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import { FileText, Save, Pencil, Trash2, Plus, X } from 'lucide-react';

// Scénarios pris en charge par les Modele_Message (cf. CHECK SQL message_templates).
const SCENARIOS = ['recovery', 'announcement', 'personalized', 'custom'];

// Libellés de repli pour le scénario « custom » (pas de clé i18n dédiée).
const CUSTOM_LABEL = { fr: 'Personnalisé', en: 'Custom' };

const EMPTY_FORM = { id: null, name: '', lang: 'fr', scenario: 'personalized', body: '' };

// Gestion des modèles de message WhatsApp (CRUD), intégrée dans Settings.
// Bilingue via useT(). Réutilise les classes CSS existantes (card, form-*, btn).
// _Requirements: 10.2, 10.5_
export default function TemplatesManager() {
  const { templates, createTemplate, updateTemplate, deleteTemplate, language } = useApp();
  const t = useT();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);

  const scenarioLabel = (scenario) => {
    if (scenario === 'custom') return CUSTOM_LABEL[language] || CUSTOM_LABEL.fr;
    return t(`reminders.scenario_${scenario}`);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditing(false);
    setError(null);
  };

  const startEdit = (tpl) => {
    setForm({
      id: tpl.id,
      name: tpl.name || '',
      lang: tpl.lang || 'fr',
      scenario: tpl.scenario || 'personalized',
      body: tpl.body || ''
    });
    setEditing(true);
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const payload = {
      name: form.name.trim(),
      lang: form.lang,
      scenario: form.scenario,
      body: form.body.trim()
    };

    if (!payload.name || !payload.body) {
      setError(t('templates_manager.name_label') + ' / ' + t('templates_manager.body_label'));
      return;
    }

    const res = editing
      ? await updateTemplate(form.id, payload)
      : await createTemplate(payload);

    if (res?.success) {
      resetForm();
    } else {
      setError(res?.error || 'Error');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('templates_manager.delete') + ' ?')) {
      await deleteTemplate(id);
      if (editing && form.id === id) resetForm();
    }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileText size={18} color="var(--color-primary)" />
        <span>{t('templates_manager.title')}</span>
      </h3>

      {/* Liste des modèles existants */}
      {(!templates || templates.length === 0) ? (
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>
          {t('templates_manager.empty')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 0',
                borderBottom: '1px solid var(--border-color)'
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--deep-navy)' }}>{tpl.name}</span>
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {(tpl.lang || 'fr').toUpperCase()} • {scenarioLabel(tpl.scenario)}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tpl.body}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', margin: 0 }}
                  onClick={() => startEdit(tpl)}
                  title={t('templates_manager.edit')}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 10px', borderRadius: '8px', fontSize: '12px', margin: 0, borderColor: 'var(--color-red)', color: 'var(--color-red)' }}
                  onClick={() => handleDelete(tpl.id)}
                  title={t('templates_manager.delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulaire création / édition */}
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-info" style={{ marginBottom: '12px' }}>
            <span>{error}</span>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">{t('templates_manager.name_label')}</label>
          <input
            type="text"
            className="form-control"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('templates_manager.lang_label')}</label>
            <select
              className="form-control"
              value={form.lang}
              onChange={(e) => setForm({ ...form, lang: e.target.value })}
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t('templates_manager.scenario_label')}</label>
            <select
              className="form-control"
              value={form.scenario}
              onChange={(e) => setForm({ ...form, scenario: e.target.value })}
            >
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>{scenarioLabel(s)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('templates_manager.body_label')}</label>
          <textarea
            className="form-control"
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            required
          />
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {t('templates_manager.body_hint')}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '5px' }}>
          <button type="submit" className="btn btn-primary">
            {editing ? <Save size={16} /> : <Plus size={16} />}
            <span>{editing ? t('templates_manager.save') : t('templates_manager.new_template')}</span>
          </button>
          {editing && (
            <button type="button" className="btn btn-outline" onClick={resetForm}>
              <X size={16} />
              <span>{language === 'en' ? 'Cancel' : 'Annuler'}</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

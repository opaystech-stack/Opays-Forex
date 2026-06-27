import { useState, useMemo } from 'react';
import { Send, CheckCircle2, AlertCircle, X, MessageSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../services/supabase';
import { buildReminders, runReminderBatch } from '../services/reminderService';
import { isValidInternationalPhone } from '../utils/phoneValidation';
import { useT } from '../i18n';

// Scénarios pris en charge (Ex. 5.2, 7, 8, 9). Le scénario « custom » du
// schéma n'est pas exposé directement : un texte libre couvre ce besoin.
const SCENARIOS = ['recovery', 'announcement', 'personalized'];

// Modes de composition (Ex. 10.1) : modèle réutilisable OU texte libre.
const MODES = { TEMPLATE: 'template', FREETEXT: 'freetext' };

// ReminderModal — déclenchement manuel d'une relance depuis le Tableau_de_Bord
// (Ex. 5.1–5.6, 8.1, 10.1).
//
// Responsabilités :
//   - Choisir un scénario (recouvrement / annonce collective / personnalisée).
//   - Choisir entre un Modele_Message enregistré et un texte libre (Ex. 10.1).
//   - Afficher un aperçu résolu du message avant envoi (Ex. 5.2).
//   - Déléguer la composition à `buildReminders` puis l'envoi à
//     `runReminderBatch` (Service_Relance) — `logReminder`/`supabase` injectés.
//   - Confirmation visuelle au succès (Ex. 5.5) ; message d'erreur avec cause
//     à l'échec (Ex. 5.6) ; blocage explicite si une variable obligatoire d'un
//     modèle est manquante (Ex. 10.4 — message « variables manquantes »).
//
// Props :
//   open      : booléen d'ouverture du modal
//   onClose   : fermeture du modal
//   customer  : Client cible des relances unitaires (recouvrement/personnalisée)
//   customers : ensemble de Clients pour une annonce collective (Ex. 8.1)
//
// Charte_Graphique : classes existantes (`modal-overlay`, `modal-content`,
// `card`, `btn`, `alert`, `form-group`, `form-label`, `form-control`) et
// variables CSS `var(--...)`. Bilingue via `useT()`.
export default function ReminderModal({ open, onClose, customer, customers }) {
  const { templates, loans, logReminder } = useApp();
  const t = useT();

  const [scenario, setScenario] = useState('recovery');
  const [mode, setMode] = useState(MODES.TEMPLATE);
  const [templateId, setTemplateId] = useState('');
  const [freeText, setFreeText] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null); // { type:'success'|'error', text }

  const availableTemplates = useMemo(
    () => (Array.isArray(templates) ? templates : []),
    [templates]
  );

  // Ensemble des Clients destinataires selon le scénario :
  //   - annonce collective → la sélection `customers` (Ex. 8.1) ;
  //   - recouvrement / personnalisée → le `customer` ciblé.
  const targetCustomers = useMemo(() => {
    if (scenario === 'announcement') {
      if (Array.isArray(customers) && customers.length > 0) return customers;
      return customer ? [customer] : [];
    }
    if (customer) return [customer];
    if (Array.isArray(customers) && customers.length > 0) return [customers[0]];
    return [];
  }, [scenario, customer, customers]);

  // Modèle sélectionné (objet) résolu depuis son identifiant.
  const selectedTemplate = useMemo(
    () => availableTemplates.find((tpl) => tpl && tpl.id === templateId) || null,
    [availableTemplates, templateId]
  );

  // Aperçu : on réutilise `buildReminders` (fonction pure) pour obtenir le
  // contenu résolu et les éventuels blocages (variables obligatoires).
  const preview = useMemo(
    () =>
      buildReminders({
        scenario,
        customers: targetCustomers,
        loans,
        template: mode === MODES.TEMPLATE ? selectedTemplate : undefined,
        freeText: mode === MODES.FREETEXT ? freeText : undefined,
      }),
    [scenario, targetCustomers, loans, mode, selectedTemplate, freeText]
  );

  if (!open) return null;

  const handleClose = () => {
    if (sending) return;
    onClose && onClose();
  };

  const scenarioLabel = (key) => {
    if (key === 'recovery') return t('reminders.scenario_recovery');
    if (key === 'announcement') return t('reminders.scenario_announcement');
    return t('reminders.scenario_personalized');
  };

  // Déclenche la composition (buildReminders) puis l'envoi (runReminderBatch).
  const handleSend = async () => {
    if (sending) return;
    setMessage(null);

    const { reminders, blocked } = preview;

    // Blocage : au moins une variable obligatoire d'un modèle n'a pas de
    // valeur → on ne tente aucun envoi (Ex. 10.4).
    if (blocked.length > 0 && reminders.length === 0) {
      setMessage({ type: 'error', text: t('reminders.missing_vars_msg') });
      return;
    }

    // Aucun destinataire exploitable (ex. recouvrement sans créance en cours).
    if (reminders.length === 0) {
      setMessage({ type: 'error', text: t('reminders.error_msg') });
      return;
    }

    // Pré-validation du numéro : on signale l'absence/invalidité d'un numéro
    // avant tout appel réseau (Ex. 3.2, 3.3 — message dédié 5.6).
    const hasInvalidPhone = reminders.some((r) => !isValidInternationalPhone(r.phone));
    if (hasInvalidPhone) {
      setMessage({ type: 'error', text: t('reminders.no_phone_error') });
      return;
    }

    setSending(true);
    try {
      const summary = await runReminderBatch({ supabase, reminders, logReminder });

      if (summary && summary.sent > 0 && summary.failed === 0) {
        // Confirmation visuelle au succès (Ex. 5.5).
        setMessage({ type: 'success', text: t('reminders.success_msg') });
      } else if (summary && summary.sent > 0) {
        // Lot partiellement abouti (annonce) : succès partiel signalé.
        setMessage({ type: 'success', text: t('reminders.success_msg') });
      } else {
        // Échec total : message d'erreur indiquant la cause (Ex. 5.6).
        const firstError =
          summary && Array.isArray(summary.results) && summary.results[0]
            ? summary.results[0].error
            : '';
        setMessage({
          type: 'error',
          text: t('reminders.error_msg') + (firstError ? ' ' + firstError : ''),
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('reminders.error_msg') + ' ' + (error.message || ''),
      });
    } finally {
      setSending(false);
    }
  };

  const previewReminders = preview.reminders;
  const previewBlocked = preview.blocked;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={t('reminders.title')}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            <Send
              size={18}
              style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--color-green, #16a34a)' }}
            />
            {t('reminders.title')}
          </h3>
          <button className="modal-close" aria-label={t('reminders.cancel')} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {message && (
          <div
            className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}
            role="status"
            data-testid="reminder-message"
          >
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Scénario */}
        <div className="form-group">
          <label className="form-label">{t('reminders.action_relaunch')}</label>
          <select
            className="form-control"
            data-testid="reminder-scenario"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            disabled={sending}
          >
            {SCENARIOS.map((key) => (
              <option key={key} value={key}>
                {scenarioLabel(key)}
              </option>
            ))}
          </select>
        </div>

        {/* Choix du mode : modèle vs texte libre (Ex. 10.1) */}
        <div className="form-group">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn ${mode === MODES.TEMPLATE ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: 1 }}
              onClick={() => setMode(MODES.TEMPLATE)}
              disabled={sending}
              aria-pressed={mode === MODES.TEMPLATE}
            >
              {t('reminders.mode_template')}
            </button>
            <button
              type="button"
              className={`btn ${mode === MODES.FREETEXT ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: 1 }}
              onClick={() => setMode(MODES.FREETEXT)}
              disabled={sending}
              aria-pressed={mode === MODES.FREETEXT}
            >
              {t('reminders.mode_freetext')}
            </button>
          </div>
        </div>

        {/* Sélection du modèle */}
        {mode === MODES.TEMPLATE && (
          <div className="form-group">
            <label className="form-label">{t('reminders.select_template')}</label>
            <select
              className="form-control"
              data-testid="reminder-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={sending}
            >
              <option value="">—</option>
              {availableTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({tpl.lang})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Saisie du texte libre (préservé verbatim — Ex. 5.3, 5.4) */}
        {mode === MODES.FREETEXT && (
          <div className="form-group">
            <label className="form-label">{t('reminders.free_text_label')}</label>
            <textarea
              className="form-control"
              data-testid="reminder-freetext"
              rows={4}
              placeholder={t('reminders.free_text_placeholder')}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              disabled={sending}
            />
          </div>
        )}

        {/* Aperçu résolu (Ex. 5.2) */}
        <div className="card" style={{ marginTop: '4px' }}>
          <div
            className="form-label"
            style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <MessageSquare size={14} />
            {t('reminders.preview')}
          </div>

          {previewBlocked.length > 0 && previewReminders.length === 0 ? (
            <p
              className="screen-desc"
              data-testid="reminder-blocked"
              style={{ color: 'var(--color-red)', margin: 0 }}
            >
              {t('reminders.missing_vars_msg')}
            </p>
          ) : previewReminders.length === 0 ? (
            <p className="screen-desc" data-testid="reminder-empty" style={{ margin: 0 }}>
              {t('reminders.history_empty')}
            </p>
          ) : (
            <div data-testid="reminder-preview" style={{ display: 'grid', gap: '10px' }}>
              {previewReminders.map((reminder, index) => (
                <div
                  key={reminder.customerId || index}
                  style={{
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    borderBottom:
                      index < previewReminders.length - 1
                        ? '1px solid var(--border-color)'
                        : 'none',
                    paddingBottom: index < previewReminders.length - 1 ? '8px' : 0,
                  }}
                >
                  {reminder.content || '—'}
                </div>
              ))}
              {scenario === 'announcement' && previewReminders.length > 1 && (
                <p className="screen-desc" style={{ margin: 0 }}>
                  {previewReminders.length}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ flex: 1 }}
            onClick={handleClose}
            disabled={sending}
          >
            {t('reminders.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="reminder-send"
            style={{ flex: 2 }}
            onClick={handleSend}
            disabled={sending || previewReminders.length === 0}
          >
            <Send size={16} />
            <span>{sending ? t('reminders.sending') : t('reminders.send')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

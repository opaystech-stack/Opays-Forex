import { useState } from 'react';
import { User, Send, X, MessageCircle } from 'lucide-react';
import {
  sortCustomerOperations,
  countCustomerOperations,
  formatOperationRow,
} from '../utils/customerHistory';
import ReminderModal from './ReminderModal';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';

// Nettoie un numéro de téléphone pour construire l'URL wa.me (sans espaces ni symboles).
function cleanPhoneForWhatsApp(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/[^0-9+]/g, '').replace(/^\+/, '');
}

// Fiche_Client dans un tiroir coulissant (Bottom Sheet) Google Maps-style.
// Exigences 9.1, 9.2, 9.3, 9.4, 9.7 + intégration shell Maps.
export default function CustomerCard({ customer, operations, isOpen, onClose }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  const safeCustomer = customer && typeof customer === 'object' ? customer : {};
  const ops = Array.isArray(operations) ? operations : [];
  const sortedOps = sortCustomerOperations(ops);
  const total = countCustomerOperations(ops);

  const app = useApp();
  const getCustomerReminders = app && app.getCustomerReminders;
  const reminders =
    typeof getCustomerReminders === 'function' && safeCustomer.id
      ? getCustomerReminders(safeCustomer.id)
      : [];
  const reminderList = Array.isArray(reminders) ? reminders : [];

  const formatReminderDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const sourceLabel = (source) => {
    if (source === 'manual') return t('reminders.source_manual');
    if (source === 'voice') return t('reminders.source_voice');
    return source || '—';
  };

  const statusLabel = (status) => {
    if (status === 'sent') return t('reminders.status_sent');
    if (status === 'failed') return t('reminders.status_failed');
    if (status === 'queued') return t('reminders.status_queued');
    return status || '—';
  };

  const name =
    typeof safeCustomer.name === 'string' && safeCustomer.name.trim() !== ''
      ? safeCustomer.name.trim()
      : t('customer_card.no_name');
  const phone =
    typeof safeCustomer.phone === 'string' && safeCustomer.phone.trim() !== ''
      ? safeCustomer.phone.trim()
      : t('customer_card.no_phone');

  const cleanPhone = cleanPhoneForWhatsApp(safeCustomer.phone);
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;

  const typeLabel = (type) => {
    if (type === 'exchange') return t('transactions.exchange_label');
    if (type === 'deposit') return t('transactions.deposit_label');
    if (type === 'withdrawal') return t('transactions.withdrawal_label');
    return type;
  };

  // Styles inline pour le shell Maps + Bottom Sheet
  const styles = {
    // Tiroir coulissant
    sheet: {
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: expanded ? '85vh' : '45vh',
      background: '#ffffff',
      borderRadius: '16px 16px 0 0',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Inter', sans-serif",
    },
    dragHandle: {
      width: '36px',
      height: '4px',
      borderRadius: '2px',
      background: '#CBD5E1',
      margin: '10px auto 0',
      cursor: 'pointer',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px 12px',
      borderBottom: '1px solid #E2E8F0',
    },
    closeBtn: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: 'none',
      background: '#F1F5F9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      color: '#64748B',
    },
    content: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px',
    },
    // Identité
    avatar: {
      width: '44px',
      height: '44px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(79,70,229,0.06))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#4F46E5',
      flexShrink: 0,
    },
    nameText: {
      fontSize: '16px',
      fontWeight: 700,
      fontFamily: "'Space Grotesk', sans-serif",
      color: '#1E293B',
    },
    // WhatsApp
    waLink: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '13px',
      color: '#25D366',
      textDecoration: 'none',
      fontWeight: 500,
    },
    waBadge: {
      width: '18px',
      height: '18px',
      borderRadius: '4px',
      background: '#25D366',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    waBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      borderRadius: '8px',
      border: '1px solid #25D366',
      background: 'rgba(37,211,102,0.08)',
      color: '#25D366',
      fontSize: '12px',
      fontWeight: 600,
      textDecoration: 'none',
      marginLeft: '8px',
    },
    // Tableaux
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '13px',
      fontFamily: "'Inter', sans-serif",
    },
    th: {
      padding: '8px 10px',
      fontWeight: 600,
      color: '#64748B',
      textAlign: 'left',
      borderBottom: '1px solid #E2E8F0',
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    },
    td: {
      padding: '10px',
      color: '#1E293B',
      borderBottom: '1px solid #E2E8F0',
    },
    tdMuted: {
      padding: '10px',
      color: '#64748B',
      borderBottom: '1px solid #E2E8F0',
    },
    sectionTitle: {
      fontSize: '13px',
      fontWeight: 700,
      fontFamily: "'Space Grotesk', sans-serif",
      color: '#334155',
      marginBottom: '8px',
      marginTop: '20px',
    },
    totalValue: {
      fontSize: '20px',
      fontWeight: 700,
      fontFamily: "'Space Grotesk', sans-serif",
      color: '#1E293B',
      fontVariantNumeric: 'tabular-nums',
    },
  };

  // Si le tiroir est fermé et isOpen est géré par le parent, on ne rend rien
  if (isOpen === false) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.25)',
          zIndex: 999,
        }}
        onClick={onClose}
      />

      {/* Tiroir Bottom Sheet */}
      <div className="customer-card-sheet customer-card" data-testid="customer-card" style={styles.sheet}>
        {/* Poignée de glissement */}
        <div
          onClick={() => setExpanded(!expanded)}
          style={{ padding: '4px 0', cursor: 'pointer' }}
          aria-label="Basculer la hauteur du tiroir"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded); }}
        >
          <div style={styles.dragHandle} />
        </div>

        {/* Header avec fermeture */}
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={styles.avatar} aria-hidden="true">
              <User size={20} />
            </span>
            <div>
              <div className="customer-card-name" style={styles.nameText}>{name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                {waUrl ? (
                  <>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.waLink}
                      className="customer-card-phone"
                    >
                      <span style={styles.waBadge}>
                        <MessageCircle size={11} color="#fff" />
                      </span>
                      {phone}
                    </a>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.waBtn}
                    >
                      <MessageCircle size={12} />
                      Discuter sur WhatsApp
                    </a>
                  </>
                ) : (
                  <span style={{ fontSize: '13px', color: '#64748B' }} className="customer-card-phone">{phone}</span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            style={styles.closeBtn}
            onClick={onClose}
            aria-label="Fermer la fiche client"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div style={styles.content}>
          {/* Bouton Relancer (visible en mode compact) */}
          <div style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="customer-card-relaunch"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 16px',
                borderRadius: '10px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                fontSize: '14px',
              }}
              onClick={() => setReminderOpen(true)}
            >
              <Send size={15} />
              <span>{t('reminders.action_relaunch')}</span>
            </button>
          </div>

          {reminderOpen && (
            <ReminderModal
              open
              onClose={() => setReminderOpen(false)}
              customer={safeCustomer}
            />
          )}

          {/* Total opérations */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t('customer_card.total_label')}
            </span>
            <span data-testid="customer-card-total" style={styles.totalValue}>{total}</span>
          </div>

          {/* Historique opérations (visible en mode étendu) */}
          <>
            {sortedOps.length === 0 ? (
              <p className="customer-card-empty" data-testid="customer-card-empty" style={{ margin: '16px 0 0', color: '#94A3B8', fontSize: '13px' }}>
                {t('customer_card.no_operations')}
              </p>
            ) : (
              <>
                <div style={styles.sectionTitle}>{t('customer_card.operations_title')}</div>
                <div style={{ borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <table style={styles.table} className="customer-card-table">
                    <thead>
                      <tr>
                        <th style={styles.th}>{t('customer_card.col_date')}</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>{t('customer_card.col_amount')}</th>
                        <th style={styles.th}>{t('customer_card.col_type')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOps.map((operation, index) => {
                        const row = formatOperationRow(operation);
                        const key = operation && operation.id != null ? operation.id : index;
                        return (
                          <tr key={key} className="customer-card-row">
                            <td style={styles.td}>{row.date}</td>
                            <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.amount}</td>
                            <td style={styles.tdMuted}>{typeLabel(row.type)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Historique relances */}
            <div style={styles.sectionTitle}>{t('reminders.history_title')}</div>
            {reminderList.length === 0 ? (
              <p className="customer-card-reminders-empty" data-testid="customer-card-reminders-empty" style={{ margin: 0, color: '#94A3B8', fontSize: '13px' }}>
                {t('reminders.history_empty')}
              </p>
            ) : (
              <div style={{ borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={styles.table} className="customer-card-table" data-testid="customer-card-reminders-table">
                  <thead>
                    <tr>
                      <th style={styles.th}>{t('reminders.col_date')}</th>
                      <th style={styles.th}>{t('reminders.col_content')}</th>
                      <th style={styles.th}>{t('reminders.col_source')}</th>
                      <th style={styles.th}>{t('reminders.col_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reminderList.map((reminder, index) => {
                      const key = reminder && reminder.id != null ? reminder.id : index;
                      return (
                        <tr key={key} className="customer-card-row">
                          <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{formatReminderDate(reminder && reminder.created_at)}</td>
                          <td style={styles.td}>{(reminder && reminder.content) || '—'}</td>
                          <td style={styles.tdMuted}>{sourceLabel(reminder && reminder.trigger_source)}</td>
                          <td style={styles.tdMuted}>{statusLabel(reminder && reminder.status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        </div>
      </div>
    </>
  );
}

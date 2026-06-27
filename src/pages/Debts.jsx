import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import CurrencySelect from '../components/CurrencySelect';
import { HandCoins, ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertCircle, Check } from 'lucide-react';

export default function Debts() {
  const { debts, rates, createDebt, updateDebtStatus, getDebtTotals } = useApp();
  const t = useT();

  const [type, setType] = useState('receivable');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [counterparty, setCounterparty] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const totals = getDebtTotals();

  const fmtUSD = (v) =>
    new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' USD';
  const fmt = (v, c) => new Intl.NumberFormat('fr-FR').format(v) + ' ' + c;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    const amt = parseFloat(amount);
    if (!type || isNaN(amt) || amt <= 0 || !currency) {
      setMessage({ type: 'error', text: t('debts.required_fields') });
      return;
    }
    setLoading(true);
    const res = await createDebt({ type, amount: amt, currency, counterparty_name: counterparty.trim() || null, note: note.trim() || null });
    setLoading(false);
    if (res.success) {
      setMessage({ type: 'success', text: t('debts.created_success') });
      setAmount('');
      setCounterparty('');
      setNote('');
    } else {
      setMessage({ type: 'error', text: res.error });
    }
  };

  const handleSettle = async (id) => {
    await updateDebtStatus(id, 'settled');
  };

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">{t('debts.title')}</h2>
        <p className="screen-desc">{t('debts.desc')}</p>
      </div>

      {/* Totaux séparés créances / dettes */}
      <div className="stats-strip">
        <div className="stat-box">
          <span className="stat-label">{t('debts.total_receivable')}</span>
          <div className="stat-value" style={{ color: 'var(--color-green)' }}>{fmtUSD(totals.receivableUSD)}</div>
        </div>
        <div className="stat-box">
          <span className="stat-label">{t('debts.total_payable')}</span>
          <div className="stat-value" style={{ color: 'var(--color-red)' }}>{fmtUSD(totals.payableUSD)}</div>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Formulaire de création */}
      <form onSubmit={handleSubmit} className="card">
        <div className="toggle-group">
          <button
            type="button"
            className={`toggle-button ${type === 'receivable' ? 'active business' : ''}`}
            onClick={() => setType('receivable')}
          >
            <ArrowDownLeft size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} />
            {t('debts.receivable')}
          </button>
          <button
            type="button"
            className={`toggle-button ${type === 'payable' ? 'active personal' : ''}`}
            onClick={() => setType('payable')}
          >
            <ArrowUpRight size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} />
            {t('debts.payable')}
          </button>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('debts.amount_label')}</label>
            <input type="number" step="any" className="form-control" placeholder="Ex: 500" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('debts.currency_label')}</label>
            <CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} rates={rates} ariaLabel={t('debts.currency_label')} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('debts.counterparty_label')}</label>
          <input type="text" className="form-control" placeholder={t('debts.counterparty_placeholder')} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">{t('debts.note_label')}</label>
          <input type="text" className="form-control" placeholder={t('debts.note_placeholder')} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          <HandCoins size={16} />
          <span>{t('debts.add_button')}</span>
        </button>
      </form>

      {/* Liste des dettes */}
      <div className="ledger-list" style={{ marginTop: '8px' }}>
        {debts.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '15px' }}>{t('debts.none')}</p>
        ) : (
          debts.map((d) => {
            const isReceivable = d.type === 'receivable';
            const settled = d.status === 'settled';
            return (
              <div key={d.id} className="ledger-item" style={{ opacity: settled ? 0.6 : 1 }}>
                <div className="ledger-left">
                  <div className={`ledger-icon-box ${isReceivable ? 'exchange' : 'expense-perso'}`}>
                    {isReceivable ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </div>
                  <div className="ledger-details">
                    <span className="ledger-title">{d.counterparty_name || (isReceivable ? t('debts.receivable') : t('debts.payable'))}</span>
                    <span className="ledger-subtitle">{isReceivable ? t('debts.receivable') : t('debts.payable')}{d.note ? ` • ${d.note}` : ''}</span>
                  </div>
                </div>
                <div className="ledger-right">
                  <span className={`ledger-value ${isReceivable ? 'positive' : 'negative'}`}>
                    {isReceivable ? '+' : '-'}{fmt(d.amount, d.currency)}
                  </span>
                  {settled ? (
                    <span className="mock-badge" style={{ marginTop: '4px' }}>{t('debts.settled_badge')}</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ width: 'auto', padding: '4px 10px', fontSize: '12px', marginTop: '6px' }}
                      onClick={() => handleSettle(d.id)}
                    >
                      <Check size={13} />
                      <span>{t('debts.mark_settled')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

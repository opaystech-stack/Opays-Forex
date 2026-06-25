import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import { Landmark, Plus, Edit, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle, X, Wallet } from 'lucide-react';

export default function WalletsPage() {
  const { wallets, createWallet, updateWallet, deleteWallet, addTransaction } = useApp();
  const t = useT();

  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('cash');
  const [currency, setCurrency] = useState('USD');
  const [balance, setBalance] = useState('0');

  const [editingWallet, setEditingWallet] = useState(null);
  const [editName, setEditName] = useState('');
  const [editActive, setEditActive] = useState(true);

  const [showCapitalForm, setShowCapitalForm] = useState(false);
  const [movementType, setMovementType] = useState('deposit');
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');

  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const CURRENCIES = [
    { code: 'USD', label: 'USD ($)' },
    { code: 'UGX', label: 'UGX (Ouganda)' },
    { code: 'KES', label: 'KES (Kenya)' },
    { code: 'RWF', label: 'RWF (Rwanda)' },
    { code: 'CDF', label: 'CDF (Congo)' },
    { code: 'TZS', label: 'TZS (Tanzanie)' },
    { code: 'BIF', label: 'BIF (Burundi)' },
    { code: 'EUR', label: 'EUR (Euro)' },
    { code: 'FCFA', label: 'FCFA (Afrique CFA)' },
  ];

  const handleCreateWallet = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      const res = await createWallet({
        name: name.trim(),
        type,
        currency,
        balance: parseFloat(balance) || 0,
        is_active: true
      });
      if (res.success) {
        setMessage({ type: 'success', text: t('wallets.create_success').replace('{name}', name) });
        setName('');
        setBalance('0');
        setShowAddForm(false);
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur : ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateWallet = async (e) => {
    e.preventDefault();
    if (!editingWallet || !editName.trim()) return;
    try {
      setLoading(true);
      const res = await updateWallet(editingWallet.id, { name: editName.trim(), is_active: editActive });
      if (res.success) {
        setMessage({ type: 'success', text: t('wallets.update_success') });
        setEditingWallet(null);
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur : ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWallet = async (id, wName) => {
    if (window.confirm(t('wallets.delete_confirm').replace('{name}', wName))) {
      try {
        setLoading(true);
        const res = await deleteWallet(id);
        if (res.success) setMessage({ type: 'success', text: t('wallets.delete_success') });
        else throw new Error(res.error);
      } catch (err) {
        setMessage({ type: 'error', text: t('wallets.delete_error_prefix') + err.message });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCapitalMovement = async (e) => {
    e.preventDefault();
    const activeWalletId = selectedWalletId || (wallets.length > 0 ? wallets[0].id : '');
    const amount = parseFloat(movementAmount);
    if (!activeWalletId || isNaN(amount) || amount <= 0) {
      setMessage({ type: 'error', text: t('common.confirm_delete') });
      return;
    }
    const targetWallet = wallets.find(w => w.id === activeWalletId);
    if (!targetWallet) return;
    const isDeposit = movementType === 'deposit';
    const payload = {
      type: movementType,
      source_wallet_id: isDeposit ? null : activeWalletId,
      dest_wallet_id: isDeposit ? activeWalletId : null,
      source_amount: amount,
      dest_amount: amount,
      exchange_rate: 1.0,
      fee: 0,
      fee_wallet_id: null,
      profit_usd: 0,
      note: movementNote.trim() || (isDeposit ? t('wallets.movement_inject') : t('wallets.movement_withdraw')),
      transaction_id: `CAP-${Date.now().toString().slice(-6)}`
    };
    try {
      setLoading(true);
      const res = await addTransaction(payload);
      if (res.success) {
        setMessage({
          type: 'success',
          text: isDeposit
            ? `${t('wallets.movement_inject')} +${amount} ${targetWallet.currency}`
            : `${t('wallets.movement_withdraw')} -${amount} ${targetWallet.currency}`
        });
        setMovementAmount('');
        setMovementNote('');
        setShowCapitalForm(false);
      } else {
        throw new Error(res.error);
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Erreur : ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value, curr) => new Intl.NumberFormat('fr-FR').format(value) + ' ' + curr;

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div>
          <h2 className="ofx-screen-title">{t('wallets.page_title')}</h2>
          <p className="ofx-screen-desc">{t('wallets.page_desc')}</p>
        </div>
        <div className="ofx-screen-actions">
          <button type="button" className="ofx-btn ofx-btn-outline" onClick={() => { setShowCapitalForm(true); setShowAddForm(false); setEditingWallet(null); }}>
            <ArrowUpRight size={14} />
            <span>{t('wallets.capital_movement')}</span>
          </button>
          <button type="button" className="ofx-btn ofx-btn-primary" onClick={() => { setShowAddForm(true); setShowCapitalForm(false); setEditingWallet(null); }}>
            <Plus size={14} />
            <span>{t('wallets.new_wallet')}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleCreateWallet} className="ofx-card ofx-card-accent">
          <div className="ofx-card-header">
            <h3>{t('wallets.create_wallet_title')}</h3>
            <button type="button" className="ofx-icon-btn" onClick={() => setShowAddForm(false)}><X size={18} /></button>
          </div>
          <div className="ofx-form-group">
            <label>{t('wallets.create_wallet_title')}</label>
            <input type="text" className="ofx-input" placeholder={t('wallets.create_wallet_title')} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="ofx-form-row">
            <div className="ofx-form-group">
              <label>{t('wallets.type_label')}</label>
              <select className="ofx-input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="cash">{t('wallets.wallet_type_cash')}</option>
                <option value="mobile_money">{t('wallets.wallet_type_mmoney')}</option>
              </select>
            </div>
            <div className="ofx-form-group">
              <label>{t('wallets.currency_label')}</label>
              <select className="ofx-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="ofx-form-group">
            <label>{t('wallets.initial_balance')}</label>
            <input type="number" step="any" className="ofx-input" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          <button type="submit" className="ofx-btn ofx-btn-primary" disabled={loading}>{t('wallets.create_wallet_button')}</button>
        </form>
      )}

      {editingWallet && (
        <form onSubmit={handleUpdateWallet} className="ofx-card ofx-card-warn">
          <div className="ofx-card-header">
            <h3>{t('wallets.create_wallet_title')}</h3>
            <button type="button" className="ofx-icon-btn" onClick={() => setEditingWallet(null)}><X size={18} /></button>
          </div>
          <div className="ofx-form-group">
            <label>{t('wallets.create_wallet_title')}</label>
            <input type="text" className="ofx-input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
          </div>
          <label className="ofx-checkbox">
            <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
            <span>{t('wallets.wallet_active_label')}</span>
          </label>
          <button type="submit" className="ofx-btn ofx-btn-warn" disabled={loading}>{t('wallets.update_success')}</button>
        </form>
      )}

      {showCapitalForm && (
        <form onSubmit={handleCapitalMovement} className="ofx-card ofx-card-info">
          <div className="ofx-card-header">
            <h3>{t('wallets.capital_movement')}</h3>
            <button type="button" className="ofx-icon-btn" onClick={() => setShowCapitalForm(false)}><X size={18} /></button>
          </div>
          <div className="ofx-toggle-group">
            <button type="button" className={`ofx-toggle ${movementType === 'deposit' ? 'active' : ''}`} onClick={() => setMovementType('deposit')}>
              <ArrowUpRight size={14} /> {t('wallets.movement_inject')}
            </button>
            <button type="button" className={`ofx-toggle ${movementType === 'withdrawal' ? 'active' : ''}`} onClick={() => setMovementType('withdrawal')}>
              <ArrowDownLeft size={14} /> {t('wallets.movement_withdraw')}
            </button>
          </div>
          <div className="ofx-form-group">
            <label>{t('wallets.select_wallet')}</label>
            <select className="ofx-input" value={selectedWalletId} onChange={(e) => setSelectedWalletId(e.target.value)}>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency}) - Actuel: {formatValue(w.balance, w.currency)}</option>)}
            </select>
          </div>
          <div className="ofx-form-group">
            <label>{t('wallets.amount_placeholder')}</label>
            <input type="number" step="any" className="ofx-input" placeholder={t('wallets.amount_placeholder')} value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} required />
          </div>
          <div className="ofx-form-group">
            <label>{t('wallets.note_placeholder')}</label>
            <input type="text" className="ofx-input" placeholder={t('wallets.note_placeholder')} value={movementNote} onChange={(e) => setMovementNote(e.target.value)} />
          </div>
          <button type="submit" className="ofx-btn ofx-btn-info" disabled={loading}>{t('wallets.validate_movement')}</button>
        </form>
      )}

      {wallets.length === 0 ? (
        <div className="ofx-empty-card">
          <Landmark size={48} />
          <h3>{t('wallets.wallet_none')}</h3>
          <p>{t('wallets.create_first_wallet')}</p>
          <button className="ofx-btn ofx-btn-primary" onClick={() => setShowAddForm(true)}>
            <Plus size={14} /> {t('wallets.create_first_wallet')}
          </button>
        </div>
      ) : (
        <div className="ofx-card-list">
          {wallets.map(w => {
            const isCash = w.type === 'cash';
            const isInactive = w.is_active === false;
            return (
              <div key={w.id} className={`ofx-wallet-card ${isInactive ? 'inactive' : ''}`}>
                <div className="ofx-wallet-card-head">
                  <div className="ofx-wallet-card-meta">
                    <div className={`ofx-wallet-card-type ${isCash ? 'cash' : 'mobile'}`}>{isCash ? <Landmark size={16} /> : <Wallet size={16} />}</div>
                    <div>
                      <div className="ofx-wallet-card-name">{w.name} {isInactive && <span className="ofx-badge-muted">{t('common.no')}</span>}</div>
                      <div className="ofx-wallet-card-currency">{isCash ? t('wallets.wallet_type_cash') : t('wallets.wallet_type_mmoney')} • {w.currency}</div>
                    </div>
                  </div>
                  <div className="ofx-wallet-card-actions">
                    <button className="ofx-icon-btn" onClick={() => { setEditingWallet(w); setEditName(w.name); setEditActive(w.is_active !== undefined ? w.is_active : true); setShowAddForm(false); setShowCapitalForm(false); }}>
                      <Edit size={16} />
                    </button>
                    <button className="ofx-icon-btn danger" onClick={() => handleDeleteWallet(w.id, w.name)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="ofx-wallet-card-balance">
                  <span>Stock actuel</span>
                  <strong>{formatValue(w.balance, w.currency)}</strong>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

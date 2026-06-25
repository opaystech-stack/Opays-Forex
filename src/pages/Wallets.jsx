import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import { Landmark, Plus, Edit, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function WalletsPage() {
  const { wallets, createWallet, updateWallet, deleteWallet, addTransaction } = useApp();
  const t = useT();
  
  // Wallet CRUD state
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('cash');
  const [currency, setCurrency] = useState('USD');
  const [balance, setBalance] = useState('0');
  
  const [editingWallet, setEditingWallet] = useState(null);
  const [editName, setEditName] = useState('');
  const [editActive, setEditActive] = useState(true);

  // Capital movement state
  const [showCapitalForm, setShowCapitalForm] = useState(false);
  const [movementType, setMovementType] = useState('deposit'); // deposit or withdrawal
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');

  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

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
      const res = await updateWallet(editingWallet.id, {
        name: editName.trim(),
        is_active: editActive
      });

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
        if (res.success) {
          setMessage({ type: 'success', text: t('wallets.delete_success') });
        } else {
          throw new Error(res.error);
        }
      } catch (err) {
        setMessage({ 
          type: 'error', 
          text: t('wallets.delete_error_prefix') + err.message
        });
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
    
    // Prepare transaction payload for capital injection/reduction
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

  const formatValue = (value, curr) => {
    return new Intl.NumberFormat('fr-FR').format(value) + ' ' + curr;
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="screen-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 className="screen-title">{t('wallets.page_title')}</h2>
          <p className="screen-desc">{t('wallets.page_desc')}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            className="btn btn-outline" 
            style={{ width: 'auto', padding: '8px 14px', fontSize: '13px' }}
            onClick={() => {
              setShowCapitalForm(true);
              setShowAddForm(false);
              setEditingWallet(null);
            }}
          >
            <ArrowUpRight size={14} />
            <span>{t('wallets.capital_movement')}</span>
          </button>
          <button 
            type="button" 
            className="btn btn-primary" 
            style={{ width: 'auto', padding: '8px 14px', fontSize: '13px' }}
            onClick={() => {
              setShowAddForm(true);
              setShowCapitalForm(false);
              setEditingWallet(null);
            }}
          >
            <Plus size={14} />
            <span>{t('wallets.new_wallet')}</span>
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: '16px' }}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* A. Create Wallet Form */}
      {showAddForm && (
        <form onSubmit={handleCreateWallet} className="card glass-card" style={{ border: '1px solid var(--primary-blue)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>{t('wallets.create_wallet_title')}</h3>
            <button type="button" onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
          </div>

          <div className="form-group">
            <label className="form-label">{t('wallets.create_wallet_title')}</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder={t('wallets.create_wallet_title')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required 
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('wallets.type_label')}</label>
              <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="cash">{t('wallets.wallet_type_cash')}</option>
                <option value="mobile_money">{t('wallets.wallet_type_mmoney')}</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('wallets.currency_label')}</label>
              <select className="form-control" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD ($)</option>
                <option value="UGX">UGX (Ouganda)</option>
                <option value="KES">KES (Kenya)</option>
                <option value="RWF">RWF (Rwanda)</option>
                <option value="CDF">CDF (Congo)</option>
                <option value="TZS">TZS (Tanzanie)</option>
                <option value="BIF">BIF (Burundi)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="FCFA">FCFA (Afrique CFA)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('wallets.initial_balance')}</label>
            <input 
              type="number" 
              step="any"
              className="form-control" 
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            <span>{t('wallets.create_wallet_button')}</span>
          </button>
        </form>
      )}

      {/* B. Edit Wallet Form */}
      {editingWallet && (
        <form onSubmit={handleUpdateWallet} className="card glass-card" style={{ border: '1px solid var(--color-orange)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-orange)' }}>{t('wallets.create_wallet_title')}</h3>
            <button type="button" onClick={() => setEditingWallet(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
          </div>

          <div className="form-group">
            <label className="form-label">{t('wallets.create_wallet_title')}</label>
            <input 
              type="text" 
              className="form-control" 
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required 
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '20px' }}>
            <input 
              type="checkbox" 
              id="wallet-active" 
              checked={editActive} 
              onChange={(e) => setEditActive(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="wallet-active" style={{ fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>{t('wallets.wallet_active_label')}</label>
          </div>

          <button type="submit" className="btn btn-primary" style={{ backgroundColor: 'var(--color-orange)' }} disabled={loading}>
            <span>{t('wallets.update_success')}</span>
          </button>
        </form>
      )}

      {/* C. Capital Movement Form */}
      {showCapitalForm && (
        <form onSubmit={handleCapitalMovement} className="card glass-card" style={{ border: '1px solid var(--color-cyan)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-cyan)' }}>{t('wallets.capital_movement')}</h3>
            <button type="button" onClick={() => setShowCapitalForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
          </div>

          <div className="toggle-group" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`toggle-button ${movementType === 'deposit' ? 'active business' : ''}`}
              onClick={() => setMovementType('deposit')}
              style={{ padding: '8px 12px' }}
            >
              <ArrowUpRight size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} />
              {t('wallets.movement_inject')}
            </button>
            <button
              type="button"
              className={`toggle-button ${movementType === 'withdrawal' ? 'active personal' : ''}`}
              onClick={() => setMovementType('withdrawal')}
              style={{ padding: '8px 12px' }}
            >
              <ArrowDownLeft size={14} style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }} />
              {t('wallets.movement_withdraw')}
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">{t('wallets.select_wallet')}</label>
            <select 
              className="form-control"
              value={selectedWalletId}
              onChange={(e) => setSelectedWalletId(e.target.value)}
            >
              {wallets.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.currency}) - Actuel: {formatValue(w.balance, w.currency)}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t('wallets.amount_placeholder')}</label>
            <input 
              type="number" 
              step="any"
              className="form-control" 
              placeholder={t('wallets.amount_placeholder')}
              value={movementAmount}
              onChange={(e) => setMovementAmount(e.target.value)}
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('wallets.note_placeholder')}</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder={t('wallets.note_placeholder')}
              value={movementNote}
              onChange={(e) => setMovementNote(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ backgroundColor: 'var(--color-cyan)', color: '#090c10' }} disabled={loading}>
            <span>{t('wallets.validate_movement')}</span>
          </button>
        </form>
      )}

      {/* D. Wallets List */}
      {wallets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Landmark size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>{t('wallets.wallet_none')}</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.6' }}>
            {t('wallets.create_first_wallet')}
          </p>
          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', width: 'auto' }} onClick={() => setShowAddForm(true)}>
            <Plus size={14} />
            <span>{t('wallets.create_first_wallet')}</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {wallets.map(w => {
            const isCash = w.type === 'cash';
            const isInactive = w.is_active === false;
            return (
              <div 
                key={w.id} 
                className="card" 
                style={{ 
                  margin: 0, 
                  opacity: isInactive ? 0.6 : 1,
                  borderLeft: `5px solid ${isInactive ? 'var(--text-muted)' : isCash ? 'var(--primary-blue)' : 'var(--color-cyan)'}`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--deep-navy)' }}>{w.name}</h3>
                          {isInactive && <span className="mock-badge" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-secondary)', border: 'none', padding: '2px 6px', fontSize: '8px' }}>{t('common.no')}</span>}
                    </div>
                        <span className="wallet-type-badge" style={{ display: 'inline-block', marginTop: '2px' }}>
                          {isCash ? t('wallets.wallet_type_cash') : t('wallets.wallet_type_mmoney')} • {w.currency}
                        </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      type="button" 
                      className="draft-btn edit" 
                      style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                      onClick={() => {
                        setEditingWallet(w);
                        setEditName(w.name);
                        setEditActive(w.is_active !== undefined ? w.is_active : true);
                        setShowAddForm(false);
                        setShowCapitalForm(false);
                      }}
                      title="Modifier"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      type="button" 
                      className="draft-btn reject" 
                      onClick={() => handleDeleteWallet(w.id, w.name)}
                      title="Supprimer définitivement"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '15px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: '600' }}>STOCK ACTUEL :</span>
                  <span className="wallet-balance" style={{ fontSize: '22px' }}>
                    {formatValue(w.balance, w.currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import CurrencySelect from '../components/CurrencySelect';
import { Landmark, Plus, Edit, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertCircle, X, ChevronDown } from 'lucide-react';

// Brand colors for wallet types
const WALLET_BRANDS = {
  MTN: { bg: 'linear-gradient(135deg, #FBBF24, #F59E0B)', letter: 'M' },
  Airtel: { bg: 'linear-gradient(135deg, #EF4444, #DC2626)', letter: 'A' },
  Cash: { bg: 'linear-gradient(135deg, #8B5CF6, #7C3AED)', letter: '$' },
  Crypto: { bg: 'linear-gradient(135deg, #6366F1, #4F46E5)', letter: '₿' },
  default: { bg: 'linear-gradient(135deg, #0EA5E9, #0284C7)', letter: 'W' },
};

function getWalletBrand(wallet) {
  const n = (wallet.name || '').toLowerCase();
  if (n.includes('mtn')) return WALLET_BRANDS.MTN;
  if (n.includes('airtel')) return WALLET_BRANDS.Airtel;
  if (n.includes('cash') || n.includes('usd')) return WALLET_BRANDS.Cash;
  if (n.includes('btc') || n.includes('crypto') || n.includes('bitcoin')) return WALLET_BRANDS.Crypto;
  return WALLET_BRANDS.default;
}

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

  const [capitalWalletId, setCapitalWalletId] = useState(null);
  const [movementType, setMovementType] = useState('deposit');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');

  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreateWallet = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setLoading(true);
      const res = await createWallet({ name: name.trim(), type, currency, balance: parseFloat(balance) || 0, is_active: true });
      if (res.success) {
        setMessage({ type: 'success', text: t('wallets.create_success').replace('{name}', name) });
        setName(''); setBalance('0'); setShowAddForm(false);
      } else throw new Error(res.error);
    } catch (err) { setMessage({ type: 'error', text: `Erreur : ${err.message}` }); }
    finally { setLoading(false); }
  };

  const handleUpdateWallet = async (e) => {
    e.preventDefault();
    if (!editingWallet || !editName.trim()) return;
    try {
      setLoading(true);
      const res = await updateWallet(editingWallet.id, { name: editName.trim(), is_active: editActive });
      if (res.success) { setMessage({ type: 'success', text: t('wallets.update_success') }); setEditingWallet(null); }
      else throw new Error(res.error);
    } catch (err) { setMessage({ type: 'error', text: `Erreur : ${err.message}` }); }
    finally { setLoading(false); }
  };

  const handleDeleteWallet = async (id, wName) => {
    if (window.confirm(t('wallets.delete_confirm').replace('{name}', wName))) {
      try {
        setLoading(true);
        const res = await deleteWallet(id);
        if (res.success) setMessage({ type: 'success', text: t('wallets.delete_success') });
        else throw new Error(res.error);
      } catch (err) { setMessage({ type: 'error', text: t('wallets.delete_error_prefix') + err.message }); }
      finally { setLoading(false); }
    }
  };

  const handleCapitalMovement = async (e) => {
    e.preventDefault();
    const amount = parseFloat(movementAmount);
    if (!capitalWalletId || isNaN(amount) || amount <= 0) {
      setMessage({ type: 'error', text: t('common.confirm_delete') });
      return;
    }
    const targetWallet = wallets.find(w => w.id === capitalWalletId);
    if (!targetWallet) return;
    const isDeposit = movementType === 'deposit';
    const payload = {
      type: movementType,
      source_wallet_id: isDeposit ? null : capitalWalletId,
      dest_wallet_id: isDeposit ? capitalWalletId : null,
      source_amount: amount, dest_amount: amount,
      exchange_rate: 1.0, fee: 0, fee_wallet_id: null, profit_usd: 0,
      note: movementNote.trim() || (isDeposit ? t('wallets.movement_inject') : t('wallets.movement_withdraw')),
      transaction_id: `CAP-${Date.now().toString().slice(-6)}`
    };
    try {
      setLoading(true);
      const res = await addTransaction(payload);
      if (res.success) {
        setMessage({ type: 'success', text: isDeposit ? `${t('wallets.movement_inject')} +${amount} ${targetWallet.currency}` : `${t('wallets.movement_withdraw')} -${amount} ${targetWallet.currency}` });
        setMovementAmount(''); setMovementNote(''); setCapitalWalletId(null);
      } else throw new Error(res.error);
    } catch (err) { setMessage({ type: 'error', text: `Erreur : ${err.message}` }); }
    finally { setLoading(false); }
  };

  const formatValue = (value, curr) => new Intl.NumberFormat('fr-FR').format(value) + ' ' + curr;

  // Detect mobile context (bottom sheet)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div className="wallets-page" style={{ overflowX: 'hidden' }}>
      {/* Header — hidden on mobile bottom sheet */}
      {!isMobile && (
        <div className="screen-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 className="screen-title">{t('wallets.page_title')}</h2>
            <p className="screen-desc">{t('wallets.page_desc')}</p>
          </div>
          <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', fontSize: '13px' }}
            onClick={() => { setShowAddForm(!showAddForm); setEditingWallet(null); setCapitalWalletId(null); }}>
            <Plus size={14} /><span>{t('wallets.new_wallet')}</span>
          </button>
        </div>
      )}

      {/* Mobile compact header */}
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0 12px' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>{wallets.length} {t('wallets.page_title')}</span>
          <button type="button" className="btn btn-primary" style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}
            onClick={() => { setShowAddForm(!showAddForm); setEditingWallet(null); setCapitalWalletId(null); }}>
            <Plus size={12} /><span>{t('wallets.new_wallet')}</span>
          </button>
        </div>
      )}

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: '12px' }}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Accordion: Add Wallet Form */}
      <div className="wallets-accordion" style={{ overflow: 'hidden', maxHeight: showAddForm ? '400px' : '0', transition: 'max-height 0.3s ease', marginBottom: showAddForm ? '12px' : '0' }}>
        <form onSubmit={handleCreateWallet} style={{ background: 'var(--card-bg)', border: '1px solid var(--primary-blue)', borderRadius: '14px', padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700' }}>{t('wallets.create_wallet_title')}</h3>
            <button type="button" onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={16} /></button>
          </div>
          <input type="text" className="form-control" placeholder={t('wallets.create_wallet_title')} value={name} onChange={(e) => setName(e.target.value)} required style={{ marginBottom: '8px', padding: '8px 12px', fontSize: '13px' }} />
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select className="form-control" value={type} onChange={(e) => setType(e.target.value)} style={{ flex: 1, padding: '8px 10px', fontSize: '13px' }}>
              <option value="cash">{t('wallets.wallet_type_cash')}</option>
              <option value="mobile_money">{t('wallets.wallet_type_mmoney')}</option>
            </select>
            <CurrencySelect value={currency} onChange={(e) => setCurrency(e.target.value)} ariaLabel={t('wallets.currency_label')} />
          </div>
          <input type="number" step="any" className="form-control" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder={t('wallets.initial_balance')} style={{ marginBottom: '10px', padding: '8px 12px', fontSize: '13px' }} />
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '10px', fontSize: '13px' }}>
            <span>{t('wallets.create_wallet_button')}</span>
          </button>
        </form>
      </div>

      {/* Wallets List — vertical cards for mobile */}
      {wallets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Landmark size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '8px' }}>{t('wallets.wallet_none')}</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>{t('wallets.create_first_wallet')}</p>
          <button type="button" className="btn btn-primary" style={{ display: 'inline-flex', width: 'auto' }} onClick={() => setShowAddForm(true)}>
            <Plus size={14} /><span>{t('wallets.create_first_wallet')}</span>
          </button>
        </div>
      ) : (
        <div className="wallets-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {wallets.map(w => {
            const brand = getWalletBrand(w);
            const isInactive = w.is_active === false;
            const isEditing = editingWallet?.id === w.id;
            const isCapital = capitalWalletId === w.id;

            return (
              <div key={w.id} style={{ opacity: isInactive ? 0.55 : 1 }}>
                {/* Main wallet row */}
                <div className="wallet-list-row" style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '14px',
                  boxShadow: '0 1px 4px rgba(15,23,42,0.04)',
                  transition: 'all 0.15s'
                }}>
                  {/* Left: brand badge */}
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: brand.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: '800', fontSize: '16px', flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                  }}>
                    {brand.letter}
                  </div>

                  {/* Center: name + currency */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {w.name}
                      {isInactive && <span style={{ marginLeft: '6px', fontSize: '9px', background: 'var(--border-color)', borderRadius: '6px', padding: '1px 5px', color: 'var(--text-muted)' }}>OFF</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', fontWeight: '600' }}>
                      {w.type === 'cash' ? t('wallets.wallet_type_cash') : t('wallets.wallet_type_mmoney')} • {w.currency}
                    </div>
                  </div>

                  {/* Right: balance + actions */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: "'Space Grotesk', var(--font-sans)" }}>
                      {formatValue(w.balance, w.currency)}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => { setCapitalWalletId(isCapital ? null : w.id); setEditingWallet(null); setShowAddForm(false); }}
                        style={{ width: '26px', height: '26px', borderRadius: '8px', border: 'none', background: isCapital ? 'var(--indigo-soft)' : 'var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        title={t('wallets.capital_movement')}>
                        <ArrowUpRight size={13} color={isCapital ? 'var(--primary-blue)' : 'var(--text-secondary)'} />
                      </button>
                      <button type="button" onClick={() => { setEditingWallet(isEditing ? null : w); setEditName(w.name); setEditActive(w.is_active !== undefined ? w.is_active : true); setCapitalWalletId(null); setShowAddForm(false); }}
                        style={{ width: '26px', height: '26px', borderRadius: '8px', border: 'none', background: isEditing ? 'rgba(245,158,11,0.15)' : 'var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        title="Modifier">
                        <Edit size={13} color={isEditing ? '#F59E0B' : 'var(--text-secondary)'} />
                      </button>
                      <button type="button" onClick={() => handleDeleteWallet(w.id, w.name)}
                        style={{ width: '26px', height: '26px', borderRadius: '8px', border: 'none', background: 'var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        title="Supprimer">
                        <Trash2 size={13} color="var(--text-secondary)" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Accordion: Edit form */}
                <div style={{ overflow: 'hidden', maxHeight: isEditing ? '200px' : '0', transition: 'max-height 0.3s ease' }}>
                  <form onSubmit={handleUpdateWallet} style={{ margin: '6px 0 0', padding: '12px 14px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px' }}>
                    <input type="text" className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} required style={{ marginBottom: '8px', padding: '8px 12px', fontSize: '13px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <input type="checkbox" id={`active-${w.id}`} checked={editActive} onChange={(e) => setEditActive(e.target.checked)} style={{ width: '14px', height: '14px' }} />
                      <label htmlFor={`active-${w.id}`} style={{ fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{t('wallets.wallet_active_label')}</label>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '8px', fontSize: '12px', backgroundColor: '#F59E0B' }}>
                      <span>{t('wallets.update_success')}</span>
                    </button>
                  </form>
                </div>

                {/* Accordion: Capital movement form */}
                <div style={{ overflow: 'hidden', maxHeight: isCapital ? '260px' : '0', transition: 'max-height 0.3s ease' }}>
                  <form onSubmit={handleCapitalMovement} style={{ margin: '6px 0 0', padding: '12px 14px', background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: '12px' }}>
                    <div className="toggle-group" style={{ marginBottom: '10px', display: 'flex', gap: '6px' }}>
                      <button type="button" onClick={() => setMovementType('deposit')}
                        style={{ flex: 1, padding: '6px 10px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: 'none', cursor: 'pointer', background: movementType === 'deposit' ? 'var(--primary-blue)' : 'var(--border-color)', color: movementType === 'deposit' ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                        <ArrowUpRight size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{t('wallets.movement_inject')}
                      </button>
                      <button type="button" onClick={() => setMovementType('withdrawal')}
                        style={{ flex: 1, padding: '6px 10px', fontSize: '12px', fontWeight: '600', borderRadius: '8px', border: 'none', cursor: 'pointer', background: movementType === 'withdrawal' ? 'var(--color-red)' : 'var(--border-color)', color: movementType === 'withdrawal' ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                        <ArrowDownLeft size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{t('wallets.movement_withdraw')}
                      </button>
                    </div>
                    <input type="number" step="any" className="form-control" placeholder={t('wallets.amount_placeholder')} value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} required style={{ marginBottom: '8px', padding: '8px 12px', fontSize: '13px' }} />
                    <input type="text" className="form-control" placeholder={t('wallets.note_placeholder')} value={movementNote} onChange={(e) => setMovementNote(e.target.value)} style={{ marginBottom: '10px', padding: '8px 12px', fontSize: '13px' }} />
                    <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '8px', fontSize: '12px' }}>
                      <span>{t('wallets.validate_movement')}</span>
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

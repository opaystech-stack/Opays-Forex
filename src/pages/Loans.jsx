import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Coins, Users, Plus, CheckCircle2, AlertCircle, Clock, Calendar, Percent, FileText, Phone, User, X, ChevronDown, ChevronUp, Image as ImageIcon, Camera } from 'lucide-react';
import { useT } from '../i18n';

const fmt = new Intl.NumberFormat('fr-FR');

export default function LoansPage() {
  const t = useT();
  const { wallets, customers, loans, transactions, createCustomer, createLoan, updateLoanStatus } = useApp();

  const [activeTab, setActiveTab] = useState('loans');
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanCustomerId, setLoanCustomerId] = useState('');
  const [loanWalletId, setLoanWalletId] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanInterest, setLoanInterest] = useState('0');
  const [loanDueDate, setLoanDueDate] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [loanAttachmentUrl, setLoanAttachmentUrl] = useState(null);
  const [loanAttachment, setLoanAttachment] = useState(null);
  const [showPaidLoans, setShowPaidLoans] = useState(false);
  const [loanMessage, setLoanMessage] = useState(null);

  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [custMessage, setCustMessage] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  const enrichedLoans = loans.map(l => {
    const isOverdue = l.status === 'pending' && l.due_date < today;
    const effectiveStatus = isOverdue ? 'overdue' : l.status;
    const customer = customers.find(c => c.id === l.customer_id);
    const wallet = wallets.find(w => w.id === l.wallet_id);
    const dueMs = new Date(l.due_date).getTime();
    const nowMs = new Date(today).getTime();
    const diffDays = Math.ceil((dueMs - nowMs) / (1000 * 60 * 60 * 24));
    return { ...l, effectiveStatus, customer, wallet, diffDays };
  });

  const overdueLoans = enrichedLoans.filter(l => l.effectiveStatus === 'overdue');
  const pendingLoans = enrichedLoans.filter(l => l.effectiveStatus === 'pending');
  const paidLoans = enrichedLoans.filter(l => l.effectiveStatus === 'paid');
  const activeLoansCount = overdueLoans.length + pendingLoans.length;

  const outstandingByCurrency = {};
  [...overdueLoans, ...pendingLoans].forEach(l => {
    const cur = l.currency || 'USD';
    outstandingByCurrency[cur] = (outstandingByCurrency[cur] || 0) + parseFloat(l.amount);
  });

  const selectedWallet = wallets.find(w => w.id === loanWalletId);
  const loanCurrency = selectedWallet?.currency || '';

  const resetLoanForm = () => {
    setLoanCustomerId('');
    setLoanWalletId('');
    setLoanAmount('');
    setLoanInterest('0');
    setLoanDueDate('');
    setLoanNote('');
    setLoanAttachment(null);
    setLoanAttachmentUrl(null);
  };

  const handleLoanSubmit = async (e) => {
    e.preventDefault();
    if (!loanCustomerId || !loanWalletId || !loanAmount || !loanDueDate) {
      setLoanMessage({ type: 'error', text: t('loans.required_fields') });
      return;
    }
    const res = await createLoan({
      customer_id: loanCustomerId,
      wallet_id: loanWalletId,
      amount: parseFloat(loanAmount),
      currency: loanCurrency,
      interest_rate: parseFloat(loanInterest) || 0,
      due_date: loanDueDate,
      note: loanNote || '',
      contract_image_url: loanAttachmentUrl || null
    });
    if (res.success) {
      setLoanMessage({ type: 'success', text: t('loans.create_success') });
      resetLoanForm();
      setShowLoanForm(false);
    } else {
      setLoanMessage({ type: 'error', text: t('settings.rates_update_error') + res.error });
    }
  };

  const handleMarkPaid = async (loanId) => {
    const res = await updateLoanStatus(loanId, 'paid');
    if (res.success) setLoanMessage({ type: 'success', text: t('loans.mark_paid_success') });
    else setLoanMessage({ type: 'error', text: t('settings.rates_update_error') + res.error });
  };

  const handleAttachment = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoanAttachment(file);
    setLoanAttachmentUrl(URL.createObjectURL(file));
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      setCustMessage({ type: 'error', text: t('loans.client_name_required') });
      return;
    }
    const res = await createCustomer({ name: newCustName.trim(), phone: newCustPhone.trim() || null });
    if (res.success) {
      setCustMessage({ type: 'success', text: t('loans.client_created_success') });
      setNewCustName('');
      setNewCustPhone('');
    } else {
      setCustMessage({ type: 'error', text: t('settings.rates_update_error') + res.error });
    }
  };

  const statusConfig = {
    overdue: { cls: 'ofx-status-red', label: 'En retard', icon: AlertCircle },
    pending: { cls: 'ofx-status-orange', label: 'En cours', icon: Clock },
    paid: { cls: 'ofx-status-green', label: 'Rembourse', icon: CheckCircle2 }
  };

  const renderLoanCard = (loan) => {
    const cfg = statusConfig[loan.effectiveStatus] || statusConfig.pending;
    const Icon = cfg.icon;
    return (
      <div key={loan.id} className={`ofx-card ofx-loan-card ${cfg.cls}`}>
        <div className="ofx-loan-head">
          <div className="ofx-loan-customer">
            <User size={15} />
            <span>{loan.customer?.name || t('loans.client_unknown')}</span>
          </div>
          <span className={`ofx-status ${cfg.cls}`}><Icon size={14} /> {cfg.label}</span>
        </div>
        <div className="ofx-loan-body">
          <div className="ofx-loan-amount">{fmt.format(loan.amount)} {loan.currency}</div>
          {loan.interest_rate > 0 && <div className="ofx-loan-rate"><Percent size={12} /> {loan.interest_rate}%</div>}
        </div>
        <div className="ofx-loan-meta">
          <div><Calendar size={13} /> {loan.due_date}</div>
          <div className={loan.diffDays < 0 ? 'red' : loan.diffDays <= 3 ? 'orange' : 'green'}>
            {loan.diffDays < 0 ? `${Math.abs(loan.diffDays)}j de retard` : loan.diffDays === 0 ? "Aujourd'hui" : `${loan.diffDays}j restants`}
          </div>
        </div>
        {loan.note && <div className="ofx-loan-note"><FileText size={11} /> {loan.note}</div>}
        {loan.effectiveStatus !== 'paid' && (
          <button className="ofx-btn ofx-btn-green" onClick={() => handleMarkPaid(loan.id)}>
            <CheckCircle2 size={15} /> {t('loans.mark_paid')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div>
          <h2 className="ofx-screen-title">{t('loans.title')}</h2>
          <p className="ofx-screen-desc">{t('loans.desc')}</p>
        </div>
      </div>

      <div className="ofx-toggle-group">
        <button className={`ofx-toggle ${activeTab === 'loans' ? 'active' : ''}`} onClick={() => setActiveTab('loans')}>
          <Coins size={15} /> {t('loans.loans_tab')}
        </button>
        <button className={`ofx-toggle ${activeTab === 'clients' ? 'active' : ''}`} onClick={() => setActiveTab('clients')}>
          <Users size={15} /> {t('loans.clients_tab')}
        </button>
      </div>

      {activeTab === 'loans' && (
        <div>
          {loanMessage && (
            <div className={`ofx-alert ${loanMessage.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
              {loanMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{loanMessage.text}</span>
            </div>
          )}

          <div className="ofx-stats-row">
            <div className="ofx-stat-card"><div className="ofx-stat-label">En cours</div><div className="ofx-stat-value warn">{activeLoansCount}</div></div>
            <div className="ofx-stat-card"><div className="ofx-stat-label">Engage</div><div className="ofx-stat-value small">{Object.keys(outstandingByCurrency).length === 0 ? '—' : Object.entries(outstandingByCurrency).map(([cur, amt]) => <span key={cur}>{fmt.format(amt)} {cur}</span>)}</div></div>
            <div className="ofx-stat-card"><div className="ofx-stat-label">En retard</div><div className={`ofx-stat-value ${overdueLoans.length > 0 ? 'minus' : 'plus'}`}>{overdueLoans.length}</div></div>
          </div>

          <button className="ofx-btn ofx-btn-primary" onClick={() => setShowLoanForm(!showLoanForm)}>
            {showLoanForm ? <X size={16} /> : <Plus size={16} />}
            <span>{showLoanForm ? t('loans.cancel') : t('loans.add_loan')}</span>
          </button>

          {showLoanForm && (
            <form onSubmit={handleLoanSubmit} className="ofx-card">
              <div className="ofx-form-group">
                <label>{t('loans.client_name_required')}</label>
                <select className="ofx-input" value={loanCustomerId} onChange={(e) => setLoanCustomerId(e.target.value)} required>
                  <option value="">— {t('common.no')} —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>)}
                </select>
              </div>
              <div className="ofx-form-group">
                <label>{t('modal.source_wallet')}</label>
                <select className="ofx-input" value={loanWalletId} onChange={(e) => setLoanWalletId(e.target.value)} required>
                  <option value="">— {t('common.no')} —</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                </select>
              </div>
              <div className="ofx-form-row">
                <div className="ofx-form-group">
                  <label>Montant</label>
                  <input type="number" step="any" className="ofx-input" placeholder="Ex: 500" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} required />
                </div>
                <div className="ofx-form-group">
                  <label>Devise</label>
                  <input type="text" className="ofx-input" value={loanCurrency} readOnly />
                </div>
              </div>
              <div className="ofx-form-row">
                <div className="ofx-form-group">
                  <label>Interet (%)</label>
                  <input type="number" step="any" min="0" className="ofx-input" placeholder="0" value={loanInterest} onChange={(e) => setLoanInterest(e.target.value)} />
                </div>
                <div className="ofx-form-group">
                  <label>Date d'echeance</label>
                  <input type="date" className="ofx-input" value={loanDueDate} onChange={(e) => setLoanDueDate(e.target.value)} required />
                </div>
              </div>
              <div className="ofx-form-group">
                <label>Note (optionnel)</label>
                <input type="text" className="ofx-input" placeholder="Motif du pret..." value={loanNote} onChange={(e) => setLoanNote(e.target.value)} />
              </div>
              <div className="ofx-form-group">
                <label>Piece jointe</label>
                <div className="ofx-btn-row">
                  <label className="ofx-btn ofx-btn-outline">
                    <Camera size={14} /> {t('transactions.take_photo')}
                    <input type="file" accept="image/*,.pdf" capture="environment" onChange={handleAttachment} style={{ display: 'none' }} />
                  </label>
                  <label className="ofx-btn ofx-btn-outline">
                    <ImageIcon size={14} /> {t('transactions.choose_file')}
                    <input type="file" accept="image/*,.pdf" onChange={handleAttachment} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
              {loanAttachmentUrl && (
                <div className="ofx-preview">
                  {loanAttachment?.type?.startsWith('image/') ? <img src={loanAttachmentUrl} alt="Piece jointe" /> : <div className="ofx-file"><FileText size={18} /> {loanAttachment?.name || 'Document'}</div>}
                  <button type="button" className="ofx-preview-close" onClick={() => { setLoanAttachment(null); setLoanAttachmentUrl(null); }}><X size={14} /></button>
                </div>
              )}
              <button type="submit" className="ofx-btn ofx-btn-primary"><Coins size={16} /> {t('loans.add_loan')}</button>
            </form>
          )}

          {overdueLoans.length > 0 && <div className="ofx-section"><div className="ofx-section-header red"><AlertCircle size={14} /> {t('loans.status.overdue')} ({overdueLoans.length})</div>{overdueLoans.map(renderLoanCard)}</div>}
          {pendingLoans.length > 0 && <div className="ofx-section"><div className="ofx-section-header orange"><Clock size={14} /> {t('loans.status.pending')} ({pendingLoans.length})</div>{pendingLoans.map(renderLoanCard)}</div>}
          {paidLoans.length > 0 && (
            <div className="ofx-section">
              <button className="ofx-section-header green" onClick={() => setShowPaidLoans(!showPaidLoans)}>
                <CheckCircle2 size={14} /> {t('loans.status.paid')} ({paidLoans.length}) {showPaidLoans ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showPaidLoans && paidLoans.map(renderLoanCard)}
            </div>
          )}

          {enrichedLoans.length === 0 && (
            <div className="ofx-empty-card">
              <Coins size={40} />
              <h3>{t('loans.none')}</h3>
              <p>{t('loans.create_first')}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'clients' && (
        <div>
          {custMessage && (
            <div className={`ofx-alert ${custMessage.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
              {custMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{custMessage.text}</span>
            </div>
          )}
          <form onSubmit={handleCreateCustomer} className="ofx-card">
            <h3 className="ofx-card-title"><Plus size={15} /> {t('loans.add_client')}</h3>
            <div className="ofx-form-row">
              <div className="ofx-form-group">
                <label>Nom complet *</label>
                <input type="text" className="ofx-input" placeholder="Ex: Jean Kabamba" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} required />
              </div>
              <div className="ofx-form-group">
                <label>Telephone</label>
                <input type="tel" className="ofx-input" placeholder="+243..." value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="ofx-btn ofx-btn-primary"><User size={16} /> {t('loans.save_client')}</button>
          </form>

          {customers.length === 0 ? (
            <div className="ofx-empty-card"><Users size={40} /><h3>Aucun client</h3><p>Ajoutez votre premier client.</p></div>
          ) : (
            <div className="ofx-section">
              <div className="ofx-section-header">Repertoire ({customers.length})</div>
              {customers.map(c => {
                const txCount = transactions.filter(t => t.customer_id === c.id).length;
                const activeCount = loans.filter(l => l.customer_id === c.id && (l.status === 'pending' || (l.status === 'pending' && l.due_date < today))).length;
                return (
                  <div key={c.id} className="ofx-list-item" onClick={() => setSelectedCustomer(c)}>
                    <div className="ofx-list-icon primary"><User size={18} /></div>
                    <div className="ofx-list-body">
                      <div className="ofx-list-title">{c.name}</div>
                      {c.phone && <div className="ofx-list-sub"><Phone size={12} /> {c.phone}</div>}
                    </div>
                    <div className="ofx-list-amounts">
                      <span>{txCount} operation{txCount !== 1 ? 's' : ''}</span>
                      {activeCount > 0 && <span className="warn">{activeCount} pret actif</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {selectedCustomer && (
        <div className="ofx-modal" onClick={() => setSelectedCustomer(null)}>
          <div className="ofx-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="ofx-modal-header">
              <h4><User size={18} /> {selectedCustomer.name}</h4>
              <button onClick={() => setSelectedCustomer(null)}><X size={20} /></button>
            </div>
            <div className="ofx-modal-body">
              {selectedCustomer.phone && <div className="ofx-modal-field"><span>Telephone</span><strong><Phone size={14} /> {selectedCustomer.phone}</strong></div>}
              <div className="ofx-modal-field"><span>Client depuis</span><strong>{new Date(selectedCustomer.created_at).toLocaleDateString('fr-FR')}</strong></div>
              <div className="ofx-section"><div className="ofx-section-header"><Coins size={15} /> Historique Prets</div>
                {enrichedLoans.filter(l => l.customer_id === selectedCustomer.id).length === 0 ? <p className="ofx-empty">Aucun pret enregistre.</p> : enrichedLoans.filter(l => l.customer_id === selectedCustomer.id).map(l => {
                  const cfg = statusConfig[l.effectiveStatus] || statusConfig.pending;
                  const Icon = cfg.icon;
                  return (
                    <div key={l.id} className={`ofx-mini-card ${cfg.cls}`}>
                      <div><strong>{fmt.format(l.amount)} {l.currency}</strong> <span className={`ofx-status ${cfg.cls}`}><Icon size={12} /> {cfg.label}</span></div>
                      <div className="ofx-list-sub">Echeance : {l.due_date}{l.interest_rate > 0 && ` · ${l.interest_rate}% interet`}</div>
                      {l.note && <div className="ofx-list-note">{l.note}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="ofx-section"><div className="ofx-section-header"><FileText size={15} /> Historique Transactions</div>
                {transactions.filter(t => t.customer_id === selectedCustomer.id).length === 0 ? <p className="ofx-empty">Aucune transaction liee.</p> : transactions.filter(t => t.customer_id === selectedCustomer.id).map(txn => {
                  const srcW = wallets.find(w => w.id === txn.source_wallet_id);
                  const dstW = wallets.find(w => w.id === txn.dest_wallet_id);
                  return (
                    <div key={txn.id} className="ofx-mini-card">
                      <div><strong>{txn.source_amount && `${fmt.format(txn.source_amount)} ${srcW?.currency || ''}`} {txn.dest_amount && `→ ${fmt.format(txn.dest_amount)} ${dstW?.currency || ''}`}</strong></div>
                      <div className="ofx-list-sub">{new Date(txn.timestamp).toLocaleDateString('fr-FR')}</div>
                      {txn.note && <div className="ofx-list-note">{txn.note}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

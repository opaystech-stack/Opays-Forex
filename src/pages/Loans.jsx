import { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Coins, Users, Plus, CheckCircle2, AlertCircle, Clock, Calendar,
  Percent, FileText, Phone, User, X, ChevronDown, ChevronUp,
  Image as ImageIcon, Camera
} from 'lucide-react';

const fmt = new Intl.NumberFormat('fr-FR');

export default function LoansPage() {
  const {
    wallets, customers, loans, transactions,
    createCustomer, createLoan, updateLoanStatus
  } = useApp();

  // Sub-tab state
  const [activeTab, setActiveTab] = useState('loans'); // 'loans' | 'clients'

  // =============================================
  // LOANS TAB STATE
  // =============================================
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [loanCustomerId, setLoanCustomerId] = useState('');
  const [loanWalletId, setLoanWalletId] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanInterest, setLoanInterest] = useState('0');
  const [loanDueDate, setLoanDueDate] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [loanAttachment, setLoanAttachment] = useState(null);
  const [loanAttachmentUrl, setLoanAttachmentUrl] = useState(null);
  const [showPaidLoans, setShowPaidLoans] = useState(false);
  const [loanMessage, setLoanMessage] = useState(null);

  // =============================================
  // CLIENTS TAB STATE
  // =============================================
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [custMessage, setCustMessage] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // =============================================
  // DERIVED DATA
  // =============================================
  const today = new Date().toISOString().split('T')[0];

  const enrichedLoans = loans.map(l => {
    const isOverdue = l.status === 'pending' && l.due_date < today;
    const effectiveStatus = isOverdue ? 'overdue' : l.status;
    const customer = customers.find(c => c.id === l.customer_id);
    const wallet = wallets.find(w => w.id === l.wallet_id);

    // Days remaining or overdue
    const dueMs = new Date(l.due_date).getTime();
    const nowMs = new Date(today).getTime();
    const diffDays = Math.ceil((dueMs - nowMs) / (1000 * 60 * 60 * 24));

    return { ...l, effectiveStatus, customer, wallet, diffDays };
  });

  const overdueLoans = enrichedLoans.filter(l => l.effectiveStatus === 'overdue');
  const pendingLoans = enrichedLoans.filter(l => l.effectiveStatus === 'pending');
  const paidLoans = enrichedLoans.filter(l => l.effectiveStatus === 'paid');

  const activeLoansCount = overdueLoans.length + pendingLoans.length;

  // Group outstanding amounts by currency
  const outstandingByCurrency = {};
  [...overdueLoans, ...pendingLoans].forEach(l => {
    const cur = l.currency || 'USD';
    outstandingByCurrency[cur] = (outstandingByCurrency[cur] || 0) + parseFloat(l.amount);
  });

  // Selected wallet currency (auto-fill)
  const selectedWallet = wallets.find(w => w.id === loanWalletId);
  const loanCurrency = selectedWallet?.currency || '';

  // =============================================
  // HANDLERS — LOANS
  // =============================================
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
      setLoanMessage({ type: 'error', text: 'Veuillez remplir tous les champs obligatoires.' });
      return;
    }

    const payload = {
      customer_id: loanCustomerId,
      wallet_id: loanWalletId,
      amount: parseFloat(loanAmount),
      currency: loanCurrency,
      interest_rate: parseFloat(loanInterest) || 0,
      due_date: loanDueDate,
      note: loanNote || '',
      contract_image_url: loanAttachmentUrl || null
    };

    const res = await createLoan(payload);
    if (res.success) {
      setLoanMessage({ type: 'success', text: 'Prêt créé avec succès ! Le solde de la caisse a été débité.' });
      resetLoanForm();
      setShowLoanForm(false);
    } else {
      setLoanMessage({ type: 'error', text: `Erreur : ${res.error}` });
    }
  };

  const handleMarkPaid = async (loanId) => {
    const res = await updateLoanStatus(loanId, 'paid');
    if (res.success) {
      setLoanMessage({ type: 'success', text: 'Prêt marqué comme remboursé ! Solde crédité.' });
    } else {
      setLoanMessage({ type: 'error', text: `Erreur : ${res.error}` });
    }
  };

  const handleAttachment = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoanAttachment(file);
    setLoanAttachmentUrl(URL.createObjectURL(file));
  };

  // =============================================
  // HANDLERS — CLIENTS
  // =============================================
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustName.trim()) {
      setCustMessage({ type: 'error', text: 'Le nom du client est requis.' });
      return;
    }
    const res = await createCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim() || null
    });
    if (res.success) {
      setCustMessage({ type: 'success', text: `Client "${newCustName}" créé avec succès.` });
      setNewCustName('');
      setNewCustPhone('');
    } else {
      setCustMessage({ type: 'error', text: `Erreur : ${res.error}` });
    }
  };

  const getCustomerTxCount = (customerId) => {
    return transactions.filter(t => t.customer_id === customerId).length;
  };

  const getCustomerActiveLoans = (customerId) => {
    return loans.filter(l => l.customer_id === customerId && (l.status === 'pending' || (l.status === 'pending' && l.due_date < today)));
  };

  const getCustomerLoans = (customerId) => {
    return enrichedLoans.filter(l => l.customer_id === customerId);
  };

  const getCustomerTransactions = (customerId) => {
    return transactions.filter(t => t.customer_id === customerId);
  };

  // =============================================
  // RENDER HELPERS
  // =============================================
  const statusConfig = {
    overdue: { color: 'var(--color-red)', label: 'En retard', icon: <AlertCircle size={14} /> },
    pending: { color: 'var(--color-orange)', label: 'En cours', icon: <Clock size={14} /> },
    paid: { color: 'var(--color-green)', label: 'Remboursé', icon: <CheckCircle2 size={14} /> }
  };

  const renderLoanCard = (loan) => {
    const cfg = statusConfig[loan.effectiveStatus] || statusConfig.pending;
    return (
      <div
        key={loan.id}
        className="card glass-card"
        style={{
          borderLeft: `4px solid ${cfg.color}`,
          marginBottom: '10px',
          padding: '14px 16px'
        }}
      >
        {/* Header: customer name + status badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={15} color="var(--text-secondary)" />
            <span style={{ fontWeight: '700', fontSize: '14px' }}>
              {loan.customer?.name || 'Client inconnu'}
            </span>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', fontWeight: '600', color: cfg.color,
            backgroundColor: `${cfg.color}15`, padding: '3px 8px', borderRadius: '12px'
          }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>

        {/* Amount row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px', fontWeight: '800', color: cfg.color }}>
            {fmt.format(loan.amount)} {loan.currency}
          </span>
          {loan.interest_rate > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              fontSize: '12px', color: 'var(--color-cyan)', fontWeight: '600'
            }}>
              <Percent size={12} /> {loan.interest_rate}%
            </span>
          )}
        </div>

        {/* Due date + days */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <Calendar size={13} />
            <span>Échéance : {loan.due_date}</span>
          </div>
          <span style={{
            fontSize: '11px', fontWeight: '700',
            color: loan.diffDays < 0 ? 'var(--color-red)' : loan.diffDays <= 3 ? 'var(--color-orange)' : 'var(--color-green)'
          }}>
            {loan.diffDays < 0
              ? `${Math.abs(loan.diffDays)}j de retard`
              : loan.diffDays === 0
                ? "Aujourd'hui"
                : `${loan.diffDays}j restants`
            }
          </span>
        </div>

        {/* Note */}
        {loan.note && (
          <div style={{
            fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic',
            padding: '6px 0', borderTop: '1px solid var(--border-color)', marginTop: '4px'
          }}>
            <FileText size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {loan.note}
          </div>
        )}

        {/* Contract attachment preview */}
        {loan.contract_image_url && (
          <div style={{ marginTop: '8px' }}>
            <img
              src={loan.contract_image_url}
              alt="Contrat"
              style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }}
            />
          </div>
        )}

        {/* Action button */}
        {loan.effectiveStatus !== 'paid' && (
          <button
            className="btn btn-primary"
            onClick={() => handleMarkPaid(loan.id)}
            style={{
              marginTop: '12px', width: '100%', fontSize: '13px',
              backgroundColor: 'var(--color-green)',
              boxShadow: '0 4px 14px rgba(0, 200, 80, 0.3)'
            }}
          >
            <CheckCircle2 size={15} />
            <span>Marquer Payé</span>
          </button>
        )}
      </div>
    );
  };

  // =============================================
  // RENDER
  // =============================================
  return (
    <div>
      {/* Screen header */}
      <div className="screen-header">
        <h2 className="screen-title">Prêts & Clients</h2>
        <p className="screen-desc">Gérer vos prêts et votre base de clients.</p>
        <span className="mock-badge">DÉMO</span>
      </div>

      {/* Sub-tab toggle */}
      <div className="toggle-group" style={{ marginBottom: '18px', padding: '4px' }}>
        <button
          type="button"
          className={`toggle-button ${activeTab === 'loans' ? 'active business' : ''}`}
          onClick={() => setActiveTab('loans')}
          style={{ fontSize: '13px', padding: '9px 6px' }}
        >
          <Coins size={15} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
          Prêts
        </button>
        <button
          type="button"
          className={`toggle-button ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
          style={{ fontSize: '13px', padding: '9px 6px' }}
        >
          <Users size={15} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
          Clients
        </button>
      </div>

      {/* ========================================= */}
      {/* PRÊTS TAB                                 */}
      {/* ========================================= */}
      {activeTab === 'loans' && (
        <div>
          {/* Alert messages */}
          {loanMessage && (
            <div className={`alert ${loanMessage.type === 'success' ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: '14px' }}>
              {loanMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{loanMessage.text}</span>
            </div>
          )}

          {/* Metrics strip */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <div className="stat-box">
              <span className="stat-label">En cours</span>
              <span className="stat-value" style={{ color: 'var(--color-orange)' }}>
                {activeLoansCount}
              </span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Engagé</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {Object.keys(outstandingByCurrency).length === 0 ? (
                  <span className="stat-value" style={{ fontSize: '14px' }}>—</span>
                ) : (
                  Object.entries(outstandingByCurrency).map(([cur, amt]) => (
                    <span key={cur} className="stat-value" style={{ fontSize: '13px', lineHeight: '1.5' }}>
                      {fmt.format(amt)} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{cur}</span>
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="stat-box">
              <span className="stat-label">En retard</span>
              <span className="stat-value" style={{ color: overdueLoans.length > 0 ? 'var(--color-red)' : 'var(--color-green)' }}>
                {overdueLoans.length}
              </span>
            </div>
          </div>

          {/* Add loan button */}
          <button
            className="btn btn-primary"
            onClick={() => setShowLoanForm(!showLoanForm)}
            style={{
              width: '100%', marginBottom: '16px', fontSize: '13px',
              backgroundColor: showLoanForm ? 'var(--text-secondary)' : 'var(--primary-blue)',
              boxShadow: showLoanForm ? 'none' : '0 6px 20px var(--primary-blue-glow)'
            }}
          >
            {showLoanForm ? <X size={16} /> : <Plus size={16} />}
            <span>{showLoanForm ? 'Annuler' : 'Nouveau Prêt'}</span>
          </button>

          {/* Loan creation form (collapsible) */}
          {showLoanForm && (
            <form onSubmit={handleLoanSubmit} className="card" style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '14px', color: 'var(--deep-navy)' }}>
                <Coins size={15} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Créer un prêt
              </h3>

              {/* Customer select */}
              <div className="form-group">
                <label className="form-label">Client emprunteur</label>
                <select
                  className="form-control"
                  value={loanCustomerId}
                  onChange={(e) => setLoanCustomerId(e.target.value)}
                  required
                >
                  <option value="">— Sélectionner un client —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Wallet select */}
              <div className="form-group">
                <label className="form-label">Caisse de sortie</label>
                <select
                  className="form-control"
                  value={loanWalletId}
                  onChange={(e) => setLoanWalletId(e.target.value)}
                  required
                >
                  <option value="">— Sélectionner une caisse —</option>
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                  ))}
                </select>
              </div>

              {/* Amount + Currency (auto-filled) */}
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Montant</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="Ex: 500"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Devise</label>
                  <input
                    type="text"
                    className="form-control"
                    value={loanCurrency}
                    readOnly
                    placeholder="Auto"
                    style={{ backgroundColor: 'var(--bg-light)', color: 'var(--text-muted)', fontWeight: '700', textAlign: 'center' }}
                  />
                </div>
              </div>

              {/* Interest rate + Due date */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Intérêt (%)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="form-control"
                    placeholder="0"
                    value={loanInterest}
                    onChange={(e) => setLoanInterest(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Date d'échéance</label>
                  <input
                    type="date"
                    className="form-control"
                    value={loanDueDate}
                    onChange={(e) => setLoanDueDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Note */}
              <div className="form-group">
                <label className="form-label">Note (optionnel)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Motif du prêt, conditions..."
                  value={loanNote}
                  onChange={(e) => setLoanNote(e.target.value)}
                />
              </div>

              {/* Contract attachment */}
              <div className="form-group">
                <label className="form-label">Pièce jointe (contrat, photo)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <label className="btn btn-outline" style={{ cursor: 'pointer', fontSize: '12px', padding: '9px 6px' }}>
                    <Camera size={14} color="var(--color-green)" />
                    <span>Prendre Photo</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      capture="environment"
                      onChange={handleAttachment}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <label className="btn btn-outline" style={{ cursor: 'pointer', fontSize: '12px', padding: '9px 6px' }}>
                    <ImageIcon size={14} color="var(--primary-blue)" />
                    <span>Choisir Fichier</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleAttachment}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* Attachment preview */}
              {loanAttachmentUrl && (
                <div className="receipt-preview" style={{ marginBottom: '14px', position: 'relative' }}>
                  {loanAttachment?.type?.startsWith('image/') ? (
                    <img src={loanAttachmentUrl} alt="Pièce jointe" style={{ width: '100%', maxHeight: '150px', objectFit: 'cover', borderRadius: '8px' }} />
                  ) : (
                    <div style={{
                      padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-light)',
                      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)'
                    }}>
                      <FileText size={18} />
                      <span>{loanAttachment?.name || 'Document PDF'}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setLoanAttachment(null); setLoanAttachmentUrl(null); }}
                    style={{
                      position: 'absolute', top: '6px', right: '6px',
                      width: '24px', height: '24px', borderRadius: '50%',
                      backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                className="btn btn-primary"
                style={{
                  width: '100%', fontSize: '13px', marginTop: '4px',
                  backgroundColor: 'var(--primary-blue)',
                  boxShadow: '0 6px 20px var(--primary-blue-glow)'
                }}
              >
                <Coins size={16} />
                <span>Créer le Prêt</span>
              </button>
            </form>
          )}

          {/* ---- LOAN LIST ---- */}

          {/* Overdue loans */}
          {overdueLoans.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{
                fontSize: '12px', fontWeight: '700', color: 'var(--color-red)',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <AlertCircle size={14} /> En retard ({overdueLoans.length})
              </h4>
              {overdueLoans.map(renderLoanCard)}
            </div>
          )}

          {/* Pending loans */}
          {pendingLoans.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{
                fontSize: '12px', fontWeight: '700', color: 'var(--color-orange)',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
                <Clock size={14} /> En cours ({pendingLoans.length})
              </h4>
              {pendingLoans.map(renderLoanCard)}
            </div>
          )}

          {/* Paid loans (collapsed by default) */}
          {paidLoans.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setShowPaidLoans(!showPaidLoans)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: '700', color: 'var(--color-green)',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
                  padding: '8px 0'
                }}
              >
                <CheckCircle2 size={14} />
                Remboursés ({paidLoans.length})
                {showPaidLoans ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showPaidLoans && paidLoans.map(renderLoanCard)}
            </div>
          )}

          {/* Empty state */}
          {enrichedLoans.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
              <Coins size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px' }}>Aucun prêt</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Créez votre premier prêt en appuyant sur le bouton « Nouveau Prêt » ci-dessus.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================= */}
      {/* CLIENTS TAB                               */}
      {/* ========================================= */}
      {activeTab === 'clients' && (
        <div>
          {/* Alert messages */}
          {custMessage && (
            <div className={`alert ${custMessage.type === 'success' ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: '14px' }}>
              {custMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{custMessage.text}</span>
            </div>
          )}

          {/* Customer creation form (inline) */}
          <form onSubmit={handleCreateCustomer} className="card" style={{ marginBottom: '18px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '14px', color: 'var(--deep-navy)' }}>
              <Plus size={15} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Ajouter un client
            </h3>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Nom complet *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ex: Jean Kabamba"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1.5 }}>
                <label className="form-label">Téléphone</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+243..."
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%', fontSize: '13px', marginTop: '4px',
                backgroundColor: 'var(--primary-blue)',
                boxShadow: '0 6px 20px var(--primary-blue-glow)'
              }}
            >
              <User size={16} />
              <span>Enregistrer Client</span>
            </button>
          </form>

          {/* Customer list */}
          {customers.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
              <Users size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px' }}>Aucun client</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                Ajoutez votre premier client via le formulaire ci-dessus.
              </p>
            </div>
          ) : (
            <div>
              <h4 style={{
                fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px'
              }}>
                Répertoire ({customers.length})
              </h4>

              {customers.map(c => {
                const txCount = getCustomerTxCount(c.id);
                const activeCount = getCustomerActiveLoans(c.id).length;
                return (
                  <div
                    key={c.id}
                    className="card glass-card"
                    onClick={() => setSelectedCustomer(c)}
                    style={{
                      marginBottom: '10px', padding: '14px 16px', cursor: 'pointer',
                      borderLeft: `4px solid ${activeCount > 0 ? 'var(--color-orange)' : 'var(--primary-blue)'}`,
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px' }}>
                          <User size={14} style={{ marginRight: '6px', verticalAlign: 'middle', color: 'var(--primary-blue)' }} />
                          {c.name}
                        </div>
                        {c.phone && (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={11} /> {c.phone}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {txCount} opération{txCount !== 1 ? 's' : ''}
                        </div>
                        {activeCount > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--color-orange)', fontWeight: '700', marginTop: '2px' }}>
                            {activeCount} prêt{activeCount !== 1 ? 's' : ''} actif{activeCount !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Customer detail modal */}
          {selectedCustomer && (
            <div className="modal-overlay" onClick={() => setSelectedCustomer(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
                <div className="modal-header">
                  <h3 className="modal-title">
                    <User size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                    {selectedCustomer.name}
                  </h3>
                  <button className="modal-close" onClick={() => setSelectedCustomer(null)}>
                    <X size={20} />
                  </button>
                </div>

                {/* Customer info */}
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                  {selectedCustomer.phone && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <Phone size={14} /> {selectedCustomer.phone}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Client depuis : {new Date(selectedCustomer.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                {/* Loan history */}
                <div style={{ padding: '16px' }}>
                  <h4 style={{
                    fontSize: '13px', fontWeight: '700', marginBottom: '12px',
                    display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--deep-navy)'
                  }}>
                    <Coins size={15} /> Historique Prêts
                  </h4>
                  {getCustomerLoans(selectedCustomer.id).length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucun prêt enregistré.</p>
                  ) : (
                    getCustomerLoans(selectedCustomer.id).map(loan => {
                      const cfg = statusConfig[loan.effectiveStatus] || statusConfig.pending;
                      return (
                        <div key={loan.id} style={{
                          padding: '10px 12px', borderRadius: '8px',
                          backgroundColor: 'var(--bg-light)', marginBottom: '8px',
                          borderLeft: `3px solid ${cfg.color}`,
                          fontSize: '12px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700' }}>{fmt.format(loan.amount)} {loan.currency}</span>
                            <span style={{ color: cfg.color, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)' }}>
                            Échéance : {loan.due_date}
                            {loan.interest_rate > 0 && ` · ${loan.interest_rate}% intérêt`}
                          </div>
                          {loan.note && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '3px' }}>{loan.note}</div>}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Transaction history */}
                <div style={{ padding: '0 16px 16px' }}>
                  <h4 style={{
                    fontSize: '13px', fontWeight: '700', marginBottom: '12px',
                    display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--deep-navy)'
                  }}>
                    <FileText size={15} /> Historique Transactions
                  </h4>
                  {getCustomerTransactions(selectedCustomer.id).length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune transaction liée.</p>
                  ) : (
                    getCustomerTransactions(selectedCustomer.id).map(txn => {
                      const srcW = wallets.find(w => w.id === txn.source_wallet_id);
                      const dstW = wallets.find(w => w.id === txn.dest_wallet_id);
                      return (
                        <div key={txn.id} style={{
                          padding: '10px 12px', borderRadius: '8px',
                          backgroundColor: 'var(--bg-light)', marginBottom: '8px',
                          borderLeft: '3px solid var(--primary-blue)',
                          fontSize: '12px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                            <span style={{ fontWeight: '700' }}>
                              {txn.source_amount && `${fmt.format(txn.source_amount)} ${srcW?.currency || ''}`}
                              {txn.source_amount && txn.dest_amount && ' → '}
                              {txn.dest_amount && `${fmt.format(txn.dest_amount)} ${dstW?.currency || ''}`}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                              {new Date(txn.timestamp).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                          {txn.note && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{txn.note}</div>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

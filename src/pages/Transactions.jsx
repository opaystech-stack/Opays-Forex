import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeftRight, Image, Mic, Square, Sparkles, CheckCircle2, AlertCircle, Camera, X } from 'lucide-react';
import { useT } from '../i18n';

export default function Transactions({ draftToEdit, clearDraftToEdit }) {
  const { wallets, addTransaction, convertToUSD, customers } = useApp();
  const t = useT();

  const defaultSourceId = useMemo(() => (wallets.length ? wallets[0].id : ''), [wallets]);
  const defaultDestId = useMemo(() => (wallets.length > 1 ? wallets[1].id : wallets[0]?.id || ''), [wallets]);

  const [form, setForm] = useState({
    type: 'exchange',
    sourceWalletId: '',
    destWalletId: '',
    sourceAmount: '',
    destAmount: '',
    fee: '0',
    transactionId: '',
    customerId: '',
    note: '',
  });
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState(null);

  const derived = useMemo(() => {
    if (draftToEdit) {
      return {
        type: draftToEdit.type || 'exchange',
        sourceWalletId: draftToEdit.source_wallet_id || '',
        destWalletId: draftToEdit.dest_wallet_id || '',
        sourceAmount: draftToEdit.source_amount ? draftToEdit.source_amount.toString() : '',
        destAmount: draftToEdit.dest_amount ? draftToEdit.dest_amount.toString() : '',
        fee: draftToEdit.fee ? draftToEdit.fee.toString() : '0',
        transactionId: draftToEdit.transaction_id || '',
        customerId: draftToEdit.customer_id || '',
        note: draftToEdit.note || '',
      };
    }
    return {
      type: 'exchange',
      sourceWalletId: defaultSourceId,
      destWalletId: defaultDestId,
      sourceAmount: '',
      destAmount: '',
      fee: '0',
      transactionId: '',
      customerId: '',
      note: '',
    };
  }, [draftToEdit, defaultSourceId, defaultDestId]);

  const active = draftToEdit ? derived : { ...derived, ...form };

  const update = (patch) => {
    if (draftToEdit && clearDraftToEdit) clearDraftToEdit();
    setForm({ ...active, ...patch });
  };

  const sWallet = wallets.find(w => w.id === active.sourceWalletId);
  const dWallet = wallets.find(w => w.id === active.destWalletId);
  const src = parseFloat(active.sourceAmount) || 0;
  const dst = parseFloat(active.destAmount) || 0;
  const calculatedRate = src > 0 ? dst / src : 0;
  const calculatedProfitUSD = active.type === 'exchange' && sWallet && dWallet
    ? (dst / convertToUSD(1, dWallet.currency || 'USD')) - (src / convertToUSD(1, sWallet.currency || 'USD'))
    : 0;

  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (file) setReceiptPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    const payload = {
      type: active.type,
      sourceWalletId: active.type !== 'deposit' ? active.sourceWalletId : null,
      destWalletId: active.type !== 'withdrawal' ? active.destWalletId : null,
      sourceAmount: src,
      destAmount: dst,
      exchangeRate: calculatedRate,
      fee: parseFloat(active.fee) || 0,
      transactionId: active.transactionId,
      customerId: active.customerId || null,
      note: active.note,
    };
    const res = await addTransaction(payload);
    if (res.success) {
      setMessage({ type: 'success', text: t('transactions.created_success') });
      setForm({
        type: 'exchange',
        sourceWalletId: defaultSourceId,
        destWalletId: defaultDestId,
        sourceAmount: '',
        destAmount: '',
        fee: '0',
        transactionId: '',
        customerId: '',
        note: '',
      });
      setReceiptPreviewUrl(null);
      if (clearDraftToEdit) clearDraftToEdit();
    } else {
      setMessage({ type: 'error', text: res.error || t('common.error') });
    }
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><ArrowLeftRight size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('transactions.title')}</h2>
          <p className="ofx-screen-desc">{t('transactions.desc')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="ofx-card">
        <div className="ofx-btn-row">
          <button type="button" className={`ofx-btn ofx-btn-outline ${isRecording ? 'ofx-recording' : ''}`} onClick={() => setIsRecording(!isRecording)}>
            {isRecording ? <Square size={14} /> : <Mic size={14} />} {isRecording ? t('transactions.voice_stop') : t('transactions.voice_button')}
          </button>
          <label className="ofx-btn ofx-btn-outline">
            <Camera size={14} /> {t('transactions.take_photo')}
            <input type="file" accept="image/*" capture="environment" onChange={handleReceiptUpload} style={{ display: 'none' }} />
          </label>
          <label className="ofx-btn ofx-btn-outline">
            <Image size={14} /> {t('transactions.choose_file')}
            <input type="file" accept="image/*" onChange={handleReceiptUpload} style={{ display: 'none' }} />
          </label>
        </div>

        {isRecording && (
          <div className="ofx-ai-loading">
            <Sparkles size={16} className="ofx-pulse" />
            <span>{t('transactions.ai_parsing')}</span>
          </div>
        )}

        {wallets.length === 0 ? (
          <div className="ofx-empty-card"><AlertCircle size={40} /><h3>{t('expenses.no_wallets')}</h3></div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="ofx-toggle-group">
              <button type="button" className={`ofx-toggle ${active.type === 'exchange' ? 'active' : ''}`} onClick={() => update({ type: 'exchange' })}>{t('transactions.exchange_label')}</button>
              <button type="button" className={`ofx-toggle ${active.type === 'deposit' ? 'active' : ''}`} onClick={() => update({ type: 'deposit' })}>{t('transactions.deposit_label')}</button>
              <button type="button" className={`ofx-toggle ${active.type === 'withdrawal' ? 'active' : ''}`} onClick={() => update({ type: 'withdrawal' })}>{t('transactions.withdrawal_label')}</button>
            </div>

            <div className="ofx-form-row">
              {active.type !== 'deposit' && (
                <div className="ofx-form-group">
                  <label>{active.type === 'withdrawal' ? t('transactions.withdrawal_label') : t('transactions.source')}</label>
                  <select className="ofx-input" value={active.sourceWalletId} onChange={(e) => update({ sourceWalletId: e.target.value })}>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                  </select>
                </div>
              )}
              {active.type !== 'withdrawal' && (
                <div className="ofx-form-group">
                  <label>{active.type === 'deposit' ? t('transactions.deposit_label') : t('transactions.dest')}</label>
                  <select className="ofx-input" value={active.destWalletId} onChange={(e) => update({ destWalletId: e.target.value })}>
                    {wallets.map(w => <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="ofx-form-row">
              {active.type !== 'deposit' && (
                <div className="ofx-form-group">
                  <label>Montant source</label>
                  <input type="number" step="any" className="ofx-input" placeholder={t('expenses.amount_placeholder')} value={active.sourceAmount} onChange={(e) => update({ sourceAmount: e.target.value })} required />
                </div>
              )}
              {active.type !== 'withdrawal' && (
                <div className="ofx-form-group">
                  <label>Montant recu</label>
                  <input type="number" step="any" className="ofx-input" placeholder={t('expenses.amount_placeholder')} value={active.destAmount} onChange={(e) => update({ destAmount: e.target.value })} required />
                </div>
              )}
            </div>

            {active.type === 'exchange' && calculatedRate > 0 && (
              <div className="ofx-rate-bar">
                <div><span>Taux pratique :</span> <strong>1 {sWallet?.currency} = {calculatedRate.toFixed(4)} {dWallet?.currency}</strong></div>
                <div><span>Marge estimée :</span> <strong className={calculatedProfitUSD >= 0 ? 'plus' : 'minus'}>{calculatedProfitUSD.toFixed(2)} USD</strong></div>
              </div>
            )}

            <div className="ofx-form-row">
              <div className="ofx-form-group">
                <label>Frais telecom (deduit)</label>
                <input type="number" step="any" className="ofx-input" value={active.fee} onChange={(e) => update({ fee: e.target.value })} />
              </div>
              <div className="ofx-form-group">
                <label>ID Reseau (Preuve/Litige)</label>
                <input type="text" className="ofx-input" placeholder="Ex: AP9841893" value={active.transactionId} onChange={(e) => update({ transactionId: e.target.value })} />
              </div>
            </div>

            <div className="ofx-form-group">
              <label>Client (optionnel)</label>
              <select className="ofx-input" value={active.customerId} onChange={(e) => update({ customerId: e.target.value })}>
                <option value="">— Aucun client —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="ofx-form-group">
              <label>Note</label>
              <textarea className="ofx-input" rows={3} value={active.note} onChange={(e) => update({ note: e.target.value })} />
            </div>

            {receiptPreviewUrl && (
              <div className="ofx-preview">
                <img src={receiptPreviewUrl} alt="Recu" />
                <button type="button" className="ofx-preview-close" onClick={() => setReceiptPreviewUrl(null)}><X size={14} /></button>
              </div>
            )}

            <button type="submit" className="ofx-btn ofx-btn-primary">
              <CheckCircle2 size={16} /> {t('transactions.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

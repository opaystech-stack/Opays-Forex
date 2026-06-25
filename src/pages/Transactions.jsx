import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeftRight, Image, Mic, Square, Sparkles, CheckCircle2, AlertCircle, Camera } from 'lucide-react';

import { useT } from '../i18n';
export default function Transactions({ draftToEdit, clearDraftToEdit }) {
  const { wallets, addTransaction, confirmDraft, convertToUSD, customers, findOrCreateCustomer } = useApp();
  const t = useT();
  
  // Form state
  const [type, setType] = useState('exchange'); // 'exchange', 'deposit', 'withdrawal'
  const [sourceWalletId, setSourceWalletId] = useState('');
  const [destWalletId, setDestWalletId] = useState('');
  const [sourceAmount, setSourceAmount] = useState('');
  const [destAmount, setDestAmount] = useState('');
  const [fee, setFee] = useState('0');
  const [transactionId, setTransactionId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [note, setNote] = useState('');
  
  // Interactive / UI states
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '' }
  const [aiLoading, setAiLoading] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null);

  // Initialize wallet dropdowns on mount if they are empty
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (wallets.length > 0 && !sourceWalletId && !destWalletId) {
      setSourceWalletId(wallets[0].id);
      setDestWalletId(wallets.length > 1 ? wallets[1].id : wallets[0].id);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [wallets, sourceWalletId, destWalletId]);

  // Pre-populate form when draftToEdit changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (draftToEdit) {
      setType(draftToEdit.type || 'exchange');
      setSourceWalletId(draftToEdit.source_wallet_id || '');
      setDestWalletId(draftToEdit.dest_wallet_id || '');
      setSourceAmount(draftToEdit.source_amount ? draftToEdit.source_amount.toString() : '');
      setDestAmount(draftToEdit.dest_amount ? draftToEdit.dest_amount.toString() : '');
      setFee(draftToEdit.fee ? draftToEdit.fee.toString() : '0');
      setTransactionId(draftToEdit.transaction_id || '');
      setCustomerId(draftToEdit.customer_id || '');
      setNote(draftToEdit.note || '');
      setReceiptPreviewUrl(null);
    } else {
      setType('exchange');
      setSourceAmount('');
      setDestAmount('');
      setFee('0');
      setTransactionId('');
      setCustomerId('');
      setNote('');
      setReceiptPreviewUrl(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [draftToEdit]);

  const sWallet = wallets.find(w => w.id === sourceWalletId);
  const dWallet = wallets.find(w => w.id === destWalletId);

  const parsedSource = parseFloat(sourceAmount) || 0;
  const parsedDest = parseFloat(destAmount) || 0;
  
  const calculatedRate = parsedSource > 0 ? parsedDest / parsedSource : 0;
  
  const sourceInUSD = sWallet ? convertToUSD(parsedSource, sWallet.currency) : 0;
  const destInUSD = dWallet ? convertToUSD(parsedDest, dWallet.currency) : 0;
  const calculatedProfitUSD = sourceInUSD - destInUSD;

  // Audio recording & OCR states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  // Convert files/blobs to base64 helper
  // eslint-disable-next-line no-unused-vars
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // eslint-disable-next-line no-unused-vars
  const callGeminiProxy = async ({ kind, prompt, mimeType, base64Data }) => {
    // Gemini/Supabase functions no longer available; throw to trigger simulation fallback
    throw new Error(t('transactions.gemini_unavailable'));
  };

  const applyGeminiResult = async (parsed) => {
    if (parsed.type) setType(parsed.type);

    const matchedSource = wallets.find(w => 
      w.name.toLowerCase().includes(parsed.sourceWalletName?.toLowerCase()) || 
      parsed.sourceWalletName?.toLowerCase().includes(w.name.toLowerCase())
    );
    const matchedDest = wallets.find(w => 
      w.name.toLowerCase().includes(parsed.destWalletName?.toLowerCase()) || 
      parsed.destWalletName?.toLowerCase().includes(w.name.toLowerCase())
    );

    if (matchedSource) setSourceWalletId(matchedSource.id);
    if (matchedDest) setDestWalletId(matchedDest.id);
    
    // Support partial extraction (asymmetric MM SMS)
    if (parsed.sourceAmount !== undefined && parsed.sourceAmount !== null) {
      setSourceAmount(parsed.sourceAmount.toString());
    } else {
      setSourceAmount('');
    }

    if (parsed.destAmount !== undefined && parsed.destAmount !== null) {
      setDestAmount(parsed.destAmount.toString());
    } else {
      setDestAmount('');
    }

    if (parsed.fee) setFee(parsed.fee.toString());
    if (parsed.transactionId) setTransactionId(parsed.transactionId.toString());
    if (parsed.note) setNote(parsed.note);

    // Auto-detect and find or create customer
    if (parsed.customerName || parsed.customerPhone) {
      const custRes = await findOrCreateCustomer({
        name: parsed.customerName,
        phone: parsed.customerPhone
      });
      if (custRes.success && custRes.data) {
        setCustomerId(custRes.data.id);
        if (custRes.isNew) {
          setMessage({
            type: 'success',
            text: t('transactions.client_auto_created').replace('{name}', custRes.data.name)
          });
          setMessage({ type: 'success', text: t('transactions.receipt_ai_simulated') });
        }
      }
    } else {
      setCustomerId('');
    }
  };

  const simulateOcrResult = async () => {
    const randomReceipt = Math.random() > 0.5 ? {
      type: 'exchange',
      sourceWalletName: 'Caisse USD Cash',
      destWalletName: 'MTN Uganda (UGX)',
      sourceAmount: '150',
      destAmount: '552000',
      fee: '0',
      transactionId: 'MTN-UG-' + Math.floor(1000000 + Math.random() * 9000000),
      note: 'Reçu simulé (clé Gemini absente dans .env) - Capture',
      customerName: 'Mama Sarah',
      customerPhone: '+256788291039'
    } : {
      type: 'exchange',
      sourceWalletName: 'Airtel Money RDC (USD)',
      destWalletName: 'Caisse UGX Cash',
      sourceAmount: '200',
      destAmount: '734000',
      fee: '2',
      transactionId: 'ART-CD-' + Math.floor(1000000 + Math.random() * 9000000),
      note: 'Reçu simulé (clé Gemini absente dans .env) - Airtel RDC',
      customerName: 'Nouveau Client Ocr',
      customerPhone: '+243888777666'
    };
    await applyGeminiResult(randomReceipt);
  };

  const simulateVoiceResult = async () => {
    await applyGeminiResult({
      type: 'exchange',
      sourceWalletName: 'Caisse USD Cash',
      destWalletName: 'MTN Uganda (UGX)',
      sourceAmount: '100',
      destAmount: '366000',
      fee: '0',
      transactionId: 'VOC-' + Math.floor(100000 + Math.random() * 900000),
      note: 'Transcription simulée (clé Gemini absente) : "Échange de 100 USD contre 366000 UGX"',
      customerName: 'Jean Kabamba',
      customerPhone: '+243999988271'
    });
  };

  // eslint-disable-next-line no-unused-vars
  const processImageWithGemini = async (file) => {
    // Real Gemini proxy removed; always use local simulation
    setAiLoading(true);
    setTimeout(async () => {
      await simulateOcrResult();
      setAiLoading(false);
      setMessage({ type: 'success', text: 'Simulé : Reçu analysé (IA distante non configurée).' });
    }, 1500);
  };

  // eslint-disable-next-line no-unused-vars
  const processAudioWithGemini = async (audioBlob) => {
    // Real Gemini proxy removed; always use local simulation
    setAiLoading(true);
    setTimeout(async () => {
      await simulateVoiceResult();
      setAiLoading(false);
      setMessage({ type: 'success', text: 'Simulé : Audio transcrit (IA distante non configurée).' });
    }, 1500);
  };

  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setReceiptPreviewUrl(URL.createObjectURL(file));
    processImageWithGemini(file);
  };

  const startRecording = async () => {
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await processAudioWithGemini(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Accès micro refusé:", err);
      setMessage({ type: 'error', text: `Impossible d'accéder au micro : ${err.message}. Saisie simulée lancée.` });
      setAiLoading(true);
      setTimeout(() => {
        simulateVoiceResult();
        setAiLoading(false);
        setMessage({ type: 'success', text: 'Simulé : Transcription vocale (micro indisponible).' });
      }, 1500);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate depending on type
    if (type === 'exchange') {
      if (!sourceWalletId || !destWalletId || !sourceAmount || !destAmount) {
        setMessage({ type: 'error', text: 'Veuillez remplir tous les champs requis pour un échange.' });
          setMessage({ type: 'error', text: t('transactions.required_exchange') });
        return;
      }
      if (sourceWalletId === destWalletId) {
        setMessage({ type: 'error', text: 'Le portefeuille de départ doit être différent de celui d\'arrivée.' });
        return;
      }
    } else if (type === 'deposit') {
      if (!destWalletId || !destAmount) {
        setMessage({ type: 'error', text: 'Veuillez renseigner le portefeuille à créditer et le montant.' });
          setMessage({ type: 'error', text: t('transactions.required_deposit') });
        return;
      }
    } else if (type === 'withdrawal') {
      if (!sourceWalletId || !sourceAmount) {
        setMessage({ type: 'error', text: 'Veuillez renseigner le portefeuille à débiter et le montant.' });
          setMessage({ type: 'error', text: t('transactions.required_withdrawal') });
        return;
      }
    }

    const payload = {
      type,
      source_wallet_id: type === 'deposit' ? null : sourceWalletId,
      dest_wallet_id: type === 'withdrawal' ? null : destWalletId,
      customer_id: customerId || null,
      source_amount: type === 'deposit' ? parseFloat(destAmount) : parseFloat(sourceAmount),
      dest_amount: type === 'withdrawal' ? parseFloat(sourceAmount) : parseFloat(destAmount),
      exchange_rate: type === 'exchange' ? parseFloat(destAmount) / parseFloat(sourceAmount) : 1.0,
      fee: parseFloat(fee) || 0,
      fee_wallet_id: type === 'deposit' ? destWalletId : sourceWalletId,
      profit_usd: type === 'exchange' ? calculatedProfitUSD : 0,
      transaction_id: transactionId || null,
      note: note || ''
    };

    let res;
    if (draftToEdit) {
      res = await confirmDraft(draftToEdit.id, payload);
    } else {
      res = await addTransaction(payload);
    }

    if (res.success) {
      setMessage({ 
        type: 'success', 
        text: draftToEdit ? t('transactions.draft_validated') : t('transactions.transaction_saved')
      });
      // Reset form
      setSourceAmount('');
      setDestAmount('');
      setFee('0');
      setTransactionId('');
      setCustomerId('');
      setNote('');
      setReceiptPreviewUrl(null);
      if (draftToEdit) {
        clearDraftToEdit();
      }
    } else {
      setMessage({ type: 'error', text: `Erreur : ${res.error}` });
      setMessage({ type: 'error', text: t('settings.rates_update_error') + res.error });
    }
  };

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title" style={{ color: draftToEdit ? 'var(--color-orange)' : 'var(--deep-navy)' }}>
          {draftToEdit ? t('transactions.validate_draft') : t('transactions.new_operation')}
        </h2>
        <p className="screen-desc">
          {draftToEdit ? t('transactions.validate_draft') : t('transactions.new_operation')}
        </p>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* A. AI Assistant shortcuts (Voice, Camera capture, Upload) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px', marginBottom: '15px' }}>
        {/* Voice recorder button */}
        {!isRecording ? (
          <button type="button" className="btn btn-outline" style={{ padding: '10px 6px', fontSize: '11px' }} onClick={startRecording} disabled={aiLoading}>
            <Mic size={14} color="var(--color-red)" />
            <span>{t('transactions.voice_button')}</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" style={{ backgroundColor: 'var(--color-red)', padding: '10px 6px', fontSize: '11px' }} onClick={stopRecording}>
            <Square size={14} />
            <span>{t('transactions.voice_stop')}</span>
          </button>
        )}

        {/* OCR Camera Photo button */}
        <label className="btn btn-outline" style={{ cursor: 'pointer', padding: '10px 6px', fontSize: '11px' }}>
          <Camera size={14} color="var(--color-green)" />
          <span>{t('transactions.take_photo')}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleReceiptUpload}
            style={{ display: 'none' }}
            disabled={aiLoading}
          />
        </label>

        {/* OCR File Upload button */}
        <label className="btn btn-outline" style={{ cursor: 'pointer', padding: '10px 6px', fontSize: '11px' }}>
          <Image size={14} color="var(--primary-blue)" />
          <span>{t('transactions.choose_file')}</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleReceiptUpload}
            style={{ display: 'none' }}
            disabled={aiLoading}
          />
        </label>
      </div>

      {aiLoading && (
        <div className="card glass-card" style={{ textAlign: 'center', padding: '15px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            <Sparkles className="navbar-icon" size={16} style={{ color: 'var(--color-primary)', animation: 'pulse 1s infinite' }} />
            <span style={{ fontSize: '13px', fontWeight: '500' }}>{t('transactions.ai_parsing')}</span>
          </div>
        </div>
      )}

      {/* B. Check Wallets List availability */}
      {wallets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <AlertCircle size={40} color="var(--color-orange)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px' }}>{t('expenses.no_wallets')}</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
            {t('expenses.no_wallets')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card">
          
          {/* Transaction Type Selector */}
          <div className="toggle-group" style={{ marginBottom: '18px', padding: '4px' }}>
            <button
              type="button"
              className={`toggle-button ${type === 'exchange' ? 'active business' : ''}`}
              onClick={() => setType('exchange')}
              style={{ fontSize: '12px', padding: '8px 6px' }}
            >
              {t('transactions.exchange_label')}
            </button>
            <button
              type="button"
              className={`toggle-button ${type === 'deposit' ? 'active' : ''}`}
              onClick={() => setType('deposit')}
              style={{ fontSize: '12px', padding: '8px 6px' }}
            >
              {t('transactions.deposit_label')}
            </button>
            <button
              type="button"
              className={`toggle-button ${type === 'withdrawal' ? 'active' : ''}`}
              onClick={() => setType('withdrawal')}
              style={{ fontSize: '12px', padding: '8px 6px' }}
            >
              {t('transactions.withdrawal_label')}
            </button>
          </div>

          {/* Wallets Dropdown Selection */}
          <div className="form-row">
            {type !== 'deposit' && (
              <div className="form-group">
                <label className="form-label">{type === 'withdrawal' ? t('transactions.withdrawal_label') : t('transactions.exchange_label')}</label>
                <select
                  className="form-control"
                  value={sourceWalletId}
                  onChange={(e) => setSourceWalletId(e.target.value)}
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                  ))}
                </select>
              </div>
            )}

            {type !== 'withdrawal' && (
              <div className="form-group">
                <label className="form-label">{type === 'deposit' ? t('transactions.deposit_label') : t('transactions.exchange_label')}</label>
                <select
                  className="form-control"
                  value={destWalletId}
                  onChange={(e) => setDestWalletId(e.target.value)}
                >
                  {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Amounts inputs */}
          <div className="form-row">
            {type !== 'deposit' && (
              <div className="form-group">
                <label className="form-label">{type === 'withdrawal' ? t('transactions.withdrawal_label') : t('transactions.exchange_label')}</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder={t('expenses.amount_placeholder')}
                  value={sourceAmount}
                  onChange={(e) => setSourceAmount(e.target.value)}
                  required
                />
              </div>
            )}

            {type !== 'withdrawal' && (
              <div className="form-group">
                <label className="form-label">{type === 'deposit' ? t('transactions.deposit_label') : t('transactions.exchange_label')}</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder={t('expenses.amount_placeholder')}
                  value={destAmount}
                  onChange={(e) => setDestAmount(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {/* Rate indicator & Profit simulation (only for exchange) */}
          {type === 'exchange' && calculatedRate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#0c1017', borderRadius: '8px', marginBottom: '16px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Taux pratiqué : </span>
                <span style={{ fontWeight: '600' }}>
                  1 {sWallet?.currency} = {calculatedRate.toFixed(4)} {dWallet?.currency}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Marge estimée : </span>
                <span style={{ fontWeight: '600', color: calculatedProfitUSD >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                  {calculatedProfitUSD.toFixed(2)} USD
                </span>
              </div>
            </div>
          )}

          {/* Transaction ID & Fee */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Frais télécom (déduit)</label>
                            <label className="form-label">Frais télécom (déduit)</label>
              <input
                type="number"
                step="any"
                className="form-control"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">ID Réseau (Preuve/Litige)</label>
                            <label className="form-label">{t('modal.txn_id_label')}</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: AP9841893"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              />
            </div>
          </div>

          {/* Customer Selection */}
          <div className="form-group">
            <label className="form-label">Client (optionnel)</label>
                        <label className="form-label">{t('modal.source_wallet')}</label>
            <select
              className="form-control"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">— Aucun client —</option>
                            <option value="">— {t('common.no')} —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? ` (${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {t('transactions.receipt_ai_simulated')}
          </p>

          {/* Note */}
          <div className="form-group">
            <label className="form-label">Note / Info Client</label>
                        <label className="form-label">{t('transactions.payment_note_placeholder')}</label>
            <input
              type="text"
              className="form-control"
              placeholder="Nom du client, WhatsApp..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Receipt Image Preview */}
          {receiptPreviewUrl && (
            <div className="receipt-preview" style={{ marginBottom: '16px' }}>
              <img src={receiptPreviewUrl} alt="Visualisation" />
              <button 
                type="button" 
                className="receipt-remove-btn" 
                onClick={() => {
                  setReceiptPreviewUrl(null);
                }}
              >
                ×
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
            {draftToEdit && (
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => {
                  clearDraftToEdit();
                  setMessage({ type: 'info', text: t('common.confirm_delete') });
                }}
                style={{ flex: 1 }}
              >
                {t('common.no')}
              </button>
            )}
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ flex: 2, backgroundColor: draftToEdit ? 'var(--color-orange)' : 'var(--primary-blue)', boxShadow: draftToEdit ? '0 6px 20px var(--color-orange-glow)' : '0 6px 20px var(--primary-blue-glow)' }}
            >
              <ArrowLeftRight size={16} />
              <span>{draftToEdit ? t('transactions.validate_draft') : t('common.save')}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

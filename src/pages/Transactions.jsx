import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../services/supabase';
import { ArrowLeftRight, Image, Mic, Square, Sparkles, CheckCircle2, AlertCircle, Camera } from 'lucide-react';
import {
  buildGeminiRequest,
  parseGeminiResponse,
  validateMediaInput,
  callGeminiWithTimeout,
  validateExtractedFields,
  simulateVoiceResult,
  simulateOcrResult,
} from '../utils/voiceAgent';

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

  // Pré-remplissage du formulaire à partir d'un jeu de données extrait (réel
  // ou Mode_Simule). Les champs absents/invalides ont déjà été vidés en amont
  // par `validateExtractedFields`. Aucune écriture définitive ici : la
  // Confirmation explicite reste requise via `handleSubmit`.
  const applyGeminiResult = async (parsed) => {
    if (parsed.type) setType(parsed.type);

    const srcName = parsed.sourceWalletName ? String(parsed.sourceWalletName).toLowerCase() : '';
    const dstName = parsed.destWalletName ? String(parsed.destWalletName).toLowerCase() : '';

    const matchedSource = srcName
      ? wallets.find(w =>
          w.name.toLowerCase().includes(srcName) || srcName.includes(w.name.toLowerCase())
        )
      : null;
    const matchedDest = dstName
      ? wallets.find(w =>
          w.name.toLowerCase().includes(dstName) || dstName.includes(w.name.toLowerCase())
        )
      : null;

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

  // Bascule Mode_Simule (capture photo / fichier) : applique un reçu simulé
  // issu du module commun `voiceAgent.js`.
  const applySimulatedOcr = async () => {
    await applyGeminiResult(simulateOcrResult());
  };

  // Bascule Mode_Simule (saisie vocale) : applique une transcription simulée
  // issue du module commun `voiceAgent.js`.
  const applySimulatedVoice = async () => {
    await applyGeminiResult(simulateVoiceResult());
  };

  // Capture photo / téléversement de fichier (Agent_Photo / Agent_Fichier).
  // Consomme le module commun `voiceAgent.js` : validation format/taille avant
  // transmission, appel proxy avec délai, parsing sûr, validation des champs.
  const processImageWithGemini = async (file) => {
    if (!supabase) {
      console.log('Supabase non configuré. Simulation OCR activée.');
      setAiLoading(true);
      setTimeout(async () => {
        await applySimulatedOcr();
        setAiLoading(false);
        setMessage({ type: 'success', text: t('transactions.receipt_ai_simulated') });
      }, 1500);
      return;
    }

    try {
      setAiLoading(true);
      const request = await buildGeminiRequest({ kind: 'ocr', wallets, file });
      const textResponse = await callGeminiWithTimeout({
        supabase,
        payload: {
          kind: request.kind,
          prompt: request.prompt,
          mimeType: request.mimeType,
          base64Data: request.base64Data,
        },
      });

      const result = parseGeminiResponse(textResponse);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const { data: cleaned } = validateExtractedFields(result.data);
      await applyGeminiResult(cleaned);
      setMessage({ type: 'success', text: t('transactions.receipt_ai_success') });
    } catch (error) {
      console.error('Erreur Gemini OCR:', error);
      setMessage({ type: 'error', text: t('transactions.gemini_error') + ': ' + (error.message || '') });
      await applySimulatedOcr();
      setMessage({ type: 'success', text: t('transactions.receipt_ai_simulated') });
    } finally {
      setAiLoading(false);
    }
  };

  // Saisie vocale (Agent_Vocal) : consomme le module commun `voiceAgent.js`.
  const processAudioWithGemini = async (audioBlob) => {
    if (!supabase) {
      console.log('Supabase non configuré. Simulation vocale activée.');
      setAiLoading(true);
      setTimeout(async () => {
        await applySimulatedVoice();
        setAiLoading(false);
        setMessage({ type: 'success', text: t('transactions.receipt_ai_simulated') });
      }, 1500);
      return;
    }

    try {
      setAiLoading(true);
      const request = await buildGeminiRequest({ kind: 'audio', wallets, blob: audioBlob });
      const textResponse = await callGeminiWithTimeout({
        supabase,
        payload: {
          kind: request.kind,
          prompt: request.prompt,
          mimeType: request.mimeType,
          base64Data: request.base64Data,
        },
      });

      const result = parseGeminiResponse(textResponse);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const { data: cleaned } = validateExtractedFields(result.data);
      await applyGeminiResult(cleaned);
      setMessage({ type: 'success', text: t('transactions.receipt_ai_success') });
    } catch (error) {
      console.error('Erreur Gemini Audio:', error);
      setMessage({ type: 'error', text: t('transactions.gemini_error') + ': ' + (error.message || '') });
      await applySimulatedVoice();
      setMessage({ type: 'success', text: t('transactions.receipt_ai_simulated') });
    } finally {
      setAiLoading(false);
    }
  };

  const handleReceiptUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validation format/taille AVANT toute transmission au Gemini_Proxy
    // (rejet format non supporté ou taille > 10 Mo, sans appel proxy).
    const validation = validateMediaInput({ mimeType: file.type, sizeBytes: file.size });
    if (!validation.ok) {
      setMessage({ type: 'error', text: validation.error });
      e.target.value = '';
      return;
    }

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
      setMessage({ type: 'error', text: t('transactions.mic_denied') + ' ' + (err.message || '') });
      setAiLoading(true);
      setTimeout(async () => {
        await applySimulatedVoice();
        setAiLoading(false);
        setMessage({ type: 'success', text: t('transactions.receipt_ai_simulated') });
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
    setMessage(null);

    // Validation des champs requis selon le type d'opération.
    if (type === 'exchange') {
      if (!sourceWalletId || !destWalletId || !sourceAmount || !destAmount) {
        setMessage({ type: 'error', text: t('transactions.required_exchange') });
        return;
      }
      if (sourceWalletId === destWalletId) {
        setMessage({ type: 'error', text: t('transactions.same_wallet_error') });
        return;
      }
    } else if (type === 'deposit') {
      if (!destWalletId || !destAmount) {
        setMessage({ type: 'error', text: t('transactions.required_deposit') });
        return;
      }
    } else if (type === 'withdrawal') {
      if (!sourceWalletId || !sourceAmount) {
        setMessage({ type: 'error', text: t('transactions.required_withdrawal') });
        return;
      }
    }

    // Validation de caisse (point 3) : pour un échange ou un prélèvement, le
    // montant qui SORT de la caisse source (+ frais éventuels) ne peut dépasser
    // son solde disponible. Blocage immédiat avec alerte claire.
    if (type === 'exchange' || type === 'withdrawal') {
      const outWallet = wallets.find((w) => w.id === sourceWalletId);
      const outAmount = parseFloat(sourceAmount) || 0;
      const feeOnSource = parseFloat(fee) || 0;
      if (outWallet) {
        const available = Number(outWallet.balance) || 0;
        if (outAmount + feeOnSource > available) {
          setMessage({
            type: 'error',
            text: `${t('transactions.cash_limit_block')} ${t('transactions.balance_available')} : ${available.toLocaleString()} ${outWallet.currency}.`,
          });
          return;
        }
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
      setMessage({ type: 'error', text: `${t('settings.rates_update_error')}${res.error}` });
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
          
          {/* Sélecteur d'opération — 3 grandes cartes explicites avec exemple */}
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ marginBottom: '10px' }}>
              {t('transactions.choose_operation')}
            </label>
            <div style={{ display: 'grid', gap: '8px' }}>
              {[
                { id: 'exchange', titleKey: 'op_exchange_title', descKey: 'op_exchange_desc', exKey: 'op_exchange_example' },
                { id: 'deposit', titleKey: 'op_deposit_title', descKey: 'op_deposit_desc', exKey: 'op_deposit_example' },
                { id: 'withdrawal', titleKey: 'op_withdrawal_title', descKey: 'op_withdrawal_desc', exKey: 'op_withdrawal_example' },
              ].map((op) => {
                const active = type === op.id;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setType(op.id)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: active ? '2px solid var(--primary-blue)' : '1px solid var(--border-color)',
                      background: active ? 'rgba(79, 70, 229, 0.06)' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {t(`transactions.${op.titleKey}`)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {t(`transactions.${op.descKey}`)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', fontStyle: 'italic' }}>
                      {t(`transactions.${op.exKey}`)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section ÉCHANGE : ce que le client donne / ce qu'il reçoit */}
          {type === 'exchange' && (
            <>
              <div className="card" style={{ background: '#F8FAFC', padding: '14px', marginBottom: '12px' }}>
                <div className="form-label" style={{ color: 'var(--primary-blue)' }}>
                  {t('transactions.give_section')}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('transactions.wallet_give_label')}</label>
                  <select className="form-control" value={sourceWalletId} onChange={(e) => setSourceWalletId(e.target.value)}>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                    ))}
                  </select>
                  {sWallet && (
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {t('transactions.balance_available')} : {Number(sWallet.balance).toLocaleString()} {sWallet.currency}
                    </p>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('transactions.amount_give_label')}</label>
                  <input type="number" step="any" className="form-control" placeholder={t('expenses.amount_placeholder')} value={sourceAmount} onChange={(e) => setSourceAmount(e.target.value)} required />
                </div>
              </div>

              <div className="card" style={{ background: '#F8FAFC', padding: '14px', marginBottom: '12px' }}>
                <div className="form-label" style={{ color: 'var(--color-green)' }}>
                  {t('transactions.receive_section')}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('transactions.wallet_receive_label')}</label>
                  <select className="form-control" value={destWalletId} onChange={(e) => setDestWalletId(e.target.value)}>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('transactions.amount_receive_label')}</label>
                  <input type="number" step="any" className="form-control" placeholder={t('expenses.amount_placeholder')} value={destAmount} onChange={(e) => setDestAmount(e.target.value)} required />
                </div>
              </div>
            </>
          )}

          {/* Section RENFORCEMENT : une seule caisse à approvisionner */}
          {type === 'deposit' && (
            <div className="card" style={{ background: '#F8FAFC', padding: '14px', marginBottom: '12px' }}>
              <div className="form-group">
                <label className="form-label">{t('transactions.deposit_wallet_label')}</label>
                <select className="form-control" value={destWalletId} onChange={(e) => setDestWalletId(e.target.value)}>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('transactions.deposit_amount_label')}</label>
                <input type="number" step="any" className="form-control" placeholder={t('expenses.amount_placeholder')} value={destAmount} onChange={(e) => setDestAmount(e.target.value)} required />
              </div>
            </div>
          )}

          {/* Section PRÉLÈVEMENT : une seule caisse à débiter */}
          {type === 'withdrawal' && (
            <div className="card" style={{ background: '#F8FAFC', padding: '14px', marginBottom: '12px' }}>
              <div className="form-group">
                <label className="form-label">{t('transactions.withdrawal_wallet_label')}</label>
                <select className="form-control" value={sourceWalletId} onChange={(e) => setSourceWalletId(e.target.value)}>
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.currency})</option>
                  ))}
                </select>
                {sWallet && (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {t('transactions.balance_available')} : {Number(sWallet.balance).toLocaleString()} {sWallet.currency}
                  </p>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('transactions.withdrawal_amount_label')}</label>
                <input type="number" step="any" className="form-control" placeholder={t('expenses.amount_placeholder')} value={sourceAmount} onChange={(e) => setSourceAmount(e.target.value)} required />
              </div>
            </div>
          )}

          {/* Indicateur de taux & marge (échange uniquement) */}
          {type === 'exchange' && calculatedRate > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#EEF2F7', borderRadius: '8px', marginBottom: '16px', fontSize: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>{t('transactions.rate_practiced')} : </span>
                <span style={{ fontWeight: '600' }}>
                  1 {sWallet?.currency} = {calculatedRate.toFixed(4)} {dWallet?.currency}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>{t('transactions.margin_estimated')} : </span>
                <span style={{ fontWeight: '600', color: calculatedProfitUSD >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                  {calculatedProfitUSD.toFixed(2)} USD
                </span>
              </div>
            </div>
          )}

          {/* Frais télécom & ID réseau */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('transactions.fee_label')}</label>
              <input type="number" step="any" className="form-control" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('modal.txn_id_label')}</label>
              <input type="text" className="form-control" placeholder="Ex: AP9841893" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
            </div>
          </div>

          {/* Sélection du client */}
          <div className="form-group">
            <label className="form-label">{t('transactions.customer_label')}</label>
            <select className="form-control" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— {t('transactions.customer_none')} —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.phone ? ` (${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div className="form-group">
            <label className="form-label">{t('transactions.note_label')}</label>
            <input type="text" className="form-control" placeholder={t('transactions.payment_note_placeholder')} value={note} onChange={(e) => setNote(e.target.value)} />
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

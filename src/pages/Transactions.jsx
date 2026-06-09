import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../services/supabase';
import { ArrowLeftRight, Image, Mic, Square, Sparkles, CheckCircle2, AlertCircle, Camera } from 'lucide-react';

export default function Transactions({ draftToEdit, clearDraftToEdit }) {
  const { wallets, addTransaction, confirmDraft, convertToUSD, customers, findOrCreateCustomer } = useApp();
  
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
      setReceiptPreviewUrl(draftToEdit.image_url || null);
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

  const callGeminiProxy = async ({ kind, prompt, mimeType, base64Data }) => {
    if (!supabase) {
      throw new Error('Supabase non configuré');
    }

    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body: { kind, prompt, mimeType, base64Data }
    });

    if (error) {
      throw error;
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Erreur Gemini proxy');
    }

    return data.text;
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
            text: `Nouveau client "${custRes.data.name}" créé automatiquement à partir du reçu.`
          });
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

  const processImageWithGemini = async (file) => {
    if (!supabase) {
      console.log('Supabase non configuré. Simulation OCR activée.');
      setAiLoading(true);
      setTimeout(async () => {
        await simulateOcrResult();
        setAiLoading(false);
        setMessage({ type: 'success', text: 'Simulé : Reçu analysé (configuration Supabase absente).' });
      }, 1500);
      return;
    }

    try {
      setAiLoading(true);
      const base64Data = await fileToBase64(file);
      const prompt = `Tu es un assistant comptable expert pour un bureau de change Forex et Mobile Money.
Analyse cette capture d'écran de reçu ou message de transaction. Extrais les informations requises et renvoie-les sous la forme d'un objet JSON brut. Le JSON doit suivre exactement ce format :
{
  "type": "exchange", // Mettre "exchange" par défaut
  "sourceWalletName": "Nom exact du portefeuille de départ si l'opérateur a ENVOYÉ des fonds",
  "destWalletName": "Nom exact du portefeuille d'arrivée si l'opérateur a REÇU des fonds",
  "sourceAmount": "Montant débité/envoyé (nombre ou null)",
  "destAmount": "Montant crédité/reçu (nombre ou null)",
  "fee": "Frais réseau s'ils sont indiqués, sinon 0",
  "transactionId": "ID unique de la transaction (réseau)",
  "customerName": "Nom complet du client s'il est mentionné dans le reçu/SMS ou si l'on peut l'identifier",
  "customerPhone": "Numéro de téléphone du client s'il est mentionné dans le reçu/SMS",
  "note": "Note courte décrivant la transaction (ex: 'Transféré à ZAMWANA')"
}

Les portefeuilles disponibles dans l'application sont :
${wallets.map(w => `- ${w.name}`).join('\n')}

INSTRUCTIONS CRITIQUES POUR LES CAPTURES MOBILE MONEY A SENS UNIQUE :
Les captures d'écran SMS de Mobile Money ne contiennent généralement que les détails de l'envoi réseau (ex: "transferred to [Name] at [Date]" ou "You have received [Amount] from [Name] [Phone]").
- Si le SMS indique que l'opérateur a ENVOYÉ/TRANSFÉRÉ de l'argent :
  * Définis "sourceWalletName" comme le portefeuille Mobile Money correspondant (ex: MTN Uganda, Airtel Money).
  * Définis "sourceAmount" comme le montant transféré.
  * Laisse "destWalletName" et "destAmount" à null (l'opérateur complétera manuellement la devise/montant cash qu'il a reçue du client).
  * Extrais le nom et téléphone du destinataire dans "customerName" et "customerPhone".
- Si le SMS indique que l'opérateur a REÇU/DÉPOSÉ de l'argent :
  * Définis "destWalletName" comme le portefeuille Mobile Money correspondant.
  * Définis "destAmount" comme le montant reçu.
  * Laisse "sourceWalletName" et "sourceAmount" à null.
  * Extrais le nom et téléphone de l'expéditeur dans "customerName" et "customerPhone".

Associe la transaction aux portefeuilles correspondants en faisant une recherche floue.
Réponds uniquement avec le JSON valide, sans balises markdown, sans texte d'introduction ni de conclusion.`;

      const textResponse = await callGeminiProxy({
        kind: 'ocr',
        prompt,
        mimeType: file.type || 'image/jpeg',
        base64Data
      });

      let cleanedText = textResponse.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '');
      }

      const parsed = JSON.parse(cleanedText.trim());
      await applyGeminiResult(parsed);
      setMessage({ type: 'success', text: 'Reçu analysé par l\'IA Gemini avec succès ! Complétez les champs manquants.' });
    } catch (error) {
      console.error("Erreur Gemini OCR:", error);
      setMessage({ type: 'error', text: `Erreur d'analyse réelle Gemini : ${error.message}. Bascule en simulation.` });
      await simulateOcrResult();
    } finally {
      setAiLoading(false);
    }
  };

  const processAudioWithGemini = async (audioBlob) => {
    if (!supabase) {
      console.log('Supabase non configuré. Simulation vocale activée.');
      setAiLoading(true);
      setTimeout(async () => {
        await simulateVoiceResult();
        setAiLoading(false);
        setMessage({ type: 'success', text: 'Simulé : Audio transcrit (configuration Supabase absente).' });
      }, 1500);
      return;
    }

    try {
      setAiLoading(true);
      const base64Data = await fileToBase64(audioBlob);
      const prompt = `Tu es un assistant de saisie vocale pour l'application Forex Ledger.
Écoute cet enregistrement audio décrivant une transaction financière (ex: "échange de 100 dollars contre 365 000 shillings" ou "j'ai reçu 10 dollars cash" ou "retrait de 5000 shillings sur MTN").
Extrais les informations requises et renvoie-les sous la forme d'un objet JSON brut. Le JSON doit suivre exactement ce format :
{
  "type": "exchange", // Ou "deposit" ou "withdrawal" en fonction du contexte
  "sourceWalletName": "Nom du portefeuille de départ si l'opérateur paye/donne/débite",
  "destWalletName": "Nom du portefeuille d'arrivée si l'opérateur reçoit/crédite",
  "sourceAmount": "Montant donné (nombre ou null)",
  "destAmount": "Montant reçu/remis (nombre ou null)",
  "fee": "Frais s'ils sont indiqués, sinon 0",
  "transactionId": "ID unique s'il est mentionné, sinon null",
  "customerName": "Nom du client s'il est mentionné dans l'audio, sinon null",
  "customerPhone": "Téléphone du client s'il est mentionné dans l'audio, sinon null",
  "note": "Note ou transcription résumée de l'audio"
}

Les portefeuilles disponibles dans l'application sont :
${wallets.map(w => `- ${w.name}`).join('\n')}

Associe les montants aux portefeuilles les plus proches de la liste.
Réponds uniquement avec le JSON valide, sans balises markdown, sans texte d'introduction ni de conclusion.`;

      const textResponse = await callGeminiProxy({
        kind: 'audio',
        prompt,
        mimeType: 'audio/webm',
        base64Data
      });

      let cleanedText = textResponse.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '');
      }

      const parsed = JSON.parse(cleanedText.trim());
      await applyGeminiResult(parsed);
      setMessage({ type: 'success', text: 'Commande vocale analysée par l\'IA Gemini avec succès !' });
    } catch (error) {
      console.error("Erreur Gemini Audio:", error);
      setMessage({ type: 'error', text: `Erreur vocale réelle Gemini : ${error.message}. Bascule en simulation.` });
      await simulateVoiceResult();
    } finally {
      setAiLoading(false);
    }
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
        return;
      }
      if (sourceWalletId === destWalletId) {
        setMessage({ type: 'error', text: 'Le portefeuille de départ doit être différent de celui d\'arrivée.' });
        return;
      }
    } else if (type === 'deposit') {
      if (!destWalletId || !destAmount) {
        setMessage({ type: 'error', text: 'Veuillez renseigner le portefeuille à créditer et le montant.' });
        return;
      }
    } else if (type === 'withdrawal') {
      if (!sourceWalletId || !sourceAmount) {
        setMessage({ type: 'error', text: 'Veuillez renseigner le portefeuille à débiter et le montant.' });
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
      note: note || '',
      image_url: receiptPreviewUrl || (draftToEdit ? draftToEdit.image_url : null)
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
        text: draftToEdit 
          ? 'Brouillon validé avec succès et soldes mis à jour !' 
          : 'Transaction enregistrée et soldes mis à jour !' 
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
    }
  };

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title" style={{ color: draftToEdit ? 'var(--color-orange)' : 'var(--deep-navy)' }}>
          {draftToEdit ? 'Validation Brouillon' : 'Nouvelle Opération'}
        </h2>
        <p className="screen-desc">
          {draftToEdit 
            ? 'Vérifier et compléter les détails du brouillon avant validation.' 
            : 'Saisir un échange de devises, un renforcement de fonds ou un retrait.'}
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
            <span>Saisie Vocale</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" style={{ backgroundColor: 'var(--color-red)', padding: '10px 6px', fontSize: '11px' }} onClick={stopRecording}>
            <Square size={14} />
            <span>Fin écoute</span>
          </button>
        )}

        {/* OCR Camera Photo button */}
        <label className="btn btn-outline" style={{ cursor: 'pointer', padding: '10px 6px', fontSize: '11px' }}>
          <Camera size={14} color="var(--color-green)" />
          <span>Prendre Photo</span>
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
          <span>Choisir Fichier</span>
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
            <span style={{ fontSize: '13px', fontWeight: '500' }}>L'IA analyse le fichier...</span>
          </div>
        </div>
      )}

      {/* B. Check Wallets List availability */}
      {wallets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <AlertCircle size={40} color="var(--color-orange)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '8px' }}>Aucune caisse disponible</h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
            Veuillez d'abord créer vos caisses (ex: Caisse USD, MTN UGX) dans le menu dédié « Portefeuilles » pour pouvoir enregistrer une transaction.
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
              Échange Forex
            </button>
            <button
              type="button"
              className={`toggle-button ${type === 'deposit' ? 'active' : ''}`}
              onClick={() => setType('deposit')}
              style={{ fontSize: '12px', padding: '8px 6px' }}
            >
              Renforcement (+)
            </button>
            <button
              type="button"
              className={`toggle-button ${type === 'withdrawal' ? 'active' : ''}`}
              onClick={() => setType('withdrawal')}
              style={{ fontSize: '12px', padding: '8px 6px' }}
            >
              Prélèvement (-)
            </button>
          </div>

          {/* Wallets Dropdown Selection */}
          <div className="form-row">
            {type !== 'deposit' && (
              <div className="form-group">
                <label className="form-label">{type === 'withdrawal' ? 'Caisse Débitée' : 'Client Donne (Source)'}</label>
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
                <label className="form-label">{type === 'deposit' ? 'Caisse Créditée' : 'Client Reçoit (Dest)'}</label>
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
                <label className="form-label">{type === 'withdrawal' ? 'Montant Prélèvement' : 'Montant Donné'}</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Ex: 100"
                  value={sourceAmount}
                  onChange={(e) => setSourceAmount(e.target.value)}
                  required
                />
              </div>
            )}

            {type !== 'withdrawal' && (
              <div className="form-group">
                <label className="form-label">{type === 'deposit' ? 'Montant Apporté' : 'Montant Remis'}</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  placeholder="Ex: 365000"
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
            <label className="form-label">Client associé (optionnel)</label>
            <select
              className="form-control"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">— Aucun client associé —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? ` (${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Note */}
          <div className="form-group">
            <label className="form-label">Note / Info Client</label>
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
                  setMessage({ type: 'info', text: 'Édition du brouillon annulée.' });
                }}
                style={{ flex: 1 }}
              >
                Annuler
              </button>
            )}
            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ flex: 2, backgroundColor: draftToEdit ? 'var(--color-orange)' : 'var(--primary-blue)', boxShadow: draftToEdit ? '0 6px 20px var(--color-orange-glow)' : '0 6px 20px var(--primary-blue-glow)' }}
            >
              <ArrowLeftRight size={16} />
              <span>{draftToEdit ? 'Valider le Brouillon' : 'Enregistrer'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

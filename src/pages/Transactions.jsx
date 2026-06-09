import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeftRight, Image, Mic, Square, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Transactions({ draftToEdit, clearDraftToEdit }) {
  const { wallets, addTransaction, confirmDraft, convertToUSD } = useApp();
  
  // Form state
  const [sourceWalletId, setSourceWalletId] = useState('');
  const [destWalletId, setDestWalletId] = useState('');
  const [sourceAmount, setSourceAmount] = useState('');
  const [destAmount, setDestAmount] = useState('');
  const [fee, setFee] = useState('0');
  const [transactionId, setTransactionId] = useState('');
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
      setSourceWalletId(draftToEdit.source_wallet_id || '');
      setDestWalletId(draftToEdit.dest_wallet_id || '');
      setSourceAmount(draftToEdit.source_amount ? draftToEdit.source_amount.toString() : '');
      setDestAmount(draftToEdit.dest_amount ? draftToEdit.dest_amount.toString() : '');
      setFee(draftToEdit.fee ? draftToEdit.fee.toString() : '0');
      setTransactionId(draftToEdit.transaction_id || '');
      setNote(draftToEdit.note || '');
      setReceiptPreviewUrl(draftToEdit.image_url || null);
    } else {
      setSourceAmount('');
      setDestAmount('');
      setFee('0');
      setTransactionId('');
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

  const applyGeminiResult = (parsed) => {
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
    
    if (parsed.sourceAmount) setSourceAmount(parsed.sourceAmount.toString());
    if (parsed.destAmount) setDestAmount(parsed.destAmount.toString());
    if (parsed.fee) setFee(parsed.fee.toString());
    if (parsed.transactionId) setTransactionId(parsed.transactionId.toString());
    if (parsed.note) setNote(parsed.note);
  };

  const simulateOcrResult = () => {
    const randomReceipt = Math.random() > 0.5 ? {
      sourceWalletName: 'Caisse USD Cash',
      destWalletName: 'MTN Uganda (UGX)',
      sourceAmount: '150',
      destAmount: '552000',
      fee: '0',
      transactionId: 'MTN-UG-' + Math.floor(1000000 + Math.random() * 9000000),
      note: 'Reçu simulé (clé Gemini absente dans .env) - Capture'
    } : {
      sourceWalletName: 'Airtel Money RDC (USD)',
      destWalletName: 'Caisse UGX Cash',
      sourceAmount: '200',
      destAmount: '734000',
      fee: '2',
      transactionId: 'ART-CD-' + Math.floor(1000000 + Math.random() * 9000000),
      note: 'Reçu simulé (clé Gemini absente dans .env) - Airtel RDC'
    };
    applyGeminiResult(randomReceipt);
  };

  const simulateVoiceResult = () => {
    applyGeminiResult({
      sourceWalletName: 'Caisse USD Cash',
      destWalletName: 'MTN Uganda (UGX)',
      sourceAmount: '100',
      destAmount: '366000',
      fee: '0',
      transactionId: 'VOC-' + Math.floor(100000 + Math.random() * 900000),
      note: 'Transcription simulée (clé Gemini absente) : "Échange de 100 USD contre 366000 UGX"'
    });
  };

  const processImageWithGemini = async (file) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.log('Gemini API Key missing. Simulating OCR.');
      setAiLoading(true);
      setTimeout(() => {
        simulateOcrResult();
        setAiLoading(false);
        setMessage({ type: 'success', text: 'Simulé : Reçu analysé (clé API absente).' });
      }, 1500);
      return;
    }

    try {
      setAiLoading(true);
      const base64Data = await fileToBase64(file);
      const prompt = `Tu es un assistant comptable expert pour un bureau de change Forex et Mobile Money.
Analyse cette capture d'écran de reçu ou message de transaction. Extrais les informations requises et renvoie-les sous la forme d'un objet JSON brut. Le JSON doit suivre exactement ce format :
{
  "sourceWalletName": "Nom exact du portefeuille source",
  "destWalletName": "Nom exact du portefeuille destination",
  "sourceAmount": "Montant envoyé",
  "destAmount": "Montant reçu",
  "fee": "Frais s'ils sont indiqués, sinon 0",
  "transactionId": "ID unique de la transaction (réseau)",
  "note": "Note courte décrivant la transaction ou le client"
}

Les portefeuilles disponibles dans l'application sont :
${wallets.map(w => `- ${w.name}`).join('\n')}

Associe la transaction aux portefeuilles correspondants.
Si une information n'est pas présente, laisse le champ à "" ou 0 pour fee. Réponds uniquement avec le JSON valide, sans balises markdown, sans texte d'introduction ni de conclusion.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: file.type || 'image/jpeg',
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`API Gemini retournée : ${response.statusText}`);
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error("Pas de réponse de Gemini");
      }

      let cleanedText = textResponse.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '');
      }

      const parsed = JSON.parse(cleanedText.trim());
      applyGeminiResult(parsed);
      setMessage({ type: 'success', text: 'Reçu analysé par l\'IA Gemini avec succès !' });
    } catch (error) {
      console.error("Erreur Gemini OCR:", error);
      setMessage({ type: 'error', text: `Erreur d'analyse réelle Gemini : ${error.message}. Bascule en simulation.` });
      simulateOcrResult();
    } finally {
      setAiLoading(false);
    }
  };

  const processAudioWithGemini = async (audioBlob) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.log('Gemini API Key missing. Simulating Voice transcription.');
      setAiLoading(true);
      setTimeout(() => {
        simulateVoiceResult();
        setAiLoading(false);
        setMessage({ type: 'success', text: 'Simulé : Audio transcrit (clé API absente).' });
      }, 1500);
      return;
    }

    try {
      setAiLoading(true);
      const base64Data = await fileToBase64(audioBlob);
      const prompt = `Tu es un assistant de saisie vocale pour l'application Forex Ledger.
Écoute cet enregistrement audio décrivant une transaction financière (ex: "échange de 100 dollars contre 365 000 shillings" ou "retrait de 5000 shillings sur MTN").
Extrais les informations requises et renvoie-les sous la forme d'un objet JSON brut. Le JSON doit suivre exactement ce format :
{
  "sourceWalletName": "Nom du portefeuille de départ",
  "destWalletName": "Nom du portefeuille d'arrivée",
  "sourceAmount": "Montant donné",
  "destAmount": "Montant reçu/remis",
  "fee": "Frais s'ils sont indiqués, sinon 0",
  "transactionId": "ID unique s'il est mentionné, sinon null",
  "note": "Note ou transcription résumée de l'audio"
}

Les portefeuilles disponibles dans l'application sont :
${wallets.map(w => `- ${w.name}`).join('\n')}

Associe les montants aux portefeuilles les plus proches de la liste.
Réponds uniquement avec le JSON valide, sans balises markdown, sans texte d'introduction ni de conclusion.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: 'audio/webm',
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`API Gemini retournée : ${response.statusText}`);
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error("Pas de réponse de Gemini");
      }

      let cleanedText = textResponse.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/```$/, '');
      }

      const parsed = JSON.parse(cleanedText.trim());
      applyGeminiResult(parsed);
      setMessage({ type: 'success', text: 'Commande vocale analysée par l\'IA Gemini avec succès !' });
    } catch (error) {
      console.error("Erreur Gemini Audio:", error);
      setMessage({ type: 'error', text: `Erreur vocale réelle Gemini : ${error.message}. Bascule en simulation.` });
      simulateVoiceResult();
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
    if (!sourceWalletId || !destWalletId || !sourceAmount || !destAmount) {
      setMessage({ type: 'error', text: 'Veuillez remplir les champs obligatoires.' });
      return;
    }

    if (sourceWalletId === destWalletId) {
      setMessage({ type: 'error', text: 'Le portefeuille de départ doit être différent de celui d\'arrivée.' });
      return;
    }

    const payload = {
      source_wallet_id: sourceWalletId,
      dest_wallet_id: destWalletId,
      source_amount: parseFloat(sourceAmount),
      dest_amount: parseFloat(destAmount),
      exchange_rate: parseFloat(destAmount) / parseFloat(sourceAmount),
      fee: parseFloat(fee) || 0,
      fee_wallet_id: sourceWalletId,
      profit_usd: calculatedProfitUSD,
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
          {draftToEdit ? 'Validation Brouillon' : 'Nouvelle Transaction'}
        </h2>
        <p className="screen-desc">
          {draftToEdit 
            ? 'Vérifier et compléter les détails du brouillon avant validation.' 
            : 'Échange de devises ou transfert de fonds mobile money.'}
        </p>
      </div>

      {message && (
        <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* A. AI Assistant shortcuts (Voice & Screenshot) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
        {/* Voice recorder button */}
        {!isRecording ? (
          <button type="button" className="btn btn-outline" onClick={startRecording} disabled={aiLoading}>
            <Mic size={16} color="var(--color-red)" />
            <span>Saisie Vocale</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary" style={{ backgroundColor: 'var(--color-red)' }} onClick={stopRecording}>
            <Square size={16} />
            <span style={{ fontSize: '12px' }}>En écoute... (Fin)</span>
          </button>
        )}

        {/* OCR Screenshot button */}
        <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
          <Image size={16} color="var(--color-primary)" />
          <span>Scanner Reçu</span>
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

      {/* B. Transaction Form */}
      <form onSubmit={handleSubmit} className="card">
        {/* Source Wallet selection */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Client Donne (Source)</label>
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

          <div className="form-group">
            <label className="form-label">Client Reçoit (Destination)</label>
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
        </div>

        {/* Amounts */}
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Montant Donné</label>
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

          <div className="form-group">
            <label className="form-label">Montant Remis</label>
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
        </div>

        {/* Rate indicator & Profit simulation */}
        {calculatedRate > 0 && (
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
            <label className="form-label">ID Réseau (Litiges)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Ex: AP9841893"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </div>
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
            <span>{draftToEdit ? 'Valider le Brouillon' : 'Enregistrer la Transaction'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}

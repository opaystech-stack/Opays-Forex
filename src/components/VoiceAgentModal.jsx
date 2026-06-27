import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Sparkles, CheckCircle2, AlertCircle, X, Search, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../services/supabase';
import {
  buildGeminiRequest,
  parseGeminiResponse,
  callGeminiWithTimeout,
  validateExtractedFields,
  interpretReminderIntent,
  simulateVoiceResult,
} from '../utils/voiceAgent';
import { matchCustomer } from '../utils/customerMatching';
import { buildReminders, runReminderBatch } from '../services/reminderService';
import { computeExchangeRate, computeOperationAmounts } from '../utils/finance';
import { createAgentRegistry, canExecuteProposal, isCriticalAction } from '../utils/agentRegistry';
import { useT } from '../i18n';

// États du flux de l'agent vocal.
const PHASE = {
  STARTING: 'starting', // démarrage du micro (≤ 2 s — Ex. 10.4)
  LISTENING: 'listening', // écoute en cours
  PROCESSING: 'processing', // transcription/analyse Gemini
  REVIEW: 'review', // Transcription affichée + Confirmation (Ex. 10.6, 5.5)
  ERROR: 'error', // échec démarrage / refus micro (Ex. 10.5, 5.6)
};

// Seuil de confiance minimal pour un enregistrement automatique (Ex. 12.2).
const MIN_CONFIDENCE = 0.8;

// Registre_Agents partagé : l'Agent_Vocal est un Agent_IA recensé (type `forex`)
// dont toute proposition d'Operation est une Action_Critique soumise à validation
// humaine explicite avant exécution (Req 15.1, 15.2, 15.3, 15.6).
const VOICE_AGENT_REGISTRY = createAgentRegistry();
const VOICE_AGENT_TYPE = 'forex';
// Genre d'Action_Critique proposé par l'Agent_Vocal lors d'une opération (Req 15.3).
const OPERATION_ACTION_KIND = 'operation.creer';

// Détermine l'action interprétée à partir des données extraites :
//   - 'search'    : recherche d'historique (client mentionné, sans opération exploitable)
//   - 'operation' : enregistrement d'une opération (cas par défaut)
const interpretAction = (parsed, invalidFields) => {
  const hasCustomer =
    (typeof parsed.customerName === 'string' && parsed.customerName.trim() !== '') ||
    (typeof parsed.customerPhone === 'string' && parsed.customerPhone.trim() !== '');
  const amountsInvalid =
    invalidFields.includes('sourceAmount') && invalidFields.includes('destAmount');

  if (hasCustomer && amountsInvalid) return 'search';
  return 'operation';
};

// Modal de l'Agent_Vocal lancé depuis la Barre_Actions_Dashboard.
//
// Responsabilités (cf. design Components/Interfaces #3) :
//   - Démarrer l'écoute micro en ≤ 2 s via navigator.mediaDevices.getUserMedia
//     (même mécanique que `startRecording` de Transactions.jsx) — Ex. 10.4.
//   - Transcrire via `voiceAgent.js` (kind 'audio' → callGeminiWithTimeout →
//     parseGeminiResponse → validateExtractedFields) — Ex. 5.x.
//   - Afficher la Transcription PUIS une Confirmation présentant l'action
//     interprétée (opération OU recherche d'historique), avec validation /
//     annulation explicite AVANT toute exécution — Ex. 10.6, 5.5.
//   - Sur refus micro / échec de démarrage : message d'erreur, dashboard
//     inchangé (état local au modal), bascule Mode_Simule — Ex. 10.5, 5.6.
//
// Props :
//   open               : booléen d'ouverture
//   onClose            : fermeture du modal
//   onConfirmOperation : (payload) => void — sinon `addTransaction` (AppContext)
//   onSearchHistory    : (query) => void — recherche d'historique
//
// Charte_Graphique : classes existantes (`modal-overlay`, `modal-content`,
// `card`, `btn`, `alert`...) et variables CSS `var(--...)`.
export default function VoiceAgentModal({ open, onClose, onConfirmOperation, onSearchHistory }) {
  const { wallets, addTransaction, findOrCreateCustomer, convertToUSD, customers, loans, logReminder, user } =
    useApp();
  const t = useT();

  const [phase, setPhase] = useState(PHASE.STARTING);
  const [message, setMessage] = useState(null); // { type: 'error' | 'success' | 'info', text }
  const [simulated, setSimulated] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [invalidFields, setInvalidFields] = useState([]);
  const [actionKind, setActionKind] = useState('operation');
  const [submitting, setSubmitting] = useState(false);

  // Ajustement des taux AVANT Confirmation (Req 7.1, 7.2, 7.7) : champs éditables
  // pour le Taux_Change et le Taux_Service (%), recalculés via les fonctions pures
  // de `finance.js`. Saisis en chaînes pour préserver l'état d'édition partiel.
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [serviceRateInput, setServiceRateInput] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const startTimerRef = useRef(null);

  // Arrête proprement le flux micro et le recorder éventuels.
  const cleanupRecording = useCallback(() => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* no-op */
      }
    }
    recorderRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Construit le résultat de revue à partir de données extraites (réel ou
  // Mode_Simule) : transcription + champs validés + action interprétée.
  const buildReview = useCallback((parsed) => {
    const { invalidFields: invalid, data: cleaned } = validateExtractedFields(parsed);
    setParsedData({ ...cleaned, customerName: parsed.customerName, customerPhone: parsed.customerPhone });
    setInvalidFields(invalid);
    // Pré-renseigne le Taux_Change proposé à partir des montants extraits
    // (dest/source) pour permettre son ajustement avant Confirmation (Req 7.1, 7.7).
    // Le Taux_Service par défaut est 0 (module désactivé → no-op, Req 7.8).
    const seed = computeExchangeRate(cleaned.sourceAmount, cleaned.destAmount);
    setExchangeRateInput(seed.ok ? String(seed.rate) : '');
    setServiceRateInput('');
    // Intention « relance » prioritaire si détectée (Ex. 6.1) ; sinon on
    // conserve l'interprétation opération/recherche existante (non-régression).
    const reminderIntent = interpretReminderIntent(parsed);
    setActionKind(reminderIntent.isReminder ? 'reminder' : interpretAction(parsed, invalid));
    setTranscription(typeof parsed.note === 'string' ? parsed.note : '');
    setPhase(PHASE.REVIEW);
  }, []);

  // Bascule Mode_Simule : applique une transcription simulée (Ex. 5.6, 10.5).
  const fallbackToSimulation = useCallback(
    (errorText) => {
      cleanupRecording();
      setSimulated(true);
      if (errorText) setMessage({ type: 'error', text: errorText });
      buildReview(simulateVoiceResult());
    },
    [buildReview, cleanupRecording]
  );

  // Transcrit l'audio capté via le module commun `voiceAgent.js`.
  const processAudio = useCallback(
    async (audioBlob) => {
      setPhase(PHASE.PROCESSING);

      if (!supabase) {
        // Supabase non configuré : Mode_Simule direct (parité Transactions.jsx).
        fallbackToSimulation(null);
        setMessage({ type: 'info', text: t('voice_agent.simulated_notice') });
        return;
      }

      try {
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

        cleanupRecording();
        setSimulated(false);
        buildReview(result.data);
      } catch (error) {
        // Timeout / erreur proxy / réponse non analysable → Mode_Simule,
        // transcription simulée conservée pour consultation (Ex. 5.7, 4.6).
        fallbackToSimulation(t('voice_agent.transcription_error') + ' ' + (error.message || ''));
      }
    },
    [buildReview, cleanupRecording, fallbackToSimulation, t, wallets]
  );

  // Démarre l'écoute micro (≤ 2 s) — même mécanique que startRecording.
  const startListening = useCallback(async () => {
    setPhase(PHASE.STARTING);
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        await processAudio(audioBlob);
      };

      recorder.start();
      recorderRef.current = recorder;
      setPhase(PHASE.LISTENING);
    } catch (err) {
      // Refus micro / échec de démarrage : message d'erreur, dashboard
      // inchangé, bascule Mode_Simule (Ex. 5.6, 10.5).
      setPhase(PHASE.ERROR);
      fallbackToSimulation(t('voice_agent.mic_denied') + ' ' + (err && err.message ? err.message : ''));
    }
  }, [fallbackToSimulation, processAudio, t]);

  // À l'ouverture : démarre l'écoute dans le budget de 2 s (Ex. 10.4).
  useEffect(() => {
    if (!open) return undefined;

    // Réinitialise l'état à chaque ouverture (synchronisation volontaire à
    // l'événement d'ouverture du modal).
    /* eslint-disable react-hooks/set-state-in-effect */
    setPhase(PHASE.STARTING);
    setMessage(null);
    setSimulated(false);
    setTranscription('');
    setParsedData(null);
    setInvalidFields([]);
    setActionKind('operation');
    setSubmitting(false);
    setExchangeRateInput('');
    setServiceRateInput('');
    /* eslint-enable react-hooks/set-state-in-effect */

    startListening();

    return () => {
      cleanupRecording();
    };
  }, [open, startListening, cleanupRecording]);

  if (!open) return null;

  // Arrêt manuel de l'écoute → déclenche la transcription.
  const handleStopListening = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      // Aucun recorder actif : bascule Mode_Simule par sécurité.
      fallbackToSimulation(null);
    }
  };

  // Fermeture du modal : nettoie l'enregistrement et conserve le dashboard.
  const handleClose = () => {
    cleanupRecording();
    onClose && onClose();
  };

  // Résolution des portefeuilles à partir des noms extraits (fuzzy match),
  // comme `applyGeminiResult` de Transactions.jsx.
  const matchWallet = (rawName) => {
    if (!rawName) return null;
    const name = String(rawName).toLowerCase();
    return (
      wallets.find(
        (w) => w.name.toLowerCase().includes(name) || name.includes(w.name.toLowerCase())
      ) || null
    );
  };

  // Confiance jugée insuffisante (Ex. 12.2).
  const lowConfidence =
    parsedData &&
    typeof parsedData.confidence === 'number' &&
    parsedData.confidence < MIN_CONFIDENCE;

  // L'ajustement des taux ne concerne que les opérations de change (Req 7.1, 7.7).
  const isExchangeOperation = actionKind === 'operation' && parsedData && parsedData.type === 'exchange';

  // Taux_Service saisi : chaîne vide ⇒ 0 (no-op, Req 7.8) ; sinon valeur numérique.
  const serviceRateValue = serviceRateInput.trim() === '' ? 0 : Number(serviceRateInput);

  // Recalcul pur du Montant_Service et du montant converti à partir des taux
  // ajustés, via `computeOperationAmounts` (Req 7.3, 7.7). N'est calculé que pour
  // une opération de change dont le montant source est exploitable.
  const recomputed =
    isExchangeOperation && !invalidFields.includes('sourceAmount')
      ? computeOperationAmounts({
          sourceAmount: Number(parsedData.sourceAmount),
          exchangeRate: Number(exchangeRateInput),
          serviceRate: serviceRateValue,
          destDecimals: 2,
        })
      : null;

  // Échec de validation des taux ajustés (Req 7.4, 7.5).
  const exchangeRateInvalid =
    isExchangeOperation && (!Number.isFinite(Number(exchangeRateInput)) || Number(exchangeRateInput) <= 0);
  const serviceRateInvalid =
    isExchangeOperation &&
    (!Number.isFinite(serviceRateValue) || serviceRateValue < 0 || serviceRateValue > 100);
  const rateInvalid = exchangeRateInvalid || serviceRateInvalid;

  // La Confirmation reste bloquée tant qu'un champ obligatoire est invalide,
  // que la confiance est insuffisante (Ex. 5.4, 12.2) ou qu'un taux ajusté est
  // invalide (Req 7.4, 7.5).
  const operationBlocked =
    actionKind === 'operation' && (invalidFields.length > 0 || lowConfidence || rateInvalid);

  // Déclenchement d'une relance par commande vocale (Ex. 6.1, 6.2).
  //
  // Résout le Client via `matchCustomer` (réutilisé du rattachement existant) :
  //   - correspondance unique  → construit la relance (source « vocale ») via
  //     buildReminders puis l'envoie via runReminderBatch (logReminder injecté,
  //     trigger_source 'voice' porté par le service) ; confirmation visuelle ;
  //   - ambiguïté ou aucune correspondance → AUCUN envoi, signalement de
  //     l'ambiguïté à l'opérateur (Ex. 6.2).
  const handleReminder = async () => {
    if (!parsedData || submitting) return;
    setSubmitting(true);
    try {
      const { match, ambiguous } = matchCustomer(customers, {
        name: parsedData.customerName,
        phone: parsedData.customerPhone,
      });

      // Pas de Client unique → pas d'envoi + signalement (Ex. 6.2).
      if (!match || ambiguous) {
        setMessage({ type: 'error', text: t('reminders.voice_ambiguous') });
        setSubmitting(false);
        return;
      }

      // Compose la relance pour le Client résolu. Le contenu vocal est traité en
      // texte libre (verbatim) à partir de la transcription ; la source de
      // déclenchement « vocale » est enregistrée par le service (Ex. 6.3).
      const { reminders } = buildReminders({
        scenario: 'personalized',
        customers: [match],
        loans,
        freeText: transcription,
        triggerSource: 'voice',
      });

      if (reminders.length === 0) {
        setMessage({ type: 'error', text: t('reminders.voice_ambiguous') });
        setSubmitting(false);
        return;
      }

      const summary = await runReminderBatch({
        supabase,
        reminders,
        logReminder,
      });

      if (summary && summary.sent > 0) {
        setMessage({ type: 'success', text: t('reminders.voice_triggered') });
        handleClose();
        return;
      }

      // Aucun envoi abouti : cause d'échec issue du premier résultat.
      const firstError =
        summary && Array.isArray(summary.results) && summary.results[0]
          ? summary.results[0].error
          : '';
      setMessage({
        type: 'error',
        text: t('reminders.error_msg') + (firstError ? ' ' + firstError : ''),
      });
      setSubmitting(false);
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('reminders.error_msg') + ' ' + (error.message || ''),
      });
      setSubmitting(false);
    }
  };

  // Validation explicite : exécute l'action interprétée (Ex. 5.5, 10.6).
  const handleConfirm = async () => {
    if (!parsedData || submitting) return;

    if (actionKind === 'reminder') {
      await handleReminder();
      return;
    }

    if (actionKind === 'search') {
      const query =
        (parsedData.customerName && String(parsedData.customerName).trim()) ||
        (parsedData.customerPhone && String(parsedData.customerPhone).trim()) ||
        '';
      onSearchHistory && onSearchHistory(query);
      handleClose();
      return;
    }

    if (operationBlocked) return;

    // Validation humaine préalable à l'Action_Critique (Req 15.3, 15.4) : la
    // proposition de l'Agent_Vocal (Agent_IA recensé au Registre_Agents) n'est
    // exécutée QUE si une Confirmation explicite est donnée. Le clic sur
    // « Confirmer » constitue cette Confirmation par l'Utilisateur en session.
    const agentRecognized = VOICE_AGENT_REGISTRY.agents.some((a) => a.type === VOICE_AGENT_TYPE);
    const confirmedBy = agentRecognized ? (user && user.id) || VOICE_AGENT_TYPE : null;
    const proposal = { kind: OPERATION_ACTION_KIND };
    if (isCriticalAction(proposal.kind) && !canExecuteProposal({ action: proposal, confirmedBy })) {
      setMessage({ type: 'error', text: t('voice_agent.confirm_required') });
      return;
    }

    setSubmitting(true);
    try {
      const parsed = parsedData;
      const sourceWallet = matchWallet(parsed.sourceWalletName);
      const destWallet = matchWallet(parsed.destWalletName);
      const type = parsed.type || 'exchange';

      // Rattachement_Client avant enregistrement (Ex. 5.8).
      let customerId = null;
      if (parsed.customerName || parsed.customerPhone) {
        const custRes = await findOrCreateCustomer({
          name: parsed.customerName,
          phone: parsed.customerPhone,
        });
        if (custRes && custRes.success && custRes.data) {
          customerId = custRes.data.id;
        }
      }

      const sourceAmount = parseFloat(parsed.sourceAmount) || 0;

      // Pour une opération de change, applique les taux ajustés : le montant
      // converti et le Montant_Service proviennent du recalcul pur (Req 7.7) ;
      // le Taux_Change effectif est la valeur saisie/ajustée (Req 7.1).
      const useAdjusted = type === 'exchange' && recomputed && recomputed.ok;
      const destAmount = useAdjusted ? recomputed.destAmount : parseFloat(parsed.destAmount) || 0;
      const exchangeRate = useAdjusted
        ? Number(exchangeRateInput)
        : type === 'exchange' && sourceAmount > 0
        ? destAmount / sourceAmount
        : 1.0;
      const montantService = useAdjusted ? recomputed.montantService : 0;

      const sourceCurrency = sourceWallet ? sourceWallet.currency : null;
      const destCurrency = destWallet ? destWallet.currency : null;

      // Le Montant_Service prélevé est compté en bénéfice de l'Agence (Req 7.3,
      // hypothèse Q3). À Taux_Service nul, montantService = 0 ⇒ aucun effet
      // (non-régression, Req 7.8 / 18.4).
      const serviceProfitUSD =
        montantService > 0 && sourceCurrency ? convertToUSD(montantService, sourceCurrency) : 0;

      const profitUSD =
        type === 'exchange' && sourceCurrency && destCurrency
          ? convertToUSD(sourceAmount, sourceCurrency) - convertToUSD(destAmount, destCurrency) + serviceProfitUSD
          : 0;

      const payload = {
        type,
        source_wallet_id: type === 'deposit' ? null : sourceWallet ? sourceWallet.id : null,
        dest_wallet_id: type === 'withdrawal' ? null : destWallet ? destWallet.id : null,
        customer_id: customerId,
        source_amount: type === 'deposit' ? destAmount : sourceAmount,
        dest_amount: type === 'withdrawal' ? sourceAmount : destAmount,
        exchange_rate: type === 'exchange' ? exchangeRate : 1.0,
        service_rate: type === 'exchange' ? serviceRateValue : 0,
        service_amount: montantService,
        fee: parseFloat(parsed.fee) || 0,
        fee_wallet_id: type === 'deposit'
          ? destWallet && destWallet.id
          : sourceWallet && sourceWallet.id,
        profit_usd: type === 'exchange' ? profitUSD : 0,
        transaction_id: parsed.transactionId || null,
        note: parsed.note || '',
      };

      const res = onConfirmOperation
        ? await onConfirmOperation(payload)
        : await addTransaction(payload);

      if (res && res.success === false) {
        setMessage({ type: 'error', text: (res.error || t('voice_agent.save_error')) });
        setSubmitting(false);
        return;
      }

      setMessage({ type: 'success', text: t('voice_agent.saved') });
      handleClose();
    } catch (error) {
      setMessage({ type: 'error', text: t('voice_agent.save_error') + ' ' + (error.message || '') });
      setSubmitting(false);
    }
  };

  // Libellé lisible du type d'opération.
  const typeLabel = (type) => {
    if (type === 'exchange') return t('transactions.exchange_label');
    if (type === 'deposit') return t('transactions.deposit_label');
    if (type === 'withdrawal') return t('transactions.withdrawal_label');
    return type || '—';
  };

  const fieldValue = (value) =>
    value === undefined || value === null || value === '' ? '—' : String(value);

  return (
    <div className="modal-overlay voice-agent-overlay mobile-sheet-overlay" onClick={handleClose}>
      <div
        className="modal-content voice-agent-content mobile-sheet-content"
        role="dialog"
        aria-modal="true"
        aria-label={t('voice_agent.title')}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            <Mic size={18} style={{ marginRight: '8px', verticalAlign: 'middle', color: 'var(--primary-blue)' }} />
            {t('voice_agent.title')}
          </h3>
          <button className="modal-close" aria-label={t('voice_agent.close')} onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        {message && (
          <div
            className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}
            role="status"
          >
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Phase : démarrage / écoute */}
        {(phase === PHASE.STARTING || phase === PHASE.LISTENING) && (
          <div className="card glass-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                className="mic-btn-vibrant"
                style={{
                  animation: phase === PHASE.LISTENING ? 'micPulse 1.6s infinite' : 'none',
                  background: phase === PHASE.LISTENING ? 'var(--indigo-strong)' : '#94A3B8',
                  cursor: phase === PHASE.LISTENING ? 'pointer' : 'default',
                  marginBottom: '8px'
                }}
                disabled={phase === PHASE.STARTING}
                onClick={phase === PHASE.LISTENING ? handleStopListening : undefined}
                aria-label="Microphone"
              >
                <Mic size={24} />
              </button>

              {phase === PHASE.LISTENING && (
                <div className="sound-wave" aria-label="Visualisation de la voix">
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                  <div className="bar"></div>
                </div>
              )}

              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {phase === PHASE.LISTENING ? t('voice_agent.listening') : t('voice_agent.starting')}
              </span>
              {phase === PHASE.LISTENING && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ backgroundColor: 'var(--color-red)' }}
                  onClick={handleStopListening}
                >
                  <Square size={16} />
                  <span>{t('voice_agent.stop')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Phase : analyse / transcription */}
        {phase === PHASE.PROCESSING && (
          <div className="card glass-card" style={{ textAlign: 'center', padding: '30px 16px' }}>
            <div className="ai-processing-loader">
              <div className="loader-ring"></div>
              <Sparkles size={24} className="sparkle-anim" />
            </div>
            <p style={{ fontSize: '14px', fontWeight: 500, marginTop: '16px', color: 'var(--indigo-strong)' }}>
              {t('voice_agent.processing')}
            </p>
          </div>
        )}

        {/* Phase : revue (Transcription puis Confirmation) */}
        {phase === PHASE.REVIEW && parsedData && (
          <div>
            {simulated && (
              <p className="screen-desc" style={{ marginTop: 0 }}>
                {t('voice_agent.simulated_notice')}
              </p>
            )}

            {/* 1) Transcription textuelle (Ex. 10.6) */}
            <div className="card" style={{ marginBottom: '14px' }}>
              <div className="form-label" style={{ marginBottom: '6px' }}>
                {t('voice_agent.transcription_title')}
              </div>
              <p
                data-testid="voice-agent-transcription"
                style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5 }}
              >
                {transcription || t('voice_agent.no_transcription')}
              </p>
            </div>

            {/* 2) Confirmation de l'action interprétée (Ex. 5.5, 10.6) */}
            <div className="card" data-testid="voice-agent-confirmation">
              <div
                className="form-label"
                style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {actionKind === 'search' ? (
                  <Search size={14} />
                ) : actionKind === 'reminder' ? (
                  <Send size={14} />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {actionKind === 'search'
                  ? t('voice_agent.action_search')
                  : actionKind === 'reminder'
                  ? t('reminders.title')
                  : t('voice_agent.action_operation')}
              </div>

              {actionKind === 'search' ? (
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {t('voice_agent.search_query')} :{' '}
                  <strong>
                    {fieldValue(parsedData.customerName || parsedData.customerPhone)}
                  </strong>
                </p>
              ) : actionKind === 'reminder' ? (
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
                  {t('reminders.action_relaunch')} :{' '}
                  <strong>
                    {fieldValue(parsedData.customerName || parsedData.customerPhone)}
                  </strong>
                </p>
              ) : (
                <>
                <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                  <ConfirmRow
                    label={t('voice_agent.field_type')}
                    value={typeLabel(parsedData.type)}
                    invalid={invalidFields.includes('type')}
                  />
                  <ConfirmRow
                    label={t('voice_agent.field_source')}
                    value={fieldValue(parsedData.sourceWalletName)}
                    invalid={invalidFields.includes('sourceWalletName')}
                  />
                  <ConfirmRow
                    label={t('voice_agent.field_dest')}
                    value={fieldValue(parsedData.destWalletName)}
                    invalid={invalidFields.includes('destWalletName')}
                  />
                  <ConfirmRow
                    label={t('voice_agent.field_source_amount')}
                    value={fieldValue(parsedData.sourceAmount)}
                    invalid={invalidFields.includes('sourceAmount')}
                  />
                  <ConfirmRow
                    label={t('voice_agent.field_dest_amount')}
                    value={fieldValue(parsedData.destAmount)}
                    invalid={invalidFields.includes('destAmount')}
                  />
                  <ConfirmRow
                    label={t('voice_agent.field_fee')}
                    value={fieldValue(parsedData.fee)}
                    invalid={invalidFields.includes('fee')}
                  />
                  <ConfirmRow
                    label={t('voice_agent.field_customer')}
                    value={fieldValue(parsedData.customerName || parsedData.customerPhone)}
                  />
                </div>

                {/* Ajustement des taux avant Confirmation (Req 7.1, 7.2, 7.7).
                    Réservé aux opérations de change ; recalcul pur via finance.js. */}
                {isExchangeOperation && (
                  <div
                    data-testid="voice-agent-rate-adjust"
                    style={{ marginTop: '12px', display: 'grid', gap: '10px' }}
                  >
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" htmlFor="voice-exchange-rate">
                        {t('voice_agent.adjust_exchange_rate')}
                      </label>
                      <input
                        id="voice-exchange-rate"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        className="form-input"
                        data-testid="voice-agent-exchange-rate"
                        aria-label={t('voice_agent.field_exchange_rate')}
                        value={exchangeRateInput}
                        onChange={(e) => setExchangeRateInput(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" htmlFor="voice-service-rate">
                        {t('voice_agent.adjust_service_rate')}
                      </label>
                      <input
                        id="voice-service-rate"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max="100"
                        step="any"
                        className="form-input"
                        data-testid="voice-agent-service-rate"
                        aria-label={t('voice_agent.field_service_rate')}
                        placeholder="0"
                        value={serviceRateInput}
                        onChange={(e) => setServiceRateInput(e.target.value)}
                      />
                    </div>

                    {/* Restitution du recalcul (Montant_Service + montant converti). */}
                    {recomputed && recomputed.ok && (
                      <div style={{ display: 'grid', gap: '6px', fontSize: '13px' }}>
                        <ConfirmRow
                          label={t('voice_agent.service_amount')}
                          value={fieldValue(recomputed.montantService)}
                        />
                        <ConfirmRow
                          label={t('voice_agent.converted_amount')}
                          value={fieldValue(recomputed.destAmount)}
                        />
                      </div>
                    )}

                    {/* Messages d'invalidité des taux ajustés (Req 7.4, 7.5). */}
                    {exchangeRateInvalid && (
                      <p
                        className="screen-desc"
                        data-testid="voice-agent-rate-error"
                        style={{ color: 'var(--color-red)', margin: 0 }}
                      >
                        {t('voice_agent.invalid_exchange_rate')}
                      </p>
                    )}
                    {serviceRateInvalid && (
                      <p
                        className="screen-desc"
                        style={{ color: 'var(--color-red)', margin: 0 }}
                      >
                        {t('voice_agent.invalid_service_rate')}
                      </p>
                    )}
                  </div>
                )}
                </>
              )}

              {operationBlocked && (
                <p
                  className="screen-desc"
                  data-testid="voice-agent-blocked"
                  style={{ color: 'var(--color-red)', marginBottom: 0 }}
                >
                  {lowConfidence
                    ? t('voice_agent.low_confidence')
                    : t('voice_agent.missing_fields')}
                </p>
              )}

              {/* Rappel : toute Operation proposée par l'Agent_Vocal est une
                  Action_Critique exigeant une validation humaine explicite
                  avant enregistrement (Req 15.3). */}
              {actionKind === 'operation' && (
                <p
                  className="screen-desc"
                  data-testid="voice-agent-human-validation"
                  style={{ marginBottom: 0, marginTop: '8px' }}
                >
                  {t('voice_agent.confirm_required')}
                </p>
              )}
            </div>

            {/* Validation / annulation explicite (Ex. 5.5, 10.6) */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1 }}
                onClick={handleClose}
                disabled={submitting}
              >
                {t('voice_agent.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="voice-agent-confirm"
                style={{ flex: 2, backgroundColor: 'var(--primary-blue)' }}
                onClick={handleConfirm}
                disabled={submitting || operationBlocked}
              >
                <CheckCircle2 size={16} />
                <span>{t('voice_agent.confirm')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Phase : erreur de démarrage (la bascule Mode_Simule mène ensuite à REVIEW) */}
        {phase === PHASE.ERROR && (
          <div className="card" style={{ textAlign: 'center', padding: '20px 16px' }}>
            <AlertCircle size={32} color="var(--color-orange)" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
              {t('voice_agent.error_generic')}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="voice-agent-restart"
              style={{ backgroundColor: 'var(--color-red)' }}
              onClick={startListening}
            >
              <Mic size={16} />
              <span>{t('voice_agent.restart')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Ligne d'un champ de Confirmation ; signale visuellement un champ invalide.
function ConfirmRow({ label, value, invalid }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '12px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '4px',
      }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          color: invalid ? 'var(--color-red)' : 'var(--text-primary)',
          textAlign: 'right',
        }}
      >
        {value}
        {invalid ? ' ⚠' : ''}
      </span>
    </div>
  );
}

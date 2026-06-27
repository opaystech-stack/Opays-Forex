// Module logique d'agent vocal/IA réutilisable (extrait de Transactions.jsx).
//
// Objectif : factoriser la logique aujourd'hui inline dans `Transactions.jsx`
// pour la partager entre la page Transactions et le bouton « Agent vocal »
// du tableau de bord, sans dupliquer.
//
// Les helpers de parsing/validation sont purs et testables ; les fonctions à
// effet réseau reçoivent `supabase` en paramètre. Le contrat de l'edge function
// `gemini-proxy` reste inchangé.

// --- Constantes de validation ----------------------------------------------

// Types MIME acceptés pour les médias (capture photo / fichier) — Ex. 6.2, 7.6.
export const ALLOWED_MEDIA_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

// Taille maximale d'un média : 10 Mo.
export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;

// Bornes des montants d'opération.
export const AMOUNT_MIN = 0.01;
export const AMOUNT_MAX = 999999999.99;

// Bornes des frais.
export const FEE_MIN = 0;
export const FEE_MAX = 999999999.99;

// Champs obligatoires d'un jeu de données extrait par un agent.
export const REQUIRED_EXTRACTED_FIELDS = [
  'type',
  'sourceWalletName',
  'destWalletName',
  'sourceAmount',
  'destAmount',
];

// Délai d'appel par défaut au Gemini_Proxy (agents vocal/photo/fichier).
export const DEFAULT_GEMINI_TIMEOUT_MS = 30000;

// --- Conversion fichier/blob -> base64 --------------------------------------

// Convertit un File/Blob en chaîne base64 (sans le préfixe data-URL).
export const fileToBase64 = (file) => {
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

// --- Construction des prompts -----------------------------------------------

// Prompt de saisie vocale (transcription audio -> opération).
export const buildAudioPrompt = (wallets = []) => {
  return `Tu es un assistant de saisie vocale pour l'application OpaysFox.
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
  "intent": "reminder" UNIQUEMENT si l'opérateur demande explicitement de relancer/rappeler/contacter un client par message (ex: "relance Jean Kabamba", "envoie un rappel à Marie"), sinon null,
  "note": "Note ou transcription résumée de l'audio"
}

Les portefeuilles disponibles dans l'application sont :
${wallets.map((w) => `- ${w.name}`).join('\n')}

Associe les montants aux portefeuilles les plus proches de la liste.
Réponds uniquement avec le JSON valide, sans balises markdown, sans texte d'introduction ni de conclusion.`;
};

// Prompt OCR (capture photo / fichier reçu -> opération).
export const buildOcrPrompt = (wallets = []) => {
  return `Tu es un assistant comptable expert pour un bureau de change Forex et Mobile Money.
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
${wallets.map((w) => `- ${w.name}`).join('\n')}

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
};

// --- Construction de la requête Gemini --------------------------------------

// Construit la requête Gemini selon le kind ('audio' | 'ocr' | 'file').
// Retourne { kind, prompt, mimeType, base64Data }.
// Asynchrone car la conversion base64 du média l'est.
export const buildGeminiRequest = async ({ kind, wallets = [], file, blob }) => {
  if (kind === 'audio') {
    const base64Data = blob ? await fileToBase64(blob) : null;
    return {
      kind: 'audio',
      prompt: buildAudioPrompt(wallets),
      mimeType: 'audio/webm',
      base64Data,
    };
  }

  // kind === 'ocr' | 'file' : même prompt OCR, mimeType issu du fichier.
  const base64Data = file ? await fileToBase64(file) : null;
  return {
    kind,
    prompt: buildOcrPrompt(wallets),
    mimeType: (file && file.type) || 'image/jpeg',
    base64Data,
  };
};

// --- Parsing sûr de la réponse Gemini ---------------------------------------

// Retire les balises markdown (```), puis JSON.parse de façon sûre.
// Ne lève JAMAIS d'exception.
// Retourne { ok: true, data } pour un JSON valide, sinon { ok: false, error }.
export const parseGeminiResponse = (text) => {
  if (typeof text !== 'string') {
    return { ok: false, error: 'Réponse vide ou invalide' };
  }

  let cleanedText = text.trim();
  if (cleanedText.length === 0) {
    return { ok: false, error: 'Réponse vide ou invalide' };
  }

  // Retrait des balises markdown (```json ... ``` ou ``` ... ```).
  if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '');
  }

  cleanedText = cleanedText.trim();
  if (cleanedText.length === 0) {
    return { ok: false, error: 'Réponse vide ou invalide' };
  }

  try {
    const data = JSON.parse(cleanedText);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'Réponse JSON inattendue' };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Analyse JSON impossible' };
  }
};

// --- Validation format/taille du média --------------------------------------

// Valide le type MIME et la taille avant transmission au Gemini_Proxy.
// N'effectue AUCUN appel proxy. Retourne { ok: true } ou { ok: false, error }.
export const validateMediaInput = ({ mimeType, sizeBytes } = {}) => {
  if (!ALLOWED_MEDIA_TYPES.includes(mimeType)) {
    return {
      ok: false,
      error: `Format non supporté. Formats acceptés : ${ALLOWED_MEDIA_TYPES.join(', ')}.`,
    };
  }

  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size > MAX_MEDIA_SIZE_BYTES) {
    return {
      ok: false,
      error: `Fichier trop volumineux. Taille maximale : ${MAX_MEDIA_SIZE_BYTES} octets (10 Mo).`,
    };
  }

  return { ok: true };
};

// --- Appel proxy avec délai (timeout) ---------------------------------------

// Appelle l'edge function `gemini-proxy` avec un délai maximal.
// Utilise AbortController + Promise.race ; lève en cas de délai dépassé ou
// d'erreur, permettant à l'appelant de basculer en Mode_Simule.
// Retourne le texte de réponse (data.text) en cas de succès.
export const callGeminiWithTimeout = ({ supabase, payload, timeoutMs = DEFAULT_GEMINI_TIMEOUT_MS }) => {
  if (!supabase) {
    return Promise.reject(new Error('Supabase non configuré'));
  }

  const controller = new AbortController();
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Délai dépassé (${timeoutMs} ms)`));
    }, timeoutMs);
  });

  const invokePromise = supabase.functions
    .invoke('gemini-proxy', {
      body: payload,
      signal: controller.signal,
    })
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erreur Gemini');
      return data.text;
    });

  return Promise.race([invokePromise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

// --- Validation des champs extraits par les agents --------------------------

// Vrai si `value` est un montant numérique fini dans [min, max].
const isAmountInBounds = (value, min, max) => {
  if (value === undefined || value === null || value === '') return false;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return false;
  return parsed >= min && parsed <= max;
};

// Vrai si `value` est une chaîne non vide (après trim).
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

// Valide un jeu de données d'opération extrait par un agent.
// Les champs obligatoires (type, sourceWalletName, destWalletName,
// sourceAmount, destAmount) absents ou hors bornes — ainsi que `fee` hors
// bornes — sont marqués invalides et laissés vides dans `data`.
// Retourne { invalidFields, data } où `invalidFields` est la liste des champs
// invalides et `data` une copie nettoyée (champs invalides vidés).
export const validateExtractedFields = (data) => {
  const source = data && typeof data === 'object' ? data : {};
  const cleaned = { ...source };
  const invalidFields = [];

  const markInvalid = (field) => {
    invalidFields.push(field);
    cleaned[field] = '';
  };

  // type : non vide.
  if (!isNonEmptyString(source.type)) {
    markInvalid('type');
  }

  // portefeuilles source/destination : noms non vides.
  if (!isNonEmptyString(source.sourceWalletName)) {
    markInvalid('sourceWalletName');
  }
  if (!isNonEmptyString(source.destWalletName)) {
    markInvalid('destWalletName');
  }

  // montants source/destination : dans [0,01 ; 999 999 999,99].
  if (!isAmountInBounds(source.sourceAmount, AMOUNT_MIN, AMOUNT_MAX)) {
    markInvalid('sourceAmount');
  }
  if (!isAmountInBounds(source.destAmount, AMOUNT_MIN, AMOUNT_MAX)) {
    markInvalid('destAmount');
  }

  // frais : optionnels, mais s'ils sont fournis ils doivent être dans
  // [0 ; 999 999 999,99]. Un frais absent/vide est toléré (valeur 0 par défaut).
  if (source.fee !== undefined && source.fee !== null && source.fee !== '') {
    if (!isAmountInBounds(source.fee, FEE_MIN, FEE_MAX)) {
      markInvalid('fee');
    }
  }

  return { invalidFields, data: cleaned };
};

// --- Interprétation de l'intention « relance » ------------------------------
//
// Ajout ADDITIF et non destructif : ne modifie ni l'extraction d'opération ni
// l'interprétation recherche/opération existantes. Détecte si une commande
// vocale exprime une intention de relance client (Service_Relance), à partir du
// résultat déjà analysé par `parseGeminiResponse`.
//
// Feature: whatsapp-client-reminders (Exigences 6.1, 6.2)

// Mots-clés déclenchant une intention de relance (fr/en), insensibles à la casse.
export const REMINDER_INTENT_KEYWORDS = [
  'relance',
  'relancer',
  'rappel',
  'rappelle',
  'reminder',
  'remind',
  'follow up',
  'follow-up',
  'followup',
];

// Détermine si la commande vocale exprime une intention de « relance » client.
//
// Deux signaux combinés (OU) :
//   1. champ explicite `intent === 'reminder'` renvoyé par Gemini (prompt audio) ;
//   2. présence d'un mot-clé de relance dans la note/transcription (repli robuste
//      lorsque le modèle n'a pas posé le champ `intent`).
//
// Retourne { isReminder, customerName, customerPhone } sans effet de bord.
export const interpretReminderIntent = (parsed) => {
  const data = parsed && typeof parsed === 'object' ? parsed : {};

  const explicit =
    typeof data.intent === 'string' && data.intent.trim().toLowerCase() === 'reminder';

  const haystack = [data.intent, data.action, data.note]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const keywordMatch = REMINDER_INTENT_KEYWORDS.some((kw) => haystack.includes(kw));

  return {
    isReminder: explicit || keywordMatch,
    customerName: typeof data.customerName === 'string' ? data.customerName : null,
    customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : null,
  };
};

// --- Données de repli (Mode_Simule) -----------------------------------------

// Reçu simulé (clé Gemini absente / proxy indisponible) — capture photo/fichier.
export const simulateOcrResult = () => {
  return Math.random() > 0.5
    ? {
        type: 'exchange',
        sourceWalletName: 'Caisse USD Cash',
        destWalletName: 'MTN Uganda (UGX)',
        sourceAmount: '150',
        destAmount: '552000',
        fee: '0',
        transactionId: 'MTN-UG-' + Math.floor(1000000 + Math.random() * 9000000),
        note: 'Reçu simulé (clé Gemini absente dans .env) - Capture',
        customerName: 'Mama Sarah',
        customerPhone: '+256788291039',
      }
    : {
        type: 'exchange',
        sourceWalletName: 'Airtel Money RDC (USD)',
        destWalletName: 'Caisse UGX Cash',
        sourceAmount: '200',
        destAmount: '734000',
        fee: '2',
        transactionId: 'ART-CD-' + Math.floor(1000000 + Math.random() * 9000000),
        note: 'Reçu simulé (clé Gemini absente dans .env) - Airtel RDC',
        customerName: 'Nouveau Client Ocr',
        customerPhone: '+243888777666',
      };
};

// Transcription vocale simulée (clé Gemini absente / micro indisponible).
export const simulateVoiceResult = () => {
  return {
    type: 'exchange',
    sourceWalletName: 'Caisse USD Cash',
    destWalletName: 'MTN Uganda (UGX)',
    sourceAmount: '100',
    destAmount: '366000',
    fee: '0',
    transactionId: 'VOC-' + Math.floor(100000 + Math.random() * 900000),
    note: 'Transcription simulée (clé Gemini absente) : "Échange de 100 USD contre 366000 UGX"',
    customerName: 'Jean Kabamba',
    customerPhone: '+243999988271',
  };
};

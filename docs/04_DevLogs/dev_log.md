# Journal de Développement - Forex & Mobile Money Tracker

## 2026-06-09 - Audit Technique & Révision de la Feuille de Route (V1 Online + WhatsApp)

### Jalons
*   **Audit Complet Réalisé** : Identification de l'incompatibilité des triggers PostgreSQL avec les brouillons non validés. Identification des restrictions RLS posant problème en mode anonyme.
*   **Réorientation Technique** : Simplification confirmée (100% en ligne direct sur Supabase).
*   **Planification en Phases** : Définition de 4 phases claires pour stabiliser l'application, implémenter les brouillons, connecter l'API Gemini réelle et packager en PWA.

### Décisions d'Architecture Révisées
1.  **Gestion des statuts de Transaction** : Introduction du statut `draft` (brouillon) pour éviter de corrompre les soldes réels des caisses lors de l'intégration WhatsApp / OCR automatique. Le trigger SQL ne modifie les soldes que si `status = 'completed'`.
2.  **Sécurité RLS assouplie** : Activation des politiques `anon` publiques pour la V1 privée (sécurisée par la clé secrète de l'application), évitant la complexité d'un système de comptes utilisateurs en phase de test.
3.  **PWA Native** : Transition vers une PWA installable sur l'écran d'accueil du mobile pour offrir l'expérience d'une application native gratuitement et sans les stores d'applications.

### Prochaines Étapes
*   Toutes les phases de la feuille de route de Forex Ledger V1 et V2 (y compris l'OCR réel, la saisie vocale réelle, la PWA installable et la passerelle WhatsApp de VPS) sont désormais complétées et documentées.

## 2026-06-09 - Stabilisation de la V1 et Finalisation de l'Interface de Brouillons (Phase 1 & 2 Termines)

### Jalons
*   **Fin de la Phase 1 (Stabilisation & Nettoyage)** :
    *   Renommage complet du projet de `temp-vite` vers `forex-ledger` dans `package.json` et `index.html`.
    *   Suppression définitive de `App.css` mort.
    *   Création de `.env.example` pour guider le branchement Supabase.
    *   Stabilisation globale du fichier CSS `src/index.css` en rajoutant toutes les classes de grille de formulaire (`.form-row`), de liste de transactions (`.ledger-left`, etc.), de recherche (`.input-icon-wrapper`) et de brouillons (`.drafts-panel`, etc.).
    *   Correction du bug d'importation de `ArrowLeftRight` qui provoquait un crash au chargement.
*   **Fin de la Phase 2 (Interface de Validation des Brouillons)** :
    *   Mise en place d'un flux d'édition bidirectionnel entre le Dashboard et l'onglet Transactions.
    *   Intégration d'un bouton d'édition (crayon) et d'un clic interactif sur le texte de chaque brouillon dans le panneau orange du Dashboard.
    *   Pré-remplissage automatique du formulaire de transaction lorsqu'un brouillon est sélectionné.
    *   Affichage d'un en-tête dynamique coloré ("Validation Brouillon") et d'un bouton "Annuler" pour sortir du mode d'édition du brouillon.
    *   Branchement du bouton d'enregistrement sur la fonction `confirmDraft` (qui passe le statut de `draft` à `completed` et applique les soldes dans Supabase ou dans le mock de secours local).

## 2026-06-09 - IA Gemini Réelle (OCR + Audio) & Configuration PWA (Phase 3 & 4 Termines)

### Jalons
*   **Fin de la Phase 3 (IA Gemini Réelle - OCR & Vocal)** :
    *   Création de requêtes HTTP REST directes vers l'API Google AI pour utiliser `gemini-2.5-flash` sans dépendances tierces lourdes.
    *   **Module OCR Réel** : Conversion des images téléversées en base64 et envoi à Gemini avec un prompt structuré retournant un JSON strict pour remplir les portefeuilles source/dest, les montants, frais et ID de transaction.
    *   **Saisie Vocale Réelle** : Utilisation de l'API standard `MediaRecorder` pour capturer la voix de l'utilisateur directement depuis le micro du smartphone, conversion du fichier audio en base64 et envoi multimodal direct à Gemini pour extraction structurée.
    *   **Bascule Gracieuse** : Gestion intelligente des cas d'erreur (micro refusé, clé API non fournie) avec bascule transparente vers les algorithmes de simulation locaux afin de conserver l'application testable.
*   **Fin de la Phase 4 (PWA Installable sur Mobile)** :
    *   Création du fichier `manifest.json` avec description du thème, icônes, affichage autonome (standalone) et orientation portrait pour mobile.
    *   Création de `sw.js` (Service Worker) gérant la mise en cache locale des fichiers d'application essentiels pour une vitesse de chargement accrue.
    *   Modification de `index.html` pour lier le manifeste et déclarer le Service Worker au démarrage.
    *   Validation complète du build de production local (`npm run build`).

## 2026-06-09 - Intégration WhatsApp Automatique (V2 Terminée)

### Jalons
*   **Edge Function whatsapp-webhook (Supabase Deno)** :
    *   Création d'une fonction Deno TypeScript dans `supabase/functions/whatsapp-webhook` pour recevoir les notifications d'OpenWA.
    *   Intégration d'appels Gemini API pour analyser les messages ou images (reçus) entrants et en extraire de façon structurée les transactions financières.
    *   Calcul dynamique des commissions et bénéfices nets en USD basés sur les taux de change à jour.
    *   Insertion automatique des transactions extraites en statut `draft` directement dans Supabase PostgreSQL.
*   **Passerelle OpenWA (Docker VPS)** :
    *   Création d'un fichier `docker-compose.yml` complet pour instancier la passerelle WhatsApp sur un serveur VPS.
    *   Mise en cache et persistance de la session WhatsApp (dossier `./sessions`) pour éviter de devoir re-scanner le QR code.
    *   Guide complet rédigé dans `whatsapp-gateway/README.md` décrivant les prérequis système, les variables d'environnement, le branchement webhook et les étapes d'appairage.


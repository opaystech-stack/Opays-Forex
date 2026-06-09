# Spécifications Fonctionnelles : Ledger Forex V1 (En Ligne)

Ce document décrit les fonctionnalités de la V1 de l'application comptable, adaptée pour être connectée à Internet et intégrée aux flux WhatsApp pour simplifier la saisie et résoudre les litiges.

---

## 1. Principes Fondamentaux
*   **En Ligne Uniquement** : L'application nécessite une connexion Internet active pour fonctionner et interroger directement Supabase.
*   **Saisie par Vision (OCR)** : L'utilisateur peut glisser-déposer ou photographier un reçu de transaction (Airtel, MTN, M-Pesa). L'IA extrait automatiquement les données pour pré-remplir le formulaire.
*   **Preuve de Transaction** : L'ID unique de transaction fourni par l'opérateur telecom est sauvegardé pour servir de preuve incontestable en cas de litige client.

---

## 2. Modules & Fonctionnalités

### A. Tableau de Bord (Dashboard)
*   **Valorisation du Capital** : Somme totale des caisses physiques et portefeuilles mobiles convertie en USD (taux saisis par l'opérateur chaque matin).
*   **Dépôts et Caisses** : Soldes des comptes (Cash USD, Cash UGX, Airtel RDC, MTN Uganda, etc.).
*   **Résumé du Jour** : Volume d'échange global, profit net (spreads de change - dépenses business) et retraits personnels.

### B. Formulaire de Transaction Intelligent
Le formulaire s'alimente de deux manières :
1.  **Saisie Manuelle Classique** : Montant départ ➡️ Wallet départ ➡️ Wallet destination ➡️ Montant reçu.
2.  **Saisie par Capture d'Écran (OCR)** :
    *   L'utilisateur dépose la capture d'écran du reçu mobile money.
    *   L'IA extrait : **Montant**, **Devise**, **Réseau**, **Date**, et l'**ID de Transaction**.
    *   Le formulaire est pré-rempli ; l'utilisateur n'a plus qu'à cliquer sur "Valider".
3.  **Champs Obligatoires de Sécurité** :
    *   `transaction_id` : L'identifiant réseau unique.
    *   `receipt_text` : Le texte extrait du reçu.
    *   `image_url` : Le lien vers l'image stockée dans Supabase.

### C. Historique & Résolution des Litiges
*   **Moteur de Recherche par ID** : Si un client conteste un paiement 3 jours plus tard, l'ami saisit l'ID de transaction (ou le numéro de téléphone du client) dans l'historique.
*   **Affichage de la Preuve** : L'application affiche la fiche de la transaction avec l'heure exacte, le montant, et la capture d'écran d'origine du reçu.

### D. Liaison WhatsApp (OpenWA)
*   Un robot WhatsApp surveille les messages reçus. 
*   Si l'ami envoie un mémo vocal ou une image de reçu au robot, celui-ci envoie un webhook à l'application pour générer un brouillon de transaction à valider.

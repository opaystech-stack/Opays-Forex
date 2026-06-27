# Registre de Mémoire Commune des Agents

Ce fichier sert de mémoire partagée pour tous les sous-agents opérant sur le projet OpaysFox. Il conserve le contexte opérationnel, les leçons apprises (lessons learned) et l'historique des événements système importants.

---

## 1. État Actuel du Système (System State)

*   **Version du Projet** : 0.0.0 (React + Vite PWA)
*   **Base de Données** : Supabase PostgreSQL (1 instance privée avec politiques RLS de type "Allow full access on wallets/transactions/loans/expenses/debts/message_templates/reminder_history for anon").
*   **Canaux d'intégration** : WhatsApp Gateway (OpenWA fonctionnant via Docker Compose).
*   **Intégration d'intelligence opérationnelle** : En cours d'implémentation (Intégration de la structure ECC/AgentShield).

---

## 2. Leçons Apprises & Bonnes Pratiques (Lessons Learned)

*   **Logique Financière Centralisée** : Toute modification de la logique de calcul de float, de bénéfices ou de taux de change doit être effectuée uniquement dans `src/utils/finance.js` et validée par les tests de `src/utils/finance.test.js`.
*   **Triggers de Base de Données** : La mise à jour des soldes de portefeuilles (wallets) est gérée au niveau de la base de données par des triggers PostgreSQL (`on_transaction_inserted`, `on_transaction_updated`, `on_expense_inserted`, `on_loan_inserted_or_updated`). Les composants React ne doivent pas calculer et écrire directement les soldes, mais plutôt s'appuyer sur Supabase pour la source de vérité.
*   **Audit Financier Continu** : Le script `scripts/audit/runAudit.js` génère le Rapport d'Audit (`docs/Rapport_Audit.md`) couvrant quatre axes (calculs, sécurité/RLS, schéma et recensement des erreurs). C'est la référence pour valider la conformité du code avant toute livraison.

---

## 3. Journal des Événements de Sécurité (Security Event Log)

*   **13/06/2026** : Initialisation du système d'intelligence opérationnelle ECC avec AgentShield. Configuration des règles communes et du principe *HUMAN CONFIRMATION FIRST*.

---

## 4. Recommandations Actives

1.  **Expert Sécurité** : Veiller à ce que toutes les entrées provenant du WhatsApp Gateway (reçus de paiement) soient rigoureusement nettoyées et validées par l'Expert IA pour prévenir toute injection de prompts ou de données invalides.
2.  **Architecte** : Maintenir l'application dans un état PWA réactif sans introduire de frameworks lourds. Privilégier des composants atomiques réutilisables.

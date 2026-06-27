---
name: security-and-hardening
description: Flux de travail pour la revue de sécurité applicative, la validation des entrées, la gestion des secrets et l'exécution des vérifications AgentShield.
---

# Sécurité et Hardening (AgentShield Workflow)

## Aperçu

Ce guide définit les processus et les vérifications de sécurité statiques et dynamiques à mener sur le projet OpaysFox. Il s'inspire du module AgentShield du framework ECC pour détecter les secrets exposés, les injections de prompts, les mauvaises configurations et les vulnérabilités du code (comme les injections SQL ou XSS).

---

## Modèle de Menace (Threat Model) pour OpaysFox

1.  **Exposition de Secrets (Haute Sévérité)** : Fuite de la clé d'API Gemini (OpenRouter), des clés anonymes Supabase ou des jetons de connexion WhatsApp Gateway dans le dépôt public Git.
2.  **Injections de Prompts (Moyenne Sévérité)** : Textes de reçus de paiement WhatsApp forgés par un tiers malveillant pour tromper l'analyse de l'Expert IA et valider des transactions factices.
3.  **Injections SQL (Critique)** : Manipulation des paramètres de requête dans les appels à Supabase pour lire ou corrompre les portefeuilles ou soldes.
4.  **Accès Non Autorisé aux Données (Haute Sévérité)** : Politiques RLS Supabase trop permissives permettant à n'importe quel rôle anonyme de modifier les données de tiers.

---

## Processus de Revue de Sécurité (Sécurité en Continu)

Avant de valider ou de commiter du code :

### 1. Détection des Secrets
*   **Règle** : Aucun mot de passe, clé d'API, token ou secret de chiffrement ne doit être présent en dur dans le code source.
*   **Action** : Utiliser uniquement les variables d'environnement via `process.env` ou `import.meta.env`. Vérifier que `.env` est bien exclu du suivi Git via le fichier `.gitignore`.

### 2. Validation et Assainissement des Entrées
*   **Règle** : Tout texte provenant du WhatsApp Gateway ou saisi par l'opérateur doit être traité comme suspect.
*   **Action** : Valider les types, longueurs et structures de données avant traitement.
*   **XSS** : Ne jamais insérer d'HTML brut dans l'application React sans assainissement préalable (interdiction d'utiliser `dangerouslySetInnerHTML` brut).

### 3. Requêtes SQL Sécurisées
*   **Règle** : Les requêtes dynamiques composées par concaténation de chaînes de caractères avec des entrées utilisateur sont strictement interdites.
*   **Action** : Utiliser exclusivement les fonctions de filtrage paramétrées du client JavaScript Supabase (ex. `.eq('id', walletId)`) qui protègent nativement contre les injections SQL.

### 4. Durcissement des Prompts des Agents
*   **Règle** : Chaque agent autonome doit posséder dans ses consignes des instructions claires pour résister à la manipulation de prompts (Prompt Injection Defense).

---

## Exécution de l'Audit de Sécurité AgentShield

Le système d'audit intègre automatiquement le module AgentShield. Pour lancer l'audit de sécurité et générer le rapport :

```bash
# Lance l'audit complet du projet incluant l'axe AgentShield
npm run audit
```

Le script génère ou met à jour le fichier `docs/Rapport_Audit.md` qui liste :
*   Les clés d'API ou secrets potentiellement exposés dans les sources.
*   La conformité de la configuration de `.gitignore`.
*   Les agents manquant de protection contre l'injection de prompts dans `docs/05_Agents/`.
*   Les vulnérabilités de code détectées (SQLi, XSS).

---

## Guide de Résolution des Écarts

*   **Secrets exposés** : Révoquer immédiatement la clé exposée, la remplacer par une variable d'environnement dans `.env` et nettoyer l'historique Git si nécessaire.
*   **Fichier .env non ignoré** : Ajouter immédiatement `.env` dans le fichier `.gitignore`.
*   **Agent vulnérable à l'injection** : Ajouter la clause de défense standard contre les injections de prompts dans les instructions de l'agent.
*   **DangerouslySetInnerHTML détecté** : Remplacer par des composants de texte standard React ou assainir la chaîne avec un validateur sécurisé avant rendu.

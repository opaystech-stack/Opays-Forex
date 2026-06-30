# Document de Correction de Bugs — auth-access-mobile-fixes

## Introduction

Audit technique et ergonomique de l'application de production Opays-Forex (https://fox.opays.io),
une PWA React + Vite adossée à Supabase (base `foxdb`) avec des Edge Functions dans
`supabase/functions/`. Cet audit couvre **cinq zones de défauts distinctes** qui dégradent
fortement l'accès et l'expérience, principalement sur mobile :

1. **Persistance de session** — le rafraîchissement de la page (F5) déconnecte l'utilisateur sur mobile.
2. **Authentification Google** — impossible de se connecter ou de créer un compte avec Google.
3. **Inscription classique e-mail / mot de passe** — l'inscription échoue ou bloque l'utilisateur sur un écran de confirmation d'e-mail jamais reçu.
4. **Période d'essai gratuite (30 jours)** — aucune période d'essai n'existe ; tout nouvel inscrit est bloqué immédiatement par l'écran d'accès restreint / paiement.
5. **Design & mise en page mobile** — formulaires d'authentification écrasés par le clavier virtuel, bouton WhatsApp flottant mal positionné, bas de la barre latérale PC coupé, accès aux Prêts indisponible sur mobile.

Chaque zone est traitée comme une condition de bug indépendante : la correction doit résoudre
le défaut pour tous les cas concernés tout en préservant le comportement existant pour les cas
non concernés (prévention des régressions). L'audit doit confirmer chaque point sur le code réel
(frontend et backend) — aucune hypothèse.

## Bug Analysis

### Current Behavior (Defect)

Comportement défectueux actuellement observé.

**Zone 1 — Persistance de session (déconnexion au rafraîchissement)**

1.1 WHEN un utilisateur authentifié rafraîchit la page (F5) sur mobile THEN the system le déconnecte et le renvoie vers l'écran de connexion (`/login`) au lieu de restaurer sa session.
1.2 WHEN le Service Worker (`public/sw.js`) sert une navigation ou des ressources THEN the system peut renvoyer un `index.html` de repli (cache hors-ligne) ou des réponses mises en cache de façon inappropriée, provoquant une perte de l'état de session après rafraîchissement.

**Zone 2 — Authentification Google (connexion & inscription)**

1.3 WHEN un utilisateur clique sur le bouton Google sur mobile (Safari/Chrome iOS) THEN the system reste en chargement infini et n'ouvre jamais le flux d'authentification (la fenêtre/pop-up est bloquée ou jamais lancée).
1.4 WHEN un nouvel utilisateur tente de s'authentifier via Google THEN the system ne crée pas automatiquement le compte utilisateur ni l'agence associée dans la base (`foxdb`), si bien que l'authentification n'aboutit pas de bout en bout.

**Zone 3 — Inscription classique e-mail / mot de passe**

1.5 WHEN un utilisateur soumet le formulaire d'inscription classique THEN the system le laisse bloqué sur un écran demandant de confirmer son e-mail, alors que l'e-mail de confirmation n'arrive jamais.
1.6 WHEN l'inscription classique se termine THEN the system ne connecte pas directement le nouvel inscrit et ne le redirige pas vers l'application (`/app`), interposant une étape bloquante.

**Zone 4 — Période d'essai gratuite (30 jours)**

1.7 WHEN un nouvel inscrit accède à l'application THEN the system bloque immédiatement l'accès via l'écran d'accès restreint / paiement, car `acces_autorise` vaut `FALSE` par défaut et aucune logique de période d'essai n'existe.
1.8 WHEN l'accès d'un compte est évalué THEN the system n'utilise pas la date réelle de création du compte (`created_at` / `createdAt`) pour accorder un quelconque essai gratuit.

**Zone 5 — Design & mise en page mobile**

1.9 WHEN le clavier virtuel s'ouvre sur un formulaire de connexion/inscription mobile THEN the system écrase et tronque les éléments du bas du formulaire, qui deviennent illisibles et inaccessibles.
1.10 WHEN l'application est consultée sur mobile THEN the system affiche le bouton WhatsApp flottant en haut de l'écran au lieu du coin inférieur droit.
1.11 WHEN la barre latérale gauche est affichée sur PC et que son contenu dépasse la hauteur visible THEN the system coupe et masque les éléments du bas (par ex. Prêts/Loans), qui deviennent invisibles et inaccessibles.
1.12 WHEN un utilisateur mobile cherche à accéder aux Prêts THEN the system ne fournit pas d'accès fiable à cette fonctionnalité.

### Expected Behavior (Correct)

Comportement attendu après correction.

**Zone 1 — Persistance de session**

2.1 WHEN un utilisateur authentifié rafraîchit la page (F5) sur mobile THEN the system SHALL restaurer sa session et le maintenir connecté sur l'écran applicatif courant, sans redirection vers `/login`.
2.2 WHEN le Service Worker traite des requêtes dynamiques (`/api/*`) ou la navigation THEN the system SHALL NOT mettre en cache de façon inappropriée ces requêtes, de sorte que l'état de session survive au rafraîchissement.

**Zone 2 — Authentification Google**

2.3 WHEN un utilisateur clique sur le bouton Google sur mobile (Safari/Chrome iOS) THEN the system SHALL lancer le flux d'authentification Google jusqu'à son terme sans être interrompu par un bloqueur de pop-up, et sans chargement infini.
2.4 WHEN un nouvel utilisateur s'authentifie via Google THEN the system SHALL créer automatiquement le compte utilisateur et l'agence associée dans `foxdb`, puis connecter l'utilisateur de bout en bout.

**Zone 3 — Inscription classique e-mail / mot de passe**

2.5 WHEN un utilisateur soumet une inscription classique valide THEN the system SHALL finaliser la création du compte sans imposer d'étape bloquante de confirmation d'e-mail.
2.6 WHEN l'inscription classique réussit THEN the system SHALL connecter directement le nouvel inscrit et le rediriger vers l'application (`/app`).

**Zone 4 — Période d'essai gratuite (30 jours)**

2.7 WHEN un nouvel inscrit accède à l'application pendant les 30 jours suivant la date réelle de création du compte THEN the system SHALL autoriser l'accès libre sans écran de paiement bloquant.
2.8 WHEN 30 jours se sont écoulés depuis la date réelle de création du compte (`created_at`) et qu'aucun accès payant n'a été accordé THEN the system SHALL bloquer l'accès via l'écran prévu, le calcul de l'essai étant fiable et sécurisé (fondé sur `created_at`, non falsifiable côté client).

**Zone 5 — Design & mise en page mobile**

2.9 WHEN le clavier virtuel s'ouvre sur un formulaire de connexion/inscription mobile THEN the system SHALL conserver le formulaire lisible et défilable, tous les champs et boutons du bas restant accessibles.
2.10 WHEN l'application est consultée sur mobile THEN the system SHALL afficher le bouton WhatsApp flottant fixé en bas à droite de l'écran.
2.11 WHEN la barre latérale gauche est affichée sur PC et que son contenu dépasse la hauteur visible THEN the system SHALL permettre le défilement de la barre latérale, rendant les éléments du bas (par ex. Prêts/Loans) visibles et accessibles.
2.12 WHEN un utilisateur mobile cherche à accéder aux Prêts THEN the system SHALL fournir un accès fiable à cette fonctionnalité.

### Unchanged Behavior (Regression Prevention)

Comportement existant à préserver impérativement.

3.1 WHEN un utilisateur authentifié rafraîchit la page (F5) sur PC THEN the system SHALL CONTINUE TO restaurer sa session et le maintenir connecté.
3.2 WHEN un utilisateur se connecte via e-mail / mot de passe avec des identifiants valides THEN the system SHALL CONTINUE TO l'authentifier et le rediriger vers l'application.
3.3 WHEN un utilisateur dispose déjà d'un accès payant validé (`acces_autorise = TRUE`) THEN the system SHALL CONTINUE TO lui accorder l'accès, indépendamment de la période d'essai.
3.4 WHEN un compte a dépassé sa période d'essai sans paiement THEN the system SHALL CONTINUE TO afficher l'écran d'accès restreint / paiement et à respecter les politiques RLS (`has_access`) côté base.
3.5 WHEN le mode démo (`?debug_force_demo`, `loginAsDemo`) est utilisé THEN the system SHALL CONTINUE TO accorder l'accès local sans appel réseau ni blocage.
3.6 WHEN le Service Worker sert des ressources statiques (icônes, polices, images, bundles JS/CSS hachés) THEN the system SHALL CONTINUE TO appliquer sa stratégie de cache existante (network-first pour la navigation, cache-first pour les assets statiques) et la mise à jour de version.
3.7 WHEN l'application est consultée sur PC THEN the system SHALL CONTINUE TO afficher la mise en page bureau (barre latérale, en-tête, contenu) sans régression visuelle.
3.8 WHEN aucun brouillon WhatsApp n'est en attente THEN the system SHALL CONTINUE TO masquer le bouton WhatsApp flottant lié aux brouillons.
3.9 WHEN un utilisateur navigue dans l'application sur mobile THEN the system SHALL CONTINUE TO afficher la barre de navigation inférieure et les écrans existants sans régression de mise en page.

# Fiche Synthèse du Projet : Ledger Mobile Money & Change (Kampala)

## 1. Vision du Projet
L'objectif premier est de fournir à ton ami opérant à Kampala une application web sur-mesure (PWA) pour contrôler l'intégralité de son flux financier professionnel et personnel. Le SaaS viendra dans un second temps. La priorité absolue de cette V1 est l'ergonomie, la fiabilité des calculs de marge, et l'automatisation de la saisie via WhatsApp.

---

## 2. Le Besoin Utilisateur Réel
Ton ami gère quotidiennement plusieurs devises physiques et wallets mobiles (Airtel RDC, MTN Ouganda, M-Pesa Kenya). L'argent circule rapidement, mais il est difficile de :
*   Connaître sa valeur nette exacte consolidée à l'instant T (convertie en USD).
*   Suivre la marge bénéficiaire nette de chaque transaction (après déduction des frais de transfert).
*   Conserver des preuves incontestables de transaction (ID uniques + captures d'écran de reçus) pour clore rapidement les litiges clients.
*   Séparer les dépenses personnelles des dépenses d'exploitation.

---

## 3. Matrice SWOT de la V1

### Forces (Strengths)
1.  **Sur-mesure total** : Répond directement aux habitudes de ton ami (WhatsApp, mémos vocaux, captures d'écran).
2.  **Coût de structure nul** : Hébergé sur des infrastructures gratuites (Supabase Free Tier, Vercel).
3.  **Traçabilité maximale** : Historique searchable avec preuve visuelle (reçu) et ID de transaction unique.

### Faiblesses (Weaknesses)
1.  **Dépendance Internet** : L'application nécessite une connexion réseau active pour interroger Supabase (exigence acceptée par l'utilisateur).
2.  **Hébergement de la passerelle WhatsApp** : OpenWA nécessite un mini-serveur VPS ou un ordinateur local connecté pour faire tourner son conteneur Docker.

### Opportunités (Opportunities)
1.  **Automatisation par l'IA** : Utilisation de Gemini 1.5 Flash (multimodal) pour lire les captures d'écran et écouter les mémos vocaux directement depuis WhatsApp, évitant ainsi la saisie manuelle fastidieuse.
2.  **Sécurité et Paix d'esprit** : Recherche rapide par ID de transaction lors d'une réclamation client, même plusieurs semaines après.

### Menaces (Threats)
1.  **Changements dans WhatsApp Web** : WhatsApp effectue régulièrement des mises à jour qui peuvent perturber temporairement les passerelles open-source comme OpenWA. (Il y aura toujours la possibilité d'importer les fichiers manuellement via l'application).

---

## 4. Évolutions Futures (Vers le SaaS)
Une fois que l'outil aura fait ses preuves avec ton ami pendant 2 à 3 mois, nous pourrons structurer une version commerciale (SaaS) :
1.  **Multi-utilisateurs / Multi-agences** : Pour les propriétaires de réseaux de kiosques mobile money.
2.  **Gestion des rôles employés** : Permettre aux employés de saisir les transactions sous la surveillance du propriétaire.
3.  **Tableau de bord multi-kiosques** : Suivre le flux de chaque agence en temps réel.

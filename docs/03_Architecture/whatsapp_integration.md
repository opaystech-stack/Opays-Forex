# Architecture d'Intégration WhatsApp (OpenWA & Gemini)

Ce document décrit comment connecter la passerelle WhatsApp open-source **OpenWA** à notre backend Supabase pour automatiser la capture des reçus et le traitement vocal.

---

## 1. Fonctionnement Général

```
+------------+               +-------------+               +----------------------+
| WhatsApp   | --(Message)-->|   OpenWA    | --(Webhook)-->| Supabase Edge Func / |
| Téléphone  |               | (Docker VPS)|               |   Next.js API Route  |
+------------+               +-------------+               +----------------------+
                                                                      |
                                                               (Envoi Média)
                                                                      v
+------------+               +-------------+               +----------------------+
|  Tableau   | <--(Draft)----|  Supabase   | <--(JSON)-----|  Gemini 1.5 Flash    |
|  de bord   |               |  Database   |               |      (Vision/Audio)  |
+------------+               +-------------+               +----------------------+
```

---

## 2. Déploiement de OpenWA

**OpenWA** s'exécute de préférence dans un conteneur Docker sur un serveur VPS (ex: Hetzner ou DigitalOcean à 4-5$/mois) ou localement sur un ordinateur Linux/Windows de l'agence.

### Fichier `docker-compose.yml`

```yaml
version: '3.8'

services:
  openwa:
    image: rmyndharis/openwa:latest
    container_name: openwa-gateway
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - DB_TYPE=sqlite
      - DB_NAME=/data/openwa.db
      - API_KEY=VotreCleSecurisee123!
    volumes:
      - ./openwa_data:/data
    restart: unless-stopped
```

### Initialisation & Connexion
1.  Lancer le service : `docker-compose up -d`.
2.  Accéder au dashboard React d'OpenWA sur le port `3000`.
3.  Scanner le **QR Code** affiché avec l'application WhatsApp de ton ami (fonctionnalité "Appareils connectés" de WhatsApp).
4.  L'appareil est connecté et prêt à envoyer/recevoir.

---

## 3. Configuration du Webhook
Dans le dashboard OpenWA, configurer le Webhook pour envoyer les événements de type `message.received` vers notre API.

*   **URL du Webhook** : `https://[PROJECT-ID].supabase.co/functions/v1/whatsapp-webhook`
*   **Headers** : `Authorization: Bearer [SUPABASE-ANON-KEY]`

---

## 4. Traitement des Messages Reçus (Backend Supabase Edge Function)

Lorsqu'un message contenant une image (capture d'écran de reçu) ou un fichier audio (mémo vocal) arrive, la fonction exécute la logique suivante :

### A. Cas d'un Reçu en Image (Capture d'écran)
1.  Télécharger l'image depuis l'API OpenWA en utilisant l'ID du message.
2.  Appeler l'API Gemini 1.5 Flash en lui envoyant l'image avec le prompt OCR suivant :
    > *"Tu es un comptable spécialisé dans le mobile money en Afrique de l'Est. Analyse cette capture d'écran de reçu. Extrais les informations suivantes sous forme de JSON strict : 
    > 1. Montant de la transaction (nombre)
    > 2. Devise (USD, UGX, KES ou CDF)
    > 3. Réseau/Opérateur (Airtel, MTN, M-Pesa, Cash)
    > 4. Numéro de transaction / ID de transaction
    > 5. Date et heure.
    > Réponds uniquement en JSON sans balises markdown."*
3.  Enregistrer l'image dans Supabase Storage dans le bucket `receipts`.
4.  Créer une ligne dans la table `transactions` avec le statut `brouillon` (draft), pré-remplie avec les données de l'IA, l'ID de transaction et l'URL de l'image.

### B. Cas d'un Message Vocal
1.  Télécharger le fichier audio (.ogg) via OpenWA.
2.  Appeler l'API Gemini (qui gère nativement l'audio) avec le prompt suivant :
    > *"Tu es un assistant comptable. Écoute ce mémo vocal décrivant une transaction de change ou de transfert. Extrais les informations de transaction au format JSON :
    > - source_wallet (ex: 'Cash USD', 'Airtel RDC')
    > - source_amount (nombre)
    > - dest_wallet (ex: 'MTN Uganda', 'Cash UGX')
    > - dest_amount (nombre)
    > - note (transcription texte brute du message)
    > Réponds uniquement au format JSON."*
3.  Enregistrer le brouillon dans l'application. Ton ami reçoit une notification à l'écran et valide d'un simple clic.

# Prompt / Spécification — Agent Comptable (mémo de clôture)

`agents/accountant.js` produit un mémo **déterministe** (sans IA) pour fiabilité
comptable. Structure du mémo, par agence et par jour :

```
Mémo de clôture — {agency_name} — {date}
Opérations complétées : {tx_count}
Bénéfice réel : {profit_usd} USD
Soldes de caisses par devise :
  - {currency} : {balance}
  ...
```

Sources : `transactions` (status='completed', profit_usd du jour) et `wallets`
(soldes par `currency_code`). Persisté dans `closing_memos`.

**Option IA (facultative)** : pour une synthèse en langage naturel, envoyer le
mémo brut à Gemini avec le prompt :

```
Résume ce mémo de clôture en 3 puces pour le propriétaire de l'agence,
en français, sans recalculer les chiffres (reprends-les tels quels).
```

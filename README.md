# Forex & Mobile Money Ledger (Kampala Kiosk)

Application web (PWA) sur-mesure d'aide à la comptabilité et de suivi de trésorerie pour un kiosque multi-devises et mobile money basé à Kampala (Ouganda).

---

## 📂 Structure du Projet

```
FOREX/
├── docs/                      # Coffre Obsidian (Mémoire du projet)
│   ├── 01_Briefs/             # Brief stratégique & analyse de marché
│   │   └── startup_brief.md
│   ├── 02_Specs/              # Spécifications fonctionnelles de l'application
│   │   └── v1_spec.md
│   ├── 03_Architecture/       # Base de données et documentations d'intégration
│   │   ├── db_schema.md       # Schéma PostgreSQL (Supabase)
│   │   ├── whatsapp_integration.md # Passerelle OpenWA + Gemini OCR
│   │   └── vocal_integration.md # Traitement des notes vocales
│   ├── 04_DevLogs/            # Journal technique quotidien (Karpathy-style)
│   │   └── dev_log.md
│   ├── 05_Agents/             # Configurations et prompts pour agents IA
│   │   └── accountant_agent.md
│   └── 06_Skills/             # Règles d'ingénierie et bonnes pratiques logicielles
└── README.md
```

## 🛠️ Stack Technique Proposée
*   **Base de Données & Stockage** : Supabase (PostgreSQL + RLS + Storage pour les reçus).
*   **Frontend** : React.js (Vite) déployé en PWA pour un usage mobile fluide.
*   **Passerelle WhatsApp** : OpenWA (Docker) hébergée sur VPS à bas coût.
*   **Traitement IA (OCR & Voix)** : API Gemini 1.5 Flash (multimodale, gratuite pour la V1).

## 🧭 Comment naviguer dans ce projet
Ouvre ce dossier avec l'application **Obsidian** pour afficher les notes reliées entre elles, ou navigue directement dans le dossier `docs/` à l'aide de ton éditeur de code.

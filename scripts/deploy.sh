#!/bin/bash
# ============================================
# OpaysFox — Deploy Script for Doploy
# ============================================
set -e

echo "🚀 OpaysFox — Déploiement via Doploy"
echo "======================================"

# 1. Vérifier que les variables d'env sont définies
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
  echo "❌ Erreur: VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies"
  echo "   Crée un fichier .env à partir de .env.example"
  exit 1
fi

# 2. Build
echo "📦 Build de l'application..."
npm run build

# 3. Lint
echo "🔍 Vérification ESLint..."
npm run lint

# 4. Tests
echo "🧪 Tests unitaires..."
npm test

# 5. Déploiement Doploy
echo "🐳 Déploiement via Doploy..."
doploy deploy

echo "✅ OpaysFox déployé avec succès !"
echo "   Site: https://fox.opays.io"

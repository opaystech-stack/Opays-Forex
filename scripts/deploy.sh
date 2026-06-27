#!/usr/bin/env bash
# ============================================================================
# deploy.sh — Orchestration du déploiement Agency Operations Expansion
# ----------------------------------------------------------------------------
# Applique les migrations Supabase (0003 + 0004) et déploie les Edge Functions
# sur un environnement donné, après validation locale (tests + build).
#
# Usage :
#   ./scripts/deploy.sh <env> <project-ref> [--skip-checks] [--functions-only] [--db-only]
#
#   <env>          dev | staging | prod   (étiquette informative + garde-fou prod)
#   <project-ref>  référence du projet Supabase cible
#
# Options :
#   --skip-checks     ne pas relancer npm ci / test / build (déconseillé)
#   --functions-only  déployer uniquement les Edge Functions (pas de db push)
#   --db-only         appliquer uniquement les migrations (pas de functions)
#
# Exemples :
#   ./scripts/deploy.sh dev     abcddev123
#   ./scripts/deploy.sh staging abcdstg123
#   ./scripts/deploy.sh prod    abcdprod99
#
# Pré-requis : supabase CLI installé et `supabase login` effectué.
# NB : le déploiement du FRONT est géré par Vercel (push Git) — hors de ce script.
# ============================================================================
set -euo pipefail

# --- Couleurs ---------------------------------------------------------------
RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
info()  { echo "${BLUE}[INFO]${NC} $*"; }
ok()    { echo "${GREEN}[ OK ]${NC} $*"; }
warn()  { echo "${YELLOW}[WARN]${NC} $*"; }
err()   { echo "${RED}[FAIL]${NC} $*" >&2; }

# --- Racine projet ----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# --- Arguments --------------------------------------------------------------
ENVIRONMENT="${1:-}"
PROJECT_REF="${2:-}"
SKIP_CHECKS=false
FUNCTIONS_ONLY=false
DB_ONLY=false

shift 2 2>/dev/null || true
for arg in "$@"; do
  case "$arg" in
    --skip-checks)    SKIP_CHECKS=true ;;
    --functions-only) FUNCTIONS_ONLY=true ;;
    --db-only)        DB_ONLY=true ;;
    *) err "Option inconnue : $arg"; exit 2 ;;
  esac
done

if [[ -z "${ENVIRONMENT}" || -z "${PROJECT_REF}" ]]; then
  err "Usage : ./scripts/deploy.sh <dev|staging|prod> <project-ref> [options]"
  exit 2
fi

case "${ENVIRONMENT}" in
  dev|staging|prod) ;;
  *) err "Environnement invalide : ${ENVIRONMENT} (attendu dev|staging|prod)"; exit 2 ;;
esac

# --- Outils requis ----------------------------------------------------------
command -v supabase >/dev/null 2>&1 || { err "supabase CLI introuvable. Installez-le et 'supabase login'."; exit 3; }

# Liste ordonnée des Edge Functions à déployer.
EDGE_FUNCTIONS=( agency-invite scheduled-reminders gemini-proxy whatsapp-send whatsapp-webhook )

info "Cible : environnement=${ENVIRONMENT}, project-ref=${PROJECT_REF}"

# --- Garde-fou production ---------------------------------------------------
if [[ "${ENVIRONMENT}" == "prod" ]]; then
  warn "Vous allez déployer en PRODUCTION (project-ref=${PROJECT_REF})."
  warn "Assurez-vous d'avoir pris un SNAPSHOT de la base (Dashboard → Database → Backups)."
  read -r -p "Taper 'DEPLOY-PROD' pour confirmer : " confirm
  if [[ "${confirm}" != "DEPLOY-PROD" ]]; then
    err "Confirmation invalide. Abandon."
    exit 1
  fi
fi

# --- 1. Validation locale ---------------------------------------------------
if [[ "${SKIP_CHECKS}" == "false" ]]; then
  info "Installation déterministe (npm ci)…"
  npm ci
  info "Exécution des tests (npm test)…"
  npm test
  info "Build de production (npm run build)…"
  npm run build
  ok "Validation locale réussie."
else
  warn "Validation locale ignorée (--skip-checks)."
fi

# --- 2. Lien projet Supabase ------------------------------------------------
info "Liaison au projet Supabase (${PROJECT_REF})…"
supabase link --project-ref "${PROJECT_REF}"
ok "Projet lié."

# --- 3. Migrations base de données -----------------------------------------
if [[ "${FUNCTIONS_ONLY}" == "false" ]]; then
  info "Application des migrations (supabase db push) — 0001 → 0002 → 0003 → 0004…"
  supabase db push
  ok "Migrations appliquées."
else
  warn "Migrations ignorées (--functions-only)."
fi

# --- 4. Edge Functions ------------------------------------------------------
if [[ "${DB_ONLY}" == "false" ]]; then
  for fn in "${EDGE_FUNCTIONS[@]}"; do
    if [[ -d "supabase/functions/${fn}" ]]; then
      info "Déploiement de l'Edge Function : ${fn}…"
      supabase functions deploy "${fn}"
      ok "Edge Function déployée : ${fn}."
    else
      warn "Dossier supabase/functions/${fn} absent — ignoré."
    fi
  done
else
  warn "Edge Functions ignorées (--db-only)."
fi

# --- 5. Rappels post-déploiement -------------------------------------------
echo ""
ok "Déploiement Supabase terminé pour l'environnement '${ENVIRONMENT}'."
echo ""
info "VÉRIFICATIONS MANUELLES À EFFECTUER (cf. docs/07_Deployment/deployment_runbook.md) :"
echo "  1. Backfill complet :"
echo "       SELECT count(*) FROM transactions WHERE agency_id IS NULL;   -- attendu : 0"
echo "  2. Policies storage :"
echo "       SELECT policyname FROM pg_policies WHERE tablename='objects'"
echo "         AND policyname IN ('op_read_member','op_insert_valid_link');"
echo "  3. Fonctions de sécurité présentes :"
echo "       SELECT proname FROM pg_proc WHERE proname IN"
echo "         ('is_agency_member','is_platform_editor','submit_remote_order','is_valid_order_proof_path');"
echo "  4. GUC du cron (relances) — à configurer si pas déjà fait :"
echo "       ALTER DATABASE postgres SET app.settings.edge_base_url    = 'https://${PROJECT_REF}.supabase.co/functions/v1';"
echo "       ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_jwt>';"
echo "       SELECT * FROM cron.job;   -- doit lister 'scheduled-reminders-15min'"
echo "  5. Secrets Edge Functions (si non définis) :"
echo "       supabase secrets set GEMINI_API_KEY=... WHATSAPP_SEND_GATEWAY_URL=... WHATSAPP_API_SECRET=... WEBHOOK_SECRET=..."
echo ""
info "FRONT : le déploiement Vercel est déclenché par le push Git (variables VITE_* à configurer dans Vercel)."

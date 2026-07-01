import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../services/supabase';
import { useT } from '../i18n';
import { Shield, Check, X, FileText, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildAdminPage,
  buildActivationPatch,
  buildReviewPatch,
  latestProofStatus,
  DEFAULT_ADMIN_PAGE_SIZE,
} from '../utils/adminActions';

// Console_Admin (Page_Console_Admin) — Console d'administration des accès.
//
// Liste paginée des Utilisateurs (50/page) triée par Preuve_Paiement la plus
// récente (R6.1), avec état vide (R6.2). Sélection d'une preuve ⇒ détails +
// aperçu via URL signée ≤ 300 s (R6.3, R6.11), reçu indisponible (R6.12).
// Actions activer/désactiver (R6.4, R6.5) et valider/rejeter (R6.6, R6.7), avec
// conservation de l'état précédent en cas d'échec et message d'erreur (R6.8).
//
// L'accès admin aux données (liste des profils, preuves, URL signées, patchs)
// passe par des appels Supabase directs : le client `supabase` n'est pas exposé
// via le contexte, on l'importe donc depuis le service.
//
// Remarque : l'e-mail des Utilisateurs n'est pas directement interrogeable
// depuis le client (table `auth.users`). On affiche l'e-mail s'il est présent
// sur le Profil_Accès, sinon on retombe sur l'identifiant de l'Utilisateur.
//
// Feature: paid-access-control

// Construit les entrées de la liste admin à partir des Profils_Accès et des
// Preuves_Paiement. Chaque entrée porte l'horodatage de la preuve la plus
// récente (pour le tri par `buildAdminPage`) et le statut le plus récent.
function buildEntries(profiles, proofs) {
  const proofsByUser = new Map();
  for (const proof of proofs) {
    const list = proofsByUser.get(proof.user_id) || [];
    list.push(proof);
    proofsByUser.set(proof.user_id, list);
  }

  // Index des profils pour fusionner et détecter les preuves orphelines.
  const entries = [];
  const seen = new Set();

  const makeEntry = (userId, profile) => {
    const userProofs = proofsByUser.get(userId) || [];
    const latest = userProofs.reduce((acc, p) => {
      const t = new Date(p.submitted_at ?? 0).getTime();
      return t > acc.t ? { t, at: p.submitted_at } : acc;
    }, { t: -Infinity, at: null });
    return {
      user_id: userId,
      email: profile?.email ?? null,
      acces_autorise: Boolean(profile?.acces_autorise),
      latestProofAt: latest.at,
      latestStatus: latestProofStatus(userProofs),
      proofs: userProofs,
    };
  };

  for (const profile of profiles) {
    seen.add(profile.user_id);
    entries.push(makeEntry(profile.user_id, profile));
  }
  // Inclure les Utilisateurs disposant de preuves mais sans profil chargé.
  for (const userId of proofsByUser.keys()) {
    if (!seen.has(userId)) entries.push(makeEntry(userId, null));
  }

  return entries;
}

// Données d'exemple en mémoire pour le Mode_Démo (Utilisateur `isDemo`).
//
// Avec des clés Supabase factices/placeholder, le client `supabase` n'est pas
// `null` : les gardes `if (!supabase)` ne suffisent donc pas à empêcher les
// requêtes réelles, qui échoueraient et afficheraient une bannière d'erreur
// avec une liste vide. En Mode_Démo on court-circuite vers ces entrées locales.
//
// La forme reproduit exactement la sortie de `buildEntries` :
// `{ user_id, email, acces_autorise, latestProofAt, latestStatus, proofs }`.
const DEMO_ADMIN_ENTRIES = [
  {
    user_id: 'demo-user-alpha',
    email: 'client.alpha@demo.app',
    acces_autorise: true,
    latestProofAt: '2025-01-15T09:30:00.000Z',
    latestStatus: 'validee',
    proofs: [
      {
        id: 'demo-proof-alpha-1',
        user_id: 'demo-user-alpha',
        mode_paiement: 'bitcoin',
        reference: 'DEMO-REF-001',
        submitted_at: '2025-01-15T09:30:00.000Z',
        statut: 'validee',
        recu_path: null,
      },
    ],
  },
  {
    user_id: 'demo-user-beta',
    email: 'client.beta@demo.app',
    acces_autorise: false,
    latestProofAt: '2025-01-18T14:05:00.000Z',
    latestStatus: 'en_attente',
    proofs: [
      {
        id: 'demo-proof-beta-1',
        user_id: 'demo-user-beta',
        mode_paiement: 'virement',
        reference: 'DEMO-REF-002',
        submitted_at: '2025-01-18T14:05:00.000Z',
        statut: 'en_attente',
        recu_path: null,
      },
    ],
  },
  {
    user_id: 'demo-user-gamma',
    email: 'client.gamma@demo.app',
    acces_autorise: false,
    latestProofAt: null,
    latestStatus: null,
    proofs: [],
  },
];

export default function ConsoleAdmin() {
  const { user } = useApp();
  const t = useT();

  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Preuve sélectionnée + aperçu (URL signée).
  const [selectedProof, setSelectedProof] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  const adminId = user?.id ?? null;

  const loadData = useCallback(async () => {
    if (user?.isDemo) {
      // Mode_Démo : court-circuit vers les données d'exemple en mémoire. Avec
      // des clés placeholder, `supabase` n'est pas null, d'où la garde explicite
      // sur `isDemo` (et non plus seulement `!supabase`). Pas de bannière d'erreur.
      setError(null);
      setEntries(DEMO_ADMIN_ENTRIES);
      setLoading(false);
      return;
    }
    if (!supabase) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [profRes, proofRes] = await Promise.all([
        supabase.from('access_profiles').select('*'),
        supabase.from('payment_proofs').select('*').order('submitted_at', { ascending: false }),
      ]);
      if (profRes.error) throw profRes.error;
      if (proofRes.error) throw proofRes.error;
      setEntries(buildEntries(profRes.data || [], proofRes.data || []));
    } catch (err) {
      console.error('Échec du chargement de la Console_Admin:', err?.message || err);
      setError(t('admin.update_error'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [t, user?.isDemo]);

  useEffect(() => {
    // Chargement initial des données (effet de synchronisation au montage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Génère une URL signée (≤ 300 s) pour l'aperçu du Reçu (R6.11) ; en cas
  // d'échec ou de reçu introuvable, signale l'indisponibilité (R6.12).
  const selectProof = useCallback(async (proof) => {
    setSelectedProof(proof);
    setPreviewUrl(null);
    setPreviewUnavailable(false);
    if (!supabase || user?.isDemo) {
      // Mode_Démo : aucune URL signée, reçu indisponible (R6.12).
      setPreviewUnavailable(true);
      return;
    }
    if (!proof?.recu_path) {
      setPreviewUnavailable(true);
      return;
    }
    try {
      const { data, error: signErr } = await supabase.storage
        .from('receipts')
        .createSignedUrl(proof.recu_path, 300);
      if (signErr || !data?.signedUrl) {
        setPreviewUnavailable(true);
        return;
      }
      setPreviewUrl(data.signedUrl);
    } catch (err) {
      console.error('Reçu indisponible:', err?.message || err);
      setPreviewUnavailable(true);
    }
  }, [user?.isDemo]);

  // Active/désactive l'accès d'un Utilisateur (R6.4, R6.5). En cas d'échec,
  // conserve la valeur précédente et affiche un message d'erreur (R6.8).
  const handleAccessChange = useCallback(async (userId, actif) => {
    if (!supabase || user?.isDemo) {
      // Mode_Démo : bascule l'état local sans appel réseau ni erreur.
      setError(null);
      setEntries((prev) =>
        prev.map((e) => (e.user_id === userId ? { ...e, acces_autorise: actif } : e))
      );
      return;
    }
    setError(null);
    const patch = buildActivationPatch(actif, adminId);
    const { error: updErr } = await supabase
      .from('access_profiles')
      .update(patch)
      .eq('user_id', userId);
    if (updErr) {
      console.error('Échec de la mise à jour de l\'accès:', updErr?.message || updErr);
      setError(t('admin.update_error'));
      return;
    }
    setEntries((prev) =>
      prev.map((e) => (e.user_id === userId ? { ...e, acces_autorise: actif } : e))
    );
  }, [adminId, t, user?.isDemo]);

  // Valide/rejette une Preuve_Paiement (R6.6, R6.7). En cas d'échec, conserve
  // l'état précédent et affiche un message d'erreur (R6.8).
  const handleReview = useCallback(async (proof, statut) => {
    if (!supabase || user?.isDemo) {
      // Mode_Démo : applique la revue en local (même logique que le succès réel),
      // sans appel réseau ni erreur.
      setError(null);
      setEntries((prev) =>
        prev.map((e) => {
          if (e.user_id !== proof.user_id) return e;
          const proofs = e.proofs.map((p) => (p.id === proof.id ? { ...p, statut } : p));
          return { ...e, proofs, latestStatus: latestProofStatus(proofs) };
        })
      );
      setSelectedProof((prev) => (prev && prev.id === proof.id ? { ...prev, statut } : prev));
      return;
    }
    setError(null);
    const patch = buildReviewPatch(statut, adminId);
    const { error: updErr } = await supabase
      .from('payment_proofs')
      .update(patch)
      .eq('id', proof.id);
    if (updErr) {
      console.error('Échec de la revue de la preuve:', updErr?.message || updErr);
      setError(t('admin.update_error'));
      return;
    }
    // Mise à jour locale : statut de la preuve + statut le plus récent de l'entrée.
    setEntries((prev) =>
      prev.map((e) => {
        if (e.user_id !== proof.user_id) return e;
        const proofs = e.proofs.map((p) => (p.id === proof.id ? { ...p, statut } : p));
        return { ...e, proofs, latestStatus: latestProofStatus(proofs) };
      })
    );
    setSelectedProof((prev) => (prev && prev.id === proof.id ? { ...prev, statut } : prev));
  }, [adminId, t, user?.isDemo]);

  const statusLabel = (status) => {
    if (!status) return t('admin.status_none');
    return t(`admin.status_${status}`);
  };

  // Statut → variante de badge (couleur dérivée d'une Theme_Variable). Le cas
  // « pas de preuve » (null/none) reste un badge libellé, jamais une cellule vide.
  const statusBadgeVariant = (status) => {
    switch (status) {
      case 'validee':
        return 'badge-success';
      case 'rejetee':
        return 'badge-danger';
      case 'en_attente':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  };

  const pageEntries = buildAdminPage(entries, page, DEFAULT_ADMIN_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(entries.length / DEFAULT_ADMIN_PAGE_SIZE));

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={20} color="var(--color-primary)" />
          <span>Administration des accès</span>
        </h2>
        <p className="screen-desc">Gérez les accès et les permissions des utilisateurs</p>
      </div>

      {error && (
        <div className="alert alert-info" role="alert" style={{ marginBottom: '20px' }}>
          <span>{error}</span>
        </div>
      )}

      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>
            Total Utilisateurs
          </span>
          <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
            {entries.length}
          </span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>
            Accès Actifs
          </span>
          <span style={{ fontSize: '24px', fontWeight: '700', color: 'var(--indigo-strong)' }}>
            {entries.filter(e => e.acces_autorise).length}
          </span>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: '500' }}>
            En Attente de Validation
          </span>
          <span style={{ fontSize: '24px', fontWeight: '700', color: '#D97706' }}>
            {entries.filter(e => e.latestStatus === 'en_attente').length}
          </span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{t('admin.users_title')}</span>
          <button type="button" className="btn btn-outline" style={{ width: 'auto', padding: '8px 12px', margin: 0 }} onClick={loadData}>
            <RefreshCw size={14} />
          </button>
        </h3>

        {loading ? (
          <p role="status" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>
            {t('loading.data')}
          </p>
        ) : pageEntries.length === 0 ? (
          <p role="status" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>
            {t('admin.empty')}
          </p>
        ) : (
          <>
            <table className="admin-users">
              <thead>
                <tr>
                  <th>{t('admin.col_email')}</th>
                  <th>{t('admin.col_access')}</th>
                  <th>{t('admin.col_status')}</th>
                  <th>{t('admin.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry) => {
                  const latestProof = entry.proofs && entry.proofs.length > 0
                    ? entry.proofs.reduce((a, b) =>
                        new Date(b.submitted_at ?? 0) > new Date(a.submitted_at ?? 0) ? b : a)
                    : null;
                  return (
                    <tr key={entry.user_id}>
                      <td data-label={t('admin.col_email')}>
                        {entry.email || entry.user_id}
                      </td>
                      <td data-label={t('admin.col_access')}>
                        <span className={`badge ${entry.acces_autorise ? 'badge-success' : 'badge-danger'}`}>
                          {entry.acces_autorise ? t('admin.access_granted') : t('admin.access_revoked')}
                        </span>
                      </td>
                      <td data-label={t('admin.col_status')}>
                        <span className={`badge ${statusBadgeVariant(entry.latestStatus)}`}>
                          {statusLabel(entry.latestStatus)}
                        </span>
                      </td>
                      <td data-label={t('admin.col_actions')}>
                        <div className="admin-users__actions">
                          {entry.acces_autorise ? (
                            <button type="button" className="btn btn-outline" style={{ width: 'auto', padding: '6px 12px', margin: 0, borderColor: 'var(--color-red)', color: 'var(--color-red)' }} onClick={() => handleAccessChange(entry.user_id, false)}>
                              {t('admin.deactivate')}
                            </button>
                          ) : (
                            <button type="button" className="btn btn-outline" style={{ width: 'auto', padding: '6px 12px', margin: 0, borderColor: 'var(--color-green)', color: 'var(--color-green)' }} onClick={() => handleAccessChange(entry.user_id, true)}>
                              {t('admin.activate')}
                            </button>
                          )}
                          {latestProof && (
                            <button type="button" className="btn btn-outline" aria-label={t('admin.view_proof')} style={{ width: 'auto', padding: '6px 12px', margin: 0 }} onClick={() => selectProof(latestProof)}>
                              <FileText size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination (R6.1 : 50/page) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
              <button type="button" className="btn btn-outline" style={{ width: 'auto', padding: '8px 16px', margin: 0 }} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft size={14} />
                <span>{t('admin.pagination_prev')}</span>
              </button>
              <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-secondary)' }}>
                {t('admin.pagination_page')} {page} / {totalPages}
              </span>
              <button type="button" className="btn btn-outline" style={{ width: 'auto', padding: '8px 16px', margin: 0 }} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <span>{t('admin.pagination_next')}</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Détail de la preuve sélectionnée + aperçu via URL signée (R6.3, R6.11, R6.12) */}
      {selectedProof && (
        <div className="modal-overlay" onClick={() => { setSelectedProof(null); setPreviewUrl(null); setPreviewUnavailable(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--color-primary)" />
                <span>{t('admin.proof_details_title')}</span>
              </h3>
              <button type="button" className="btn modal-close" onClick={() => { setSelectedProof(null); setPreviewUrl(null); setPreviewUnavailable(false); }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', marginBottom: '16px', marginTop: '16px' }}>
              <div><strong>{t('admin.proof_mode')} :</strong> {selectedProof.mode_paiement}</div>
              <div><strong>{t('admin.proof_reference')} :</strong> {selectedProof.reference || '—'}</div>
              <div><strong>{t('admin.proof_date')} :</strong> {selectedProof.submitted_at ? new Date(selectedProof.submitted_at).toLocaleString() : '—'}</div>
              <div><strong>{t('admin.col_status')} :</strong> {statusLabel(selectedProof.statut)}</div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('admin.receipt_preview')}</p>
              {previewUnavailable ? (
                <p style={{ fontSize: '13px', color: 'var(--color-red)', fontStyle: 'italic' }}>{t('admin.receipt_unavailable')}</p>
              ) : previewUrl ? (
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  <img src={previewUrl} alt={t('admin.receipt_preview')} style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '12px', border: '1px solid var(--border-color)' }} />
                </a>
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t('loading.skeleton')}</p>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn btn-outline" style={{ width: 'auto', padding: '8px 16px', margin: 0, borderColor: 'var(--color-green)', color: 'var(--color-green)' }} onClick={() => handleReview(selectedProof, 'validee')}>
                <Check size={14} style={{ marginRight: '4px' }} />
                <span>{t('admin.validate_proof')}</span>
              </button>
              <button type="button" className="btn btn-outline" style={{ width: 'auto', padding: '8px 16px', margin: 0, borderColor: 'var(--color-red)', color: 'var(--color-red)' }} onClick={() => handleReview(selectedProof, 'rejetee')}>
                <X size={14} style={{ marginRight: '4px' }} />
                <span>{t('admin.reject_proof')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

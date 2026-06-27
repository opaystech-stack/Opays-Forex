import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, CreditCard, LogOut, Clock, CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import { supabase } from '../services/supabase';
import { latestProofStatus } from '../utils/adminActions';
import StandalonePage from '../components/StandalonePage';

const statusThemes = {
  en_attente: { bg: 'rgba(194, 65, 12, 0.08)', border: 'rgba(194, 65, 12, 0.25)', color: '#C2410C', icon: Clock, label: 'access.status_en_attente', badge: '#C2410C' },
  validee: { bg: 'rgba(21, 128, 61, 0.08)', border: 'rgba(21, 128, 61, 0.25)', color: '#15803D', icon: CheckCircle, label: 'access.status_validee', badge: '#15803D' },
  rejetee: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)', color: '#991B1B', icon: XCircle, label: 'access.status_rejetee', badge: '#EF4444' },
};

export default function AccesRestreint() {
  const { user, logOut, profilAcces } = useApp();
  const navigate = useNavigate();
  const t = useT();
  const [proofStatus, setProofStatus] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!supabase || user?.isDemo || !user?.id) { if (active) setProofStatus('none'); return; }
      try {
        const { data, error } = await supabase.from('payment_proofs').select('statut, submitted_at').eq('user_id', user.id);
        if (error) throw error;
        if (active) setProofStatus(latestProofStatus(data) ?? 'none');
      } catch { if (active) setProofStatus('none'); }
    };
    load();
    return () => { active = false; };
  }, [user]);

  const handleLogout = async () => {
    const res = await logOut();
    if (res.success) navigate('/login');
    else alert(t('settings.logout_error_prefix') + res.error);
  };

  const theme = statusThemes[proofStatus];

  return (
    <StandalonePage maxWidth={440}>
      <style>{`
        @keyframes lockPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(79,70,229,0.2); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 14px rgba(79,70,229,0); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes orbDrift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(14px, -10px) scale(1.1); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .ar-card { animation: cardIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .ar-btn { transition: transform 0.12s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease, filter 0.2s ease, background 0.2s ease, border-color 0.2s ease; }
        .ar-btn:active { transform: scale(0.98) !important; }
        .ar-btn-pay:hover {
          filter: brightness(1.08);
          box-shadow: 0 8px 28px rgba(79,70,229,0.4), inset 0 1px 0 rgba(255,255,255,0.15) !important;
        }
        .ar-btn-out:hover { background: rgba(220,38,38,0.06); border-color: rgba(220,38,38,0.5); color: #B91C1C; }
        .ar-btn-admin:hover { background: rgba(99,102,241,0.06); border-color: rgba(99,102,241,0.5); }
        @media (prefers-reduced-motion: reduce) {
          .ar-card { animation: none; opacity: 1; }
          .ar-lock-ring { animation: none !important; }
          .ar-orb { animation: none !important; }
        }
      `}</style>

      {/* Background orbs */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: '28px' }}>
        <div className="ar-orb" style={{ position: 'absolute', top: '-25%', right: '-15%', width: '240px', height: '240px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', animation: 'orbDrift 8s ease-in-out infinite' }} />
        <div className="ar-orb" style={{ position: 'absolute', bottom: '-18%', left: '-12%', width: '200px', height: '200px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,70,229,0.09) 0%, transparent 70%)', animation: 'orbDrift 10s ease-in-out infinite reverse' }} />
      </div>

      {/* Glass card */}
      <div className="ar-card" style={{
        position: 'relative',
        textAlign: 'center',
        padding: '44px 30px 34px',
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(28px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.45)',
        borderRadius: '28px',
        boxShadow: '0 1px 3px rgba(79,70,229,0.04), 0 8px 24px rgba(79,70,229,0.06), 0 32px 72px rgba(79,70,229,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
      }}>

        {/* Eyebrow */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4F46E5', marginBottom: '18px', fontFamily: "'SF Pro Text', 'Space Grotesk', system-ui, monospace" }}>
          <ShieldCheck size={12} strokeWidth={2.5} />
          Accès restreint
        </span>

        {/* Lock ring with pulse */}
        <div className="ar-lock-ring" style={{
          width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 20px',
          background: 'linear-gradient(145deg, rgba(99,102,241,0.12), rgba(79,70,229,0.05))',
          border: '1.5px solid rgba(99,102,241,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'lockPulse 3s ease-in-out infinite',
        }}>
          <Lock size={28} color="#4F46E5" strokeWidth={2.2} />
        </div>

        <h2 style={{ margin: '0 0 8px', fontSize: '22px', fontWeight: 700, color: '#1a1a2e', fontFamily: "'SF Pro Display', 'Space Grotesk', sans-serif", letterSpacing: '-0.01em' }}>
          {t('access.title')}
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, marginBottom: '24px', maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto' }}>
          {t('access.message')}
        </p>

        {/* Proof status — premium box */}
        <div style={{
          padding: '14px 16px', borderRadius: '14px', marginBottom: '24px',
          background: theme ? theme.bg : 'rgba(99,102,241,0.04)',
          border: `1.5px solid ${theme ? theme.border : 'rgba(99,102,241,0.1)'}`,
          boxShadow: theme ? `0 2px 8px ${theme.border}` : 'none',
        }}>
          <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', fontWeight: 700, marginBottom: '8px' }}>
            {t('access.proof_status_label')}
          </span>
          {proofStatus === null ? (
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>…</span>
          ) : proofStatus === 'none' ? (
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>{t('access.no_proof')}</span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              fontWeight: 650, fontSize: '14px', color: theme.color,
              padding: '5px 12px', borderRadius: '8px',
              background: theme.bg,
            }}>
              {(() => { const Icon = theme.icon; return <Icon size={16} color={theme.badge} strokeWidth={2.4} />; })()}
              <span>{t(theme.label)}</span>
            </span>
          )}
        </div>

        {/* Primary CTA — gradient indigo */}
        <button type="button" className="ar-btn ar-btn-pay" onClick={() => navigate('/paiement')} style={{
          width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '14px 20px', border: 'none', borderRadius: '14px', fontSize: '15px', fontWeight: 650, color: '#fff',
          background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 30%, #4F46E5 70%, #4338CA 100%)',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(79,70,229,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
          marginBottom: '10px',
        }}>
          <CreditCard size={17} strokeWidth={2.2} /><span>{t('access.go_to_payment')}</span>
        </button>

        {/* Admin button */}
        {(Boolean(profilAcces?.is_platform_editor) || Boolean(user?.isDemo)) && (
          <button type="button" className="ar-btn ar-btn-admin" onClick={() => navigate('/admin-plateforme')} style={{
            width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '12px 20px', background: 'transparent', border: '1.5px solid rgba(99,102,241,0.22)',
            borderRadius: '14px', fontSize: '14px', fontWeight: 600, color: '#4F46E5',
            cursor: 'pointer', marginBottom: '10px',
          }}>
            <ShieldCheck size={16} /><span>Administration Plateforme</span>
          </button>
        )}

        {/* Logout — elegant red outline */}
        <button type="button" className="ar-btn ar-btn-out" onClick={handleLogout} style={{
          width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '12px 20px', background: 'transparent', border: '1.5px solid rgba(220,38,38,0.2)',
          borderRadius: '14px', fontSize: '14px', fontWeight: 600, color: '#DC2626',
          cursor: 'pointer',
        }}>
          <LogOut size={16} /><span>{t('access.logout')}</span>
        </button>

        {/* Trust footer */}
        <p style={{ marginTop: '22px', fontSize: '11px', color: '#94a3b8', letterSpacing: '0.02em', lineHeight: 1.5 }}>
          🔐 Connexion chiffrée · Données hébergées en Afrique de l'Est
        </p>
      </div>
    </StandalonePage>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, Plus, Check, User, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useT } from '../i18n';
import { useNavigate } from 'react-router-dom';

export default function ProfileDrawer({ isOpen, onClose }) {
  const t = useT();
  const navigate = useNavigate();
  const {
    user,
    currentAgency,
    platformAgencies,
    switchAgency,
    createAgency,
    logOut,
  } = useApp();

  const [newAgencyName, setNewAgencyName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const userInitials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'OP';

  const handleAddAgency = async (e) => {
    e.preventDefault();
    if (!newAgencyName.trim()) return;

    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await createAgency(newAgencyName.trim());
      if (res.success) {
        setSuccessMsg('Agence ajoutée avec succès !');
        setNewAgencyName('');
        setIsCreating(false);
      } else {
        setErrorMsg(res.error || 'Erreur lors de la création');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Une erreur est survenue');
    }
  };

  const handleLogout = async () => {
    const res = await logOut();
    if (res?.success) {
      onClose();
      navigate('/login');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop avec flou */}
          <motion.div
            className="profile-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer glissant */}
          <motion.div
            className="profile-drawer-container"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          >
            {/* En-tête */}
            <div className="profile-drawer-header">
              <div className="profile-drawer-title-area">
                <User size={20} className="profile-drawer-icon" />
                <h3>{'Mon Profil'}</h3>
              </div>
              <button
                type="button"
                className="profile-drawer-close-btn"
                onClick={onClose}
                aria-label="Fermer le menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Infos Utilisateur */}
            <div className="profile-user-card">
              <div className="profile-avatar">
                <span>{userInitials}</span>
              </div>
              <div className="profile-details">
                <span className="profile-email">{user?.email || 'Demo User'}</span>
                <span className="profile-role">
                  {currentAgency ? `${'Agence Active'} : ${currentAgency.name}` : 'Aucune agence active'}
                </span>
              </div>
            </div>

            <hr className="profile-divider" />

            {/* Liste des Agences */}
            <div className="profile-agencies-section">
              <h4 className="profile-section-title">{'Mes Agences'}</h4>
              <div className="profile-agencies-list">
                {platformAgencies.map((agency) => {
                  const isActive = currentAgency?.id === agency.id;
                  return (
                    <button
                      key={agency.id}
                      type="button"
                      className={`profile-agency-item ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        switchAgency(agency);
                        onClose();
                      }}
                    >
                      <Building2 size={16} className="agency-icon" />
                      <span className="agency-name">{agency.name}</span>
                      {isActive && <Check size={16} className="agency-check" />}
                    </button>
                  );
                })}
              </div>

              {/* Formulaire ajout agence */}
              {!isCreating ? (
                <button
                  type="button"
                  className="profile-add-agency-btn"
                  onClick={() => setIsCreating(true)}
                >
                  <Plus size={16} />
                  <span>{'Ajouter une agence'}</span>
                </button>
              ) : (
                <form onSubmit={handleAddAgency} className="profile-add-agency-form">
                  <input
                    type="text"
                    placeholder={"Nom de l'agence..."}
                    value={newAgencyName}
                    onChange={(e) => setNewAgencyName(e.target.value)}
                    className="form-control"
                    required
                    autoFocus
                  />
                  <div className="profile-form-actions">
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                    >
                      {'Ajouter'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setIsCreating(false);
                        setErrorMsg('');
                        setSuccessMsg('');
                      }}
                    >
                      {'Annuler'}
                    </button>
                  </div>
                </form>
              )}

              {errorMsg && <p className="profile-message error">{errorMsg}</p>}
              {successMsg && <p className="profile-message success">{successMsg}</p>}
            </div>

            {/* Pied du Drawer / Déconnexion */}
            <div className="profile-drawer-footer">
              <button
                type="button"
                className="profile-logout-btn"
                onClick={handleLogout}
              >
                <LogOut size={16} />
                <span>{'Déconnexion'}</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

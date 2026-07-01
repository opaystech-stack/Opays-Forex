import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Users, Plus, Trash2, CheckCircle2, AlertCircle, User, Mail, Phone, Shield } from 'lucide-react';
import { useT } from '../i18n';
// Utilise createInvitation du contexte

export default function Employees() {
  const { user, employees, invitations, createInvitation, isUsingMock } = useApp();
  const t = useT();
  const [form, setForm] = useState({ email: '', role: 'agent' });
  const [message, setMessage] = useState(null);
  const allMembers = [...(Array.isArray(employees) ? employees : []), ...(Array.isArray(invitations) ? invitations.filter(i => i.state === 'en_attente') : [])];
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await createInvitation({ email: form.email, role: form.role, permission_grants: [] });
      if (res.success) {
        setMessage({ type: 'success', text: 'Invitation envoyée avec succès' });
        setForm({ email: '', role: 'agent' });
      } else {
        setMessage({ type: 'error', text: res.error || 'Erreur lors de l\'envoi' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Une erreur est survenue' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    // La suppression des employés se fait via le panneau d'administration
    setMessage({ type: 'info', text: 'Utilisez le panneau Admin pour gérer les membres' });
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><Users size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('employees.title')}</h2>
          <p className="ofx-screen-desc">{t('employees.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="ofx-card">
        <div className="ofx-form-row">
          <div className="ofx-form-group">
            <label><User size={14} /> Prenom</label>
            <input type="text" className="ofx-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          </div>
          <div className="ofx-form-group">
            <label>Nom</label>
            <input type="text" className="ofx-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          </div>
        </div>
        <div className="ofx-form-group">
          <label><Mail size={14} /> Email</label>
          <input type="email" className="ofx-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="ofx-form-row">
          <div className="ofx-form-group">
            <label><Phone size={14} /> Telephone</label>
            <input type="tel" className="ofx-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="ofx-form-group">
            <label><Shield size={14} /> Role</label>
            <select className="ofx-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <button type="submit" className="ofx-btn ofx-btn-primary" disabled={loading}>
          <Plus size={16} /> {loading ? t('common.saving') : t('employees.add')}
        </button>
      </form>

      <div className="ofx-section">
        <div className="ofx-section-header">{t('employees.list')} ({employees.length})</div>
        <div className="ofx-list">
          {allMembers.length === 0 ? <p className="ofx-empty">{t('employees.empty')}</p> : allMembers.map(e => (
            <div key={e.id} className="ofx-list-item">
              <div className="ofx-list-icon primary"><User size={18} /></div>
              <div className="ofx-list-body">
                <div className="ofx-list-title">{e.email}</div>
                <div className="ofx-list-sub">Rôle : {e.role}{e.state === 'en_attente' ? ' (En attente)' : ' (Actif)'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Users, Plus, Trash2, CheckCircle2, AlertCircle, User, Mail, Phone, Shield } from 'lucide-react';
import { useT } from '../i18n';
import { employeeApi } from '../services/api';

export default function Employees() {
  const { user, employees, setEmployees, isUsingMock } = useApp();
  const t = useT();
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', role: 'agent', phone: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      let newEmployee;
      if (isUsingMock) {
        newEmployee = { id: crypto.randomUUID(), ...form, agencyId: user?.agencyId, isActive: true, createdAt: new Date().toISOString() };
      } else {
        const res = await employeeApi.create(form);
        newEmployee = res.data;
      }
      setEmployees([newEmployee, ...employees]);
      setMessage({ type: 'success', text: t('employees.created') });
      setForm({ email: '', firstName: '', lastName: '', role: 'agent', phone: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      if (!isUsingMock) await employeeApi.delete(id);
      setEmployees(employees.filter(e => e.id !== id));
      setMessage({ type: 'success', text: t('employees.deleted') });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    }
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
          {employees.length === 0 ? <p className="ofx-empty">{t('employees.empty')}</p> : employees.map(e => (
            <div key={e.id} className="ofx-list-item">
              <div className="ofx-list-icon primary"><User size={18} /></div>
              <div className="ofx-list-body">
                <div className="ofx-list-title">{e.firstName} {e.lastName}</div>
                <div className="ofx-list-sub">{e.email} &bull; {e.phone || '-'} &bull; {e.role}</div>
              </div>
              <button className="ofx-icon-btn danger" onClick={() => handleDelete(e.id)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

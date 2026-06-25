import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Users, Plus, Trash2, CheckCircle2, AlertCircle, User } from 'lucide-react';
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
        newEmployee = {
          id: crypto.randomUUID(),
          ...form,
          agencyId: user?.agencyId,
          isActive: true,
          createdAt: new Date().toISOString()
        };
      } else {
        const res = await employeeApi.create(form);
        newEmployee = res.data;
      }
      const updated = [newEmployee, ...employees];
      setEmployees(updated);
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
      const updated = employees.filter(e => e.id !== id);
      setEmployees(updated);
      setMessage({ type: 'success', text: t('employees.deleted') });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    }
  };

  return (
    <div className="page-card">
      <div className="page-header">
        <Users className="page-icon" size={28} />
        <div>
          <h2 className="page-title">{t('employees.title')}</h2>
          <p className="page-subtitle">{t('employees.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-grid" style={{ marginBottom: '24px' }}>
        <input type="email" placeholder={t('employees.email')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="form-input" />
        <input placeholder={t('employees.firstName')} value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required className="form-input" />
        <input placeholder={t('employees.lastName')} value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} required className="form-input" />
        <input placeholder={t('employees.phone')} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="form-input" />
        <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="form-input">
          <option value="agent">{t('employees.roleAgent')}</option>
          <option value="cashier">{t('employees.roleCashier')}</option>
          <option value="supervisor">{t('employees.roleSupervisor')}</option>
        </select>
        <button type="submit" disabled={loading} className="btn btn-primary">
          <Plus size={18} /> {loading ? t('common.saving') : t('employees.add')}
        </button>
      </form>

      <div className="table-container">
        {employees.length === 0 ? (
          <p className="empty-state">{t('employees.empty')}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('employees.name')}</th>
                <th>{t('employees.email')}</th>
                <th>{t('employees.role')}</th>
                <th>{t('employees.phone')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td><User size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />{emp.firstName || emp.first_name} {emp.lastName || emp.last_name}</td>
                  <td>{emp.email}</td>
                  <td>{emp.role}</td>
                  <td>{emp.phone || '-'}</td>
                  <td>
                    <button onClick={() => handleDelete(emp.id)} className="btn btn-icon btn-danger"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

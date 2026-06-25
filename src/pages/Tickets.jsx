import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquare, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';
import { ticketApi } from '../services/api';

export default function Tickets() {
  const { user, tickets, setTickets, isUsingMock } = useApp();
  const t = useT();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      let ticket;
      if (isUsingMock) {
        ticket = { id: crypto.randomUUID(), subject, body, status: 'open', priority: 'medium', createdBy: user?.id, createdAt: new Date().toISOString(), replies: [] };
      } else {
        const res = await ticketApi.create({ title: subject, description: body });
        ticket = { ...res.data, subject: res.data.title, body: res.data.description, replies: [] };
      }
      setTickets([ticket, ...tickets]);
      setMessage({ type: 'success', text: t('tickets.created') });
      setSubject('');
      setBody('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const reply = async (id, text) => {
    try {
      const ticket = tickets.find(tk => tk.id === id);
      const replies = [...(ticket.replies || []), { text, at: new Date().toISOString() }];
      if (!isUsingMock) {
        await ticketApi.update(id, { description: `${ticket.body || ticket.description}\n\nReply: ${text}` });
      }
      setTickets(tickets.map(tk => tk.id === id ? { ...tk, replies } : tk));
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    }
  };

  return (
    <div className="ofx-scrollable-page">
      <div className="ofx-screen-header">
        <div className="ofx-screen-icon"><MessageSquare size={28} /></div>
        <div>
          <h2 className="ofx-screen-title">{t('tickets.title')}</h2>
          <p className="ofx-screen-desc">{t('tickets.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`ofx-alert ${message.type === 'success' ? 'ofx-alert-success' : 'ofx-alert-error'}`}>
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="ofx-card">
        <div className="ofx-form-group">
          <input type="text" className="ofx-input" placeholder={t('tickets.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </div>
        <div className="ofx-form-group">
          <textarea className="ofx-input" rows={3} placeholder={t('tickets.body')} value={body} onChange={(e) => setBody(e.target.value)} required />
        </div>
        <button type="submit" className="ofx-btn ofx-btn-primary" disabled={loading}>
          <Send size={16} /> {loading ? t('common.sending') : t('tickets.create')}
        </button>
      </form>

      <div className="ofx-section">
        <div className="ofx-section-header">{t('tickets.list')} ({tickets.length})</div>
        <div className="ofx-list">
          {tickets.length === 0 ? <p className="ofx-empty">{t('tickets.empty')}</p> : tickets.map(tk => (
            <div key={tk.id} className="ofx-card ofx-card-compact">
              <div className="ofx-ticket-header">
                <span className="ofx-ticket-subject">{tk.subject || tk.title}</span>
                <span className={`ofx-status ${tk.status}`}>{tk.status}</span>
              </div>
              <p className="ofx-ticket-body">{tk.body || tk.description}</p>
              {tk.replies?.map((r, i) => <p key={i} className="ofx-ticket-reply">→ {r.text}</p>)}
              <ReplyForm onReply={(text) => reply(tk.id, text)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReplyForm({ onReply }) {
  const [text, setText] = useState('');
  const t = useT();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onReply(text); setText(''); } }} className="ofx-reply-form">
      <input className="ofx-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('tickets.reply')} />
      <button type="submit" className="ofx-icon-btn primary"><Send size={16} /></button>
    </form>
  );
}

import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { MessageSquare, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useT } from '../i18n';

export default function Tickets() {
  const { user, setTickets } = useApp();
  const t = useT();
  const [list, setList] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const ticket = {
        id: crypto.randomUUID(),
        subject,
        body,
        status: 'open',
        priority: 'medium',
        createdBy: user?.id,
        createdAt: new Date().toISOString(),
        replies: []
      };
      const updated = [ticket, ...list];
      setList(updated);
      if (setTickets) setTickets(updated);
      setMessage({ type: 'success', text: t('tickets.created') });
      setSubject('');
      setBody('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message || t('common.error') });
    } finally {
      setLoading(false);
    }
  };

  const reply = (id, text) => {
    const updated = list.map(tk => tk.id === id ? { ...tk, replies: [...(tk.replies || []), { text, at: new Date().toISOString() }] } : tk);
    setList(updated);
    if (setTickets) setTickets(updated);
  };

  return (
    <div className="page-card">
      <div className="page-header">
        <MessageSquare className="page-icon" size={28} />
        <div>
          <h2 className="page-title">{t('tickets.title')}</h2>
          <p className="page-subtitle">{t('tickets.subtitle')}</p>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-grid" style={{ marginBottom: '24px' }}>
        <input placeholder={t('tickets.subject')} value={subject} onChange={e => setSubject(e.target.value)} required className="form-input" />
        <textarea placeholder={t('tickets.body')} value={body} onChange={e => setBody(e.target.value)} required className="form-input" rows={3} />
        <button type="submit" disabled={loading} className="btn btn-primary">
          <Send size={18} /> {loading ? t('common.sending') : t('tickets.create')}
        </button>
      </form>

      <div className="list-container">
        {list.length === 0 ? (
          <p className="empty-state">{t('tickets.empty')}</p>
        ) : (
          list.map(tk => (
            <div key={tk.id} className="ticket-card">
              <div className="ticket-header">
                <span className="ticket-subject">{tk.subject}</span>
                <span className={`status-badge ${tk.status}`}>{tk.status}</span>
              </div>
              <p className="ticket-body">{tk.body}</p>
              {tk.replies?.map((r, i) => <p key={i} className="ticket-reply">→ {r.text}</p>)}
              <ReplyForm onReply={text => reply(tk.id, text)} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ReplyForm({ onReply }) {
  const [text, setText] = useState('');
  const t = useT();
  return (
    <form onSubmit={e => { e.preventDefault(); if (text.trim()) { onReply(text); setText(''); } }} className="reply-form">
      <input value={text} onChange={e => setText(e.target.value)} placeholder={t('tickets.reply')} className="form-input" />
      <button type="submit" className="btn btn-secondary"><Send size={16} /></button>
    </form>
  );
}

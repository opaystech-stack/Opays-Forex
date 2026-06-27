import { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Plane, Send, CheckCircle2, AlertCircle, Trash2, Lock, Clock, History,
} from 'lucide-react';
import { useT } from '../i18n';
import { computeFlightProfit, validateFlightBooking } from '../utils/flightBooking';
import {
  isValidFlightLeadTime,
  FLIGHT_LEAD_TIME_DEFAULT_HOURS,
} from '../utils/reminderSchedule';

const fmt = new Intl.NumberFormat('fr-FR');

// Écran de réservation enrichie de billets d'avion (Exigence 12).
//
// Gardé par la permission `services.vendre` (Req 12.1) et par l'activation du
// Module_Additionnel `billets_avion` (Req 12.1). La saisie capture l'ensemble des
// champs d'une Reservation_Billet (Req 12.2), calcule la marge en direct via la
// fonction pure `computeFlightProfit` (Req 12.3), permet de configurer le
// Delai_Rappel_Vol borné par `isValidFlightLeadTime` (Req 12.6, 12.7) et affiche
// l'Historique_Rappels de chaque réservation (Req 12.8). La fiabilisation finale
// passe par `validateFlightBooking` avant l'appel à `createFlightBooking`.
export default function Billets() {
  const t = useT();
  const {
    flightBookings,
    createFlightBooking,
    deleteFlightBooking,
    hasPermission,
    isModuleEnabled,
    loading,
  } = useApp();

  const [customerName, setCustomerName] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [airline, setAirline] = useState('');
  const [departureAirport, setDepartureAirport] = useState('');
  const [arrivalAirport, setArrivalAirport] = useState('');
  const [destination, setDestination] = useState('');
  const [flightDate, setFlightDate] = useState('');
  const [agencyPrice, setAgencyPrice] = useState('');
  const [customerPrice, setCustomerPrice] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [leadTime, setLeadTime] = useState(String(FLIGHT_LEAD_TIME_DEFAULT_HOURS));
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const canSell = hasPermission('services.vendre');
  const moduleEnabled = isModuleEnabled('billets_avion');

  // Marge calculée en direct : prix client − prix agence (Req 12.3), via la
  // fonction pure partagée afin de garantir la cohérence avec l'enregistrement.
  const livePreviewProfit = useMemo(
    () => computeFlightProfit(customerPrice, agencyPrice),
    [customerPrice, agencyPrice],
  );

  const resetForm = () => {
    setCustomerName('');
    setTicketNumber('');
    setAirline('');
    setDepartureAirport('');
    setArrivalAirport('');
    setDestination('');
    setFlightDate('');
    setAgencyPrice('');
    setCustomerPrice('');
    setWhatsapp('');
    setLeadTime(String(FLIGHT_LEAD_TIME_DEFAULT_HOURS));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Configuration du Delai_Rappel_Vol : borné à 1..168 heures (Req 12.6, 12.7).
    const leadTimeHours = parseInt(leadTime, 10);
    if (!isValidFlightLeadTime(leadTimeHours)) {
      setMessage({ type: 'error', text: t('billets.error_lead_time_invalid') });
      return;
    }

    // Validation métier via la logique pure partagée (Req 12.2, 12.4).
    const check = validateFlightBooking({
      ticketNumber,
      flightDate,
      agencyPrice,
      customerPrice,
    });
    if (!check.ok) {
      const fieldMessages = {
        ticketNumber: t('billets.error_ticket_required'),
        flightDate: t('billets.error_flight_date_invalid'),
        agencyPrice: t('billets.error_agency_price_invalid'),
        customerPrice: t('billets.error_client_price_invalid'),
      };
      setMessage({ type: 'error', text: fieldMessages[check.field] || check.error });
      return;
    }

    setSaving(true);
    const res = await createFlightBooking({
      customer_name: customerName.trim(),
      ticket_number: ticketNumber.trim(),
      airline: airline.trim() || null,
      departure_airport: departureAirport.trim() || null,
      arrival_airport: arrivalAirport.trim() || null,
      destination: destination.trim() || null,
      flight_at: flightDate,
      agency_price: parseFloat(agencyPrice),
      customer_price: parseFloat(customerPrice),
      customer_whatsapp: whatsapp.trim() || null,
      flight_lead_time_hours: leadTimeHours,
    });
    setSaving(false);

    if (res.success) {
      setMessage({ type: 'success', text: t('billets.save_success') });
      resetForm();
    } else {
      setMessage({ type: 'error', text: res.error });
    }
  };

  const handleDelete = async (id) => {
    const res = await deleteFlightBooking(id);
    if (res.success) {
      setMessage({ type: 'success', text: t('billets.save_success') });
    } else {
      setMessage({ type: 'error', text: res.error });
    }
  };

  if (loading) {
    return (
      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
        {t('loading.data')}
      </p>
    );
  }

  // Garde module : le Module_Additionnel `billets_avion` doit être activé (Req 12.1).
  if (!moduleEnabled) {
    return (
      <div>
        <div className="screen-header">
          <h2 className="screen-title">{t('billets.title')}</h2>
          <p className="screen-desc">{t('billets.desc')}</p>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('billets.module_disabled')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="screen-header">
        <h2 className="screen-title">{t('billets.title')}</h2>
        <p className="screen-desc">{t('billets.desc')}</p>
      </div>

      {message && (
        <div
          className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-info'}`}
          style={{ marginBottom: '14px' }}
        >
          {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Garde permission : `services.vendre` requise pour enregistrer (Req 12.1). */}
      {!canSell ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Lock size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('billets.permission_denied')}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '18px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '14px', color: 'var(--deep-navy)' }}>
            <Plane size={15} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {t('billets.title')}
          </h3>

          {/* Client + numéro de billet */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('billets.customer_name_label')}</label>
              <input
                type="text"
                className="form-control"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('billets.ticket_number_label')}</label>
              <input
                type="text"
                className="form-control"
                maxLength={60}
                value={ticketNumber}
                onChange={(e) => setTicketNumber(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Compagnie + date du vol */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('billets.airline_label')}</label>
              <input
                type="text"
                className="form-control"
                value={airline}
                onChange={(e) => setAirline(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('billets.flight_date_label')}</label>
              <input
                type="date"
                className="form-control"
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Aéroports départ / arrivée */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('billets.departure_airport_label')}</label>
              <input
                type="text"
                className="form-control"
                value={departureAirport}
                onChange={(e) => setDepartureAirport(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('billets.arrival_airport_label')}</label>
              <input
                type="text"
                className="form-control"
                value={arrivalAirport}
                onChange={(e) => setArrivalAirport(e.target.value)}
              />
            </div>
          </div>

          {/* Destination + contact WhatsApp */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('billets.destination_label')}</label>
              <input
                type="text"
                className="form-control"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('billets.whatsapp_label')}</label>
              <input
                type="tel"
                className="form-control"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          {/* Prix agence + prix client */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('billets.agency_price_label')}</label>
              <input
                type="number"
                step="any"
                min="0"
                className="form-control"
                value={agencyPrice}
                onChange={(e) => setAgencyPrice(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('billets.client_price_label')}</label>
              <input
                type="number"
                step="any"
                min="0"
                className="form-control"
                value={customerPrice}
                onChange={(e) => setCustomerPrice(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Marge calculée en direct (Req 12.3) */}
          <div className="stat-box" style={{ marginBottom: '14px' }}>
            <span className="stat-label">{t('billets.profit_label')}</span>
            <span
              className="stat-value"
              style={{ color: livePreviewProfit >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}
            >
              {fmt.format(livePreviewProfit)}
            </span>
          </div>

          {/* Configuration du Delai_Rappel_Vol (Req 12.6, 12.7) */}
          <div className="form-group">
            <label className="form-label">
              <Clock size={13} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
              {t('billets.lead_time_label')}
            </label>
            <input
              type="number"
              step="1"
              min="1"
              max="168"
              className="form-control"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{
              width: '100%', fontSize: '13px', marginTop: '4px',
              backgroundColor: 'var(--primary-blue)',
              boxShadow: '0 6px 20px var(--primary-blue-glow)',
            }}
          >
            <Send size={16} />
            <span>{saving ? t('billets.saving') : t('billets.save')}</span>
          </button>
        </form>
      )}

      {/* Réservations récentes + Historique_Rappels (Req 12.2, 12.8) */}
      <div className="screen-header" style={{ marginTop: '25px' }}>
        <h3 style={{
          fontSize: '14px', textTransform: 'uppercase', color: 'var(--text-secondary)',
          letterSpacing: '0.5px',
        }}>
          {t('billets.list_title')}
        </h3>
      </div>

      {(Array.isArray(flightBookings) ? flightBookings : []).length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <Plane size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {t('billets.empty')}
          </p>
        </div>
      ) : (
        <div className="ledger-list" style={{ marginBottom: '15px' }}>
          {flightBookings.map((b) => {
            const flight = b.flight_at ? new Date(b.flight_at) : null;
            const dateStr = flight && !Number.isNaN(flight.getTime())
              ? flight.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : '—';
            const route = [b.departure_airport, b.arrival_airport].filter(Boolean).join(' → ');
            const profit = Number(b.profit) || 0;
            const history = Array.isArray(b.reminder_history) ? b.reminder_history : [];
            return (
              <div key={b.id} className="card" style={{ marginBottom: '10px', padding: '14px' }}>
                <div className="ledger-item" style={{ borderBottom: 'none', padding: 0 }}>
                  <div className="ledger-left">
                    <div className="ledger-icon-box">
                      <Plane size={18} />
                    </div>
                    <div className="ledger-details">
                      <span className="ledger-title">
                        {b.customer_name || '—'}
                        {b.airline ? ` · ${b.airline}` : ''}
                      </span>
                      <span className="ledger-subtitle">
                        {t('billets.col_ticket')}: {b.ticket_number || '—'}
                        {route ? ` · ${route}` : ''}
                      </span>
                      <span className="ledger-subtitle">
                        {t('billets.col_flight_date')}: {dateStr}
                      </span>
                    </div>
                  </div>
                  <div className="ledger-right">
                    <span
                      className="ledger-value"
                      style={{ color: profit >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}
                    >
                      {t('billets.col_profit')}: {fmt.format(profit)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id)}
                      className="btn btn-outline"
                      aria-label={t('common.delete') || 'Supprimer'}
                      title={t('common.delete') || 'Supprimer'}
                      style={{
                        marginTop: '6px', width: '44px', height: '44px', padding: 0,
                        borderColor: 'var(--color-red)', color: 'var(--color-red)', margin: 0,
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Historique_Rappels de la réservation (Req 12.8) */}
                <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-light, rgba(0,0,0,0.08))', paddingTop: '10px' }}>
                  <span style={{
                    fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)',
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                  }}>
                    <History size={13} />
                    {t('billets.history_title')}
                  </span>
                  {history.length === 0 ? (
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                      {t('billets.history_empty')}
                    </p>
                  ) : (
                    <table style={{ width: '100%', fontSize: '12px', marginTop: '6px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '4px 6px' }}>{t('billets.hist_col_date')}</th>
                          <th style={{ padding: '4px 6px' }}>{t('billets.hist_col_type')}</th>
                          <th style={{ padding: '4px 6px' }}>{t('billets.hist_col_status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((entry, idx) => {
                          const ts = entry.timestamp || entry.date || entry.created_at || entry.sent_at;
                          const tsDate = ts ? new Date(ts) : null;
                          const tsStr = tsDate && !Number.isNaN(tsDate.getTime())
                            ? tsDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
                              ' ' +
                              tsDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                            : '—';
                          return (
                            <tr key={entry.id || idx} style={{ borderTop: '1px solid var(--border-light, rgba(0,0,0,0.05))' }}>
                              <td style={{ padding: '4px 6px' }}>{tsStr}</td>
                              <td style={{ padding: '4px 6px' }}>{entry.type || 'flight_reminder'}</td>
                              <td style={{ padding: '4px 6px' }}>{entry.status || entry.result || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

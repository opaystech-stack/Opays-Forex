export default function FilterPills({ active, onChange, options }) {
  return (
    <div className="ofx-filter-pills">
      {options.map((opt) => (
        <button
          key={opt.id}
          className={`ofx-pill ${active === opt.id ? 'active' : ''}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

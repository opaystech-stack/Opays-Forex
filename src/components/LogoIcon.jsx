import { CircleDollarSign } from 'lucide-react';

export default function LogoIcon({ className = '' }) {
  return (
    <div className={`logo-icon ${className}`}>
      <CircleDollarSign size={32} />
    </div>
  );
}

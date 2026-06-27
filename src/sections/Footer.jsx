import { Mail, MessageCircle } from 'lucide-react';
import { useT } from '../i18n';

export default function Footer() {
  const t = useT();
  return (
    <footer className="border-t border-[#1A2642]" style={{ background: '#080E1A' }}>
      <div className="max-w-[1200px] mx-auto px-6 lg:px-12 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 lg:gap-8">
          {/* Brand */}
          <div>
            <a href="/" className="flex items-center gap-2">
              <img
                src="/logo_fox-icone.png"
                alt="Opays Forex"
                style={{ height: '36px', width: 'auto', display: 'block' }}
                onError={(e) => { e.currentTarget.src = '/logo-fox.png'; }}
              />
              <span className="font-display text-lg font-bold text-[#F8FAFC]">OpaysFox</span>
            </a>
            <p className="mt-4 text-sm text-[#94A3B8] leading-relaxed max-w-[240px]">
              {t('landing.footer.tagline')}
            </p>
          </div>

          {/* À propos */}
          <div>
            <h4 className="text-sm font-semibold text-[#F8FAFC] mb-4">{t('landing.footer.col_company')}</h4>
            <ul className="flex flex-col gap-2.5">
              <li>
                <a
                  href="https://www.opays.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                >
                  {t('landing.footer.link_about')}
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-[#F8FAFC] mb-4">{t('landing.footer.col_contact')}</h4>
            <ul className="flex flex-col gap-2.5">
              <li>
                <a
                  href="mailto:opaystech@gmail.com"
                  className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors inline-flex items-center gap-2"
                >
                  <Mail size={15} /> opaystech@gmail.com
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/243983819398"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#94A3B8] hover:text-[#F8FAFC] transition-colors inline-flex items-center gap-2"
                >
                  <MessageCircle size={15} /> +243 983 819398
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-[#1A2642] flex items-center justify-center">
          <p className="text-[13px] text-[#94A3B8]">
            {t('landing.footer.copyright')}
          </p>
        </div>
      </div>
    </footer>
  );
}

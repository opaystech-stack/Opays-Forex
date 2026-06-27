import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// i18n neutralise : useT renvoie la cle (rendu deterministe et isole).
// `t` est defini UNE SEULE FOIS via vi.hoisted (reference STABLE) pour eviter
// que les useMemo/useCallback dependant de `t` ne se re-executent en boucle
// (cf. EspaceAdminPlateforme.test.jsx / VoiceAgentModal.test.jsx).
const stableT = vi.hoisted(() => (key) => key);
vi.mock('../i18n', () => ({
  useT: () => stableT,
}));

import StandaloneAdminHeader from './StandaloneAdminHeader';
import BrandHeader from './BrandHeader';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StandaloneAdminHeader (Req 1.1, 1.2, 1.4)', () => {
  it("rend exactement un controle retour puis un controle deconnexion dans l'ordre DOM (Req 1.1, 1.4)", () => {
    render(<StandaloneAdminHeader onBack={() => {}} onLogout={() => {}} />);

    const backButtons = document.querySelectorAll('.standalone-header__back');
    const logoutButtons = document.querySelectorAll('.standalone-header__logout');

    // Exactement un de chaque.
    expect(backButtons).toHaveLength(1);
    expect(logoutButtons).toHaveLength(1);

    // Ordre DOM : le bouton retour vient TOUJOURS avant le bouton deconnexion.
    const allButtons = Array.from(document.querySelectorAll('.standalone-header button'));
    expect(allButtons).toHaveLength(2);
    expect(allButtons[0]).toBe(backButtons[0]);
    expect(allButtons[1]).toBe(logoutButtons[0]);
    expect(
      backButtons[0].compareDocumentPosition(logoutButtons[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("affiche les libelles t('nav.dashboard') et t('access.logout') (Req 1.2)", () => {
    render(<StandaloneAdminHeader onBack={() => {}} onLogout={() => {}} />);

    expect(screen.getByText('nav.dashboard')).toBeTruthy();
    expect(screen.getByText('access.logout')).toBeTruthy();

    // Les libelles sont bien rattaches aux bons controles.
    expect(
      document.querySelector('.standalone-header__back').textContent
    ).toContain('nav.dashboard');
    expect(
      document.querySelector('.standalone-header__logout').textContent
    ).toContain('access.logout');
  });

  it('appelle onBack au clic sur retour et onLogout au clic sur deconnexion (Req 1.4)', () => {
    const onBack = vi.fn();
    const onLogout = vi.fn();
    render(<StandaloneAdminHeader onBack={onBack} onLogout={onLogout} />);

    fireEvent.click(document.querySelector('.standalone-header__back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.standalone-header__logout'));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('BrandHeader (Req 11.3, 11.4)', () => {
  it("rend le nom de marque depuis t('app.title') par defaut (Req 11.3)", () => {
    render(<BrandHeader />);

    expect(screen.getByText('app.title')).toBeTruthy();
    expect(
      document.querySelector('.brand-header__name').textContent
    ).toBe('app.title');
  });

  it('rend le title fourni a la place du nom par defaut (Req 11.3)', () => {
    render(<BrandHeader title="Ma Marque" />);

    expect(screen.getByText('Ma Marque')).toBeTruthy();
    expect(
      document.querySelector('.brand-header__name').textContent
    ).toBe('Ma Marque');
    // Le nom i18n par defaut n'est plus rendu.
    expect(screen.queryByText('app.title')).toBeNull();
  });

  it('rend le subtitle lorsqu il est fourni, et l omet sinon (Req 11.4)', () => {
    const { rerender } = render(<BrandHeader subtitle="Mon slogan" />);

    expect(screen.getByText('Mon slogan')).toBeTruthy();
    expect(document.querySelector('.brand-header__subtitle')).toBeTruthy();

    rerender(<BrandHeader />);
    expect(screen.queryByText('Mon slogan')).toBeNull();
    expect(document.querySelector('.brand-header__subtitle')).toBeNull();
  });
});

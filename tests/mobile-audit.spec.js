import { test, expect } from '@playwright/test';

const BASE = process.env.OPAYS_FOX_URL || 'https://fox.opays.io';

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', 'demo@opays.io');
  await page.fill('input[type="password"]', 'demo123');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/app/**`, { timeout: 15000 });
}

async function isScrollable(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const s = window.getComputedStyle(el);
    return s.overflowY === 'auto' || s.overflowY === 'scroll';
  }, selector);
}

test.describe('Audit mobile OpaysFox v2.7', () => {
  test.use({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' });

  test('Landing page affiche le hero et le CTA', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('text=Gerez Votre Forex')).toBeVisible();
    await expect(page.locator('text=Demarrer Gratuitement')).toBeVisible();
    await expect(page.locator('text=Multi-Devises en Temps Reel')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/landing.png', fullPage: true });
  });

  test('Connexion demo redirige vers /app', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.ofx-app', { timeout: 15000 });
    await expect(page.locator('.ofx-top-bar')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/dashboard.png', fullPage: false });
  });

  test('Dashboard est scrollable avec suggestions et 4 onglets', async ({ page }) => {
    await login(page);
    await expect(page.locator('.ofx-suggestion-chips')).toBeVisible();
    expect(await page.locator('.ofx-chip').count()).toBeGreaterThan(0);
    await expect(page.locator('.ofx-bottom-nav')).toBeVisible();
    for (const label of ['Dashboard', 'Caisse', 'Depense', 'Menu']) {
      await expect(page.locator('.ofx-bottom-nav button', { hasText: label })).toBeVisible();
    }
    expect(await isScrollable(page, '.ofx-scrollable-page')).toBe(true);
  });

  test('Tiroir profil et switch agence', async ({ page }) => {
    await login(page);
    await page.click('.ofx-avatar-btn');
    await expect(page.locator('.ofx-drawer')).toBeVisible();
    await expect(page.locator('text=Agences')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/profile-drawer.png', fullPage: false });
  });

  test('Catalogue WhatsApp premium', async ({ page }) => {
    await login(page);
    await page.click('.ofx-whatsapp-fab');
    await expect(page.locator('.ofx-whatsapp-modal')).toBeVisible();
    await expect(page.locator('text=WhatsApp')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/whatsapp-catalog.png', fullPage: false });
  });

  test('Vue Caisse scrollable', async ({ page }) => {
    await login(page);
    await page.click('.ofx-bottom-nav button', { hasText: 'Caisse' });
    await page.waitForTimeout(600);
    expect(await isScrollable(page, '.ofx-scrollable-page')).toBe(true);
    await page.evaluate(() => document.querySelector('.ofx-scrollable-page')?.scrollBy(0, 300));
    await page.screenshot({ path: 'tests/screenshots/wallets-scroll.png', fullPage: false });
  });

  test('Vue Depense scrollable', async ({ page }) => {
    await login(page);
    await page.click('.ofx-bottom-nav button', { hasText: 'Depense' });
    await page.waitForTimeout(600);
    expect(await isScrollable(page, '.ofx-scrollable-page')).toBe(true);
    await page.screenshot({ path: 'tests/screenshots/expenses.png', fullPage: false });
  });

  test('Vue Menu contient les modules', async ({ page }) => {
    await login(page);
    await page.click('.ofx-bottom-nav button', { hasText: 'Menu' });
    await page.waitForTimeout(600);
    for (const label of ['Transactions', 'Employes', 'Transferts', 'Tickets']) {
      await expect(page.locator('text=' + label)).toBeVisible();
    }
    await page.screenshot({ path: 'tests/screenshots/menu.png', fullPage: false });
  });

  test('Navigation secondaire : Dettes, Abonnements, Parametres', async ({ page }) => {
    await login(page);
    await page.click('.ofx-bottom-nav button', { hasText: 'Menu' });
    await page.click('text=Prets / Creances');
    await page.waitForTimeout(600);
    await expect(page.locator('.ofx-screen-title', { hasText: 'Prets / Creances' })).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/loans.png', fullPage: false });
  });
});

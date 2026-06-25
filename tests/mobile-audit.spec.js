import { test, expect } from '@playwright/test';

const BASE = process.env.OPAYS_FOX_URL || 'https://fox.opays.io';

async function login(page) {
  await page.goto(`${BASE}/auth`);
  await page.fill('input[type="email"]', 'demo@opays.io');
  await page.fill('input[type="password"]', 'demo123');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/app`, { timeout: 10000 });
}

test.describe('Audit mobile OpaysFox', () => {
  test.use({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' });

  test('Landing page s\\u0027affiche correctement', async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('text=Gerez Votre Forex et Mobile Money')).toBeVisible();
    await expect(page.locator('text=Lancement Officiel')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/landing.png', fullPage: true });
  });

  test('Login et dashboard scrollable', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.ofx-app', { timeout: 10000 });
    await page.screenshot({ path: 'tests/screenshots/dashboard.png', fullPage: false });

    const scrollable = await page.evaluate(() => {
      const el = document.querySelector('.ofx-scrollable-page, .ofx-main');
      if (!el) return false;
      const s = window.getComputedStyle(el);
      return s.overflowY === 'auto' || s.overflowY === 'scroll';
    });
    expect(scrollable).toBe(true);
  });

  test('Navigation 4 onglets visible', async ({ page }) => {
    await login(page);
    const labels = ['Dashboard', 'Caisse', 'Depense', 'Menu'];
    for (const label of labels) {
      await expect(page.locator('.ofx-nav', { hasText: label })).toBeVisible();
    }
    await page.screenshot({ path: 'tests/screenshots/bottom-nav.png', fullPage: false });
  });

  test('Suggestions contextuelles presentes', async ({ page }) => {
    await login(page);
    await expect(page.locator('.ofx-suggestion-chips')).toBeVisible();
    const chips = await page.locator('.ofx-chip').count();
    expect(chips).toBeGreaterThan(0);
  });

  test('Profile drawer avec switch agence', async ({ page }) => {
    await login(page);
    await page.click('.ofx-avatar-btn');
    await expect(page.locator('.ofx-drawer')).toBeVisible();
    await expect(page.locator('text=Agences')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/profile-drawer.png', fullPage: false });
  });

  test('WhatsApp catalog premium', async ({ page }) => {
    await login(page);
    await page.click('.ofx-whatsapp-fab');
    await expect(page.locator('.ofx-whatsapp-modal')).toBeVisible();
    await expect(page.locator('text=Commander via WhatsApp')).toBeVisible();
    await expect(page.locator('text=Mobile Money')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/whatsapp-catalog.png', fullPage: false });
  });

  test('Vue Caisse scrollable sans chevauchement', async ({ page }) => {
    await login(page);
    await page.click('.ofx-nav', { hasText: 'Caisse' });
    await page.waitForTimeout(600);
    const scrollable = await page.evaluate(() => {
      const el = document.querySelector('.ofx-scrollable-page');
      if (!el) return false;
      const s = window.getComputedStyle(el);
      return s.overflowY === 'auto' || s.overflowY === 'scroll';
    });
    expect(scrollable).toBe(true);
    await page.evaluate(() => document.querySelector('.ofx-scrollable-page').scrollBy(0, 400));
    await page.screenshot({ path: 'tests/screenshots/wallets-scroll.png', fullPage: false });
  });

  test('Vue Depense scrollable', async ({ page }) => {
    await login(page);
    await page.click('.ofx-nav', { hasText: 'Depense' });
    await page.waitForTimeout(600);
    const scrollable = await page.evaluate(() => {
      const el = document.querySelector('.ofx-scrollable-page');
      if (!el) return false;
      const s = window.getComputedStyle(el);
      return s.overflowY === 'auto' || s.overflowY === 'scroll';
    });
    expect(scrollable).toBe(true);
    await page.screenshot({ path: 'tests/screenshots/expenses.png', fullPage: false });
  });

  test('Vue Menu contient tous les modules', async ({ page }) => {
    await login(page);
    await page.click('.ofx-nav', { hasText: 'Menu' });
    await page.waitForTimeout(600);
    await expect(page.locator('text=Transactions')).toBeVisible();
    await expect(page.locator('text=Employes')).toBeVisible();
    await expect(page.locator('text=Transferts')).toBeVisible();
    await page.screenshot({ path: 'tests/screenshots/menu.png', fullPage: false });
  });
});

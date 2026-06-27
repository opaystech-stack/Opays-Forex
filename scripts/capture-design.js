import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  console.log('Navigating to local app...');
  
  // Navigate to login
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  
  // We need to wait for the page to load visually
  await page.waitForTimeout(3000);
  
  // Take screenshot of the index/login
  await page.screenshot({ path: path.join(__dirname, '../capture-index.png') });
  console.log('Saved capture-index.png');

  // Try to go to admin-plateforme directly
  await page.goto('http://localhost:5173/admin-plateforme', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: path.join(__dirname, '../capture-admin-plateforme.png') });
  console.log('Saved capture-admin-plateforme.png');

  // Try the paiement page which user showed
  await page.goto('http://localhost:5173/paiement', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  await page.screenshot({ path: path.join(__dirname, '../capture-paiement.png') });
  console.log('Saved capture-paiement.png');

  await browser.close();
  console.log('Done!');
})();

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  console.log('Navigating to login page...');
  await page.goto('http://127.0.0.1:5173/login');
  await page.waitForTimeout(2000);

  // Take screenshot of login page
  const loginPath = path.resolve('C:/Users/lamsa/.gemini/antigravity/brain/d786f3eb-5b8d-456f-99df-1d081ada255b/login_page.png');
  await page.screenshot({ path: loginPath });
  console.log(`Saved login screenshot to: ${loginPath}`);

  // Click on "Accéder au mode démo" button
  console.log('Clicking demo mode button...');
  // The button has the text auth.signin.demo or is a button with border-dashed
  const demoButton = page.locator('button:has-text("démo"), button:has-text("demo"), button:has-text("Démo"), button:has-text("demo")');
  if (await demoButton.count() > 0) {
    await demoButton.first().click();
  } else {
    // fallback by clicking the last button or using selector
    await page.click('button:last-of-type');
  }

  console.log('Waiting for navigation to dashboard...');
  await page.waitForTimeout(3000); // wait for page transition and rendering

  // Take screenshot of dashboard page
  const dashPath = path.resolve('C:/Users/lamsa/.gemini/antigravity/brain/d786f3eb-5b8d-456f-99df-1d081ada255b/dashboard_page.png');
  await page.screenshot({ path: dashPath });
  console.log(`Saved dashboard screenshot to: ${dashPath}`);

  await browser.close();
  console.log('Done!');
})();

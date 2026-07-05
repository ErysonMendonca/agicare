import { chromium } from 'playwright';

const URL = process.argv[2] || 'https://agicare-henna.vercel.app/estoque/produtos/novo';

(async () => {
  console.log(`Testing ${URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  console.log("Navigating...");
  await page.goto(URL);
  
  console.log("Waiting for network idle...");
  await page.waitForLoadState('networkidle');

  console.log("Filling form...");
  await page.fill('input[name="name"]', 'Produto de Teste Automatizado ' + Date.now());
  
  console.log("Clicking save...");
  // Wait for the save button to be visible and enabled
  await page.waitForSelector('button:has-text("Salvar")');
  
  const [response] = await Promise.all([
    page.waitForResponse(res => res.url().includes('/estoque/produtos/novo') && res.request().method() === 'POST'),
    page.click('button:has-text("Salvar")')
  ]);

  console.log(`POST Response Status: ${response.status()} ${response.statusText()}`);
  const text = await response.text();
  console.log(`POST Response Body Prefix: ${text.substring(0, 500)}`);
  
  await page.waitForTimeout(3000); // wait for UI to update

  await page.screenshot({ path: 'test-result.png', fullPage: true });
  console.log("Screenshot saved to test-result.png");
  
  await browser.close();
})();

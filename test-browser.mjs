import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

async function run() {
  if (!supabaseServiceKey) {
    console.error("No service role key");
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: users, error } = await supabase.auth.admin.listUsers();
  if (error || !users.users.length) {
    console.error("No users found", error);
    return;
  }
  
  const user = users.users.find(u => u.email) || users.users[0];
  console.log("Using user:", user.email);
  
  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  
  if (linkErr) {
    console.error("Link error", linkErr);
    return;
  }
  
  console.log("Starting browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  console.log("Navigating to magic link...");
  await page.goto(link.properties.action_link + '&redirect_to=http://localhost:3000');
  
  await page.waitForURL('**/localhost:3000**', { timeout: 10000 });
  console.log("Logged in!");
  
  console.log("Navigating to /estoque/produtos/novo...");
  await page.goto('http://localhost:3000/estoque/produtos/novo');
  
  await page.waitForLoadState('networkidle');
  
  console.log("Filling form...");
  await page.fill('input[name="name"]', 'Produto Teste Script');
  
  console.log("Submitting...");
  await page.click('button[type="submit"]');
  
  console.log("Waiting for network idle...");
  // Wait a bit to see if it redirects or shows an error
  await page.waitForTimeout(5000);
  
  const url = page.url();
  console.log("Current URL after submit:", url);
  
  const content = await page.content();
  if (content.includes('Algo deu errado')) {
    console.error("CRASH! Global Error Boundary shown.");
  } else if (content.includes('Produto cadastrado')) {
    console.log("SUCCESS! Redirected or toast shown.");
  } else if (content.includes('Erro inesperado no servidor')) {
    console.error("SERVER ERROR CAUGHT:", await page.textContent('.bg-status-danger\\/10'));
  } else {
    console.log("Unknown state. Page HTML snippet:", content.substring(0, 500));
  }
  
  await browser.close();
}

run();

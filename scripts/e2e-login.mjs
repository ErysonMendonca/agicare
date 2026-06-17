import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
// espera o server
for (let i=0;i<30;i++){ try{ const r=await p.goto('http://localhost:3000/',{waitUntil:'domcontentloaded',timeout:5000}); if(r) break }catch{ await p.waitForTimeout(1000) } }
await p.waitForTimeout(1000)
// login real
await p.fill('#usuario','admin@agicare.test')
await p.fill('#senha','Agicare#2026demo')
await Promise.all([
  p.waitForURL('**/dashboard',{timeout:15000}).catch(()=>{}),
  p.getByRole('button',{name:/entrar/i}).click(),
])
await p.waitForTimeout(1500)
console.log('após login, URL =', p.url())
// vai para pacientes
await p.goto('http://localhost:3000/pacientes',{waitUntil:'networkidle',timeout:20000})
await p.waitForTimeout(1200)
const temPaciente = await p.getByText('Paciente Teste E2E').count()
console.log('Paciente Teste E2E na lista =', temPaciente>0 ? 'SIM' : 'NÃO')
await p.screenshot({ path:'docs/local-shots/e2e_pacientes_db.png', fullPage:true })
console.log('OK')
await b.close()

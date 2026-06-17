import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
// login real
for(let i=0;i<30;i++){try{await p.goto('http://localhost:3000/',{waitUntil:'domcontentloaded',timeout:5000});break}catch{await p.waitForTimeout(1000)}}
await p.waitForTimeout(800)
await p.fill('#usuario','admin@agicare.test'); await p.fill('#senha','Agicare#2026demo')
await Promise.all([p.waitForURL('**/dashboard',{timeout:15000}).catch(()=>{}), p.getByRole('button',{name:/entrar/i}).click()])
await p.waitForTimeout(1500)
await p.screenshot({ path:'docs/local-shots/dashboard_v2.png' })
console.log('OK', p.url())
await b.close()

import { chromium } from 'playwright'
const routes = ['dashboard','agenda','fila','estoque','faturamento','procedimentos','laboratorio','profissionais','pacientes']
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
for(let i=0;i<30;i++){try{await p.goto('http://localhost:3000/',{waitUntil:'domcontentloaded',timeout:5000});break}catch{await p.waitForTimeout(1000)}}
await p.waitForTimeout(800)
await p.fill('#usuario','admin@agicare.test'); await p.fill('#senha','Agicare2026!')
await Promise.all([p.waitForURL('**/dashboard',{timeout:15000}).catch(()=>{}), p.getByRole('button',{name:/entrar/i}).click()])
await p.waitForTimeout(1500)
for(const r of routes){
  await p.goto('http://localhost:3000/'+r,{waitUntil:'networkidle',timeout:20000})
  await p.waitForTimeout(1800) // deixa count-up/stagger terminarem
  await p.screenshot({ path:'docs/local-shots/final_'+r+'.png', fullPage:true })
  console.log('shot:', r)
}
await b.close(); console.log('OK')

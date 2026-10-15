import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const browser = await chromium.launch({ executablePath:'/usr/bin/chromium', headless:true, args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors'] });
const context = await browser.newContext({ viewport:{width:1440,height:1000}, locale:'es-DO', reducedMotion:'no-preference' });
const result = { generatedAt:new Date().toISOString(), notes:[] };
const requested = process.argv[2] || 'all';

async function ready(page, url) {
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForLoadState('networkidle',{timeout:4000}).catch(()=>{});
  await page.waitForTimeout(700);
}

// Página de inicio: salto, menús, carrusel y audio.
if (requested === 'all' || requested === 'home') {
  const page=await context.newPage(); await ready(page,'https://www.dgcp.gob.do/');
  result.home={};
  result.home.skipLink=await page.evaluate(()=>{const a=document.querySelector('a.skip-link');const t=a&&document.querySelector(a.getAttribute('href'));return {exists:!!a,text:a?.textContent.trim(),href:a?.getAttribute('href'),targetExists:!!t,targetTag:t?.tagName.toLowerCase(),targetId:t?.id};});
  await page.keyboard.press('Tab');
  result.home.firstTab=await page.evaluate(()=>({tag:document.activeElement?.tagName.toLowerCase(),text:(document.activeElement?.textContent||'').trim(),href:document.activeElement?.getAttribute('href'),class:document.activeElement?.className}));
  const menu=page.locator('header .main-menu a.dropdown-toggle').filter({hasText:'Nosotros'}).first();
  await menu.focus(); const before=await menu.getAttribute('aria-expanded'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); const afterEnter=await menu.getAttribute('aria-expanded');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); const afterEscape=await menu.getAttribute('aria-expanded');
  result.home.menuKeyboard={before,afterEnter,afterEscape,url:page.url()};
  const carouselState=async()=>page.locator('#carouselHome .carousel-item').evaluateAll((els)=>({count:els.length,active:els.findIndex(e=>e.classList.contains('active')),classes:els.slice(0,3).map(e=>e.className)}));
  const beforePause=await carouselState();
  const pause=page.locator('#btn1'); await pause.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const afterPause=await carouselState();
  result.home.carousel={beforePause,afterPause,pauseControlName:await pause.getAttribute('aria-label'),pauseTitle:await pause.getAttribute('title'),keyboardActivated:true};
  const audio=page.locator('audio').first(); const audioCount=await page.locator('audio').count();
  if (audioCount) {
    await audio.focus();
    result.home.audio={count:audioCount,controls:await audio.getAttribute('controls')!==null,autoplay:await audio.getAttribute('autoplay')!==null,
      sources:await audio.locator('source').evaluateAll(es=>es.map(e=>({src:e.src,type:e.type}))),
      adjacentText:await audio.locator('xpath=..').innerText(),focused:await audio.evaluate(e=>document.activeElement===e)};
  } else result.home.audio={count:0,note:'No apareció en esta carga; véase DOM renderizado inicio.html de la ejecución axe previa.'};
  await page.screenshot({path:path.resolve('evidence/screenshots/functional-home.png')});
  await page.close();
}

// Búsqueda: envío por teclado y cambio de contexto esperado.
if (requested === 'all' || requested === 'search') {
  const page=await context.newPage(); await ready(page,'https://www.dgcp.gob.do/');
  const q=page.locator('header form.search-bar input[name="s"]:visible').first(); await q.fill('prueba-accesibilidad-zzzx'); await q.press('Enter');
  await page.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{}); await page.waitForTimeout(500);
  result.search={finalUrl:page.url(),title:await page.title(),h1:await page.locator('h1').first().innerText().catch(()=>null)};
  await page.close();
}

// Contacto: envío vacío para generar validación, sin transmitir datos personales.
if (requested === 'all' || requested === 'contact') {
  const page=await context.newPage(); await ready(page,'https://www.dgcp.gob.do/contacto/');
  const form=page.locator('form.wpcf7-form').first();
  const fields=await form.locator('input:not([type=hidden]),textarea,select').evaluateAll(es=>es.map(e=>({tag:e.tagName.toLowerCase(),id:e.id,name:e.getAttribute('name'),type:e.getAttribute('type'),required:e.required,ariaRequired:e.getAttribute('aria-required'),labels:e.labels?[...e.labels].map(l=>l.textContent.trim()):[]})));
  await form.locator('#correo').fill('correo-invalido');
  await form.locator('input[type="submit"],button[type="submit"]').click(); await page.waitForTimeout(6000);
  result.contact={fields,afterEmptySubmit:await page.evaluate(()=>({
    focused:{tag:document.activeElement?.tagName.toLowerCase(),id:document.activeElement?.id,name:document.activeElement?.getAttribute('name')},
    invalid:[...document.querySelectorAll('.wpcf7-form :invalid,[aria-invalid="true"]')].map(e=>({tag:e.tagName.toLowerCase(),id:e.id,name:e.getAttribute('name'),ariaInvalid:e.getAttribute('aria-invalid'),describedby:e.getAttribute('aria-describedby'),message:e.validationMessage})),
    form:{class:document.querySelector('form.wpcf7-form')?.className,status:document.querySelector('form.wpcf7-form')?.getAttribute('data-status')},
    errors:[...document.querySelectorAll('.wpcf7-not-valid-tip,.wpcf7-response-output,[role="alert"],[aria-live]')].map(e=>({tag:e.tagName.toLowerCase(),id:e.id,role:e.getAttribute('role'),live:e.getAttribute('aria-live'),text:(e.textContent||'').replace(/\s+/g,' ').trim()})).filter(x=>x.text),
  }))};
  await page.screenshot({path:path.resolve('evidence/screenshots/contact-errors.png')});
  await page.close();
}

await fs.writeFile(path.resolve(`evidence/functional-${requested}.json`),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
await browser.close();

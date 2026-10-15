import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors']});
const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'es-DO'});
await page.goto('https://www.dgcp.gob.do/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(800);
const snap=()=>page.evaluate(()=>({tag:document.activeElement?.tagName.toLowerCase(),id:document.activeElement?.id||null,text:(document.activeElement?.textContent||'').replace(/\s+/g,' ').trim().slice(0,100),href:document.activeElement?.getAttribute('href'),url:location.href}));
const forward=[]; for(let i=0;i<12;i++){await page.keyboard.press('Tab');forward.push(await snap())}
const backward=[]; for(let i=0;i<5;i++){await page.keyboard.press('Shift+Tab');backward.push(await snap())}
const menu=page.locator('header .main-menu a.dropdown-toggle').filter({hasText:'Nosotros'}).first(); await menu.focus();
const before={expanded:await menu.getAttribute('aria-expanded'),url:page.url()}; await page.keyboard.press('Space'); await page.waitForTimeout(400);
const afterSpace={expanded:await menu.getAttribute('aria-expanded'),url:page.url(),active:await snap()};
const button=page.locator('#btn1'); let pauseSpace=null;
if(await button.count()){await button.focus();const titleBefore=await button.getAttribute('title');await page.keyboard.press('Space');await page.waitForTimeout(300);pauseSpace={titleBefore,titleAfter:await button.getAttribute('title'),active:await snap()}}
const result={generatedAt:new Date().toISOString(),forward,backward,menuSpace:{before,afterSpace},pauseSpace};
await fs.writeFile('evidence/keyboard-detail.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();

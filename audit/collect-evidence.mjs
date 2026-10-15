import { chromium } from 'playwright-core';
import axe from 'axe-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const outRoot = path.resolve('evidence');
const reportsDir = path.join(outRoot, 'axe');
const domDir = path.join(outRoot, 'dom');
const htmlDir = path.join(outRoot, 'html');
const shotDir = path.join(outRoot, 'screenshots');
for (const dir of [outRoot, reportsDir, domDir, htmlDir, shotDir]) await fs.mkdir(dir, { recursive: true });

const allSeeds = [
  ['inicio', 'https://www.dgcp.gob.do/'],
  ['sobre-nosotros', 'https://www.dgcp.gob.do/sobre-nosotros/'],
  ['marco-legal', 'https://www.dgcp.gob.do/sobre-nosotros/marco-legal/'],
  ['servicios', 'https://www.dgcp.gob.do/servicios/'],
  ['publicaciones', 'https://www.dgcp.gob.do/publicaciones/'],
  ['noticias', 'https://www.dgcp.gob.do/noticias/'],
  ['contacto', 'https://www.dgcp.gob.do/contacto/'],
  ['transparencia', 'https://www.dgcp.gob.do/transparencia/'],
  ['transparencia-publicaciones', 'https://www.dgcp.gob.do/transparencia/publicaciones-oficiales'],
  ['formularios-servicios', 'https://www.dgcp.gob.do/sobre-nosotros/marco-legal/formularios-estandar-de-servicios/'],
  ['buscar', 'https://www.dgcp.gob.do/?s=contrataciones'],
];
const requestedNames = new Set(process.argv.slice(2));
const seeds = requestedNames.size ? allSeeds.filter(([name]) => requestedNames.has(name)) : allSeeds;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = s => s.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--ignore-certificate-errors'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'es-DO',
  reducedMotion: 'reduce',
  userAgent: 'DGCP-NORTIC-B2-Audit/1.0 Chromium/149 Playwright/1.55',
});

const summary = { generatedAt: new Date().toISOString(), chromium: '149.0.7827.102', pages: [] };

for (const [name, url] of seeds) {
  console.error(`[start] ${name} ${url}`);
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));
  const rec = { name, requestedUrl: url, status: null, error: null };
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    rec.status = response?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await sleep(500);
    rec.finalUrl = page.url();

    await page.addScriptTag({ content: axe.source });
    const axeResults = await page.evaluate(async () => await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag21a', 'wcag22a', 'best-practice'] },
      resultTypes: ['violations', 'incomplete', 'passes', 'inapplicable'],
    }));
    await fs.writeFile(path.join(reportsDir, `${name}.json`), JSON.stringify(axeResults, null, 2));

    const dom = await page.evaluate(() => {
      const text = el => el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
      const selector = el => {
        if (!el) return null;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const parts = [];
        for (let n = el; n && n.nodeType === 1 && parts.length < 5; n = n.parentElement) {
          let p = n.tagName.toLowerCase();
          if (n.classList.length) p += '.' + [...n.classList].slice(0,2).map(x => CSS.escape(x)).join('.');
          if (n.parentElement) {
            const same = [...n.parentElement.children].filter(x => x.tagName === n.tagName);
            if (same.length > 1) p += `:nth-of-type(${same.indexOf(n)+1})`;
          }
          parts.unshift(p);
        }
        return parts.join(' > ');
      };
      const accessibleNameHint = el => el.getAttribute('aria-label') ||
        (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
        el.getAttribute('alt') || el.getAttribute('title') || text(el) || el.getAttribute('value') || '';
      const controls = [...document.querySelectorAll('input, select, textarea, button')].map(el => {
        const labels = el.labels ? [...el.labels].map(text) : [];
        return { selector: selector(el), tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), id: el.id || null,
          name: el.getAttribute('name'), labels, ariaLabel: el.getAttribute('aria-label'), ariaLabelledby: el.getAttribute('aria-labelledby'),
          placeholder: el.getAttribute('placeholder'), required: el.required || el.getAttribute('aria-required') === 'true',
          disabled: el.disabled, hidden: !el.getClientRects().length, accessibleNameHint: accessibleNameHint(el) };
      });
      const links = [...document.querySelectorAll('a[href]')].map(a => ({ selector: selector(a), href: a.href, text: text(a),
        ariaLabel: a.getAttribute('aria-label'), title: a.getAttribute('title'), accessibleNameHint: accessibleNameHint(a),
        hidden: !a.getClientRects().length }));
      const images = [...document.images].map(img => ({ selector: selector(img), src: img.currentSrc || img.src,
        hasAlt: img.hasAttribute('alt'), alt: img.getAttribute('alt'), title: img.getAttribute('title'),
        role: img.getAttribute('role'), ariaLabel: img.getAttribute('aria-label'), linked: !!img.closest('a'),
        width: img.naturalWidth, height: img.naturalHeight, hidden: !img.getClientRects().length }));
      return {
        url: location.href, title: document.title, htmlLang: document.documentElement.getAttribute('lang'),
        landmarks: [...document.querySelectorAll('header,nav,main,aside,footer,[role]')].map(el => ({selector:selector(el),tag:el.tagName.toLowerCase(),role:el.getAttribute('role'),name:accessibleNameHint(el).slice(0,160)})),
        headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].map(el => ({selector:selector(el),level:el.getAttribute('aria-level')||el.tagName.slice(1),text:text(el),hidden:!el.getClientRects().length})),
        images, links, controls,
        emptyLinks: links.filter(x => !x.accessibleNameHint), genericImageAlts: images.filter(x => /^image$/i.test((x.alt || '').trim())),
        duplicateIds: [...new Set([...document.querySelectorAll('[id]')].map(x => x.id).filter((id,i,a) => a.indexOf(id) !== i))],
        media: [...document.querySelectorAll('audio,video,iframe')].map(el => ({selector:selector(el),tag:el.tagName.toLowerCase(),src:el.src||null,controls:!!el.controls,autoplay:!!el.autoplay,title:el.getAttribute('title'),tracks:[...el.querySelectorAll('track')].map(t=>({kind:t.kind,srclang:t.srclang,label:t.label,src:t.src}))})),
        tables: [...document.querySelectorAll('table')].map(t => ({selector:selector(t),caption:text(t.querySelector('caption')),headers:t.querySelectorAll('th').length,scopeMissing:[...t.querySelectorAll('th')].filter(th=>!th.hasAttribute('scope')&&!th.hasAttribute('id')).length,rows:t.rows.length})),
        langChanges: [...document.querySelectorAll('[lang]')].filter(x=>x!==document.documentElement).map(el=>({selector:selector(el),lang:el.getAttribute('lang'),text:text(el).slice(0,160)})),
        suspiciousHiddenFocusable: [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')].filter(el => !el.getClientRects().length && el.tabIndex >= 0).map(el=>({selector:selector(el),tag:el.tagName.toLowerCase(),tabIndex:el.tabIndex,name:accessibleNameHint(el)})),
        moreInfoLinks: links.filter(x => /^(más|mas) informaci[oó]n\s*$/i.test(x.accessibleNameHint.trim())),
        pdfLinks: links.filter(x => /\.pdf(?:$|[?#])/i.test(x.href)),
        bodyTextSample: text(document.body).slice(0,2000),
      };
    });

    const keyboard = [];
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const txt = (el.innerText || el.textContent || '').replace(/\s+/g,' ').trim();
        return { tag: el.tagName.toLowerCase(), id: el.id || null, href: el.href || null,
          name: el.getAttribute('aria-label') || el.getAttribute('title') || txt || el.getAttribute('value') || el.getAttribute('placeholder') || '',
          focusVisible: el.matches(':focus-visible'), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor, boxShadow: cs.boxShadow, rect: (()=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})() };
      });
      if (!focus || (keyboard.length && JSON.stringify(focus) === JSON.stringify(keyboard.at(-1)))) break;
      keyboard.push(focus);
    }

    let contactValidation = null;
    if (name === 'contacto') {
      contactValidation = await page.evaluate(() => {
        const forms = [...document.forms];
        return forms.map(f => ({ action:f.action, method:f.method, noValidate:f.noValidate,
          fields:[...f.elements].filter(x=>x.matches?.('input,textarea,select')).map(x=>({name:x.name,type:x.type,required:x.required,ariaRequired:x.getAttribute('aria-required'),willValidate:x.willValidate,validationMessage:x.validationMessage})) }));
      });
      const submit = page.locator('form button[type="submit"], form input[type="submit"]').last();
      if (await submit.count()) {
        await submit.click({ timeout: 5000 }).catch(() => {});
        await sleep(700);
        contactValidation.afterEmptySubmit = await page.evaluate(() => ({
          active: document.activeElement?.id || document.activeElement?.name || document.activeElement?.tagName,
          invalid: [...document.querySelectorAll(':invalid')].map(x=>({tag:x.tagName.toLowerCase(),id:x.id,name:x.getAttribute('name'),message:x.validationMessage,ariaInvalid:x.getAttribute('aria-invalid')})),
          liveRegions:[...document.querySelectorAll('[role="alert"],[aria-live]')].map(x=>({role:x.getAttribute('role'),live:x.getAttribute('aria-live'),text:(x.textContent||'').trim()})),
        }));
      }
    }

    await fs.writeFile(path.join(domDir, `${name}.json`), JSON.stringify({ dom, keyboard, contactValidation, consoleErrors, failedRequests }, null, 2));
    await fs.writeFile(path.join(htmlDir, `${name}.html`), await page.content());
    await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: false });
    rec.title = dom.title; rec.lang = dom.htmlLang; rec.axeViolations = axeResults.violations.length;
    rec.axeViolationNodes = axeResults.violations.reduce((n, v) => n + v.nodes.length, 0);
    rec.images = dom.images.length; rec.missingAlt = dom.images.filter(x => !x.hasAlt).length;
    rec.genericImageAlt = dom.genericImageAlts.length; rec.emptyLinks = dom.emptyLinks.length;
    rec.controls = dom.controls.length; rec.keyboardStops = keyboard.length; rec.media = dom.media.length;
  } catch (e) {
    rec.error = `${e.name}: ${e.message}`;
  } finally {
    summary.pages.push(rec);
    await page.close();
    console.error(`[done] ${name} status=${rec.status} error=${rec.error || 'none'}`);
  }
}

await fs.writeFile(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 2));
await browser.close();
console.log(JSON.stringify(summary, null, 2));

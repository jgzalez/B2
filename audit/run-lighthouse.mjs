import fs from 'node:fs/promises';
import path from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const targets = {
  inicio: 'https://www.dgcp.gob.do/',
  publicaciones: 'https://www.dgcp.gob.do/publicaciones/',
  contacto: 'https://www.dgcp.gob.do/contacto/',
  transparencia: 'https://www.dgcp.gob.do/transparencia/',
  'transparencia-publicaciones': 'https://www.dgcp.gob.do/transparencia/publicaciones-oficiales',
  buscar: 'https://www.dgcp.gob.do/?s=contrataciones',
};
const name = process.argv[2];
if (!targets[name]) throw new Error(`Target required: ${Object.keys(targets).join(', ')}`);
const out = path.resolve('evidence/lighthouse');
await fs.mkdir(out, { recursive: true });
const chrome = await chromeLauncher.launch({
  chromePath: '/usr/bin/chromium',
  chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--ignore-certificate-errors'],
});
try {
  const result = await lighthouse(targets[name], {
    port: chrome.port,
    output: ['json', 'html'],
    onlyCategories: ['accessibility'],
    logLevel: 'info',
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1440, height: 1000, deviceScaleFactor: 1, disabled: false },
  });
  await fs.writeFile(path.join(out, `${name}.json`), result.report[0]);
  await fs.writeFile(path.join(out, `${name}.html`), result.report[1]);
  const score = result.lhr.categories.accessibility.score;
  const failed = Object.values(result.lhr.audits).filter(a => a.scoreDisplayMode === 'binary' && a.score === 0).map(a => a.id);
  console.log(JSON.stringify({ name, url: targets[name], score, failed }, null, 2));
} finally {
  await chrome.kill();
}

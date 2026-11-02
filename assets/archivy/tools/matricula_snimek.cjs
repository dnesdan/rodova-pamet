#!/usr/bin/env node
/* Uloží JEDEN snímek z Matricula Online tak, jak ho stáhne prohlížeč (Playwright).
 *
 * Použití (z kořene projektu):
 *   node tools/matricula_snimek.cjs <cesta-knihy> <snímek> <vystup.jpg>
 *   příklad: node tools/matricula_snimek.cjs oesterreich/wien/01-am-hof/01-01 5 pracovni/wien_krest_5.jpg
 * <cesta-knihy> a číslo snímku zjistíš nástrojem `python3 -I tools/matricula.py` (fary, knihy, snimky).
 *
 * Matricula chrání obrázky tokenem, který počítá JavaScript stránky. Tento skript ho NEnapodobuje: otevře knihu v pravém
 * prohlížeči (Chromium), počká, až si stránka sama načte obrázek, a uloží ho. Stahuj jen snímky, které čteš – žádné hromadné stahování.
 * Správný snímek se pozná podle názvu souboru v adrese obrázku (končí popiskem snímku, např. „02-Taufe_0003“); když ho prohlížeč
 * nenačte nebo popisky nejdou přečíst, skript skončí chybou a nic neuloží (prohlížeč jinak číslo za koncem knihy tiše dá na poslední snímek).
 * Potřebuje balíček playwright: `npm install playwright` a `npx playwright install chromium` (jednou, ve složce projektu).
 * Bez Playwrightu otevři knihu v prohlížeči (povolený prohlížeč) a snímek ulož ručně; trvalý odkaz je …/<kniha>/?pg=<snímek>.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');
const python = process.env.RODOVA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
function guard(command, url, status) {
  const args = ['-I','-X','utf8',path.join(__dirname,'slusne.py'),command,url];
  if (status !== undefined) args.push(String(status));
  const r = spawnSync(python,args,{encoding:'utf8'});
  if (r.error || r.status !== 0) throw new Error((r.stderr || r.error?.message || 'Archiv je pozastaven.').trim());
}

const [, , kniha, pg, out] = process.argv;
if (!kniha || !pg || !out) { console.error('Použití: node tools/matricula_snimek.cjs <cesta-knihy> <snímek> <vystup.jpg>'); process.exit(2); }
const castiCesty = kniha.replace(/^\/+|\/+$/g, '').replace(/^(en|de|cs|pl|it|sl|hr|sr|fr|es)\//, '').split('/');
if (castiCesty.length < 2 || castiCesty.length > 5 || castiCesty.some((c) => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(c) || c === '.' || c === '..')) {
  console.error('Cesta knihy smí obsahovat jen písmena, číslice, pomlčky a lomítka (např. oesterreich/wien/01-am-hof/01-01).'); process.exit(2);
}
if (!/^[1-9][0-9]{0,5}$/.test(pg)) { console.error('Snímek musí být kladné číslo.'); process.exit(2); }

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('Chybí balíček playwright. Nainstaluj ho: npm install playwright && npx playwright install chromium'); process.exit(3);
}

/** Pole „labels“ ze stránky (JSON pole popisků snímků); hledá se závorkově s ohledem na řetězce, ať popisek s „]“ nevadí. */
function popisky(html) {
  const m = /"labels":\s*\[/.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let hloubka = 0, vRetezci = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (vRetezci) { if (c === '\\') i++; else if (c === '"') vRetezci = false; continue; }
    if (c === '"') vRetezci = true; else if (c === '[') hloubka++; else if (c === ']' && --hloubka === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch (e) { return null; }
    }
  }
  return null;
}

/** Název souboru zakódovaný v adrese obrázku (base64 část cesty). */
function nazevSouboru(url) {
  try {
    const seg = new URL(url).pathname.split('/')[2] || '';
    return Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch (e) { return ''; }
}

(async () => {
  const cesta = castiCesty.join('/');
  const url = `https://data.matricula-online.eu/en/${cesta}/?pg=${pg}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const obrazky = [];
    let blocked = null;
    await page.route('**/*', async (route) => {
      const req = route.request();
      const host = new URL(req.url()).hostname;
      if (blocked) return route.abort();
      try {
        if ((host === 'matricula-online.eu' || host.endsWith('.matricula-online.eu')) && ['document','image'].includes(req.resourceType())) guard('cekaj',req.url());
      } catch (e) { blocked=e; return route.abort(); }
      return route.continue();
    });
    page.on('response', (r) => {
      const host = new URL(r.url()).hostname;
      if ((host === 'matricula-online.eu' || host.endsWith('.matricula-online.eu')) && [403,429,503].includes(r.status())) {
        try { guard('odpoved',r.url(),r.status()); } catch (e) { blocked=e; }
      }
      const ct = r.headers()['content-type'] || '';
      if (ct.startsWith('image/jpeg') && new URL(r.url()).hostname === 'img.data.matricula-online.eu') obrazky.push(r);
    });
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    const labely = popisky(await page.content());
    if (!labely || !labely.length) { console.error('Nepodařilo se přečíst seznam snímků knihy (stránka se změnila?). Otevři knihu v prohlížeči.'); process.exitCode = 1; return; }
    if (Number(pg) > labely.length) { console.error(`Kniha má jen ${labely.length} snímků (zadáno ${pg}).`); process.exitCode = 1; return; }
    const ocekavany = labely[Number(pg) - 1];
    // počkat (nejvýš 25 s), až se načte obrázek přesně tohoto snímku
    let nalezeny = null;
    for (let t = 0; t < 50 && !nalezeny; t++) {
      nalezeny = obrazky.find((r) => nazevSouboru(r.url()).includes(`${ocekavany}.`)) || null;
      if (!nalezeny) await page.waitForTimeout(500);
    }
    if (!nalezeny) { console.error(`Prohlížeč nenačetl snímek „${ocekavany}“ (špatná cesta knihy?). Nic neukládám.`); process.exitCode = 1; return; }
    if (blocked) throw blocked;
    const buf = await nalezeny.body().catch(() => null);
    if (!buf || buf.length < 20000) { console.error('Obrázek se nepodařilo uložit (příliš malý nebo prázdný).'); process.exitCode = 1; return; }
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    if (fs.existsSync(out)) throw new Error('Cílový soubor už existuje; použij nový název.');
    fs.writeFileSync(out, buf, {flag:'wx'});
    console.log(`${out} ${buf.length} B snímek ${pg} (${ocekavany}) odkaz: ${url}`);
  } finally { await browser.close(); }
})().catch((e) => { console.error('Chyba:', e.message); process.exit(1); });

// GEDCOM 7.0 export of the chronicle and import of a foreign GEDCOM file as
// candidates for review.
//
//   node scripts/gedcom.mjs export [--data src/data/genealogy.json] [--output dist/rodova-kronika.ged] [--living private]
//   node scripts/gedcom.mjs import soubor.ged [--data src/data/genealogy.json] [--output research/imports/<jméno>.candidates.json]
//
// The import never writes to the dataset. It stores the candidates with the
// matches against existing people and, next to them, a batch of changes
// (<jméno>.changes.json, format rk-changes/1) for later review.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RKGedcom = require('../src/gedcom.js');

function parseArgs(argv) {
  const options = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=');
      options[key] = inline ?? argv[++i];
    } else {
      options._.push(arg);
    }
  }
  return options;
}

// Paths given on the command line are relative to the current directory, defaults to the project.
const resolve = (value, fallback) => (value ? path.resolve(process.cwd(), value) : path.resolve(projectRoot, fallback));

async function readJson(file) {
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^﻿/, ''));
}

async function writeFile(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
}

async function runExport(options) {
  const dataFile = resolve(options.data, 'src/data/genealogy.json');
  const output = resolve(options.output, 'dist/rodova-kronika.ged');
  const living = options.living || 'private';
  if (!['include', 'private'].includes(living)) throw new Error('--living musí být include nebo private.');
  const data = await readJson(dataFile);
  const { text, warnings = [] } = RKGedcom.toGedcom(data, { living, now: options.now ? new Date(options.now) : new Date() });
  const tree = RKGedcom.parseGedcom(text);
  if (tree.errors.length) throw new Error(`Vygenerovaný GEDCOM má neplatné řádky: ${tree.errors.slice(0, 3).map((error) => error.line).join(', ')}`);
  await writeFile(output, text);
  const count = (tag) => tree.records.filter((record) => record.tag === tag).length;
  console.log(`GEDCOM 7.0 → ${path.relative(projectRoot, output)} (${count('INDI')} osob, ${count('FAM')} rodin, ${count('SOUR')} pramenů, ${count('OBJE')} médií, žijící: ${living}).`);
  console.warn('Export je projekce canonical dat, nikoli bezeztrátový roundtrip. Původní XREF, vlastní tagy a všechny detaily citací obnovíš pouze z původního souboru v importním sidecaru.');
  for (const warning of warnings) console.warn(warning);
}

async function runImport(options) {
  const input = options._[1];
  if (!input) throw new Error('Zadej soubor: node scripts/gedcom.mjs import soubor.ged');
  const file = path.resolve(process.cwd(), input);
  const fileName = path.basename(file);
  const base = fileName.replace(/\.ged(?:com)?$/i, '');
  const output = resolve(options.output, `research/imports/${base}.candidates.json`);
  const changesFile = output.replace(/(?:\.candidates)?\.json$/i, '') + '.changes.json';
  const dataFile = resolve(options.data, 'src/data/genealogy.json');
  const canonicalPath = async (name) => { try { return await fs.realpath(name); } catch (error) { if (error.code !== 'ENOENT') throw error; return path.resolve(name); } };
  const protectedPaths = await Promise.all([file, dataFile].map(canonicalPath));
  const outputPaths = await Promise.all([output, changesFile].map(canonicalPath));
  if (outputPaths[0] === outputPaths[1] || outputPaths.some((name) => protectedPaths.includes(name))) throw new Error('Výstup importu nesmí přepsat původní GEDCOM ani genealogy.json.');
  const data = await readJson(dataFile);
  const originalBytes = await fs.readFile(file);
  const namespace = createHash('sha256').update(originalBytes).digest('hex');
  let originalText;
  try { originalText = new TextDecoder('utf-8', { fatal: true }).decode(originalBytes); }
  catch { throw new Error('GEDCOM není platné UTF-8. Uchovej původní bajty a před importem proveď výslovný převod původního kódování; automatické nahrazování znaků je vypnuté.'); }
  const tree = RKGedcom.parseGedcom(originalText);
  const declaredEncoding = tree.head?.children.find((node) => node.tag === 'CHAR')?.value?.trim().toUpperCase();
  if (declaredEncoding && !['UTF-8', 'ASCII'].includes(declaredEncoding)) throw new Error(`GEDCOM deklaruje nepodporované kódování ${declaredEncoding}; nejprve vytvoř doloženou kopii v UTF-8.`);
  const { importReport, ...candidates } = RKGedcom.gedcomToCandidates(tree, { fileName, namespace });
  // Register spellings and Latin/German given names match the Czech forms.
  const RKNames = require('../src/names.js');
  const nameKey = (value, part) => (part === 'given' ? RKNames.givenNameKey(value) : RKNames.phoneticKey(RKNames.surnameStems(value).at(-1) || ''));
  const matches = RKGedcom.matchCandidates(candidates, data, { nameKey });
  const createdAt = new Date().toISOString();
  const ops = [];
  importReport.alreadyPresent = [];
  const collections = ['people', 'relationships', 'events', 'places', 'sources'];
  const existingCollections = new Map();
  for (const [collection, items] of Object.entries(data)) if (Array.isArray(items)) for (const item of items) if (item?.id) existingCollections.set(item.id, collection);
  for (const collection of collections) {
    const existing = new Map((data[collection] || []).map((item) => [item.id, item]));
    for (const item of candidates[collection]) {
      if (existingCollections.has(item.id) && existingCollections.get(item.id) !== collection) throw new Error(`Kolize ID ${item.id} s jinou kolekcí; dávka nebyla vytvořena.`);
      if (existing.has(item.id)) {
        importReport.alreadyPresent.push({ collection, id: item.id, differs: JSON.stringify(existing.get(item.id)) !== JSON.stringify(item), action: 'kept-existing-no-overwrite' });
        continue;
      }
      ops.push({ op: 'add', file: 'genealogy', collection, id: item.id, item });
    }
  }
  importReport.projectionLimits = [
    'Import vytváří neověřené kandidáty. QUAY se zachová doslovně a nezvyšuje stav důkazu.',
    'PEDI BIRTH znamená rodinu při narození; nezakládá genetické rodičovství.',
    'Vlastní tagy, nepodporované záznamy a jejich děti jsou v rawAst i v původních bajtech; unmappedFields popisuje položky bez canonical projekce.',
    'Export není bezeztrátový roundtrip: mění XREF a pořadí, nepřenáší všechny původní stránky citací, vlastní tagy, role, média a detaily pramenů. Více rodičovských rodin nebo smíšené typy rodičovství odmítá.',
  ];
  await writeFile(output, `${JSON.stringify({
    format: 'rk-gedcom-candidates/1', createdAt, file: fileName, gedcomVersion: tree.version,
    namespace, parseErrors: tree.errors, candidates, matches, importReport,
    original: { encoding: 'base64', decodedAs: 'UTF-8', sha256: namespace, bytes: originalBytes.length, content: originalBytes.toString('base64') },
    rawAst: { version: tree.version, head: tree.head, records: tree.records },
  }, null, 2)}\n`);
  await writeFile(changesFile, `${JSON.stringify({ format: 'rk-changes/1', createdAt, author: 'gedcom-import', ops }, null, 2)}\n`);
  console.log(`${candidates.people.length} osob, ${candidates.relationships.length} vazeb, ${candidates.events.length} událostí; ${matches.length} možných shod.`);
  console.log(`Kandidáti: ${path.relative(projectRoot, output)}`);
  console.log(`Dávka změn: ${path.relative(projectRoot, changesFile)} (genealogy.json se nemění)`);
  console.log(`Zachovány původní bajty a AST; ${importReport.unmappedFields.length} položek bez canonical projekce, ${importReport.warnings.length} upozornění, ${importReport.alreadyPresent.length} již přítomných ID bez přepsání.`);
  for (const warning of importReport.warnings.slice(0, 10)) console.warn(`${warning.code}${warning.line ? ` (řádek ${warning.line})` : ''}: ${warning.message}`);
  if (importReport.warnings.length > 10) console.warn('Úplný seznam upozornění je v importReport kandidátského souboru.');
  if (tree.errors.length) console.warn(`${tree.errors.length} neplatných řádků nebylo promítnuto; původní soubor je zachován celý v sidecaru. Před přijetím dávky chyby zkontroluj.`);
}

const options = parseArgs(process.argv.slice(2));
const command = options._[0];
try {
  if (command === 'export') await runExport(options);
  else if (command === 'import') await runImport(options);
  else throw new Error('Použití: node scripts/gedcom.mjs export|import …');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

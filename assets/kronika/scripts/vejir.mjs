// Self-contained SVG pedigree fan from canonical genealogy.json.
// node scripts/vejir.mjs --data src/data/genealogy.json --output dist/vejir.svg
//   [--person ID] [--generations 1..10]
// Generations include the starting person (1 = only that person).
// Optional parent-child fields: parentRole = father|mother|parent|unknown;
// parentType = biological|adoptive|foster|step|unknown. Missing parentType
// never implies biological parentage. No partnership is converted to a parent.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EDGE_STATES = {
  verified: { label: 'Ověřená vazba', fill: '#d5e8d8', stroke: '#346344', dash: '' },
  supported: { label: 'Podpořená vazba', fill: '#dce7f0', stroke: '#496b88', dash: '8 3' },
  'family-record': { label: 'Rodinné podání', fill: '#f1e3c6', stroke: '#947330', dash: '3 3' },
  hypothesis: { label: 'Hypotéza / rozpor', fill: '#f1d9da', stroke: '#9a4d56', dash: '9 4 2 4' },
  unknown: { label: 'Jistota neuvedena', fill: '#eeece7', stroke: '#797773', dash: '3 5' },
};
const TYPE_LABELS = { biological: 'biologická', 'birth-recorded': 'rodina při narození', adoptive: 'adoptivní', foster: 'pěstounská', step: 'nevlastní', 'sealing-recorded': 'náboženské pečetění', unknown: 'typ neurčen' };
export const xml = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const ordered = (a, b) => String(a).localeCompare(String(b), 'en');

function parentType(edge) {
  const raw = edge.parentType ?? edge.parentage ?? edge.pedigree ?? 'unknown';
  const normalized = ({ birth: 'birth-recorded', BIRTH: 'birth-recorded', natural: 'biological', adopted: 'adoptive', unspecified: 'unknown', uncertain: 'unknown', '': 'unknown' })[raw] || raw;
  if (!Object.hasOwn(TYPE_LABELS, normalized)) throw new Error(`Vazba ${edge.id}: neznámý typ rodičovství ${String(raw)}. Použij biological/birth-recorded/adoptive/foster/step/sealing-recorded/unknown.`);
  return normalized;
}

function parentRole(edge, person) {
  const explicit = edge.parentRole ?? edge.role;
  if (explicit !== undefined) {
    if (['father', 'mother'].includes(explicit)) return explicit;
    if (['parent', 'unknown', 'unspecified', ''].includes(explicit)) return 'unknown';
    throw new Error(`Vazba ${edge.id}: neznámá rodičovská role ${String(explicit)}.`);
  }
  return person.sex === 'male' ? 'father' : person.sex === 'female' ? 'mother' : 'unknown';
}

function indexedParents(data) {
  const people = new Map();
  for (const person of data.people || []) {
    if (!person.id || people.has(person.id)) throw new Error(`Chybějící nebo duplicitní ID osoby: ${person.id}`);
    people.set(person.id, person);
  }
  const parents = new Map();
  for (const edge of data.relationships || []) {
    if (edge.type !== 'parent-child') continue;
    if (!people.has(edge.from) || !people.has(edge.to)) throw new Error(`Vazba ${edge.id}: neexistující rodič nebo dítě.`);
    const list = parents.get(edge.to) || [];
    if (list.some((item) => item.edge.from === edge.from)) throw new Error(`Osoba ${edge.to}: více vazeb na rodiče ${edge.from}; nejprve vyřeš jejich význam.`);
    list.push({ edge, role: parentRole(edge, people.get(edge.from)), parentType: parentType(edge) });
    parents.set(edge.to, list);
  }
  // A cycle is invalid even when a generation limit would hide it. Iterative
  // DFS permits a repeated ancestor reached from a different completed branch.
  const done = new Set();
  const active = new Set();
  for (const id of people.keys()) {
    if (done.has(id)) continue;
    const stack = [{ id, exit: false }];
    while (stack.length) {
      const frame = stack.pop();
      if (frame.exit) { active.delete(frame.id); done.add(frame.id); continue; }
      if (active.has(frame.id)) throw new Error(`Cyklus v rodičovských vazbách u osoby ${frame.id}; vějíř nebyl vytvořen.`);
      if (done.has(frame.id)) continue;
      active.add(frame.id);
      stack.push({ id: frame.id, exit: true });
      for (const parent of parents.get(frame.id) || []) stack.push({ id: parent.edge.from, exit: false });
    }
  }
  return { people, parents };
}

function assignSlots(list, childId) {
  if (list.length > 2) throw new Error(`Osoba ${childId} má ${list.length} zapsané rodiče. Binární vějíř nemůže některého tiše vynechat; použij úplný graf nebo výslovně vyjasni větev.`);
  const result = [null, null];
  const unknown = [];
  for (const item of list) {
    if (item.role === 'unknown') { unknown.push(item); continue; }
    const index = item.role === 'father' ? 0 : 1;
    if (result[index]) throw new Error(`Osoba ${childId} má více rodičů role ${item.role}. Vějíř žádného automaticky nevybírá; použij úplný graf nebo vyjasni role.`);
    result[index] = item;
  }
  // Unspecified parents are both retained. Their stable-ID order is only
  // presentation order, never a claim about father/mother or biological origin.
  for (const item of unknown.sort((a, b) => ordered(a.edge.from, b.edge.from))) result[result[0] ? 1 : 0] = item;
  return result;
}

export function collectAncestorSlots(data, { personId = data.meta?.defaultPersonId, generations = 6 } = {}) {
  if (!Number.isInteger(generations) || generations < 1 || generations > 10) throw new Error('--generations musí být celé číslo 1 až 10 (včetně výchozí osoby).');
  const { people, parents } = indexedParents(data);
  if (!people.has(personId)) throw new Error(`Výchozí osoba ${personId || '(neuvedena)'} neexistuje; zadej --person ID.`);
  const slots = [{ number: 1, depth: 0, person: people.get(personId), edge: null, role: 'self', parentType: null }];
  for (let at = 0; at < slots.length; at += 1) {
    const slot = slots[at];
    if (slot.depth + 1 >= generations) continue;
    for (const [side, parent] of assignSlots(parents.get(slot.person.id) || [], slot.person.id).entries()) {
      if (parent) slots.push({ number: slot.number * 2 + side, depth: slot.depth + 1, person: people.get(parent.edge.from), ...parent });
    }
  }
  return slots.sort((a, b) => a.number - b.number);
}

function wrap(value, width, maxLines = 3) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    if (line && line.length + word.length + 1 > width) { lines.push(line); line = ''; }
    while (word.length > width) { lines.push(word.slice(0, width)); word = word.slice(width); }
    line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) return [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].slice(0, width - 1)}…`];
  return lines;
}
const number = (value) => Number(value.toFixed(3));
const polar = (radius, degrees) => ({ x: number(radius * Math.cos(degrees * Math.PI / 180)), y: number(-radius * Math.sin(degrees * Math.PI / 180)) });
function annulus(inner, outer, start, end) {
  const a = polar(outer, start), b = polar(outer, end), c = polar(inner, end), d = polar(inner, start);
  const large = start - end > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 ${large} 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 ${large} 0 ${d.x} ${d.y} Z`;
}
function lifespan(person) {
  const birth = person.birth?.dateText || person.birth?.date;
  const death = person.death?.dateText || person.death?.date;
  return [birth ? `* ${birth}` : '', death ? `† ${death}` : ''].filter(Boolean).join(' · ');
}

export function buildFanSvg(data, options = {}) {
  const slots = collectAncestorSlots(data, options);
  const maxDepth = Math.max(...slots.map((slot) => slot.depth));
  const byNumber = new Map(slots.map((slot) => [slot.number, slot]));
  const repeats = new Map();
  for (const slot of slots) repeats.set(slot.person.id, [...(repeats.get(slot.person.id) || []), slot.number]);
  const radii = [96];
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const inner = radii.at(-1);
    // Keep radial labels legible at deep generations; a small tree never
    // inherits the huge empty viewBox needed by a ten-generation fan.
    radii.push(number(Math.max(inner + (depth < 4 ? 164 : 224), 2 * ((2 ** depth) * 58 / Math.PI) - inner)));
  }
  const outer = radii.at(-1);
  const halfWidth = Math.max(310, outer + 24);
  const top = -outer - (data.meta?.sample === true ? 104 : 78);
  const legendY = 145;
  const height = -top + legendY + 238;
  const title = `Vějíř předků · ${slots[0].person.displayName || slots[0].person.id}`;
  const pieces = [];
  for (let depth = maxDepth; depth >= 1; depth -= 1) {
    const count = 2 ** depth;
    for (let index = 0; index < count; index += 1) {
      const n = count + index;
      const slot = byNumber.get(n);
      const style = EDGE_STATES[slot?.edge?.evidence] || EDGE_STATES.unknown;
      const start = 180 - (index * 180 / count);
      const end = 180 - ((index + 1) * 180 / count);
      const middle = (start + end) / 2;
      const position = polar((radii[depth - 1] + radii[depth]) / 2, middle);
      const rotation = depth < 4 ? 90 - middle : (middle > 90 ? 180 - middle : -middle);
      const state = slot && Object.hasOwn(EDGE_STATES, slot.edge?.evidence) ? slot.edge.evidence : 'unknown';
      const repeated = slot && repeats.get(slot.person.id).length > 1 ? ` · opakuje se na č. ${repeats.get(slot.person.id).join(', ')}` : '';
      const detail = slot ? `${slot.person.displayName || slot.person.id}\n${lifespan(slot.person)}\nPozice ${n}; ID ${slot.person.id}${repeated}\n${style.label}; rodičovství: ${TYPE_LABELS[slot.parentType]}; role ${slot.role}` : `Pozice ${n}: rodič není uveden.`;
      const nameLines = slot ? wrap(slot.person.displayName || slot.person.id, depth < 4 ? 25 : 28, 2) : ['?'];
      const rows = slot ? [`${n}${repeated ? ' ↻' : ''}`, ...nameLines, ...wrap(lifespan(slot.person), 30, 1), ...(slot.parentType !== 'unknown' ? [TYPE_LABELS[slot.parentType]] : [])] : ['?'];
      const lineHeight = depth < 4 ? 19 : 15;
      pieces.push(`<g class="ancestor-slot" data-ahnentafel="${n}"${slot ? ` data-person-id="${xml(slot.person.id)}" data-edge-id="${xml(slot.edge.id || '')}" data-evidence="${state}" data-parent-type="${xml(slot.parentType)}"` : ''}><title>${xml(detail)}</title><path d="${annulus(radii[depth - 1] + 2, radii[depth] - 2, start, end)}" fill="${slot ? style.fill : '#faf8f3'}" stroke="${slot ? style.stroke : '#dedbd2'}" stroke-width="${slot ? 2 : 1}"${style.dash && slot ? ` stroke-dasharray="${style.dash}"` : ''}/><g transform="translate(${position.x} ${position.y}) rotate(${number(rotation)})">${rows.map((row, i) => `<text x="0" y="${number((i - (rows.length - 1) / 2) * lineHeight)}" class="${i === 0 || i > nameLines.length ? 'small' : 'name'}" font-size="${depth < 4 ? 16 : 13}">${xml(row)}</text>`).join('')}</g></g>`);
    }
  }
  const root = slots[0];
  const rootRows = [...wrap(root.person.displayName || root.person.id, 20, 3), ...wrap(lifespan(root.person), 24, 2)];
  pieces.push(`<g class="focus" data-ahnentafel="1" data-person-id="${xml(root.person.id)}"><title>${xml(`${root.person.displayName}\nID ${root.person.id}\n${lifespan(root.person)}`)}</title><circle cx="0" cy="0" r="92" fill="#263e38" stroke="#162e29" stroke-width="2"/><text x="0" y="-65" class="small" fill="#f5efdf">1 · výchozí osoba</text>${rootRows.map((row, i) => `<text x="0" y="${(i - (rootRows.length - 1) / 2) * 21 + 4}" fill="#fffaf0" font-size="18">${xml(row)}</text>`).join('')}</g>`);
  const legend = Object.entries(EDGE_STATES).map(([state, style], index) => {
    const x = -280 + (index % 2) * 300;
    const y = legendY + Math.floor(index / 2) * 29;
    return `<g transform="translate(${x} ${y})"><rect x="0" y="-13" width="28" height="18" fill="${style.fill}" stroke="${style.stroke}" stroke-width="2"${style.dash ? ` stroke-dasharray="${style.dash}"` : ''}/><text x="40" y="1" class="legend-label" font-size="15">${xml(style.label)}</text></g>`;
  }).join('');
  const notes = [
    'Barva vyjadřuje stav zapsané vazby k dítěti, nikoli jistotu celé osoby.',
    'Typ rodičovství bez údaje není automaticky biologický; adoptivní vazby jsou označené.',
    'Rodina při narození (GEDCOM BIRTH) sama nedokládá genetické rodičovství.',
    'Pořadí neurčených rodičů podle ID neurčuje otce a matku. Partnerství rodiče nedoplňuje.',
    `↻ = stejný člověk na více pozicích. ${slots.length} obsazených pozic; ${repeats.size} různých osob.`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-halfWidth} ${top} ${2 * halfWidth} ${number(height)}" width="${2 * halfWidth}" height="${number(height)}" role="img" aria-labelledby="fan-title fan-description"><title id="fan-title">${xml(title)}</title><desc id="fan-description">${xml(notes.join(' '))} Generace včetně výchozí osoby: ${maxDepth + 1}.</desc><style>text{font-family:Georgia,Cambria,serif;text-anchor:middle;dominant-baseline:middle}.name{font-weight:600}.legend-label{text-anchor:start}.small{font-family:Arial,sans-serif;font-size:12px}svg{background:#fffdf7}</style><rect x="${-halfWidth}" y="${top}" width="${2 * halfWidth}" height="${number(height)}" fill="#fffdf7"/><text x="0" y="${-outer - 48}" font-size="23">${xml(title)}</text>${data.meta?.sample === true ? `<text x="0" y="${-outer - 78}" font-size="16" fill="#94531d">VYMYŠLENÁ UKÁZKA — nejde o archivní důkaz</text>` : ''}${pieces.join('')}${legend}${notes.map((note, i) => `<text x="0" y="${legendY + 100 + i * 24}" font-size="13">${xml(note)}</text>`).join('')}</svg>\n`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('node scripts/vejir.mjs --data src/data/genealogy.json --output dist/vejir.svg [--person ID] [--generations 1..10]\nGenerace zahrnují výchozí osobu (1 = pouze ona). Vějíř používá jen zapsané parent-child vazby. Více rodičů stejné role nebo cyklus vyžaduje vyjasnění; partnerství se nepřevádí na rodiče. Volitelně parentRole: father/mother/parent/unknown; parentType: biological/birth-recorded/adoptive/foster/step/sealing-recorded/unknown. PEDI BIRTH znamená rodinu při narození, samo nedokládá genetické rodičovství.');
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--data', '--output', '--person', '--generations'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Neplatný argument ${args[i]}; použij --help.`);
    options[args[i].slice(2)] = args[i + 1];
  }
  const input = options.data || 'src/data/genealogy.json';
  const output = options.output || 'dist/vejir.svg';
  if (path.resolve(input) === path.resolve(output)) throw new Error('Výstup nesmí přepsat vstupní genealogii.');
  const data = JSON.parse(await fs.readFile(input, 'utf8'));
  const svg = buildFanSvg(data, { personId: options.person || data.meta?.defaultPersonId, generations: options.generations === undefined ? 6 : Number(options.generations) });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, svg);
  console.log(`Vějíř: ${output} (samostatný SVG; zdrojová data beze změny).`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

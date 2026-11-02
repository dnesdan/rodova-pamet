import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { applyChangeFile } from '../scripts/apply-changes.mjs';
import { createFamilyEdition } from '../scripts/family-edition.mjs';

const require = createRequire(import.meta.url);
const G = require('../src/gedcom.js');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const collections = ['people', 'relationships', 'events', 'places', 'sources'];
const allItems = (candidates) => collections.flatMap((collection) => candidates[collection]);
const convert = (text, options = {}) => G.gedcomToCandidates(G.parseGedcom(text), { fileName: 'rodina.ged', ...options });
const empty = () => ({ meta: { title: 'Vymyšlená zkušební kronika', version: '0.1.0', defaultPersonId: null, sample: true }, people: [], relationships: [], events: [], places: [], claims: [], sources: [], media: [], tasks: [], changelog: [] });
const run = (...args) => new Promise((resolve) => {
  const env = { ...process.env };
  // A CLI is an ordinary process, not a nested Node test worker. Inheriting
  // child-v8 makes Node redirect console output into the test event stream.
  delete env.NODE_TEST_CONTEXT;
  execFile(process.execPath, args, { cwd: projectRoot, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    resolve({ status: error?.code || 0, error: error && typeof error.code !== 'number' ? error : null, stdout, stderr });
  });
});
const succeed = (result) => { assert.ifError(result.error); assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`); };

// Synthetic data only. The word BIRTH is intentionally not called biological:
// GEDCOM uses it for the family at birth, without proving genetic parentage.
const sample = '\uFEFF' + [
  '0 HEAD', '1 GEDC', '2 VERS 5.5.1', '1 CHAR UTF-8', '1 FILE rodina.ged',
  '0 @I1@ INDI', '1 NAME Jana /Zkoušková/', '1 SEX F',
  '1 BIRT', '2 DATE ABT 1900', '2 PLAC Fiktivov, Smyšlený kraj, Česko', '2 SOUR @S1@', '3 PAGE kniha 22, strana 3, řádek 7', '3 QUAY 3',
  '1 CHR', '2 DATE BEF 1 JAN 1901',
  '1 RESI', '2 DATE AFT 1901',
  '1 DEAT', '2 DATE BET 1960 AND 1965',
  '1 FAMC @F1@', '2 PEDI BIRTH',
  '1 FAMC @F2@', '2 PEDI adopted',
  '1 _CUSTOM neupravovat původní text', '2 _SUB zachovat i dítě',
  '0 @I2@ INDI', '1 NAME Josef /Zkouška/', '1 SEX M', '1 BIRT', '2 DATE 1870',
  '0 @I3@ INDI', '1 NAME Anna /Zkoušková/', '1 SEX F', '1 BIRT', '2 DATE 1872',
  '0 @I4@ INDI', '1 NAME Pavel /Pokus/', '1 SEX M', '1 BIRT', '2 DATE 1875',
  '0 @I5@ INDI', '1 NAME Marie /Pokusová/', '1 SEX F', '1 BIRT', '2 DATE 1876',
  '0 @i1@ INDI', '1 NAME Odlišná /Osoba/',
  '0 @F1@ FAM', '1 HUSB @I2@', '1 WIFE @I3@', '1 CHIL @I1@', '1 SOUR @S1@', '2 PAGE rodinný zápis 9',
  '0 @F2@ FAM', '1 HUSB @I4@', '1 WIFE @I5@', '1 CHIL @I1@',
  '0 @S1@ SOUR', '1 TITL Smyšlená zkušební matrika', '1 TEXT Doslovná ukázka', '2 CONT druhý řádek', '1 _ARCHIVE vlastní údaj',
  '0 @R1@ REPO', '1 NAME Fiktivní archiv',
  '0 @O1@ OBJE', '1 FILE nikdy-neotevirat.jpg',
  '0 TRLR', '',
].join('\r\n');

test('qualified dates preserve literal values without exact dates or invented endpoints', () => {
  for (const [original, qualifier] of [
    ['ABT 1900', 'about'], ['BEF 1 JAN 1901', 'before'], ['AFT 1901', 'after'],
    ['CAL 1900', 'calculated'], ['EST 1900', 'estimated'], ['BET 1900 AND 1905', 'between'],
    ['FROM 1900 TO 1905', 'period'], ['FROM 1900', 'period'], ['TO 1905', 'period-end'],
    ['INT 5 MAY 1890 (pátého máje)', 'interpreted'],
  ]) {
    const result = G.fromGedcomDate(original);
    assert.equal(result.qualifier, qualifier, original);
    assert.equal(result.originalDate, original);
    assert.equal(result.date, undefined, original);
    assert.equal(result.endDate, undefined, original);
    assert.ok(result.dateText);
  }
  const imported = convert(sample), person = imported.people.find((entry) => entry.gedcom.xref === 'I1');
  assert.equal(person.birth.dateQualifier, 'about');
  assert.equal(person.birth.date, undefined);
  assert.equal(person.death.dateQualifier, 'between');
  assert.equal(person.death.date, undefined);
  assert.deepEqual(imported.events.map((event) => [event.dateQualifier, event.date, event.originalDate]), [['before', undefined, 'BEF 1 JAN 1901'], ['after', undefined, 'AFT 1901']]);
});

test('unsupported calendars and malformed date ranges never become Gregorian ISO dates', () => {
  for (const original of ['@#DJULIAN@ 1 JAN 1700', 'JULIAN 1 JAN 1700', 'HEBREW 12 TSH 5700', 'FRENCH_R 1 VEND 10', '@#DFRENCH R@ 1 VEND 10']) {
    const date = G.fromGedcomDate(original);
    assert.equal(date.qualifier, 'calendar-unconverted', original);
    assert.equal(date.date, undefined);
    assert.equal(date.originalDate, original);
    assert.match(date.warning, /nebyl převeden/);
    assert.equal(G.toGedcomDate(undefined, { ...date, dateQualifier: date.qualifier }).value, '');
  }
  for (const original of ['FROM 1900 TO nonsense', 'BET 1900 AND invalid', '31 FEB 1900', '0 JAN 1900', '29 FEB 1900']) {
    const date = G.fromGedcomDate(original);
    assert.equal(date.date, undefined, original);
    assert.equal(date.dateText, original);
    assert.equal(date.qualifier, 'unparsed');
    assert.ok(date.warning);
  }
  assert.equal(G.fromGedcomDate('GREGORIAN 29 FEB 2000').date, '2000-02-29');
  assert.equal(G.fromGedcomDate('@#DGREGORIAN@ 1 JAN 1900').date, '1900-01-01');
  const imported = convert(sample.replace('BEF 1 JAN 1901', '@#DJULIAN@ 1 JAN 1901'));
  assert.equal(imported.events[0].calendar, 'JULIAN');
  assert.equal(imported.events[0].date, undefined);
  assert.ok(imported.importReport.warnings.some((warning) => warning.code === 'DATE_NOT_CONVERTED'));
});

test('namespaces and case-preserving XREF encodings produce stable valid noncolliding IDs', () => {
  const first = convert(sample), again = convert(sample);
  assert.deepEqual(allItems(first).map((item) => item.id), allItems(again).map((item) => item.id));
  const ids = allItems(first).map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[a-z0-9][a-z0-9-]*$/.test(id)));
  assert.notEqual(first.people.find((person) => person.gedcom.xref === 'I1').id, first.people.find((person) => person.gedcom.xref === 'i1').id);
  const different = convert(sample.replace('Jana /Zkoušková/', 'Jiná /Rodina/'));
  assert.notEqual(first.importReport.namespace, different.importReport.namespace);
  assert.ok(allItems(different).every((item) => !ids.includes(item.id)), 'same basename and XREF from another input cannot collide');
  const xrefs = convert('0 @I_1@ INDI\n1 NAME Jedna\n0 @I-1@ INDI\n1 NAME Druhá\n0 @__proto__@ INDI\n1 NAME Třetí\n');
  assert.equal(new Set(xrefs.people.map((person) => person.id)).size, 3);
  assert.ok(xrefs.people.every((person) => /^[a-z0-9][a-z0-9-]*$/.test(person.id)));
});

test('all FAMC memberships survive with original PEDI and BIRTH does not assert biology', () => {
  const candidates = convert(sample), person = candidates.people.find((entry) => entry.gedcom.xref === 'I1');
  const parents = candidates.relationships.filter((relation) => relation.type === 'parent-child' && relation.to === person.id);
  assert.equal(parents.length, 4);
  assert.deepEqual(parents.map((relation) => relation.parentType).sort(), ['adoptive', 'adoptive', 'birth-recorded', 'birth-recorded']);
  assert.deepEqual([...new Set(parents.map((relation) => relation.gedcom.familyXref))], ['F1', 'F2']);
  assert.deepEqual(person.gedcom.familyLinks.map((link) => [link.originalReference, link.originalPedigree, link.parentType]), [['@F1@', 'BIRTH', 'birth-recorded'], ['@F2@', 'adopted', 'adoptive']]);
  assert.ok(parents.every((relation) => relation.evidence === 'hypothesis' && relation.gedcom.line && relation.gedcom.parentXref && relation.gedcom.childXref === 'I1'));
  assert.ok(person.notes.some((note) => /více rodičovských rodin/.test(note)));
});

test('same parent in distinct family assertions is retained and disproven FAMC remains metadata only', () => {
  const text = '0 @C@ INDI\n1 NAME Dítě\n1 FAMC @F@\n2 PEDI BIRTH\n1 FAMC @F@\n2 PEDI FOSTER\n1 FAMC @G@\n2 PEDI ADOPTED\n2 STAT DISPROVEN\n0 @P@ INDI\n1 NAME Rodič\n0 @F@ FAM\n1 HUSB @P@\n1 CHIL @C@\n0 @G@ FAM\n1 HUSB @P@\n1 CHIL @C@\n';
  const imported = convert(text), links = imported.relationships.filter((item) => item.type === 'parent-child');
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((item) => item.parentType), ['birth-recorded', 'foster']);
  assert.notEqual(links[0].id, links[1].id);
  assert.equal(imported.people[0].gedcom.familyLinks.length, 3);
  assert.ok(imported.importReport.warnings.some((warning) => warning.code === 'DISPROVEN_FAMILY_LINK'));
});

test('nested ADOP.FAMC selector HUSB never invents adoption by WIFE', () => {
  const text = '0 @C@ INDI\n1 NAME Dítě\n1 ADOP\n2 FAMC @F@\n3 ADOP HUSB\n0 @P@ INDI\n1 NAME První\n0 @Q@ INDI\n1 NAME Druhý\n0 @F@ FAM\n1 HUSB @P@\n1 WIFE @Q@\n1 CHIL @C@\n';
  const imported = convert(text), links = imported.relationships.filter((item) => item.type === 'parent-child');
  assert.equal(links.length, 1);
  assert.equal(links[0].parentType, 'adoptive');
  assert.equal(links[0].gedcom.parentXref, 'P');
  assert.equal(links[0].gedcom.adoptionSelector, 'HUSB');
  const unspecified = convert(text.replace('3 ADOP HUSB\n', ''));
  assert.equal(unspecified.relationships.filter((item) => item.type === 'parent-child').length, 0);
  assert.ok(unspecified.importReport.warnings.some((warning) => warning.code === 'ADOPTION_PARENT_UNSPECIFIED'));
});

test('page and original QUAY are retained without raising evidence; unsupported fields are reported', () => {
  const candidates = convert(sample), person = candidates.people[0];
  assert.equal(person.birth.gedcom.citations[0].page, 'kniha 22, strana 3, řádek 7');
  assert.equal(person.birth.gedcom.citations[0].originalQuality, '3');
  assert.ok(candidates.relationships.every((relation) => relation.evidence === 'hypothesis'));
  for (const tag of ['_CUSTOM', '_SUB', '_ARCHIVE', 'REPO', 'OBJE']) assert.ok(candidates.importReport.unmappedFields.some((field) => field.tag === tag), tag);
  assert.ok(candidates.importReport.unmappedFields.every((field) => field.line && field.path));
  assert.equal(candidates.sources[1].transcriptionLines.join('\n'), 'Doslovná ukázka\ndruhý řádek');
});

test('duplicate XREF is rejected instead of silently selecting the first record', () => {
  const tree = G.parseGedcom('0 @I1@ INDI\n1 NAME První\n0 @I1@ INDI\n1 NAME Druhý\n');
  assert.equal(tree.errors[0].code, 'DUPLICATE_XREF');
  assert.throws(() => G.gedcomToCandidates(tree), /duplicitní XREF/);
});

test('real CLI import keeps original bytes and AST, and dry-run applies into an empty project', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gedcom-import-regression-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'rodina.ged'), data = path.join(directory, 'genealogy.json'), output = path.join(directory, 'test.candidates.json');
  await fs.writeFile(input, sample);
  const originalData = `${JSON.stringify(empty(), null, 2)}\n`;
  await fs.writeFile(data, originalData);
  const result = await run('scripts/gedcom.mjs', 'import', input, '--data', data, '--output', output);
  succeed(result);
  const sidecar = JSON.parse(await fs.readFile(output, 'utf8'));
  const decoded = Buffer.from(sidecar.original.content, 'base64');
  assert.deepEqual(decoded, Buffer.from(sample));
  assert.equal(sidecar.original.sha256, createHash('sha256').update(decoded).digest('hex'));
  assert.equal(sidecar.namespace, sidecar.original.sha256);
  assert.equal(sidecar.original.bytes, Buffer.byteLength(sample));
  const raw = JSON.stringify(sidecar.rawAst);
  assert.match(raw, /_CUSTOM/);
  assert.match(raw, /kniha 22, strana 3, řádek 7/);
  assert.match(raw, /neupravovat původní text/);
  const changes = JSON.parse(await fs.readFile(path.join(directory, 'test.changes.json'), 'utf8'));
  assert.ok(changes.ops.every((op) => collections.includes(op.collection) && /^[a-z0-9][a-z0-9-]*$/.test(op.id)));
  const apply = await run('scripts/apply-changes.mjs', path.join(directory, 'test.changes.json'), '--data', data, '--dry-run');
  succeed(apply);
  const preview = await applyChangeFile(path.join(directory, 'test.changes.json'), { dataPath: data, dryRun: true, log() {} });
  assert.deepEqual(preview.written, []);
  assert.equal(preview.next.genealogy.people.length, 6);
  assert.equal(preview.next.genealogy.relationships.filter((item) => item.type === 'parent-child').length, 4);
  assert.equal(await fs.readFile(data, 'utf8'), originalData);
  assert.deepEqual(await fs.readFile(input), Buffer.from(sample));
});

test('reimport of the same bytes produces no overwrite operations for existing IDs', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gedcom-reimport-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'rodina.ged'), data = path.join(directory, 'genealogy.json'), first = path.join(directory, 'first.candidates.json'), next = path.join(directory, 'next.candidates.json');
  await fs.writeFile(input, sample); await fs.writeFile(data, JSON.stringify(empty()));
  succeed(await run('scripts/gedcom.mjs', 'import', input, '--data', data, '--output', first));
  const sidecar = JSON.parse(await fs.readFile(first, 'utf8'));
  const existing = { ...empty(), ...sidecar.candidates };
  existing.people[0].notes.push('Ruční badatelská poznámka, nesmí se přepsat.');
  const dataText = JSON.stringify(existing);
  await fs.writeFile(data, dataText);
  succeed(await run('scripts/gedcom.mjs', 'import', input, '--data', data, '--output', next));
  const repeat = JSON.parse(await fs.readFile(next, 'utf8'));
  assert.equal(repeat.namespace, sidecar.namespace);
  assert.equal(repeat.importReport.alreadyPresent.length, allItems(sidecar.candidates).length);
  assert.ok(repeat.importReport.alreadyPresent.some((item) => item.differs));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'next.changes.json'), 'utf8')).ops, []);
  assert.equal(await fs.readFile(data, 'utf8'), dataText);
});

test('export refuses ambiguous family splitting and retains simple PEDI and date qualifiers', () => {
  const candidates = convert(sample);
  const data = { ...empty(), ...candidates };
  assert.throws(() => G.toGedcom(data), /více rodičovských rodin/);
  data.relationships = data.relationships.filter((relation) => relation.type !== 'parent-child' || relation.parentType === 'birth-recorded');
  const output = G.toGedcom(data);
  assert.match(output.text, /1 FAMC @F\d+@\r\n2 PEDI BIRTH/);
  assert.match(output.text, /2 DATE ABT 1900/);
  assert.match(output.text, /2 DATE BEF 1 JAN 1901/);
  assert.match(output.text, /2 DATE AFT 1901/);
  const event = data.events[0];
  Object.assign(event, { dateText: '@#DJULIAN@ 1 JAN 1901', originalDate: '@#DJULIAN@ 1 JAN 1901', dateQualifier: 'calendar-unconverted', calendar: 'JULIAN' });
  const safe = G.toGedcom(data).text;
  assert.match(safe, /1 CHR\r\n2 DATE\r\n3 PHRASE @@#DJULIAN@ 1 JAN 1901/);
  assert.doesNotMatch(safe, /1 CHR\r\n2 DATE (?:1 JAN )?1901/);
  for (const relation of data.relationships.filter((item) => item.type === 'parent-child')) {
    relation.parentType = 'unspecified'; relation.gedcom.originalPedigree = 'CUSTOM';
  }
  assert.throws(() => G.toGedcom(data), /původní PEDI CUSTOM/);
});

test('CLI rejects invalid encoding and output paths that overwrite source data', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gedcom-invalid-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'bad.ged'), data = path.join(directory, 'genealogy.json'), output = path.join(directory, 'out.json');
  await fs.writeFile(data, JSON.stringify(empty()));
  await fs.writeFile(input, Buffer.from([0xff, 0xfe, 0x61]));
  const invalid = await run('scripts/gedcom.mjs', 'import', input, '--data', data, '--output', output);
  assert.ifError(invalid.error);
  assert.equal(invalid.status, 1);
  await assert.rejects(fs.access(output), { code: 'ENOENT' });
  await fs.writeFile(input, sample);
  const before = await fs.readFile(data);
  const unsafe = await run('scripts/gedcom.mjs', 'import', input, '--data', data, '--output', data);
  assert.ifError(unsafe.error);
  assert.equal(unsafe.status, 1);
  assert.deepEqual(await fs.readFile(data), before);
});

test('family edition omits raw GEDCOM research metadata while keeping parentage and date uncertainty', () => {
  const { importReport, ...candidates } = convert(sample);
  const source = { ...empty(), ...candidates };
  source.people[0].gedcom.privateWorkingNote = 'SOUKROMA PRACOVNI STOPA';
  const family = createFamilyEdition(source);
  assert.doesNotMatch(JSON.stringify(family), /SOUKROMA PRACOVNI STOPA|"gedcom"|originalQuality|pedigreeLine/);
  assert.equal(family.people[0].birth.dateQualifier, 'about');
  assert.equal(family.people[0].birth.date, undefined);
  assert.equal(family.relationships.filter((relation) => relation.parentType === 'adoptive').length, 2);
  assert.equal(family.relationships.filter((relation) => relation.parentType === 'birth-recorded').length, 2);
  assert.ok(source.people[0].gedcom.privateWorkingNote, 'original research data stays intact');
});

test('export supports multiple partnerships and children from different unambiguous parental families', () => {
  const data = empty();
  data.people = [
    { id: 'father', displayName: 'Fiktivní Otec', sex: 'male' },
    { id: 'mother-a', displayName: 'První Matka', sex: 'female' },
    { id: 'mother-b', displayName: 'Druhá Matka', sex: 'female' },
    { id: 'child-a', displayName: 'První Dítě' },
    { id: 'child-b', displayName: 'Druhé Dítě' },
  ];
  data.relationships = [
    { id: 'spouse-a', type: 'spouse', from: 'father', to: 'mother-a' },
    { id: 'spouse-b', type: 'spouse', from: 'father', to: 'mother-b' },
    ...['a', 'b'].flatMap((suffix) => ['father', `mother-${suffix}`].map((from, index) => ({
      id: `parent-${suffix}-${index}`, type: 'parent-child', from, to: `child-${suffix}`,
      parentType: suffix === 'a' ? 'birth-recorded' : 'adoptive', gedcom: { familyXref: `F${suffix}` },
    }))),
  ];
  const { text, xrefOf } = G.toGedcom(data, { living: 'include' });
  const tree = G.parseGedcom(text);
  const record = (id) => tree.byXref[xrefOf[id].replaceAll('@', '')];
  assert.equal(tree.records.filter((item) => item.tag === 'FAM').length, 2);
  assert.equal(record('father').children.filter((node) => node.tag === 'FAMS').length, 2);
  for (const [id, pedigree] of [['child-a', 'BIRTH'], ['child-b', 'ADOPTED']]) {
    const families = record(id).children.filter((node) => node.tag === 'FAMC');
    assert.equal(families.length, 1, id);
    assert.equal(families[0].children.find((node) => node.tag === 'PEDI').value, pedigree);
  }
});

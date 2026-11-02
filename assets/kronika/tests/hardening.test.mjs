import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { safePath, assertRelativePath } from '../scripts/lib/safe-paths.mjs';
import { encryptHtml } from '../scripts/protect.mjs';
import { initProject } from '../scripts/init.mjs';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const model = require('../src/model.js');
const gedcom = require('../src/gedcom.js');
const sample = JSON.parse(await fs.readFile('tests/fixtures/sample-family/data.json', 'utf8'));

test('all family-facing dataset paths remove research layers and use adjacent overrides', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-private-path-'));
  try {
    const data = structuredClone(sample);
    data.media = [];
    data.dna = { marker: 'PRIVATE-DNA-MARKER' };
    data.acceptedFindings = ['PRIVATE-EXCEPTION-MARKER'];
    const file = path.join(directory, 'custom.json');
    await fs.writeFile(file, JSON.stringify(data));
    await fs.writeFile(path.join(directory, 'family-edition.json'), JSON.stringify({ claimOverrides: { [data.claims[0].id]: 'Vlastní rodinný text' } }));
    for (const edition of ['family', 'light']) {
      const output = path.join(directory, `${edition}.html`);
      await run(process.execPath, ['scripts/build.mjs', '--data', file, '--edition', edition, '--output', output]);
      const html = await fs.readFile(output, 'utf8');
      const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)][0][1];
      const context = { window: {} };
      vm.runInNewContext(script, context);
      const built = context.window.RK_DATA;
      assert.equal(built.researchTasks.length, 0);
      assert.equal(built.changelog.length, 0);
      assert.ok(built.claims.every((claim) => claim.reasoning === undefined));
      assert.equal(built.claims[0].text, 'Vlastní rodinný text');
      assert.equal(built.dna, undefined);
      assert.equal(built.acceptedFindings, undefined);
      assert.ok(!html.includes('PRIVATE-DNA-MARKER'));
    }
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('asset reads reject traversal, absolute paths and links leaving the archive', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-safe-path-'));
  try {
    const archive = path.join(directory, 'archive');
    await fs.mkdir(archive);
    await fs.writeFile(path.join(archive, 'inside.png'), 'inside');
    await fs.writeFile(path.join(directory, 'outside.png'), 'outside');
    assert.equal(await safePath(archive, 'inside.png'), path.join(archive, 'inside.png'));
    for (const bad of ['../outside.png', '/etc/passwd', 'C:\\secret.png', 'x/../../outside.png', 'a//b.png']) {
      assert.throws(() => assertRelativePath(bad), /Unsafe archive path/);
    }
    await fs.symlink(path.join(directory, 'outside.png'), path.join(archive, 'linked.png'));
    await assert.rejects(safePath(archive, 'linked.png'), /symlink leaves archive/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('malformed existing genealogy is never silently replaced', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-corrupt-init-'));
  try {
    const parent = path.join(directory, 'src/data');
    await fs.mkdir(parent, { recursive: true });
    const file = path.join(parent, 'genealogy.json');
    await fs.writeFile(file, '{"people": [');
    await assert.rejects(initProject({ root: directory, mode: 'vlastni', name: 'Test User' }), /Existující data nelze/);
    assert.equal(await fs.readFile(file, 'utf8'), '{"people": [');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('uncertain lifespans and explicit living people remain private', () => {
  const data = { people: [
    { id: 'unknown' },
    { id: 'empty-death', birth: { date: '1980' }, death: {} },
    { id: 'centenarian', birth: { date: '1920' } },
    { id: 'living', birth: { date: '1800' }, living: true },
    { id: 'deceased', birth: { date: '1980' }, death: { date: '2020' } },
    { id: 'historical', birth: { date: '1800' } },
  ] };
  assert.deepEqual([...gedcom.livingPeople(data, new Date('2026-11-02'))].sort(), ['centenarian', 'empty-death', 'living', 'unknown']);
});

test('reference validation includes claim targets and person citations', () => {
  const data = structuredClone(sample);
  data.claims[0].subjectId = 'absent';
  data.people[0].sourceIds = ['absent'];
  data.people[0].birth.placeId = 'absent';
  const codes = model.validateDataset(data).map((error) => error.code);
  for (const code of ['CLAIM_SUBJECT_MISSING', 'PERSON_SOURCE_MISSING', 'PERSON_PLACE_MISSING']) assert.ok(codes.includes(code));
});

test('standalone encryption rejects short passwords', async () => {
  await assert.rejects(encryptHtml('<p>Private</p>', '123456', { iterations: 1000 }), /16 znaků/);
});

test('build rejects dangling references before writing a deliverable', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-invalid-ref-'));
  try {
    const data = structuredClone(sample);
    data.claims[0].sourceIds = ['missing-source'];
    const input = path.join(directory, 'data.json');
    const output = path.join(directory, 'output.html');
    await fs.writeFile(input, JSON.stringify(data));
    await assert.rejects(run(process.execPath, ['scripts/build.mjs', '--data', input, '--output', output]), /CLAIM_SOURCE_MISSING/);
    await assert.rejects(fs.access(output));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('build rejects imported media that could inject HTML', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rk-invalid-uri-'));
  try {
    const data = structuredClone(sample);
    data.media[0].dataUri = 'x" onerror="alert(1)';
    const input = path.join(directory, 'data.json');
    const output = path.join(directory, 'output.html');
    await fs.writeFile(input, JSON.stringify(data));
    await assert.rejects(run(process.execPath, ['scripts/build.mjs', '--data', input, '--output', output]), /Unsafe embedded media/);
    await assert.rejects(fs.access(output));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

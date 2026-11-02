import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createFamilyEdition } from '../scripts/family-edition.mjs';

const require = createRequire(import.meta.url);
const views = require('../src/views.js');
const fixture = () => JSON.parse(fs.readFileSync('tests/fixtures/sample-family/data.json', 'utf8'));

test('source detail presents literal reading, translation, locator and uncertainty separately', () => {
  const data = fixture();
  const source = data.sources[0];
  Object.assign(source, {
    transcriptionLines: ['Joannes <filius> & Anna', 'Patris nomen [nečitelné]'],
    translationLines: ['Jan, syn Anny.', 'Jméno otce není čitelné.'],
    locator: { archive: 'Archiv <Praha>', signature: 'N 12', folio: '19r', scan: 20, entry: 'třetí zápis' },
    reliabilityNote: 'Rodné příjmení [?]; datum křtu je jiné než narození.',
    provenance: { kind: 'digitized-original', inspection: 'not-reviewed', importedFrom: 'rodokmen' },
    url: 'https://example.org/scan?image=20&detail=1',
  });
  const html = views.renderSourceDetail(data, source.id);
  for (const value of ['Doslovný přepis originálu', 'Český překlad', 'Citace a původ pramene', 'Nejistoty a spolehlivost', '19r', '20', 'třetí zápis', 'Obraz po převzetí dosud neověřen']) assert.ok(html.includes(value), value);
  assert.match(html, /<li>Joannes &lt;filius&gt; &amp; Anna<\/li>/);
  assert.match(html, /<li>Patris nomen \[nečitelné\]<\/li>/);
  assert.ok(html.indexOf('Doslovný přepis originálu') < html.indexOf('Český překlad'));
  assert.match(html, /href="https:\/\/example\.org\/scan\?image=20&amp;detail=1"/);
  assert.equal((html.match(/Doslovný přepis originálu/g) || []).length, 1);
});

test('source detail includes every related image and blocks active URL schemes', () => {
  const data = fixture();
  const source = data.sources[0];
  source.url = 'javascript:alert(1)';
  source.relatedUrls = ['data:text/html,<script>alert(1)</script>', 'https://example.org/reference'];
  source.transcriptionLines = ['<script>alert(2)</script>'];
  const image = data.media.find((media) => media.kind !== 'audio-clip');
  data.media = [{ ...image, id: 'first', title: 'Celý snímek', sourceId: source.id }, { ...image, id: 'second', title: 'Výřez zápisu', sourceId: source.id }];
  const html = views.renderSourceDetail(data, source.id);
  assert.match(html, /Celý snímek/);
  assert.match(html, /Výřez zápisu/);
  assert.equal((html.match(/<figure/g) || []).length, 2);
  assert.doesNotMatch(html, /href="(?:javascript|data):|<script>/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test('research person notes are visible only in the research edition', () => {
  const data = fixture();
  const person = data.people[0];
  person.notes = ['PRIVATE: Příjmení <nečitelné> & další otázka.'];
  const research = views.renderPersonDetail(data, person.id, { edition: 'research' });
  assert.match(research, /Badatelské poznámky/);
  assert.match(research, /PRIVATE: Příjmení &lt;nečitelné&gt; &amp; další otázka\./);
  const family = views.renderPersonDetail(data, person.id, { edition: 'family' });
  assert.doesNotMatch(family, /Badatelské poznámky|PRIVATE:/);
  const transformed = createFamilyEdition(data, { noteOverrides: { [person.id]: ['Text vybraný pro rodinu.'] } });
  const familyOutput = views.renderPersonDetail(transformed, person.id, { edition: 'family' });
  assert.match(familyOutput, /Text vybraný pro rodinu/);
  assert.doesNotMatch(familyOutput, /PRIVATE:/);
});

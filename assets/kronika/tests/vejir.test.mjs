import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFanSvg, collectAncestorSlots } from '../scripts/vejir.mjs';

function fixture() {
  return {
    meta: { defaultPersonId: 'ego', sample: true },
    people: [
      { id: 'ego', displayName: 'Antonín Novák', birth: { dateText: '1900' } },
      { id: 'father', displayName: 'František Novák', sex: 'male', birth: { dateText: '1871' } },
      { id: 'mother', displayName: 'Anna Dvořáková', sex: 'female', birth: { dateText: '1874' } },
      { id: 'ff', displayName: 'Josef Novák', sex: 'male' },
      { id: 'fm', displayName: 'Marie Malá', sex: 'female' },
      { id: 'mf', displayName: 'Jan Dvořák', sex: 'male' },
      { id: 'mm', displayName: 'Terezie Černá', sex: 'female' },
    ],
    relationships: [
      { id: 'r-f', type: 'parent-child', from: 'father', to: 'ego', evidence: 'verified' },
      { id: 'r-m', type: 'parent-child', from: 'mother', to: 'ego', evidence: 'family-record', parentType: 'adoptive' },
      { id: 'r-ff', type: 'parent-child', from: 'ff', to: 'father', evidence: 'supported' },
      { id: 'r-fm', type: 'parent-child', from: 'fm', to: 'father', evidence: 'hypothesis' },
      { id: 'r-mf', type: 'parent-child', from: 'mf', to: 'mother' },
      { id: 'r-mm', type: 'parent-child', from: 'mm', to: 'mother', evidence: 'verified' },
    ],
  };
}
const box = (svg) => svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);

test('one person has a compact viewBox and no invented parent', () => {
  const data = { meta: { defaultPersonId: 'self' }, people: [{ id: 'self', displayName: 'Jana Nováková' }], relationships: [] };
  const svg = buildFanSvg(data, { generations: 10 });
  assert.equal(collectAncestorSlots(data, { generations: 10 }).length, 1);
  assert.equal((svg.match(/data-person-id=/g) || []).length, 1);
  assert.ok(box(svg)[2] <= 700, 'no fixed many-generation canvas for one person');
  assert.match(svg, /Jana Nováková/);
  assert.doesNotMatch(svg, /<script|<image|https?:\/\/[^w]/);
});

test('seven people occupy exact parent slots with honest edge states and adoption labels', () => {
  const data = fixture();
  const slots = collectAncestorSlots(data, { generations: 3 });
  assert.deepEqual(slots.map((slot) => [slot.number, slot.person.id]), [[1, 'ego'], [2, 'father'], [3, 'mother'], [4, 'ff'], [5, 'fm'], [6, 'mf'], [7, 'mm']]);
  const svg = buildFanSvg(data, { generations: 10 });
  assert.equal((svg.match(/data-person-id=/g) || []).length, 7);
  assert.match(svg, /data-edge-id="r-mf" data-evidence="unknown"/);
  assert.match(svg, /data-parent-type="adoptive"/);
  assert.match(svg, /adoptivní/);
  assert.match(svg, /VYMYŠLENÁ UKÁZKA/);
  assert.ok(box(svg)[2] < 1100, 'seven people use only the necessary rings');
  for (const word of ['Ověřená vazba', 'Podpořená vazba', 'Rodinné podání', 'Hypotéza / rozpor', 'Jistota neuvedena']) assert.ok(svg.includes(word));
});

test('pedigree collapse repeats the same person ID in distinct positions', () => {
  const data = fixture();
  data.relationships.find((edge) => edge.id === 'r-mf').from = 'ff';
  const slots = collectAncestorSlots(data);
  assert.deepEqual(slots.filter((slot) => slot.person.id === 'ff').map((slot) => slot.number), [4, 6]);
  const svg = buildFanSvg(data);
  assert.equal((svg.match(/data-person-id="ff"/g) || []).length, 2);
  assert.match(svg, /opakuje se na č\. 4, 6/);
});

test('cycles are refused even beyond the selected generation limit', () => {
  const data = fixture();
  data.relationships.push({ id: 'cycle', type: 'parent-child', from: 'ego', to: 'ff' });
  assert.throws(() => buildFanSvg(data, { generations: 1 }), /Cyklus/);
});

test('partnership is not a parent and conflicting parental roles are not silently chosen', () => {
  const data = fixture();
  data.people.push({ id: 'partner', displayName: 'Partner', sex: 'male' });
  data.relationships.push({ id: 'spouse', type: 'spouse', from: 'partner', to: 'ego' });
  assert.ok(!collectAncestorSlots(data).some((slot) => slot.person.id === 'partner'));
  data.relationships.push({ id: 'extra', type: 'parent-child', from: 'partner', to: 'ego', parentType: 'adoptive' });
  assert.throws(() => buildFanSvg(data), /3 zapsané rodiče/);
  data.relationships = data.relationships.filter((edge) => edge.id !== 'r-m');
  assert.throws(() => buildFanSvg(data), /více rodičů role father/);
});

test('XML text and attributes are escaped without changing identity', () => {
  const id = 'a"<&';
  const data = { meta: { defaultPersonId: id }, people: [{ id, displayName: '<script>alert(1)</script> & Anna' }], relationships: [] };
  const svg = buildFanSvg(data);
  assert.match(svg, /data-person-id="a&quot;&lt;&amp;"/);
  assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Anna/);
  assert.doesNotMatch(svg, /<script>/);
});

test('generation limits are explicit and two unspecified parents stay distinct', () => {
  const data = fixture();
  for (const p of data.people) delete p.sex;
  assert.equal(collectAncestorSlots(data, { generations: 1 }).length, 1);
  assert.equal(collectAncestorSlots(data, { generations: 2 }).length, 3);
  assert.equal(collectAncestorSlots(data, { generations: 2 }).filter((slot) => slot.role === 'unknown').length, 2);
  for (const generations of [0, 11, 2.5, NaN]) assert.throws(() => buildFanSvg(data, { generations }), /1 až 10/);
});

test('GEDCOM BIRTH is labeled as a recorded birth family without asserting genetic parentage', () => {
  const data = fixture();
  data.relationships[0].parentType = 'birth-recorded';
  data.relationships[1].parentType = 'sealing-recorded';
  const svg = buildFanSvg(data, { generations: 2 });
  assert.match(svg, /data-parent-type="birth-recorded"/);
  assert.match(svg, /rodičovství: rodina při narození/);
  assert.match(svg, /náboženské pečetění/);
  assert.match(svg, /sama nedokládá genetické rodičovství/);
  assert.doesNotMatch(svg, /data-parent-type="biological"/);
  data.relationships[0].parentType = 'birth';
  assert.equal(collectAncestorSlots(data, { generations: 2 })[1].parentType, 'birth-recorded');
});

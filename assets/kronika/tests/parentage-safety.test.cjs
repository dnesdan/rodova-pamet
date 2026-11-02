const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../src/model.js');
const tree = require('../src/tree.js');
const fullTree = require('../src/full-tree.js');
const kinship = require('../src/kinship.js');
const presentation = require('../src/presentation.js');
const familyViews = require('../src/family-views.js');
const story = require('../src/story.js');
const researchViews = require('../src/research-views.js');

// Invented data only: two recorded parent families of the same child.
function fixture() {
  return {
    meta: { defaultPersonId: 'child', version: '0.1.0', sample: true },
    people: [
      { id: 'child', displayName: 'Dítě <ukázka>', sex: 'unknown' },
      { id: 'birth-father', displayName: 'Otec při narození', sex: 'male' },
      { id: 'birth-mother', displayName: 'Matka při narození', sex: 'female' },
      { id: 'adoptive-father', displayName: 'Adoptivní otec', sex: 'male' },
      { id: 'adoptive-mother', displayName: 'Adoptivní matka', sex: 'female' },
    ],
    relationships: [
      { id: 'r1', type: 'parent-child', from: 'birth-father', to: 'child', parentType: 'birth-recorded', parentRole: 'father' },
      { id: 'r2', type: 'parent-child', from: 'birth-mother', to: 'child', parentType: 'birth-recorded', parentRole: 'mother' },
      { id: 'r3', type: 'parent-child', from: 'adoptive-father', to: 'child', parentType: 'adoptive', parentRole: 'father' },
      { id: 'r4', type: 'parent-child', from: 'adoptive-mother', to: 'child', parentType: 'adoptive', parentRole: 'mother' },
    ],
    events: [], places: [], claims: [], sources: [], media: [], researchTasks: [], changelog: [],
  };
}

test('four recorded parents stop the binary chart while the full graph keeps every link', () => {
  const data = fixture();
  const numbering = model.getAhnentafel(data, 'child');
  assert.equal(numbering.numberOf.size, 0);
  assert.equal(numbering.idOf.size, 0);
  assert.ok(numbering.errors.some((error) => error.code === 'AHNENTAFEL_MULTIPLE_PARENTS'));
  const direct = tree.renderFamilyTree(data, 'child');
  assert.match(direct, /Vývod nelze jednoznačně očíslovat/);
  assert.match(direct, /data-tree-mode="full"/);
  assert.match(direct, /Dítě &lt;ukázka&gt;/);
  assert.doesNotMatch(direct, /<svg|<ukázka>/);
  const graph = fullTree.buildGraph(data, 'child');
  assert.equal(graph.parentIdsByChild.get('child').size, 4);
  assert.equal(graph.relationships.filter((link) => link.type === 'parent-child').length, 4);
  const full = tree.renderTreeView(data, { focusPersonId: 'child', treeMode: 'full' });
  assert.match(full, /čísla předků jsou vypnutá/);
  assert.match(full, /data-full-tree-viewport/);
});

test('two fathers are not silently reduced to the first one', () => {
  const data = fixture();
  data.relationships = data.relationships.filter((link) => link.parentRole === 'father');
  const numbering = model.getAhnentafel(data, 'child');
  assert.equal(numbering.idOf.size, 0);
  assert.ok(numbering.errors.some((error) => error.code === 'AHNENTAFEL_ROLE_CONFLICT'));
  assert.match(tree.renderFamilyTree(data, 'child'), /více rodičů role otec/);
});

test('explicit roles determine slots independently of sex and unknown roles stay unspecified', () => {
  const data = fixture();
  data.relationships = data.relationships.slice(0, 2);
  data.people.forEach((person) => { person.sex = 'unknown'; });
  const numbering = model.getAhnentafel(data, 'child');
  assert.deepEqual(numbering.errors, []);
  assert.equal(numbering.idOf.get(2), 'birth-father');
  assert.equal(numbering.idOf.get(3), 'birth-mother');
  const direct = tree.createTreeModel(data, 'child');
  assert.equal(direct.nodes.find((person) => person.id === 'birth-father').branch, 'paternal');
  assert.equal(direct.nodes.find((person) => person.id === 'birth-mother').branch, 'maternal');
  data.relationships.forEach((link) => { link.parentRole = 'unknown'; });
  data.people.find((person) => person.id === 'birth-father').sex = 'male';
  assert.equal(model.getAhnentafel(data, 'child').idOf.size, 3);
  assert.ok(tree.createTreeModel(data, 'child').nodes.filter((person) => person.generation === 1).every((person) => person.branch === 'unknown'));
  assert.ok(tree.createTreeModel(data, 'child').nodes.filter((person) => person.generation === 1).every((person) => person.relativeRole === 'rodič'));
});

test('cycles and repeated assertions are reported before any ancestor numbering', () => {
  const data = fixture();
  data.relationships = [data.relationships[0], { id: 'cycle', type: 'parent-child', from: 'child', to: 'birth-father' }];
  assert.ok(model.getAhnentafel(data, 'child').errors.some((error) => error.code === 'AHNENTAFEL_CYCLE'));
  data.relationships = [data.relationships[0], { ...data.relationships[0], id: 'second-assertion', parentType: 'adoptive' }];
  const numbering = model.getAhnentafel(data, 'child');
  assert.ok(numbering.errors.some((error) => error.code === 'AHNENTAFEL_MULTIPLE_ASSERTIONS'));
  assert.equal(numbering.numberOf.size, 0);
});

test('legacy, birth-recorded and adoptive links describe recorded family kinship', () => {
  for (const parentType of [undefined, 'unspecified', 'birth-recorded', 'adoptive', 'foster', 'step', 'sealing-recorded', 'natural']) {
    const data = fixture();
    data.relationships = [{ ...data.relationships[0], parentType }];
    const relation = model.getRelationship(data, 'child', 'birth-father');
    assert.equal(relation.kind, 'recorded', String(parentType));
    assert.match(presentation.relationshipLabel(relation, 'male'), /zapsané rodinné příbuzenství/);
    assert.doesNotMatch(presentation.relationshipLabel(relation, 'male'), /pokrevní/);
    assert.deepEqual(kinship.kinshipPath(data, 'child', 'birth-father').path, ['child', 'birth-father']);
  }
  const html = familyViews.renderKinshipResult(fixture(), 'child', 'adoptive-father');
  assert.match(html, /Biologické příbuzenství tím není doloženo/);
  assert.match(html, /Dítě &lt;ukázka&gt;/);
  assert.doesNotMatch(html, /<ukázka>/);
});

test('biological paths use only explicit biological links, including when a social path is shorter', () => {
  const data = fixture();
  data.relationships = [
    { id: 'bio-1', type: 'parent-child', from: 'birth-father', to: 'child', parentType: 'biological' },
    { id: 'bio-2', type: 'parent-child', from: 'adoptive-father', to: 'birth-father', parentType: 'biological' },
    { id: 'social', type: 'parent-child', from: 'adoptive-father', to: 'child', parentType: 'adoptive' },
  ];
  const relation = model.getRelationship(data, 'child', 'adoptive-father');
  assert.equal(relation.kind, 'blood');
  assert.equal(relation.up, 2);
  assert.deepEqual(kinship.kinshipPath(data, 'child', 'adoptive-father').path, ['child', 'birth-father', 'adoptive-father']);
});

test('co-parenthood alone does not assert spouses across birth and adoptive families', () => {
  const data = fixture();
  assert.equal(model.getRelationship(data, 'birth-father', 'adoptive-mother').kind, 'none');
  data.relationships.push({ id: 'actual-partners', type: 'spouse', from: 'birth-father', to: 'birth-mother' });
  assert.equal(model.getRelationship(data, 'birth-father', 'birth-mother').kind, 'spouse');
});

test('in-law paths retain their recorded or biological basis', () => {
  const data = fixture();
  data.people.push({ id: 'partner', displayName: 'Partner rodiče', sex: 'male' });
  data.relationships = [data.relationships[0], { id: 'partner-link', type: 'spouse', from: 'birth-father', to: 'partner' }];
  const found = kinship.kinshipPath(data, 'child', 'partner');
  assert.equal(found.relationship.kind, 'relative-partner');
  assert.equal(found.relationship.relative.kind, 'recorded');
  assert.deepEqual(found.path, ['child', 'birth-father', 'partner']);
  assert.match(presentation.relationshipLabel(found.relationship, 'male'), /zapsané rodinné příbuzenství/);
});

test('book export stops with the same ambiguity instead of printing a selected family', async () => {
  const { buildBook } = await import('../scripts/build-book.mjs');
  assert.throws(() => buildBook(fixture(), { egoId: 'child' }), /Knihu s vývodem nelze vytvořit.*4 zapsaných rodičovských vazeb/);
});

test('the life story names every parent assertion with its type and never invents co-parent partnerships', () => {
  const data = fixture();
  const text = story.storyText(data, 'child');
  for (const name of ['Otec při narození', 'Matka při narození', 'Adoptivní otec', 'Adoptivní matka']) assert.ok(text.includes(name));
  assert.match(text, /rodina při narození; biologický původ neurčen/);
  assert.match(text, /adoptivní rodičovství/);
  assert.match(text, /automaticky nevybírá jedinou rodičovskou dvojici/);
  assert.doesNotMatch(story.storyText(data, 'birth-father'), /partnerkou byla/);
  const singleFamily = fixture();
  singleFamily.relationships = singleFamily.relationships.slice(2);
  assert.match(story.storyText(singleFamily, 'child'), /Adoptivní otec \(adoptivní rodičovství\)/);
});

test('DNA branches require an explicit biological path and leave adopted or unspecified paths unassigned', () => {
  const data = fixture();
  data.relationships = [data.relationships[0]];
  data.dna = {
    tests: [{ id: 't1', personId: 'child' }],
    matches: [
      { id: 'm1', alias: 'A', sharedCm: 150, sharedMatchIds: ['m2'], knownRelation: { commonAncestorIds: ['birth-father'] } },
      { id: 'm2', alias: 'B', sharedCm: 120, sharedMatchIds: ['m1'] },
    ],
  };
  for (const parentType of [undefined, 'unspecified', 'birth-recorded', 'adoptive']) {
    data.relationships[0].parentType = parentType;
    const html = researchViews.render('dna', data);
    assert.match(html, /výslovně označené jako biologické/);
    assert.doesNotMatch(html, /<small>· otcovská větev<\/small>/);
  }
  data.relationships[0].parentType = 'biological';
  assert.match(researchViews.render('dna', data), /<small>· otcovská větev<\/small>/);
});

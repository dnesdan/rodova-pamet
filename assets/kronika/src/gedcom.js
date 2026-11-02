(function registerGedcom(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RKGedcom = api;
})(globalThis, function createGedcomModule() {
  'use strict';

  // GEDCOM 7.0 export of the chronicle dataset and a tolerant GEDCOM 5.5.1/7
  // import that only produces candidates. Imported records are always
  // hypotheses pointing to the imported file; nothing here writes to the
  // dataset or knows any family.

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const CZECH_MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  const QUAY = { verified: 3, supported: 2, 'family-record': 1, hypothesis: 0 };
  const EVIDENCE_LABELS = { verified: 'ověřeno', supported: 'podloženo', 'family-record': 'rodinný záznam', hypothesis: 'hypotéza' };
  const EVIDENCE_RANK = ['hypothesis', 'family-record', 'supported', 'verified'];
  const APPROX = /\b(?:asi|kolem|okolo|cca|circa|přibl\w*|zhruba)\b|\bca\.|~/i;
  const YEAR = /(?<!\d)(\d{3,4})(?!\d)/g;
  const RANGE = /(?<!\d)(\d{3,4})\s*(?:–|—|-|až|a)\s*(\d{3,4})(?!\d)/;
  const LIVING_YEARS = 120;
  const LIVING_NAME = 'Žijící osoba';
  // Co-parents without a recorded partnership. GEDCOM treats every family with
  // two partners as a couple, so the export marks the exception.
  const COPARENTS_TAG = '_RKCOPARENTS';
  const COPARENTS_URI = 'urn:rodova-kronika:gedcom:copartners';

  // Chronicle event types → GEDCOM tags (individual events).
  const EVENT_TAGS = {
    birth: 'BIRT', baptism: 'CHR', christening: 'CHR', death: 'DEAT', burial: 'BURI', 'burial-site': 'BURI',
    occupation: 'OCCU', employment: 'OCCU', 'public-office': 'OCCU', residence: 'RESI', migration: 'RESI',
    census: 'CENS', property: 'PROP', emigration: 'EMIG', immigration: 'IMMI',
  };
  const FAMILY_EVENT_TAGS = { marriage: 'MARR', divorce: 'DIV', engagement: 'ENGA' };
  // GEDCOM tags → chronicle event types and Czech titles (import).
  const IMPORT_EVENTS = {
    CHR: ['baptism', 'Křest'], BAPM: ['baptism', 'Křest'], BURI: ['burial', 'Pohřeb'], CREM: ['burial', 'Kremace'],
    RESI: ['residence', 'Bydliště'], OCCU: ['occupation', 'Povolání'], CENS: ['census', 'Sčítání lidu'],
    EMIG: ['migration', 'Vystěhování'], IMMI: ['migration', 'Přistěhování'], PROP: ['property', 'Majetek'],
    MARR: ['marriage', 'Sňatek'], DIV: ['divorce', 'Rozvod'], ENGA: ['engagement', 'Zasnoubení'], EVEN: ['other', 'Událost'],
  };

  // ---------------------------------------------------------------- dates

  function parseIsoPoint(value) {
    const match = String(value || '').match(/^(\d{3,4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (!match) return null;
    return { year: Number(match[1]), month: match[2] ? Number(match[2]) : null, day: match[3] ? Number(match[3]) : null };
  }

  function gedcomPoint(point) {
    if (!point) return '';
    const parts = [];
    if (point.month && point.day) parts.push(String(point.day));
    if (point.month) parts.push(MONTHS[point.month - 1]);
    parts.push(String(point.year));
    return parts.join(' ');
  }

  function czechPoint(point) {
    if (!point) return '';
    if (point.day && point.month) return `${point.day}. ${point.month}. ${point.year}`;
    if (point.month) return `${CZECH_MONTHS[point.month - 1]} ${point.year}`;
    return String(point.year);
  }

  // Chronicle date → GEDCOM 7 date value and an optional PHRASE holding the
  // original wording when it says more than the value.
  function toGedcomDate(date, options = {}) {
    const text = String(options.dateText || '').trim();
    // Imported precision must survive export. In particular a Julian year or
    // an unparsed phrase must not become an exact Gregorian year by regex.
    if (typeof options.originalDate === 'string' && options.dateQualifier) {
      const original = options.originalDate.trim();
      const parsed = fromGedcomDate(original, options.originalDatePhrase);
      if (['calendar-unconverted', 'unparsed', 'interpreted'].includes(parsed.qualifier)) {
        return { value: '', phrase: [original, options.originalDatePhrase].filter(Boolean).join(' — ') || text };
      }
      return { value: original.replace(/^@#DGREGORIAN@\s*/i, '').toUpperCase(), phrase: options.originalDatePhrase || '' };
    }
    if (options.dateQualifier && options.dateQualifier !== 'exact') return { value: '', phrase: text || String(date || '') };
    let start = parseIsoPoint(date);
    let end = parseIsoPoint(options.endDate);
    if (!start && text) {
      const range = text.match(RANGE);
      if (range && Number(range[2]) > Number(range[1])) {
        start = { year: Number(range[1]) };
        end = { year: Number(range[2]) };
      } else {
        const years = text.match(YEAR);
        if (years && years.length === 1) start = { year: Number(years[0]) };
      }
    }
    let value = '';
    if (start && end && (end.year !== start.year || end.month !== start.month || end.day !== start.day)) {
      value = `BET ${gedcomPoint(start)} AND ${gedcomPoint(end)}`;
    } else if (start) {
      const point = gedcomPoint(start);
      if (/^(?:před|pred)\b/i.test(text)) value = `BEF ${point}`;
      else if (/^(?:po|nejdříve)\b/i.test(text)) value = `AFT ${point}`;
      else if (APPROX.test(text)) value = `ABT ${point}`;
      else value = point;
    }
    const plain = start ? [czechPoint(start), String(start.year), String(date || '')] : [];
    const phrase = text && !plain.includes(text) ? text : '';
    if (!value && !phrase) return null;
    return { value, phrase };
  }

  function parseGedcomPoint(text) {
    const normal = String(text || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const match = normal.match(/^(?:(\d{1,2}) )?(?:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) )?(\d{1,4})$/);
    if (!match) return null;
    const day = match[1] ? Number(match[1]) : null;
    const month = match[2] ? MONTHS.indexOf(match[2]) + 1 : null;
    const year = Number(match[3]);
    if (!year || (day !== null && !month)) return null;
    if (day !== null) {
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day < 1 || day > days[month - 1]) return null;
    }
    return { year, month, day };
  }

  function isoPoint(point) {
    if (!point) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return [String(point.year).padStart(4, '0'), point.month && pad(point.month), point.month && point.day && pad(point.day)].filter(Boolean).join('-');
  }

  // Date precision belongs to the data. Qualified, interpreted and unsupported
  // calendar dates retain their literal text; they never become exact ISO dates.
  function fromGedcomDate(value, phrase = '') {
    const originalDate = String(value || '');
    let text = originalDate.trim();
    const calendarToken = text.match(/^@#D([^@]+)@\s*/i) || text.match(/^(GREGORIAN|JULIAN|HEBREW|FRENCH_R)\s+/i);
    const calendar = calendarToken ? calendarToken[1].trim().toUpperCase() : 'GREGORIAN';
    if (calendar !== 'GREGORIAN') {
      return { qualifier: 'calendar-unconverted', originalDate, calendar,
        dateText: [originalDate.trim(), String(phrase || '').trim()].filter(Boolean).join(' — '),
        warning: `Kalendář ${calendar} nebyl převeden; údaj není gregoriánské ISO datum.` };
    }
    if (calendarToken) text = text.slice(calendarToken[0].length).trim();
    let inlinePhrase = '';
    const parenthesised = text.match(/\(([^)]*)\)\s*$/);
    if (parenthesised) { inlinePhrase = parenthesised[1].trim(); text = text.slice(0, parenthesised.index).trim(); }
    const upper = text.toUpperCase();
    let qualifier = 'exact', start = null, end = null, needsEnd = false, match;
    if ((match = upper.match(/^BET\s+(.+?)\s+AND\s+(.+)$/))) {
      qualifier = 'between'; start = parseGedcomPoint(match[1]); end = parseGedcomPoint(match[2]); needsEnd = true;
    } else if ((match = upper.match(/^FROM\s+(.+?)(?:\s+TO\s+(.+))?$/))) {
      qualifier = 'period'; start = parseGedcomPoint(match[1]); end = match[2] ? parseGedcomPoint(match[2]) : null; needsEnd = Boolean(match[2]);
    } else if ((match = upper.match(/^TO\s+(.+)$/))) {
      qualifier = 'period-end'; start = parseGedcomPoint(match[1]);
    } else if ((match = upper.match(/^(ABT|CAL|EST|BEF|AFT|INT)\s+(.+)$/))) {
      qualifier = { ABT: 'about', CAL: 'calculated', EST: 'estimated', BEF: 'before', AFT: 'after', INT: 'interpreted' }[match[1]];
      start = parseGedcomPoint(match[2]);
    } else if (upper) start = parseGedcomPoint(upper);
    const prefix = { about: 'asi ', calculated: 'vypočteno ', estimated: 'odhadem ', before: 'před ', after: 'po ', interpreted: 'interpretováno ', 'period-end': 'do ' }[qualifier] || '';
    let generated = '';
    if (qualifier === 'between' && start && end) generated = `mezi ${czechPoint(start)} a ${czechPoint(end)}`;
    else if (qualifier === 'period' && start && (!needsEnd || end)) generated = end ? `od ${czechPoint(start)} do ${czechPoint(end)}` : `od ${czechPoint(start)}`;
    else if (!['between', 'period'].includes(qualifier) && start) generated = prefix + czechPoint(start);
    const explanation = String(phrase || inlinePhrase || '').trim();
    const mainText = generated || originalDate.trim();
    const result = { qualifier: generated ? qualifier : 'unparsed', dateText: explanation && explanation !== mainText ? `${mainText}${mainText ? ' — ' : ''}${explanation}` : mainText, originalDate };
    if (qualifier === 'exact' && start && !inlinePhrase && !APPROX.test(explanation)) result.date = isoPoint(start);
    else if (qualifier === 'exact' && (inlinePhrase || APPROX.test(explanation))) result.qualifier = 'interpreted';
    if (calendarToken) result.calendar = calendar;
    if (!generated && originalDate.trim()) result.warning = 'Datum nelze bezpečně převést; původní zápis zůstal zachován.';
    return result;
  }

  // ---------------------------------------------------------------- writing

  function escapeValue(value) {
    const text = String(value);
    return text.startsWith('@') ? `@${text}` : text;
  }

  function createWriter() {
    const lines = [];
    function add(level, tag, value, xref) {
      const head = xref ? `${level} ${xref} ${tag}` : `${level} ${tag}`;
      if (value === undefined || value === null || value === '') {
        lines.push(head);
        return;
      }
      const parts = String(value).replace(/\r\n?/g, '\n').split('\n');
      lines.push(`${head} ${escapeValue(parts[0])}`.trimEnd());
      for (const part of parts.slice(1)) lines.push(part ? `${level + 1} CONT ${escapeValue(part)}` : `${level + 1} CONT`);
    }
    function pointer(level, tag, target) {
      lines.push(`${level} ${tag} ${target}`);
    }
    return { add, pointer, lines };
  }

  function formatCoordinate(value, positive, negative) {
    const number = Math.round(Math.abs(value) * 1e6) / 1e6;
    return `${value < 0 ? negative : positive}${number}`;
  }

  function validCoordinates(place) {
    return place && Number.isFinite(place.lat) && Number.isFinite(place.lon)
      && place.lat >= -90 && place.lat <= 90 && place.lon >= -180 && place.lon <= 180;
  }

  function placeName(place) {
    return [place.name, place.region, place.country].filter(Boolean).join(', ');
  }

  function strongestEvidence(values) {
    let best = null;
    for (const value of values) if (EVIDENCE_RANK.includes(value) && (!best || EVIDENCE_RANK.indexOf(value) > EVIDENCE_RANK.indexOf(best))) best = value;
    return best;
  }

  function yearOf(part) {
    const point = parseIsoPoint(part?.date);
    if (point) return point.year;
    const years = String(part?.dateText || '').match(YEAR);
    return years ? Number(years[0]) : null;
  }

  function nowYear(now) {
    const date = now instanceof Date ? now : new Date(now || Date.now());
    return date.getUTCFullYear();
  }

  // Conservative export policy, not a legal threshold or proof of death.
  // Unknown lifespan stays private; an empty death object proves nothing.
  function livingPeople(data, now) {
    const limit = nowYear(now) - LIVING_YEARS;
    const hidden = new Set();
    for (const person of data.people || []) {
      const year = yearOf(person.birth);
      const deathYear = yearOf(person.death);
      const recordedDeath = deathYear && deathYear <= nowYear(now);
      if (person.living === true || person.privacy?.living === true
        || (!recordedDeath && (!year || year > limit))) hidden.add(person.id);
    }
    return hidden;
  }

  // Splits a display name into given names and the displayed surname using the
  // recorded surnames; "…, rozená X" adds a maiden name.
  function splitDisplayName(person) {
    const [main, ...rest] = String(person.displayName || '').split(',');
    const tokens = main.trim().split(/\s+/).filter(Boolean);
    const maiden = rest.join(',').match(/\broz(?:ená|ený|\.)\s+(.+)$/i)?.[1]?.trim() || '';
    const keys = new Set([...(person.surnames || []), maiden].filter(Boolean).map((name) => surnameStem(name)));
    let index = -1;
    for (let i = tokens.length - 1; i > 0; i -= 1) if (keys.has(surnameStem(tokens[i]))) { index = i; break; }
    if (index < 0 && tokens.length > 1) index = tokens.length - 1;
    return {
      given: index < 0 ? tokens.join(' ') : tokens.slice(0, index).join(' '),
      surname: index < 0 ? '' : tokens.slice(index).join(' '),
      maiden,
    };
  }

  function toGedcom(data, options = {}) {
    const living = options.living === 'private' ? 'private' : 'include';
    const now = options.now ? new Date(options.now) : new Date();
    const hidden = living === 'private' ? livingPeople(data, now) : new Set();
    const people = data.people || [];
    const relationships = data.relationships || [];
    const events = data.events || [];
    const claims = data.claims || [];
    const sources = data.sources || [];
    const media = data.media || [];
    const places = new Map((data.places || []).map((place) => [place.id, place]));
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const xrefOf = {};
    const warnings = [];

    people.forEach((person, index) => { xrefOf[person.id] = `@I${index + 1}@`; });

    // Families: one per recorded partnership, then one per exact parent set.
    const families = [];
    const familyByKey = new Map();
    const familyOfRelationship = new Map();
    const ensureFamily = (ids) => {
      const key = [...new Set(ids)].sort().join('|');
      if (!familyByKey.has(key)) {
        const family = { key, partners: [...new Set(ids)], children: [], relationships: [], spouse: false, pedigrees: new Map() };
        familyByKey.set(key, family);
        families.push(family);
      }
      return familyByKey.get(key);
    };
    for (const relation of relationships) {
      if (relation.type !== 'spouse' || !peopleById.has(relation.from) || !peopleById.has(relation.to)) continue;
      const family = ensureFamily([relation.from, relation.to]);
      family.spouse = true;
      family.relationships.push(relation);
      familyOfRelationship.set(relation.id, family);
    }
    const parentRelations = new Map();
    for (const relation of relationships) {
      if (relation.type !== 'parent-child' || !peopleById.has(relation.from) || !peopleById.has(relation.to)) continue;
      if (!parentRelations.has(relation.to)) parentRelations.set(relation.to, []);
      parentRelations.get(relation.to).push(relation);
    }
    for (const person of people) {
      const relations = parentRelations.get(person.id);
      if (!relations) continue;
      const parentIds = [...new Set(relations.map((relation) => relation.from))];
      const originalFamilies = new Set(relations.map((relation) => relation.gedcom?.familyXref).filter(Boolean));
      const parentTypes = new Set(relations.map((relation) => relation.parentType || 'unspecified'));
      if (parentIds.length > 2 || originalFamilies.size > 1 || parentTypes.size > 1) {
        throw new Error(`GEDCOM export: osoba ${person.id} má více rodičovských rodin nebo rozdílné typy rodičovství. Export je neumí bezpečně promítnout; nerozděluje je podle pořadí. Zachovej původní GEDCOM a nejprve připrav výslovný výběr rodiny.`);
      }
      const parentType = [...parentTypes][0];
      const unrepresentablePedigree = relations.map((relation) => String(relation.gedcom?.originalPedigree || '').trim().toUpperCase())
        .find((value) => value && !['BIRTH', 'ADOPTED', 'FOSTER'].includes(value));
      if (unrepresentablePedigree) throw new Error(`GEDCOM export neumí bezpečně přenést původní PEDI ${unrepresentablePedigree} u ${person.id}; export byl zastaven, původní hodnota zůstává v sidecaru.`);
      const pedigree = { 'birth-recorded': 'BIRTH', biological: 'BIRTH', adoptive: 'ADOPTED', foster: 'FOSTER' }[parentType];
      if (!pedigree && !['unknown', 'unspecified'].includes(parentType)) throw new Error(`GEDCOM export neumí bezpečně vyjádřit typ rodičovství ${parentType} u ${person.id}. Původní údaj zůstává v datech; export byl zastaven.`);
      if (parentType === 'biological') warnings.push(`Osoba ${person.id}: PEDI BIRTH samo nepřenáší tvrzení o genetickém rodičovství; export není bezeztrátový.`);
      const family = ensureFamily(parentIds);
      family.children.push(person.id);
      if (pedigree) family.pedigrees.set(person.id, pedigree);
      for (const relation of relations) {
        family.relationships.push(relation);
        familyOfRelationship.set(relation.id, family);
      }
    }
    const marriageEvents = events.filter((event) => FAMILY_EVENT_TAGS[event.type] && (event.personIds || []).length >= 2
      && event.personIds.slice(0, 2).every((id) => peopleById.has(id)));
    for (const event of marriageEvents) {
      const family = ensureFamily(event.personIds.slice(0, 2));
      if (event.type === 'marriage') family.spouse = true;
    }
    families.forEach((family, index) => {
      family.xref = `@F${index + 1}@`;
      for (const relation of family.relationships) xrefOf[relation.id] = family.xref;
    });

    // Sources: in private mode a source cited only by hidden content is left
    // out and one cited by hidden content loses its transcription.
    const sourceIndex = new Map(sources.map((source) => [source.id, source]));
    const citedByHidden = new Set();
    const citedByVisible = new Set();
    const cite = (ids, isHidden) => { for (const id of ids || []) (isHidden ? citedByHidden : citedByVisible).add(id); };
    const involvesHidden = (ids) => (ids || []).some((id) => hidden.has(id));
    for (const person of people) cite(person.sourceIds, hidden.has(person.id));
    for (const relation of relationships) cite(relation.sourceIds, hidden.has(relation.from) || hidden.has(relation.to));
    for (const event of events) cite(event.sourceIds, involvesHidden(event.personIds));
    for (const item of media) cite([item.sourceId], involvesHidden(item.personIds));
    const claimHidden = (claim) => {
      if (claim.subjectType === 'person') return hidden.has(claim.subjectId);
      const relation = relationships.find((item) => item.id === claim.subjectId);
      if (relation) return hidden.has(relation.from) || hidden.has(relation.to);
      const event = events.find((item) => item.id === claim.subjectId);
      if (event) return involvesHidden(event.personIds);
      return false;
    };
    for (const claim of claims) cite(claim.sourceIds, claimHidden(claim));
    const exportedSources = sources.filter((source) => !hidden.size || citedByVisible.has(source.id) || !citedByHidden.has(source.id));
    exportedSources.forEach((source, index) => { xrefOf[source.id] = `@S${index + 1}@`; });
    const exportedMedia = media.filter((item) => !involvesHidden(item.personIds));
    exportedMedia.forEach((item, index) => { xrefOf[item.id] = `@O${index + 1}@`; });

    const writer = createWriter();
    const { add, pointer } = writer;

    const writeCitations = (level, sourceIds, evidence, seen = new Set()) => {
      for (const id of sourceIds || []) {
        if (!xrefOf[id] || !sourceIndex.has(id) || seen.has(id)) continue;
        seen.add(id);
        const source = sourceIndex.get(id);
        pointer(level, 'SOUR', xrefOf[id]);
        const page = source.page || source.imageRef || source.archivePath;
        if (page) add(level + 1, 'PAGE', page);
        if (evidence in QUAY) add(level + 1, 'QUAY', String(QUAY[evidence]));
      }
    };

    const writePlace = (level, placeId, placeText) => {
      const place = placeId ? places.get(placeId) : null;
      const name = place ? placeName(place) : String(placeText || '').trim();
      if (!name) return;
      add(level, 'PLAC', name);
      if (validCoordinates(place)) {
        add(level + 1, 'MAP');
        add(level + 2, 'LATI', formatCoordinate(place.lat, 'N', 'S'));
        add(level + 2, 'LONG', formatCoordinate(place.lon, 'E', 'W'));
      }
    };

    const writeDate = (level, event) => {
      const converted = toGedcomDate(event.date, event);
      if (!converted) return;
      add(level, 'DATE', converted.value);
      if (converted.phrase) add(level + 1, 'PHRASE', converted.phrase);
    };

    const claimNote = (claim) => {
      const label = EVIDENCE_LABELS[claim.evidence] || claim.evidence || 'neuvedeno';
      return [`Tvrzení (${label}): ${claim.text || ''}`.trim(), claim.reasoning ? `Odůvodnění: ${claim.reasoning}` : ''].filter(Boolean).join('\n');
    };
    const writeClaims = (level, list) => {
      for (const claim of list) {
        add(level, 'NOTE', claimNote(claim));
        writeCitations(level + 1, claim.sourceIds, claim.evidence);
      }
    };
    const claimsFor = (type, id) => claims.filter((claim) => claim.subjectType === type && claim.subjectId === id);
    const placedClaims = new Set();
    const claimsBySubject = (ids) => claims.filter((claim) => ids.includes(claim.subjectId) && !placedClaims.has(claim.id));

    const writeEvent = (level, tag, event, extra = {}) => {
      add(level, tag, extra.value);
      if (extra.type) add(level + 1, 'TYPE', extra.type);
      writeDate(level + 1, event);
      writePlace(level + 1, event.placeId, event.placeText);
      for (const other of extra.associates || []) {
        if (!xrefOf[other] || other === extra.principal) continue;
        pointer(level + 1, 'ASSO', xrefOf[other]);
        add(level + 2, 'ROLE', 'OTHER');
      }
      if (event.fromPlaceId && places.get(event.fromPlaceId)) add(level + 1, 'NOTE', `Odkud: ${placeName(places.get(event.fromPlaceId))}`);
      for (const note of [].concat(event.notes || [], event.details || [])) if (typeof note === 'string' && note) add(level + 1, 'NOTE', note);
      if (event.id) {
        const list = claimsBySubject([event.id]).filter((claim) => claim.subjectType === 'event');
        list.forEach((claim) => placedClaims.add(claim.id));
        writeClaims(level + 1, list);
      }
      writeCitations(level + 1, event.sourceIds, event.evidence);
    };

    // HEAD
    add(0, 'HEAD');
    add(1, 'GEDC');
    add(2, 'VERS', '7.0');
    add(1, 'CHAR', 'UTF-8');
    add(1, 'SCHMA');
    add(2, 'TAG', `${COPARENTS_TAG} ${COPARENTS_URI}`);
    add(1, 'SOUR', 'RODOVA-KRONIKA');
    add(2, 'NAME', 'Rodová kronika');
    if (data.meta?.version) add(2, 'VERS', data.meta.version);
    add(1, 'DATE', gedcomPoint({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() }));
    add(1, 'LANG', 'cs');
    if (hidden.size) add(1, 'NOTE', `Žijící osoby (${hidden.size}) jsou skryté: zůstává jen jméno „${LIVING_NAME}“ a rodinné vazby.`);

    // INDI
    for (const person of people) {
      const xref = xrefOf[person.id];
      add(0, 'INDI', undefined, xref);
      if (hidden.has(person.id)) {
        add(1, 'NAME', LIVING_NAME);
        for (const family of families) {
          if (family.children.includes(person.id)) pointer(1, 'FAMC', family.xref);
        }
        for (const family of families) {
          if (family.partners.includes(person.id)) pointer(1, 'FAMS', family.xref);
        }
        continue;
      }
      const name = splitDisplayName(person);
      add(1, 'NAME', `${name.given}${name.surname ? ` /${name.surname}/` : ''}`.trim());
      if (name.given) add(2, 'GIVN', name.given);
      if (name.surname) add(2, 'SURN', name.surname);
      const shown = new Set([surnameStem(name.surname)]);
      const others = [name.maiden, ...(person.surnames || [])].filter((surname) => surname && !shown.has(surnameStem(surname)) && shown.add(surnameStem(surname)));
      for (const surname of others) {
        add(1, 'NAME', `${name.given} /${surname}/`.trim());
        add(2, 'TYPE', person.sex === 'female' && (surname === name.maiden || surname === person.surnames?.[0]) ? 'MAIDEN' : 'AKA');
      }
      for (const alias of person.aliases || []) {
        const tokens = String(alias).trim().split(/\s+/);
        add(1, 'NAME', tokens.length > 1 ? `${tokens.slice(0, -1).join(' ')} /${tokens[tokens.length - 1]}/` : alias);
        add(2, 'TYPE', 'AKA');
      }
      add(1, 'SEX', person.sex === 'male' ? 'M' : person.sex === 'female' ? 'F' : 'U');

      const own = events.filter((event) => (event.personIds || [])[0] === person.id && EVENT_TAGS[event.type]);
      for (const part of ['birth', 'death']) {
        const record = person[part];
        const matching = own.filter((event) => event.type === part && record && (!event.date || !record.date || event.date === record.date));
        if (!record && !matching.length) continue;
        if (record) {
          const merged = {
            date: record.date || matching[0]?.date, dateText: record.dateText || matching[0]?.dateText,
            dateQualifier: record.dateQualifier, originalDate: record.originalDate, originalDatePhrase: record.originalDatePhrase,
            placeId: record.placeId || matching.find((event) => event.placeId)?.placeId,
            placeText: record.placeText || matching.find((event) => event.placeText)?.placeText,
            sourceIds: [...new Set(matching.flatMap((event) => event.sourceIds || []))],
            evidence: strongestEvidence(matching.map((event) => event.evidence)),
            notes: matching.flatMap((event) => [].concat(event.notes || [])),
          };
          writeEvent(1, part === 'birth' ? 'BIRT' : 'DEAT', merged);
          const list = claimsBySubject(matching.map((event) => event.id));
          list.forEach((claim) => placedClaims.add(claim.id));
          writeClaims(2, list);
        }
      }
      for (const event of own) {
        if ((event.type === 'birth' || event.type === 'death') && person[event.type]
          && (!event.date || !person[event.type].date || event.date === person[event.type].date)) continue;
        const tag = EVENT_TAGS[event.type];
        const value = tag === 'OCCU' ? event.title : tag === 'PROP' ? event.title : undefined;
        writeEvent(1, tag, event, { value, associates: event.personIds, principal: person.id });
      }
      for (const occupation of person.occupations || []) add(1, 'OCCU', occupation);
      for (const residence of person.residences || []) {
        add(1, 'RESI');
        writePlace(2, places.has(residence) ? residence : null, residence);
      }
      for (const family of families) if (family.children.includes(person.id)) {
        pointer(1, 'FAMC', family.xref);
        if (family.pedigrees.has(person.id)) add(2, 'PEDI', family.pedigrees.get(person.id));
      }
      for (const family of families) if (family.partners.includes(person.id)) pointer(1, 'FAMS', family.xref);
      for (const relation of relationships) {
        if (relation.type !== 'sibling') continue;
        const other = relation.from === person.id ? relation.to : relation.to === person.id ? relation.from : null;
        if (!other || !xrefOf[other]) continue;
        pointer(1, 'ASSO', xrefOf[other]);
        add(2, 'ROLE', 'OTHER');
        add(3, 'PHRASE', 'sourozenec');
        writeCitations(2, relation.sourceIds, relation.evidence);
      }
      for (const item of exportedMedia) if ((item.personIds || []).includes(person.id)) pointer(1, 'OBJE', xrefOf[item.id]);
      for (const note of person.notes || []) add(1, 'NOTE', note);
      const personClaims = claimsFor('person', person.id).filter((claim) => !placedClaims.has(claim.id));
      personClaims.forEach((claim) => placedClaims.add(claim.id));
      writeClaims(1, personClaims);
      writeCitations(1, person.sourceIds);
      add(1, 'REFN', person.id);
      add(2, 'TYPE', 'rodova-kronika');
    }

    // FAM
    const isHiddenFamily = (family) => family.partners.some((id) => hidden.has(id));
    for (const family of families) {
      add(0, 'FAM', undefined, family.xref);
      const ordered = [...family.partners].sort((a, b) => {
        const rank = (id) => ({ male: 0, female: 1 }[peopleById.get(id)?.sex] ?? 0.5);
        return rank(a) - rank(b);
      });
      const [first, second] = ordered;
      const firstSex = peopleById.get(first)?.sex;
      if (ordered.length === 1) pointer(1, firstSex === 'female' ? 'WIFE' : 'HUSB', xrefOf[first]);
      else { pointer(1, 'HUSB', xrefOf[first]); pointer(1, 'WIFE', xrefOf[second]); }
      for (const child of family.children) pointer(1, 'CHIL', xrefOf[child]);
      if (ordered.length === 2 && !family.spouse) add(1, COPARENTS_TAG, 'Y');
      if (!isHiddenFamily(family)) {
        for (const event of marriageEvents) {
          if (ensureFamily(event.personIds.slice(0, 2)) !== family) continue;
          writeEvent(1, FAMILY_EVENT_TAGS[event.type], event);
        }
      }
      const visibleRelations = family.relationships.filter((relation) => !hidden.has(relation.from) && !hidden.has(relation.to));
      const familyClaims = claimsBySubject(visibleRelations.map((relation) => relation.id));
      familyClaims.forEach((claim) => placedClaims.add(claim.id));
      writeClaims(1, familyClaims);
      const seen = new Set();
      for (const relation of visibleRelations) {
        const evidence = relation.evidence || strongestEvidence(claimsFor(relation.type === 'spouse' ? 'couple' : 'relationship', relation.id)
          .concat(claimsFor('relationship', relation.id)).map((claim) => claim.evidence));
        writeCitations(1, relation.sourceIds, evidence, seen);
      }
    }

    // SOUR
    for (const source of exportedSources) {
      add(0, 'SOUR', undefined, xrefOf[source.id]);
      if (source.title) add(1, 'TITL', source.title);
      if (source.speaker) add(1, 'AUTH', source.speaker);
      if (source.publisher || source.origin) add(1, 'PUBL', source.publisher || source.origin);
      if (source.url) add(1, 'WWW', source.url);
      const lines = Array.isArray(source.transcriptionLines) ? source.transcriptionLines.filter((line) => typeof line === 'string') : [];
      if (lines.length && !citedByHidden.has(source.id)) add(1, 'TEXT', lines.join('\n'));
      if (source.reliabilityNote) add(1, 'NOTE', source.reliabilityNote);
      const sourceClaims = claimsFor('source', source.id).filter((claim) => !placedClaims.has(claim.id));
      sourceClaims.forEach((claim) => placedClaims.add(claim.id));
      writeClaims(1, sourceClaims);
      add(1, 'REFN', source.id);
      add(2, 'TYPE', 'rodova-kronika');
    }

    // OBJE
    for (const item of exportedMedia) {
      add(0, 'OBJE', undefined, xrefOf[item.id]);
      const file = String(item.file || '');
      add(1, 'FILE', file.includes('/') ? `assets/${file}` : `assets/optimized/${file}`);
      add(2, 'FORM', mediaType(file, item.kind));
      if (item.kind === 'audio-clip') add(3, 'MEDI', 'AUDIO');
      else if (/photo/.test(item.kind || '')) add(3, 'MEDI', 'PHOTO');
      if (item.title) add(2, 'TITL', item.title);
      const details = [
        item.speaker ? `Mluví: ${item.speaker}` : '',
        Number.isFinite(item.start) && Number.isFinite(item.end) ? `Úsek rozhovoru ${item.start}–${item.end} s` : '',
        item.quote ? `„${item.quote}“` : '',
      ].filter(Boolean).join('\n');
      if (details) add(1, 'NOTE', details);
      if (item.sourceId) writeCitations(1, [item.sourceId]);
      add(1, 'REFN', item.id);
      add(2, 'TYPE', 'rodova-kronika');
    }

    // Claims about places, branches or anything else without a GEDCOM record.
    let noteIndex = 0;
    for (const claim of claims) {
      if (placedClaims.has(claim.id) || claimHidden(claim)) continue;
      if (claim.subjectType === 'relationship' || claim.subjectType === 'couple' || claim.subjectType === 'event') {
        const relation = relationships.find((item) => item.id === claim.subjectId);
        if (relation && hidden.size && (hidden.has(relation.from) || hidden.has(relation.to))) continue;
      }
      noteIndex += 1;
      const subject = claim.subjectType === 'place' && places.get(claim.subjectId) ? `Místo ${placeName(places.get(claim.subjectId))}. ` : '';
      add(0, 'SNOTE', subject + claimNote(claim), `@N${noteIndex}@`);
      writeCitations(1, claim.sourceIds, claim.evidence);
    }

    add(0, 'TRLR');
    return { text: `${writer.lines.join('\r\n')}\r\n`, xrefOf, warnings };
  }

  function mediaType(file, kind) {
    const extension = String(file).toLowerCase().split('.').pop();
    const types = {
      webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff',
      pdf: 'application/pdf', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav',
      mp4: 'video/mp4', webm: kind === 'audio-clip' ? 'audio/webm' : 'video/webm', html: 'text/html', txt: 'text/plain',
    };
    return types[extension] || 'application/octet-stream';
  }

  // ---------------------------------------------------------------- parsing

  // Tolerant line parser for GEDCOM 5.5.1 and 7: BOM, CRLF/CR, blank lines,
  // leading spaces, CONT/CONC and level jumps are accepted.
  function parseGedcom(text) {
    const source = String(text || '').replace(/^﻿/, '');
    const records = [];
    const stack = [];
    const errors = [];
    source.split(/\r\n|\r|\n/).forEach((raw, index) => {
      const line = raw.replace(/^\s+/, '');
      if (!line.trim()) return;
      const match = line.match(/^(\d+)\s+(?:(@[^@\s][^@]*@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
      if (!match) { errors.push({ line: index + 1, text: raw }); return; }
      const level = Number(match[1]);
      const tag = match[3].toUpperCase();
      let value = match[4] === undefined ? '' : match[4];
      if (tag === 'CONT' || tag === 'CONC') {
        const parent = stack[Math.min(level, stack.length) - 1];
        if (!parent) { errors.push({ line: index + 1, text: raw }); return; }
        if (value.startsWith('@@')) value = value.slice(1);
        parent.value = (parent.value || '') + (tag === 'CONT' ? '\n' : '') + value;
        return;
      }
      const node = { level, tag, value: '', children: [], line: index + 1 };
      if (match[2]) node.xref = match[2].slice(1, -1);
      if (/^@[^@#\s][^@]*@$/.test(value)) node.pointer = value.slice(1, -1);
      else node.value = value.startsWith('@@') ? value.slice(1) : value;
      if (level === 0) {
        records.push(node);
        stack.length = 0;
        stack[0] = node;
        return;
      }
      const parentLevel = Math.min(level, stack.length) - 1;
      const parent = stack[parentLevel];
      if (!parent) { errors.push({ line: index + 1, text: raw }); return; }
      parent.children.push(node);
      stack.length = parentLevel + 1;
      stack[parentLevel + 1] = node;
    });
    const head = records.find((record) => record.tag === 'HEAD') || null;
    const byXref = Object.create(null);
    for (const record of records) if (record.xref) {
      if (byXref[record.xref]) errors.push({ line: record.line, code: 'DUPLICATE_XREF', text: record.xref });
      else byXref[record.xref] = record;
    }
    const version = child(child(head, 'GEDC'), 'VERS')?.value || '';
    return { version, head, records: records.filter((record) => record.tag !== 'HEAD' && record.tag !== 'TRLR'), byXref, errors };
  }

  function child(node, tag) {
    return node?.children.find((item) => item.tag === tag) || null;
  }

  function childrenOf(node, tag) {
    return node ? node.children.filter((item) => item.tag === tag) : [];
  }

  // ---------------------------------------------------------------- candidates

  function slug(value) {
    return stripDiacritics(String(value || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'soubor';
  }

  function safeXref(value) {
    const bytes = new TextEncoder().encode(String(value));
    return `${slug(value)}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') || '00'}`;
  }

  function parseCoordinate(value) {
    const match = String(value || '').trim().match(/^([NSEW])?\s*(-?\d+(?:\.\d+)?)$/i);
    if (!match) return null;
    const number = Number(match[2]);
    return /[SW]/i.test(match[1] || '') ? -Math.abs(number) : number;
  }

  function gedcomToCandidates(tree, options = {}) {
    const records = tree.records || [];
    const duplicates = (tree.errors || []).filter((error) => error.code === 'DUPLICATE_XREF');
    if (duplicates.length) throw new Error(`GEDCOM obsahuje duplicitní XREF (${duplicates.map((item) => item.text).join(', ')}); nejprve je rozliš.`);
    let namespace = options.namespace;
    if (!namespace && typeof require === 'function') {
      namespace = require('node:crypto').createHash('sha256').update(JSON.stringify({ head: tree.head, records })).digest('hex');
    }
    if (!/^[a-f0-9]{64}$/.test(namespace || '')) throw new Error('Import potřebuje deterministický namespace: 64 malých hex znaků SHA-256 vstupu.');
    const fileName = options.fileName || child(tree.head, 'FILE')?.value || 'soubor.ged';
    const prefix = `gedcom-${namespace}`;
    const idOf = (xref, kind = 'person') => `${prefix}-${kind}-${safeXref(xref)}`;
    const importSourceId = `${prefix}-source-import`;
    const verifyNote = `Převzato z GEDCOM ${fileName}; pracovní stopa, vyžaduje ověření v primárním prameni.`;
    const people = [], relationships = [], events = [], places = [];
    const importReport = { namespace, warnings: [], unmappedFields: [] };
    const used = new WeakSet();
    const locations = new WeakMap();
    const use = (node) => { if (node) used.add(node); return node; };
    const take = (node, tag) => use(child(node, tag));
    const takeAll = (node, tag) => childrenOf(node, tag).map(use);
    const locate = (node, recordXref, path) => {
      if (!node) return;
      locations.set(node, { recordXref, path, line: node.line });
      const counts = new Map();
      for (const part of node.children || []) {
        const number = (counts.get(part.tag) || 0) + 1;
        counts.set(part.tag, number);
        locate(part, recordXref, `${path}.${part.tag}[${number}]`);
      }
    };
    for (const record of [tree.head, ...records].filter(Boolean)) locate(record, record.xref || null, record.tag);
    const ref = (node) => ({ ...locations.get(node), ...(node?.pointer ? { originalReference: `@${node.pointer}@` } : {}) });
    const warn = (code, message, node) => importReport.warnings.push({ code, message, ...ref(node) });
    use(tree.head); take(tree.head, 'FILE'); take(tree.head, 'CHAR'); take(take(tree.head, 'GEDC'), 'VERS');
    const sources = [{
      id: importSourceId, title: `import GEDCOM ${fileName}`, type: 'gedcom-import',
      transcriptionLines: [], reliabilityNote: `Cizí soubor GEDCOM ${fileName}. ${verifyNote}`,
      gedcom: { namespace, fileName, version: tree.version },
    }];
    const recordByXref = new Map(records.filter((record) => record.xref).map((record) => [record.xref, record]));
    for (const record of records) {
      if (record.tag !== 'SOUR' || !record.xref) continue;
      use(record);
      const text = take(record, 'TEXT')?.value || take(take(record, 'DATA'), 'TEXT')?.value || '';
      const url = take(record, 'WWW')?.value || take(record, '_URL')?.value || '';
      const source = {
        id: idOf(record.xref, 'source'), title: take(record, 'TITL')?.value || take(record, 'ABBR')?.value || `Pramen @${record.xref}@`,
        type: 'gedcom-source', transcriptionLines: text ? text.split('\n') : [], reliabilityNote: verifyNote,
        gedcom: { xref: record.xref, ...ref(record) },
      };
      const publisher = take(record, 'PUBL')?.value || take(record, 'AUTH')?.value;
      if (publisher) source.publisher = publisher;
      if (url) source.url = url;
      sources.push(source);
    }
    const knownSources = new Set(sources.map((source) => source.id));
    const citationCache = new WeakMap();
    function citationData(node) {
      if (!node) return { sourceIds: [importSourceId], citations: [] };
      if (citationCache.has(node)) return citationCache.get(node);
      const sourceIds = [importSourceId], citations = [];
      for (const citation of takeAll(node, 'SOUR')) {
        const sourceId = citation.pointer && idOf(citation.pointer, 'source');
        const item = { ...ref(citation) };
        if (sourceId && knownSources.has(sourceId)) { sourceIds.push(sourceId); item.sourceId = sourceId; }
        else if (citation.pointer) warn('UNRESOLVED_SOURCE', `Pramen @${citation.pointer}@ nebyl nalezen; odkaz zůstal v metadatech.`, citation);
        if (citation.value) item.literal = citation.value;
        const page = take(citation, 'PAGE'), quality = take(citation, 'QUAY');
        if (page) item.page = page.value;
        if (quality) item.originalQuality = quality.value; // QUAY never upgrades imported evidence.
        citations.push(item);
      }
      const result = { sourceIds: [...new Set(sourceIds)], citations };
      citationCache.set(node, result);
      return result;
    }
    const notesOf = (node) => takeAll(node, 'NOTE').map((note) => {
      if (!note.pointer) return note.value;
      const shared = recordByXref.get(note.pointer);
      if (shared && ['NOTE', 'SNOTE'].includes(shared.tag)) { use(shared); return shared.value; }
      warn('UNRESOLVED_NOTE', `Poznámka @${note.pointer}@ nebyla rozpoznána.`, note);
      return '';
    }).filter(Boolean);
    const placeByName = new Map();
    function placeOf(node) {
      const plac = take(node, 'PLAC');
      if (!plac?.value) return {};
      const name = plac.value.trim();
      const map = take(plac, 'MAP');
      const lat = parseCoordinate(take(map, 'LATI')?.value), lon = parseCoordinate(take(map, 'LONG')?.value);
      if (!placeByName.has(name)) {
        const parts = name.split(',').map((part) => part.trim()).filter(Boolean);
        const place = { id: `${prefix}-place-${placeByName.size + 1}`, name: parts[0] || name, country: parts.length > 1 ? parts.at(-1) : '', sourceIds: [importSourceId], gedcom: ref(plac) };
        if (parts.length > 2) place.region = parts.slice(1, -1).join(', ');
        if (lat !== null && lon !== null && validCoordinates({ lat, lon })) { place.lat = lat; place.lon = lon; place.coordinatesStatus = 'gedcom-import'; }
        else if (map) warn('INVALID_COORDINATES', 'Souřadnice se nepodařilo bezpečně převést; zůstaly v původním GEDCOM.', map);
        placeByName.set(name, place); places.push(place);
      } else if (lat !== null && lon !== null && (placeByName.get(name).lat !== lat || placeByName.get(name).lon !== lon)) {
        warn('PLACE_COORDINATES_DIFFER', `Místo ${name} má více sad souřadnic; nebyly automaticky sloučeny.`, plac);
      }
      return { placeId: placeByName.get(name).id, placeText: name };
    }
    function dateOf(node) {
      const date = take(node, 'DATE');
      if (!date) return {};
      const phrase = take(date, 'PHRASE')?.value;
      const parsed = fromGedcomDate(date.value, phrase);
      if (parsed.warning) warn('DATE_NOT_CONVERTED', parsed.warning, date);
      return { dateText: parsed.dateText, dateQualifier: parsed.qualifier, originalDate: parsed.originalDate,
        ...(parsed.date ? { date: parsed.date } : {}), ...(parsed.calendar ? { calendar: parsed.calendar } : {}),
        ...(phrase ? { originalDatePhrase: phrase } : {}), ...(parsed.warning ? { dateWarning: parsed.warning } : {}) };
    }
    function eventData(node) {
      use(node);
      const citation = citationData(node);
      return { dateText: node.value === 'Y' ? 'ano' : '', ...dateOf(node), ...placeOf(node), sourceIds: citation.sourceIds,
        gedcom: { ...ref(node), tag: node.tag, originalValue: node.value, citations: citation.citations } };
    }
    function buildEvent(node, known, personIds, who) {
      const label = node.tag === 'EVEN' ? take(node, 'TYPE')?.value || known[1] : known[1];
      const event = { id: `${prefix}-event-${node.line}`, type: known[0],
        title: `${label}${node.value && node.value !== 'Y' ? `: ${node.value}` : ''} – ${who}`,
        ...eventData(node), personIds, evidence: 'hypothesis' };
      const notes = notesOf(node);
      if (notes.length) event.notes = notes;
      return event;
    }
    for (const record of records) {
      if (record.tag !== 'INDI' || !record.xref) continue;
      use(record);
      const id = idOf(record.xref), names = takeAll(record, 'NAME'), surnames = [];
      const originalNames = [];
      const displayNames = names.map((name) => {
        const given = take(name, 'GIVN')?.value, family = take(name, 'SURN')?.value;
        const nameType = take(name, 'TYPE')?.value;
        const value = name.value || [given, family].filter(Boolean).join(' ');
        const surname = value.match(/\/([^/]*)\//)?.[1]?.trim() || family || '';
        if (surname && !surnames.includes(surname)) surnames.push(surname);
        originalNames.push({ value: name.value, given, surname: family, type: nameType, ...ref(name) });
        return value.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
      const sex = String(take(record, 'SEX')?.value || '').toUpperCase(), citation = citationData(record);
      const person = { id, displayName: displayNames[0] || `Neznámá osoba @${record.xref}@`, surnames,
        sex: sex === 'M' ? 'male' : sex === 'F' ? 'female' : 'unknown', lineage: 'unlinked', branch: [],
        notes: [verifyNote, ...notesOf(record)], sourceIds: citation.sourceIds,
        gedcom: { xref: record.xref, ...ref(record), names: originalNames, citations: citation.citations, familyLinks: [] } };
      if (displayNames.length > 1) person.aliases = [...new Set(displayNames.slice(1))];
      for (const [tag, part, label] of [['BIRT', 'birth', 'Narození'], ['DEAT', 'death', 'Úmrtí']]) {
        const lifeNodes = childrenOf(record, tag);
        if (lifeNodes.length === 1) person[part] = eventData(lifeNodes[0]);
        else if (lifeNodes.length > 1) {
          person.notes.push(`${label}: více původních zápisů; žádný nebyl automaticky vybrán jako přesný údaj.`);
          warn('MULTIPLE_LIFE_EVENTS', `${label}: všechny varianty jsou samostatné události.`, record);
          for (const node of lifeNodes) events.push(buildEvent(node, [part, label], [id], person.displayName));
        }
        for (const node of lifeNodes) for (const sourceId of citationData(node).sourceIds) if (!person.sourceIds.includes(sourceId)) person.sourceIds.push(sourceId);
      }
      const occupations = takeAll(record, 'OCCU').map((node) => node.value).filter(Boolean);
      if (occupations.length) person.occupations = occupations;
      people.push(person);
      for (const node of record.children) {
        const known = IMPORT_EVENTS[node.tag];
        if (!known || ['MARR', 'DIV', 'ENGA'].includes(node.tag)) continue;
        if (node.tag === 'OCCU' && !child(node, 'DATE') && !child(node, 'PLAC')) continue;
        events.push(buildEvent(node, known, [id], person.displayName));
      }
    }
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const familyLinks = new Map();
    const spouseLinks = new Map();
    const pedigreeTypes = { BIRTH: 'birth-recorded', ADOPTED: 'adoptive', FOSTER: 'foster', SEALING: 'sealing-recorded' };
    function addFamilyLink(person, node, context = 'FAMC') {
      use(node);
      const pediNodes = takeAll(node, 'PEDI'), status = take(node, 'STAT')?.value || '';
      const adoptionSelector = context === 'ADOP.FAMC' ? take(node, 'ADOP')?.value || '' : '';
      for (const pedi of pediNodes.length ? pediNodes : [null]) {
        const originalPedigree = pedi?.value || '';
        const code = originalPedigree.trim().toUpperCase();
        const parentType = code ? pedigreeTypes[code] || 'unspecified' : context === 'BIRT.FAMC' ? 'birth-recorded' : context === 'ADOP.FAMC' ? 'adoptive' : 'unspecified';
        const link = { familyXref: node.pointer || null, originalReference: node.pointer ? `@${node.pointer}@` : node.value,
          parentType, originalPedigree, context, status, ...ref(node), ...(pedi ? { pedigreeLine: pedi.line } : {}),
          ...(context === 'ADOP.FAMC' ? { adoptionSelector } : {}), citations: citationData(node).citations };
        person.gedcom.familyLinks.push(link);
        if (code === 'BIRTH') warn('BIRTH_NOT_GENETIC_PROOF', 'PEDI BIRTH označuje rodinu při narození; samo nedokládá genetické rodičovství.', node);
        if (code && !pedigreeTypes[code]) warn('UNKNOWN_PEDIGREE', `Neznámé PEDI ${originalPedigree}; typ nebyl domyšlen.`, node);
        if (pediNodes.length > 1) warn('MULTIPLE_PEDIGREES', 'Jedno FAMC má více PEDI; všechny varianty zůstaly samostatné.', node);
        if (!node.pointer || recordByXref.get(node.pointer)?.tag !== 'FAM') { warn('UNRESOLVED_FAMILY', 'Odkaz FAMC nemá odpovídající rodinu; zůstal v metadatech osoby.', node); continue; }
        if (!familyLinks.has(node.pointer)) familyLinks.set(node.pointer, []);
        familyLinks.get(node.pointer).push({ person, node, link });
      }
    }
    for (const record of records) {
      if (record.tag !== 'INDI' || !record.xref) continue;
      const person = peopleById.get(idOf(record.xref));
      for (const node of childrenOf(record, 'FAMC')) addFamilyLink(person, node);
      for (const event of record.children.filter((node) => ['BIRT', 'ADOP'].includes(node.tag))) {
        for (const node of childrenOf(event, 'FAMC')) addFamilyLink(person, node, `${event.tag}.FAMC`);
      }
      for (const node of takeAll(record, 'FAMS')) {
        person.gedcom.familyLinks.push({ context: 'FAMS', familyXref: node.pointer || null, ...ref(node) });
        if (recordByXref.get(node.pointer)?.tag !== 'FAM') { warn('UNRESOLVED_FAMILY', 'Odkaz FAMS nemá odpovídající rodinu.', node); continue; }
        if (!spouseLinks.has(node.pointer)) spouseLinks.set(node.pointer, []);
        spouseLinks.get(node.pointer).push({ id: person.id, role: 'unknown', xref: record.xref, node });
      }
    }
    const relationKeys = new Set();
    function addRelation(type, from, to, node, extra = {}, deduplicationKey) {
      if (!peopleById.has(from) || !peopleById.has(to) || from === to) { warn('UNRESOLVED_RELATIONSHIP', 'Vazba odkazuje na chybějící osobu nebo na sebe; nevznikl platný vztah.', node); return; }
      const key = deduplicationKey || `${type}|${[from, to].sort().join('|')}`;
      if (relationKeys.has(key)) return;
      relationKeys.add(key);
      relationships.push({ id: `${prefix}-relationship-${relationships.length + 1}`, type, from, to,
        evidence: 'hypothesis', sourceIds: citationData(node).sourceIds, gedcom: ref(node), ...extra });
    }
    for (const record of records) {
      if (record.tag !== 'FAM' || !record.xref) continue;
      use(record);
      const parents = [];
      for (const [tag, role] of [['HUSB', 'father'], ['WIFE', 'mother']]) for (const node of takeAll(record, tag)) {
        if (node.pointer) parents.push({ id: idOf(node.pointer), role, xref: node.pointer, node });
        else warn('MISSING_PARENT_POINTER', `${tag} neobsahuje odkaz na osobu.`, node);
      }
      for (const entry of spouseLinks.get(record.xref) || []) if (!parents.some((parent) => parent.id === entry.id)) parents.push(entry);
      if (parents.length > 2) warn('MULTIPLE_PARENTS_IN_FAMILY', 'Rodina obsahuje více než dva rodiče; žádný nebyl tiše vynechán.', record);
      const links = familyLinks.get(record.xref) || [];
      for (const node of takeAll(record, 'CHIL')) {
        const person = peopleById.get(idOf(node.pointer));
        if (!person) { warn('UNRESOLVED_CHILD', 'CHIL nemá odpovídající osobu.', node); continue; }
        if (links.some((entry) => entry.person.id === person.id)) continue;
        const link = { familyXref: record.xref, originalReference: `@${node.pointer}@`, parentType: 'unspecified', originalPedigree: '', context: 'FAM.CHIL', ...ref(node) };
        person.gedcom.familyLinks.push(link); links.push({ person, node, link });
      }
      const coparents = String(take(record, COPARENTS_TAG)?.value || '').toUpperCase() === 'Y';
      if (parents.length === 2 && !coparents) addRelation('spouse', parents[0].id, parents[1].id, record, { gedcom: { ...ref(record), familyXref: record.xref } }, `spouse|${record.xref}`);
      for (const { person, node, link } of links) {
        if (/^DISPROVEN$/i.test(link.status || '')) { warn('DISPROVEN_FAMILY_LINK', 'FAMC se STAT DISPROVEN zůstalo jako vyvrácený záznam v metadatech; nebyla vytvořena kladná rodičovská vazba.', node); continue; }
        if (link.status) warn('FAMILY_LINK_STATUS', `Původní stav FAMC: ${link.status}; import nic nepovyšuje na doložený vztah.`, node);
        if (link.context === 'ADOP.FAMC' && !['HUSB', 'WIFE', 'BOTH'].includes(String(link.adoptionSelector).toUpperCase())) { warn('ADOPTION_PARENT_UNSPECIFIED', 'ADOP.FAMC neříká jednoznačně HUSB/WIFE/BOTH; rodičovské tvrzení z této události nebylo domyšleno.', node); continue; }
        for (const parent of parents) {
          const selector = String(link.adoptionSelector || '').toUpperCase();
          if (selector === 'HUSB' && parent.role !== 'father' || selector === 'WIFE' && parent.role !== 'mother') continue;
          const relatedSources = [...new Set([...citationData(record).sourceIds, ...citationData(node).sourceIds])];
          addRelation('parent-child', parent.id, person.id, record, {
            parentType: link.parentType, parentRole: parent.role, sourceIds: relatedSources,
            gedcom: { ...link, familyXref: record.xref, parentXref: parent.xref, childXref: person.gedcom.xref, parentReference: ref(parent.node),
              citations: [...citationData(record).citations, ...citationData(node).citations] },
          }, `parent|${record.xref}|${link.line}|${link.pedigreeLine || ''}|${parent.id}|${person.id}`);
        }
      }
      for (const node of record.children) {
        const known = IMPORT_EVENTS[node.tag];
        if (!known || !['MARR', 'DIV', 'ENGA', 'EVEN'].includes(node.tag)) continue;
        const ids = [...new Set(parents.map((parent) => parent.id).filter((id) => peopleById.has(id)))];
        events.push(buildEvent(node, known, ids, ids.map((id) => peopleById.get(id).displayName).join(' a ')));
      }
    }
    for (const record of records) {
      if (record.tag !== 'INDI' || !record.xref) continue;
      for (const asso of childrenOf(record, 'ASSO')) {
        const role = child(asso, 'ROLE');
        const label = [role?.value, child(role, 'PHRASE')?.value, child(asso, 'RELA')?.value].join(' ');
        if (asso.pointer && /sourozen|sibling|bratr|sestra/i.test(label)) {
          use(asso); use(role); take(role, 'PHRASE'); take(asso, 'RELA');
          addRelation('sibling', idOf(record.xref), idOf(asso.pointer), asso);
        }
      }
    }
    for (const person of people) {
      const parentLinks = relationships.filter((relation) => relation.type === 'parent-child' && relation.to === person.id);
      const families = [...new Set(parentLinks.map((relation) => relation.gedcom.familyXref))];
      if (families.length > 1 || new Set(parentLinks.map((relation) => relation.from)).size > 2) {
        person.notes.push('GEDCOM uvádí více rodičovských rodin. Všechny jsou zachovány jako pracovní vazby; pro přehled použij celý graf. Vývod ani biologické příbuzenství se nesmí určit výběrem první dvojice.');
        warn('MULTIPLE_PARENT_FAMILIES', `${person.gedcom.xref}: zachováno ${families.length} rodičovských rodin; vyžaduje vědomé rozlišení.`, recordByXref.get(person.gedcom.xref));
      }
    }
    function reportUnmapped(node) {
      if (!used.has(node)) importReport.unmappedFields.push({ ...ref(node), tag: node.tag, value: node.value, ...(node.pointer ? { pointer: node.pointer } : {}), childCount: node.children?.length || 0 });
      // Also visit an unmapped container: a nested FAMC can be preserved even
      // when its ADOP event has no canonical event projection.
      for (const part of node.children || []) reportUnmapped(part);
    }
    for (const record of [tree.head, ...records].filter(Boolean)) reportUnmapped(record);
    return { people, relationships, events, places, sources, importReport };
  }

  // ---------------------------------------------------------------- matching

  function stripDiacritics(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalizeName(value) {
    return stripDiacritics(value).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  }

  // Masculine base of a Czech surname, so "Novák" and "Nováková", "Brabenka" and
  // "Brabenková", "Hájek" and "Hájková" or "Malý" and "Malá" share one key.
  function surnameStem(value) {
    const token = normalizeName(value).replace(/\s+/g, '');
    if (token.length > 4 && token.endsWith('ova')) return token.slice(0, -3);
    if (token.length > 2 && /[ayi]$/.test(token)) return token.slice(0, -1);
    // Mobile e of the masculine form: Hájek → Hájk(ová).
    if (token.length > 3 && /e[^aeiouy]$/.test(token)) return token.slice(0, -2) + token.slice(-1);
    return token;
  }

  function defaultNameKey(value, part) {
    return part === 'surname' ? surnameStem(value) : normalizeName(value);
  }

  function nameParts(person, nameKey) {
    const variants = [person.displayName, ...(person.aliases || [])].filter(Boolean);
    const surnameKeys = new Set((person.surnames || []).map((surname) => nameKey(surname, 'surname')).filter(Boolean));
    const given = new Set();
    for (const variant of variants) {
      const split = splitDisplayName({ displayName: variant, surnames: person.surnames });
      if (split.surname) surnameKeys.add(nameKey(split.surname, 'surname'));
      if (split.maiden) surnameKeys.add(nameKey(split.maiden, 'surname'));
      const first = split.given.split(/\s+/)[0];
      if (first) given.add(nameKey(first, 'given'));
    }
    surnameKeys.delete('');
    given.delete('');
    return { surnameKeys, given };
  }

  // Candidate people → existing people with the same given name and surname
  // (masculine base, without diacritics) and a birth year within the
  // tolerance. `nameKey(value, part)` can replace the default key, e.g. by a
  // phonetic one; `part` is "given" or "surname".
  function matchCandidates(candidates, data, options = {}) {
    const nameKey = typeof options.nameKey === 'function' ? options.nameKey : defaultNameKey;
    const tolerance = Number.isFinite(options.yearTolerance) ? options.yearTolerance : 2;
    const existing = (data?.people || []).map((person) => ({ person, parts: nameParts(person, nameKey), year: yearOf(person.birth) }));
    const matches = [];
    for (const candidate of candidates?.people || []) {
      const parts = nameParts(candidate, nameKey);
      const year = yearOf(candidate.birth);
      for (const entry of existing) {
        const surname = [...parts.surnameKeys].find((key) => entry.parts.surnameKeys.has(key));
        const given = [...parts.given].find((key) => entry.parts.given.has(key));
        if (!surname || !given) continue;
        const sexes = [candidate.sex, entry.person.sex];
        if (sexes.every((sex) => sex === 'male' || sex === 'female') && sexes[0] !== sexes[1]) continue;
        const reasons = [`shodné křestní jméno (${given})`, `shodné příjmení (${surname})`];
        let score = 0.6;
        if (year && entry.year) {
          const difference = Math.abs(year - entry.year);
          if (difference > tolerance) continue;
          score += difference === 0 ? 0.4 : difference === 1 ? 0.3 : 0.2;
          reasons.push(difference === 0 ? `stejný rok narození ${year}` : `rok narození ${year} / ${entry.year} (rozdíl ${difference})`);
        } else {
          reasons.push('rok narození nelze porovnat');
        }
        matches.push({ candidateId: candidate.id, personId: entry.person.id, score: Math.round(score * 100) / 100, reasons });
      }
    }
    return matches.sort((a, b) => (a.candidateId === b.candidateId ? b.score - a.score : 0));
  }

  return {
    toGedcom, parseGedcom, gedcomToCandidates, matchCandidates,
    toGedcomDate, fromGedcomDate, livingPeople, surnameStem, normalizeName, QUAY,
  };
});

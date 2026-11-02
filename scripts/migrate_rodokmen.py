#!/usr/bin/env python3
"""Loss-preserving, non-executing import of a Rodokmen project into a NEW project.

Usage: python migrate_rodokmen.py OLD_PROJECT NEW_PROJECT [--title TITLE]
The original project is read only. Literal Python declarations are parsed with
AST, never imported. Unmapped fields and every original data file are retained.
No imported person-wide status can automatically verify individual facts.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

from pamet import initialize
from pamet_common import (COLLECTIONS, atomic_json, check_dataset, digest, inside,
                          read_json, safe_legacy_python, slug)


def stable_id(prefix, raw):
    text = str(raw)
    suffix = hashlib.sha256(text.encode()).hexdigest()[:10]
    return f'{prefix}-{slug(text)[:70]}-{suffix}'


def migrate(old_project, new_project, title='Rodová paměť — převod Rodokmenu'):
    old = Path(old_project).resolve()
    new = Path(new_project).resolve()
    if new == old or old in new.parents:
        raise ValueError('Nová složka musí být mimo původní projekt, aby se neměnil a nekopíroval sám do sebe.')
    old_data = inside(old, 'data/osoby.py', must_exist=True).parent
    legacy = safe_legacy_python(old_data / 'osoby.py')
    persons = legacy['P']
    if any(type(k) is not int or k < 1 or not isinstance(v, dict) for k, v in persons.items()):
        raise ValueError('P musí používat kladná celočíselná čísla předků a slovníkové hodnoty.')
    same = legacy.get('SAME', {})
    if not isinstance(same, dict):
        raise ValueError('SAME není slovník.')
    def canonical(k):
        visited = set()
        while k in same:
            if k in visited:
                raise ValueError('SAME obsahuje cyklus; import se nezapsal.')
            visited.add(k)
            k = same[k]
            if type(k) is not int or k < 1:
                raise ValueError('SAME obsahuje neplatné číslo osoby.')
        if k not in persons:
            raise ValueError(f'SAME odkazuje na chybějící osobu {k}.')
        return k
    for alias in same:
        if type(alias) is not int or alias < 1:
            raise ValueError('SAME obsahuje neplatný alias.')
        canonical(alias)
    raw = {'osoby': legacy}
    for name in ('zaznamy', 'svazky', 'prepisy', 'zvyrazneni', 'mista', 'dokumenty', 'web'):
        p = inside(old, f'data/{name}.json')
        raw[name] = read_json(p) if p.is_file() else ([] if name in ('zaznamy', 'dokumenty') else {})
    if not isinstance(raw['zaznamy'], list):
        raise ValueError('zaznamy.json musí být pole.')
    for name in ('svazky', 'prepisy', 'zvyrazneni', 'mista'):
        if not isinstance(raw[name], dict):
            raise ValueError(name + '.json musí být objekt.')

    # Prepare everything in memory before creating a destination.
    report = {'format': 'rodova-pamet-migration/1', 'createdAt': dt.date.today().isoformat(),
              'sourceFiles': [], 'warnings': [], 'unmappedPreserved': [],
              'policy': 'Původní data zachována; žádné tvrzení nebylo automaticky ověřeno.'}
    data = {c: [] for c in COLLECTIONS}
    data['meta'] = {'title': title, 'version': '0.1.0', 'updatedAt': dt.date.today().isoformat(),
                    'sample': False, 'migration': {'source': 'rodokmen', 'version': 1}}
    source_map = {}
    records = {}
    media_copies = []
    import_source = 'src-import-rodokmen'
    data['sources'].append({'id': import_source, 'type': 'research-dataset',
        'title': 'Původní projekt Rodokmen — importní podklad',
        'reliabilityNote': 'Datový přenos, nikoli nové čtení matriky. Originály a nepromítnutá pole jsou v research/imports/rodokmen.',
        'provenance': {'inspection': 'not-reviewed', 'kind': 'derivative'}})
    for record in raw['zaznamy']:
        key = record.get('klic') if isinstance(record, dict) else None
        if not key or key in records:
            raise ValueError('Zápis bez klíče nebo duplicitní klic; původní data zůstala beze změny.')
        records[key] = record
        sid = stable_id('src', key)
        source_map[key] = sid
        volume = raw['svazky'].get(record.get('svazek'), {})
        transcript = raw['prepisy'].get(key, {})
        boxes = raw['zvyrazneni'].get(key, {})
        if not isinstance(transcript, dict):
            transcript = {'orig': str(transcript)}
        source = {'id': sid, 'type': 'parish-register', 'title': str(record.get('nazev') or key),
            'origin': str(volume.get('archiv', '')),
            'locator': {'archive': volume.get('archiv', ''), 'book': volume.get('svazek', ''),
                        'legacyVolumeId': record.get('svazek'), 'scan': record.get('snimek')},
            'transcriptionLines': str(transcript.get('orig', '')).splitlines(),
            'translationLines': str(transcript.get('cs', '')).splitlines(),
            'reliabilityNote': 'Převzatý přepis; při importu nebyl obraz znovu přečten. ' + str(record.get('shrnuti', '')),
            'provenance': {'kind': 'digitized-original', 'inspection': 'not-reviewed', 'importedFrom': 'rodokmen'},
            'legacyRecordKey': key}
        link = record.get('odkaz') or volume.get('url')
        if isinstance(link, str) and link.startswith(('https://', 'http://')):
            source['url'] = link
        if isinstance(boxes, dict) and boxes.get('boxes'):
            source['boxes'] = boxes['boxes']
        if record.get('ukazka') is True:
            source['sample'] = True
            data['meta']['sample'] = True
            report['warnings'].append('Původní data obsahují vymyšlené zápisy; celý převod je označen jako ukázka.')
        # Use only safe exact file names, never arbitrary keys as paths.
        for extension in ('jpg', 'jpeg', 'png', 'webp'):
            candidate_rel = f'zdroje/{key}.{extension}'
            try:
                candidate = inside(old, candidate_rel)
            except ValueError:
                report['warnings'].append('Nebezpečný klíč média nebyl použit jako cesta: ' + str(key))
                break
            if candidate.is_file():
                filename = stable_id('scan', key) + '.' + extension
                copied = 'assets/original/' + filename
                source['originalFile'] = copied
                source['imageRole'] = 'imported-image-extent-unverified'
                source['sha256'] = digest(candidate)
                mid = stable_id('media', key)
                data['media'].append({'id': mid, 'kind': 'document', 'title': source['title'],
                                      'sourceId': sid, 'file': 'original/' + filename})
                media_copies.append((candidate, copied))
                break
        data['sources'].append(source)
    def references(item):
        keys = item.get('r', [])
        if not isinstance(keys, list):
            raise ValueError('Pole r musí být seznam; nepokračuji s částečným převodem.')
        refs = [source_map[k] for k in keys if k in source_map]
        missing = [k for k in keys if k not in source_map]
        if missing:
            report['warnings'].append('Nedohledané klíče zápisů: ' + ', '.join(map(str, missing)))
        return list(dict.fromkeys(refs)) or [import_source]
    ids = {}
    skipped = []
    for slot in sorted(set(persons) | set(same)):
        key = canonical(slot)
        p = persons[key]
        name = str(p.get('n', '')).strip()
        if p.get('st') == 'unk' or not name or name.lower() in ('neznámý', 'neznámá', 'otec neuveden', 'matka neuvedena'):
            skipped.append(slot)
            continue
        ids[slot] = 'p-rodokmen-' + str(key)
    seen = set()
    for slot, pid in ids.items():
        if pid in seen:
            continue
        seen.add(pid)
        key = canonical(slot)
        p = persons[key]
        source_ids = references(p)
        aliases = sorted(k for k, v in ids.items() if v == pid)
        explicit = p.get('sex')
        sex = {'M': 'male', 'F': 'female'}.get(explicit, 'unknown')
        if explicit is None and key != 1:
            sex = 'male' if key % 2 == 0 else 'female'
        person = {'id': pid, 'displayName': str(p['n']), 'sex': sex,
                  'lineage': 'self' if 1 in aliases else 'direct', 'sourceIds': source_ids,
                  'legacy': {'slots': aliases, 'personStatus': p.get('st'), 'lifeText': p.get('y', '')},
                  'notes': [str(p['note'])] if p.get('note') else []}
        if p.get('y'):
            person['notes'].append('Původní zápis roků života: ' + str(p['y']) + '. Přesná data neodvozena automaticky.')
        data['people'].append(person)
        # Preserve assertions from EVERY alias slot, not just the canonical slot.
        for alias in aliases:
            record = persons.get(alias, p)
            texts = [str(record.get('n', p['n']))] + [str(x) for x in record.get('f', [])]
            if record.get('note') and record.get('note') != p.get('note'):
                texts.append(str(record['note']))
            for i, text in enumerate(texts):
                data['claims'].append({'id': f'claim-p-{alias}-{i}', 'subjectType': 'person', 'subjectId': pid,
                    'text': text, 'evidence': 'family-record' if record.get('st') == 'fam' else 'hypothesis',
                    'sourceIds': references(record), 'predicate': 'name' if i == 0 else 'legacy-fact',
                    'reasoning': 'Převzato z osoby.py; původní stav celé osoby není důkaz tohoto jednotlivého údaje.',
                    'legacyEvidence': record.get('st')})
    if ids:
        data['meta']['defaultPersonId'] = ids.get(1, next(iter(ids.values())))
    pairs = set()
    for slot, child_id in ids.items():
        for parent_slot in (slot * 2, slot * 2 + 1):
            if parent_slot not in ids:
                continue
            parent_id = ids[parent_slot]
            if (parent_id, child_id) in pairs:
                continue
            pairs.add((parent_id, child_id))
            relation = {'id': f'rel-{parent_slot}-{slot}', 'type': 'parent-child', 'from': parent_id, 'to': child_id,
                        'evidence': 'hypothesis', 'sourceIds': [import_source], 'parentType': 'unspecified',
                        'reasoning': 'Vztah převzatý z čísel vývodu; čeká na přiřazení konkrétního důkazu.'}
            data['relationships'].append(relation)
    for i, side in enumerate(legacy.get('SIDE', [])):
        if not isinstance(side, dict) or not side.get('n'):
            report['warnings'].append(f'SIDE[{i}] nepromítnuto; celý původní obsah zachován.')
            continue
        data['people'].append({'id': f'p-side-{i}', 'displayName': str(side['n']), 'lineage': 'unlinked',
            'notes': [str(side.get('t', '')), 'Vazba k vývodu se neodvozuje automaticky z textu.'],
            'sourceIds': references(side), 'legacy': {'contextSlot': side.get('k')}})
    for name, place in raw['mista'].items():
        if not isinstance(place, dict):
            continue
        entry = {'id': stable_id('place', name), 'name': str(name), 'coordinatesStatus': 'approximate'}
        lat, lon = place.get('lat'), place.get('lon')
        if type(lat) in (float, int) and type(lon) in (float, int) and -90 <= lat <= 90 and -180 <= lon <= 180:
            entry.update(lat=lat, lon=lon)
        entry['legacy'] = place
        data['places'].append(entry)
    for i, issue in enumerate(legacy.get('ISSUES', [])):
        text = ' — '.join(map(str, issue)) if isinstance(issue, list) else str(issue)
        data['researchTasks'].append({'id': f'task-legacy-{i}', 'title': text, 'priority': 2,
            'status': 'closed' if 'Vyřešeno:' in text else 'open', 'sourceIds': [import_source],
            'nextAction': 'Přečíst původní poznámku a navázat na pramen.'})
    data['researchTasks'].append({'id': 'task-review-import', 'title': 'Prověřit převedené skutečnosti a vazby po jednotlivých tvrzeních',
        'priority': 1, 'status': 'open', 'sourceIds': [import_source],
        'nextAction': 'Začít nejmladší dostupnou událostí; otevřít původní obraz, doplnit lokátor, přepis a důkaz ke konkrétním tvrzením.'})
    data['changelog'].append({'id': 'change-import-rodokmen', 'date': dt.date.today().isoformat(),
        'title': 'Bezeztrátový archiv původních dat a konzervativní převod', 'categories': ['import'],
        'items': ['Jistota osoby se automaticky nepřevádí na jistotu tvrzení.']})
    report['counts'] = {c: len(data[c]) for c in COLLECTIONS}
    report['placeholderSlots'] = skipped
    report['unmappedPreserved'] = ['Celé původní AST jako JSON, data/, zdroje/ a dostupné pracovní dokumenty v importním archivu.',
        'LINES, HYPOTEZY, SAME, vlastní pole, dokumenty, popisy knih, formátování i přepisy zachovány.',
        'Volný text f/y není hádáním rozdělen na přesné datum/místo; dostupný v tvrzeních a importním archivu.',
        'SIDE kontext k neznamená doložené rodičovství ani partnerství.']
    precheck = check_dataset(data)
    errors = [x for x in precheck if x['severity'] == 'error']
    if errors:
        raise ValueError('Převod odhalil chybu, nic se nezapsalo:\n' + json.dumps(errors, ensure_ascii=False, indent=2))
    initialize(new, title=title)
    imports = inside(new, 'research/imports/rodokmen')
    imports.mkdir()
    atomic_json(imports / 'legacy.json', raw)
    document_suffixes = {'.md', '.txt', '.json', '.jsonl', '.csv', '.tsv', '.pdf', '.jpg', '.jpeg', '.png',
        '.tif', '.tiff', '.webp', '.svg', '.gif', '.ged', '.gedcom', '.ftb', '.sqlite', '.sqlite3', '.db',
        '.srt', '.vtt', '.wav', '.mp3', '.m4a', '.ogg', '.webm', '.mp4', '.docx', '.xlsx', '.eml'}
    skip_dirs = {'.git', 'node_modules', '__pycache__', '.cache', 'npm-cache', 'browser-bundle',
                 'browser-profile', 'ms-playwright', 'playwright', 'web', 'tools', 'dist', '.venv', 'venv'}
    report['excludedDirectoryNames'] = sorted(skip_dirs)
    report['warnings'].append('Importované obrazy mohou být výřezy; úplnost vůči celému snímku je nutné ověřit. '
                              'Pracovní originály jsou zachovány také v importním archivu, pokud byly v projektu.')
    for parent, directories, filenames in os.walk(old, followlinks=False):
        parent = Path(parent)
        directories[:] = sorted(d for d in directories if d not in skip_dirs and not (parent / d).is_symlink())
        for filename in sorted(filenames):
            source = parent / filename
            relative = source.relative_to(old).as_posix()
            if source.is_symlink():
                report['warnings'].append('Symlink nebyl převzat: ' + relative)
                continue
            full_data = relative.startswith(('data/', 'zdroje/'))
            if not full_data and source.suffix.lower() not in document_suffixes:
                continue
            checked = inside(old, relative, must_exist=True)
            target = inside(imports, 'original/' + relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(checked, target)
            report['sourceFiles'].append({'path': relative, 'sha256': digest(checked), 'bytes': checked.stat().st_size})
            if source.suffix.lower() in ('.md', '.txt') and (relative.startswith('data/') or
                (relative.startswith('pracovni/') and any(word in source.name.lower() for word in ('cteni', 'prepis', 'poznam', 'zdroj')))):
                data['sources'].append({'id': stable_id('src-note', relative), 'type': 'research-note',
                    'title': 'Původní pracovní podklad — ' + relative,
                    'transcriptionLines': checked.read_text(encoding='utf-8-sig', errors='replace').splitlines(),
                    'originalFile': 'research/imports/rodokmen/original/' + relative, 'sha256': digest(checked),
                    'provenance': {'kind': 'research-note', 'inspection': 'not-reviewed'},
                    'reliabilityNote': 'Doslovně převzatá pracovní poznámka, nikoli nový matriční důkaz.'})
    for source, relative in media_copies:
        destination = inside(new, relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    atomic_json(new / 'src/data/genealogy.json', data)
    report['counts'] = {c: len(data[c]) for c in COLLECTIONS}
    report['warnings'] = list(dict.fromkeys(report['warnings']))
    atomic_json(imports / 'report.json', report)
    result = {'project': str(new), 'counts': report['counts'], 'report': str(imports / 'report.json'),
              'findings': check_dataset(data, new)}
    (new / 'research/STAV.md').write_text('# Stav převodu\n\nPůvodní projekt je zachován v research/imports/rodokmen.\n'
        'Tvrzení a vazby čekají na kontrolu po jednotlivých pramenech; automaticky ověřeno nebylo nic.\n'
        'Další krok: projít report.json, poté první původní zápis.\n', encoding='utf-8')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('old_project'); parser.add_argument('new_project')
    parser.add_argument('--title', default='Rodová paměť — převod Rodokmenu')
    args = parser.parse_args()
    try:
        result = migrate(args.old_project, args.new_project, args.title)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (OSError, ValueError, SyntaxError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

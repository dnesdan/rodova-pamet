"""Shared, dependency-free data checks for Rodová paměť. Python >= 3.9."""
from __future__ import annotations

import ast
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata

COLLECTIONS = ('people', 'relationships', 'events', 'places', 'claims', 'sources', 'media', 'researchTasks', 'changelog')
EVIDENCE = {'verified', 'supported', 'family-record', 'hypothesis'}
ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def inside(root, relative, *, must_exist=False):
    root = Path(root).resolve()
    relative = str(relative)
    if not relative or '\\' in relative or '\x00' in relative:
        raise ValueError('Neplatná relativní cesta: ' + repr(relative))
    p = Path(relative)
    if p.is_absolute() or '..' in p.parts or re.match(r'^[A-Za-z]:', relative):
        raise ValueError('Cesta musí zůstat uvnitř projektu: ' + relative)
    result = (root / p).resolve()
    try:
        result.relative_to(root)
    except ValueError:
        raise ValueError('Symlink vede mimo projekt: ' + relative) from None
    if must_exist and not result.is_file():
        raise ValueError('Soubor neexistuje: ' + relative)
    return result


@contextlib.contextmanager
def project_lock(project):
    """Single writer. A stale lock is never silently removed after a crash."""
    project = Path(project).resolve()
    research = inside(project, 'research')
    research.mkdir(parents=True, exist_ok=True)
    for journal in (research / 'transactions').glob('*/journal.json'):
        try:
            state = read_json(journal).get('state')
        except (OSError, ValueError):
            state = 'unreadable'
        if state not in ('committed', 'rolled-back'):
            raise ValueError('Nedokončená transakce: ' + str(journal) +
                             '. Nejdřív porovnej zálohy a dokonči nebo vrať celou dávku.')
    lock = research / '.rodova-pamet-write.lock'
    try:
        fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise ValueError('Projekt právě zapisuje jiná relace, nebo zůstal zámek po pádu. '
                         'Zkontroluj research/transactions a vlastníka zámku; nemaž jej naslepo.') from None
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump({'pid': os.getpid(), 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat()}, handle)
        yield
    finally:
        lock.unlink(missing_ok=True)


def slug(value, fallback='zaznam'):
    raw = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', raw).strip('-') or fallback


def safe_legacy_python(path):
    """Parse data declarations; NEVER import/exec an untrusted osoby.py.

    Only literal containers and dict(keyword=literal) are supported. Reject
    imports, comprehensions, attributes, arbitrary calls and duplicate keys.
    A rejected file stays intact for manual conversion; no partial import.
    """
    text = Path(path).read_text(encoding='utf-8-sig')
    if len(text) > 20_000_000:
        raise ValueError('osoby.py je příliš velké pro tento bezpečný převod.')
    tree = ast.parse(text, filename=str(path))
    if sum(1 for _ in ast.walk(tree)) > 500_000:
        raise ValueError('Příliš složité osoby.py.')

    def literal(node, depth=0):
        if depth > 100:
            raise ValueError('Příliš vnořené osoby.py.')
        if isinstance(node, ast.Constant):
            if isinstance(node.value, (str, int, float, bool, type(None))):
                return node.value
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            return [literal(x, depth + 1) for x in node.elts]
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            n = literal(node.operand, depth + 1)
            if type(n) in (int, float):
                return n if isinstance(node.op, ast.UAdd) else -n
        if isinstance(node, ast.Dict):
            result = {}
            for key, value in zip(node.keys, node.values):
                if key is None:
                    raise ValueError('Rozbalování slovníku není povoleno.')
                k = literal(key, depth + 1)
                if not isinstance(k, (str, int)) or k in result:
                    raise ValueError('Neplatný nebo duplicitní klíč v osoby.py.')
                result[k] = literal(value, depth + 1)
            return result
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'dict' and not node.args:
            result = {}
            for kw in node.keywords:
                if kw.arg is None or kw.arg in result:
                    raise ValueError('Neplatná konstrukce dict v osoby.py.')
                result[kw.arg] = literal(kw.value, depth + 1)
            return result
        raise ValueError('Nepodporovaný spustitelný výraz v osoby.py na řádku ' + str(getattr(node, 'lineno', '?')))

    result = {}
    for statement in tree.body:
        if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Constant) and isinstance(statement.value.value, str):
            continue
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
            name = statement.targets[0].id
            if name in result:
                raise ValueError('Opakované přiřazení ' + name + '; vyžaduje ruční převod.')
            result[name] = literal(statement.value)
        else:
            raise ValueError('osoby.py obsahuje příkaz, který bezpečný import nepovoluje (řádek '
                             + str(getattr(statement, 'lineno', '?')) + '). Soubor se nespouští.')
    if not isinstance(result.get('P'), dict):
        raise ValueError('Chybí deklarativní slovník P.')
    return result


def possibly_living(person, year=None):
    """Conservative disclosure heuristic, not a legal definition or death claim."""
    if person.get('living') is True:
        return True
    death = person.get('death') or {}
    if person.get('living') is False or death.get('date') or death.get('dateText'):
        return False
    year = year or dt.date.today().year
    birth = person.get('birth') or {}
    match = re.fullmatch(r'(\d{4})(?:-\d{2}(?:-\d{2})?)?', str(birth.get('date', '')))
    if match and int(match[1]) <= year - 120:
        return False
    return True


def check_dataset(data, project=None, strict_evidence=False):
    """Return actionable errors/warnings; schema validation also runs in Node."""
    findings = []
    def add(severity, code, path, message):
        findings.append({'severity': severity, 'code': code, 'path': path, 'message': message})
    if not isinstance(data, dict):
        return [{'severity': 'error', 'code': 'root', 'path': '$', 'message': 'Kořen musí být objekt.'}]
    if not isinstance(data.get('meta', {}), dict):
        return [{'severity': 'error', 'code': 'meta-type', 'path': 'meta', 'message': 'meta musí být objekt.'}]
    maps = {}
    for collection in COLLECTIONS:
        items = data.get(collection, [])
        if not isinstance(items, list):
            add('error', 'collection-type', collection, 'Kolekce musí být pole.')
            items = []
        maps[collection] = {}
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                add('error', 'item-type', f'{collection}[{i}]', 'Položka musí být objekt.')
                continue
            key = item.get('id')
            if not isinstance(key, str) or not ID_RE.fullmatch(key):
                add('error', 'id', f'{collection}[{i}]', 'Neplatné stabilní ID.')
                continue
            if key in maps[collection]:
                add('error', 'duplicate-id', f'{collection}.{key}', 'Duplicitní ID; neslučovat podle jména.')
            maps[collection][key] = item

    def ref(collection, value, path):
        if not isinstance(value, str) or value not in maps[collection]:
            add('error', 'dangling-reference', path, f'Neexistuje {collection}:{value}.')

    default = data.get('meta', {}).get('defaultPersonId')
    if default:
        ref('people', default, 'meta.defaultPersonId')
    sample = data.get('meta', {}).get('sample') is True
    if sample:
        add('warning', 'sample', 'meta.sample', 'Vymyšlená ukázka. Stavy důkazů nejsou skutečné archivní nálezy.')
    for collection, items in maps.items():
        for key, item in items.items():
            p = f'{collection}.{key}'
            for source in item.get('sourceIds', []):
                ref('sources', source, p + '.sourceIds')
            if item.get('sourceId'):
                ref('sources', item['sourceId'], p + '.sourceId')
            for person in item.get('personIds', []):
                ref('people', person, p + '.personIds')
            for field in ('placeId', 'fromPlaceId'):
                if item.get(field):
                    ref('places', item[field], p + '.' + field)
            if 'evidence' in item and item['evidence'] not in EVIDENCE:
                add('error', 'evidence-enum', p, 'Neznámý stav důkazu.')
            if not sample and item.get('sample') is True:
                add('error', 'sample-mixed', p, 'Fiktivní položka ve skutečném výzkumu.')
    for key, person in maps['people'].items():
        for life in ('birth', 'death'):
            value = person.get(life) or {}
            if isinstance(value, dict) and value.get('placeId'):
                ref('places', value['placeId'], f'people.{key}.{life}.placeId')
        if possibly_living(person):
            add('warning', 'possibly-living', f'people.{key}', 'Pro sdílení zacházet jako s žijící osobou; chybějící datum není doklad úmrtí.')
    parents = {key: [] for key in maps['people']}
    for key, relation in maps['relationships'].items():
        ref('people', relation.get('from'), f'relationships.{key}.from')
        ref('people', relation.get('to'), f'relationships.{key}.to')
        if relation.get('from') == relation.get('to'):
            add('error', 'self-relationship', f'relationships.{key}', 'Vztah osoby k sobě samé.')
        if relation.get('type') == 'parent-child' and relation.get('to') in parents:
            parents[relation['to']].append(relation.get('from'))
        if not relation.get('sourceIds'):
            add('warning', 'unreferenced-relationship', f'relationships.{key}', 'Vztah nemá vlastní odkaz na pramen.')
    # Iterative DFS avoids both cycles and recursion failure in a large pedigree.
    colors = {}
    for start in parents:
        if colors.get(start):
            continue
        stack = [(start, False)]
        while stack:
            key, leaving = stack.pop()
            if leaving:
                colors[key] = 2
                continue
            if colors.get(key) == 1:
                add('error', 'ancestry-cycle', f'people.{key}', 'Cyklus rodičovských vazeb.')
                continue
            if colors.get(key) == 2:
                continue
            colors[key] = 1
            stack.append((key, True))
            stack.extend((parent, False) for parent in parents.get(key, []))
    subjects = {'person': 'people', 'relationship': 'relationships', 'place': 'places', 'event': 'events', 'source': 'sources'}
    for key, claim in maps['claims'].items():
        p = f'claims.{key}'
        if claim.get('subjectType') in subjects:
            ref(subjects[claim['subjectType']], claim.get('subjectId'), p + '.subjectId')
        if not claim.get('sourceIds'):
            add('error', 'unreferenced-claim', p, 'Tvrzení musí mít pramen; hypotéza může citovat výchozí stopu.')
        for history_field in ('supersedes', 'contradictedBy'):
            history_values = claim.get(history_field, [])
            if not isinstance(history_values, list):
                add('error', 'history-type', p + '.' + history_field, 'Odkazy na tvrzení musí být pole ID.')
                continue
            for other in history_values:
                ref('claims', other, p + '.' + history_field)
        if claim.get('evidence') == 'verified' and not sample:
            eligible = []
            for source_id in claim.get('sourceIds', []):
                source = maps['sources'].get(source_id, {})
                provenance = source.get('provenance', {})
                locator = source.get('locator', {})
                if not isinstance(provenance, dict) or not isinstance(locator, dict):
                    add('error', 'source-audit-type', 'sources.' + source_id, 'provenance a locator musí být objekty.')
                    continue
                if (provenance.get('inspection') == 'image-read'
                        and (source.get('url') or source.get('originalFile'))
                        and (locator.get('scan') is not None or locator.get('folio') or locator.get('entry'))
                        and source.get('transcriptionLines')):
                    eligible.append(source_id)
            if not eligible or not claim.get('reasoning'):
                add('error' if strict_evidence else 'warning', 'verified-without-audit', p,
                    'Ověřeno vyžaduje prohlédnutý obraz, dohledatelný zápis, přepis a odůvodnění konkrétního tvrzení.')
    for key, source in maps['sources'].items():
        if source.get('originalFile') and project:
            try:
                original = inside(project, source['originalFile'], must_exist=True)
                if source.get('sha256') and digest(original) != source['sha256']:
                    add('error', 'original-changed', f'sources.{key}', 'SHA-256 originálu nesouhlasí.')
            except ValueError as error:
                add('error', 'source-file', f'sources.{key}', str(error))
        for box in source.get('boxes', []):
            if not (isinstance(box, list) and len(box) == 4 and all(type(v) in (int, float) and 0 <= v <= 1 for v in box)
                    and box[0] < box[2] and box[1] < box[3]):
                add('error', 'bbox', f'sources.{key}', 'Rámeček vyžaduje x1,y1,x2,y2 v 0–1 a kladnou plochu.')
    for key, media in maps['media'].items():
        if media.get('file') and project:
            rel = 'assets/' + (media['file'] if '/' in media['file'] else 'optimized/' + media['file'])
            try:
                inside(project, rel, must_exist=True)
            except ValueError as error:
                add('error', 'media-path', f'media.{key}', str(error))
    return findings

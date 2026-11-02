#!/usr/bin/env python3
"""Rodová paměť: initialize, inspect, validate, apply changes, record research.

Python 3.9+, Node 22+ for the offline app. No network calls and no third-party
Python packages. Archive adapters are a separate, rate-limited toolset.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import uuid

from pamet_common import (COLLECTIONS, atomic_json, check_dataset, digest, inside,
                          project_lock, read_json)

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
VERSION = '1.0.0'
TARGETS = {'genealogy': 'genealogy.json', 'gazetteer': 'gazetteer.json', 'registers': 'registers.json',
           'media-notes': 'media-notes.json', 'history-local': 'history-local.json'}


def today():
    return dt.date.today().isoformat()


def run(command, **kwargs):
    return subprocess.run([str(x) for x in command], check=True, text=True, encoding='utf-8', **kwargs)


def initialize(target, *, name=None, birth_year=None, sex='unknown', title='Rodová paměť', sample=False):
    target = Path(target).absolute()
    if target.exists():
        raise ValueError('Cílová složka již existuje. Inicializace nikdy nepřepisuje rozpracovaný projekt.')
    template = SKILL / 'assets/kronika'
    if not (template / 'scripts/build.mjs').is_file():
        raise ValueError('Inicializaci spusť ze složky nainstalovaného skillu; projekt nemá vlastní šablonu.')
    if not shutil.which('node'):
        raise ValueError('Chybí Node.js. Základní aplikace potřebuje Node 22+; nejprve připrav prostředí.')
    node_version = run(['node', '--version'], stdout=subprocess.PIPE).stdout.strip()
    if int(node_version.lstrip('v').split('.')[0]) < 22:
        raise ValueError('Node.js ' + node_version + ' nestačí; potřeba verze22 nebo novější.')
    if sample and name:
        raise ValueError('Ukázku a vlastní osobu vytvářej odděleně; --sample a --name nelze kombinovat.')
    if name and ' ' not in name.strip():
        raise ValueError('Výchozí osoba potřebuje jméno i příjmení, nebo založ prázdný projekt bez --name.')
    if birth_year and (not name or len(str(birth_year)) != 4 or not str(birth_year).isdigit()):
        raise ValueError('--birth-year vyžaduje --name a čtyřmístný rok.')
    # No inherited .git, remotes, node_modules or generated outputs.
    shutil.copytree(template, target, ignore=shutil.ignore_patterns('.git', '__pycache__', 'node_modules', 'dist'))
    for directory in ('assets/original', 'assets/source', 'assets/optimized', 'assets/interviews',
                      'research/imports', 'research/transactions', 'research/requests', 'research/searches'):
        inside(target, directory).mkdir(parents=True, exist_ok=True)
    for script in ('pamet.py', 'pamet_common.py', 'migrate_rodokmen.py', 'prepare_changes.mjs'):
        if (HERE / script).is_file():
            shutil.copy2(HERE / script, target / 'scripts' / script)
    if (SKILL / 'assets/archivy').is_dir():
        shutil.copytree(SKILL / 'assets/archivy', target / 'archivy', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    if (SKILL / 'assets/project-AGENTS.md').is_file():
        shutil.copy2(SKILL / 'assets/project-AGENTS.md', target / 'AGENTS.md')
        (target / 'CLAUDE.md').write_text('@AGENTS.md\n', encoding='utf-8')
    # Keep the source manifest and upstream licenses with every generated project.
    for source in ('upstream-manifest.json', 'THIRD-PARTY-NOTICES.md', 'LICENSE'):
        if (SKILL / source).is_file():
            shutil.copy2(SKILL / source, target / ('RODOVA-PAMET-' + source))
    if sample:
        data = read_json(target / 'src/data/genealogy.json')
        data['meta']['sample'] = True
        data['meta']['title'] = 'Vymyšlená ukázka — Rodová paměť'
        atomic_json(target / 'src/data/genealogy.json', data)
    elif name:
        command = ['node', target / 'scripts/init.mjs', '--vlastni', '--jmeno', name, '--nazev', title]
        if birth_year:
            command += ['--narozeni', str(birth_year)]
        if sex != 'unknown':
            command += ['--pohlavi', 'muz' if sex == 'male' else 'zena']
        run(command, cwd=target, stdout=subprocess.PIPE)
        initial = read_json(target / 'src/data/genealogy.json')
        for source in initial.get('sources', []):
            if source.get('id') == 'src-vlastni-znalost':
                source['title'] = 'Výchozí údaje zadané při založení projektu'
                source['transcriptionLines'] = ['Zadané jméno: ' + name] + (
                    ['Zadaný rok narození: ' + str(birth_year)] if birth_year else [])
                source['reliabilityNote'] = 'Záznam vstupních údajů, nikoli doslovná citace rozhovoru ani nezávislé archivní ověření.'
                source['provenance'] = {'kind': 'provided-input', 'inspection': 'not-reviewed'}
        atomic_json(target / 'src/data/genealogy.json', initial)
    else:
        data = {key: [] for key in COLLECTIONS}
        data['meta'] = {'title': title, 'version': '0.1.0', 'updatedAt': today(), 'sample': False}
        atomic_json(target / 'src/data/genealogy.json', data)
        for file in ('gazetteer.json', 'history-local.json', 'registers.json', 'media-notes.json', 'family-edition.json'):
            path = target / 'src/data' / file
            if path.exists():
                path.unlink()
    atomic_json(target / '.rodova-pamet.json', {'skillVersion': VERSION, 'createdAt': today(),
                'canonicalData': 'src/data/genealogy.json', 'sample': sample})
    (target / 'research/STAV.md').write_text(
        '# Stav výzkumu\n\n' + ('Vymyšlená ukázka; neobsahuje skutečné archivní důkazy.\n' if sample else
        'Projekt založen. Další krok: zapsat výchozí rodinné údaje s původem informace.\n') +
        '\n## Otevřené otázky\n\n## Poslední ověřený zápis\n\n## Další konkrétní krok\n', encoding='utf-8')
    (target / 'research/research_log.jsonl').touch()
    return {'project': str(target), 'sample': sample, 'data': 'src/data/genealogy.json'}


def check_project(project, *, strict=False):
    project = Path(project).resolve()
    data_file = inside(project, 'src/data/genealogy.json', must_exist=True)
    data = read_json(data_file)
    return {'dataSha256': digest(data_file), 'counts': {c: len(data.get(c, [])) for c in COLLECTIONS},
            'findings': check_dataset(data, project, strict_evidence=strict)}


def apply_changes(project, changes, *, write=False):
    project = Path(project).resolve()
    changes = Path(changes).resolve()
    with project_lock(project):
        base = inside(project, 'src/data', must_exist=False)
        result = run(['node', HERE / 'prepare_changes.mjs', project, changes],
                     cwd=project, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        next_files = json.loads(result.stdout)
        findings = check_dataset(next_files['genealogy'], project, strict_evidence=True)
        current = read_json(base / 'genealogy.json')
        # Existing imported deficiencies remain visible; do not add or strengthen them.
        old_errors = {(x['code'], x['path'], x['message']) for x in check_dataset(current, project, True)
                      if x['severity'] == 'error'}
        old_claims = {x['id']: x for x in current.get('claims', [])}
        new_claims = {x['id']: x for x in next_files['genealogy'].get('claims', [])}
        added_errors = []
        for finding in findings:
            if finding['severity'] != 'error':
                continue
            already_present = (finding['code'], finding['path'], finding['message']) in old_errors
            claim_id = finding['path'].removeprefix('claims.')
            changed_unverified_claim = (finding['code'] == 'verified-without-audit' and
                                         old_claims.get(claim_id) != new_claims.get(claim_id))
            if not already_present or changed_unverified_claim:
                added_errors.append(finding)
        if added_errors:
            raise ValueError('Změny nesplňují důkazní kontrolu:\n' + json.dumps(added_errors, ensure_ascii=False, indent=2))
        changed = {}
        for key, value in next_files.items():
            if key not in TARGETS:
                raise ValueError('Nepovolený cíl dávky: ' + key)
            target = inside(project, 'src/data/' + TARGETS[key])
            if not target.exists() or read_json(target) != value:
                changed[TARGETS[key]] = value
        summary = {'write': write, 'files': list(changed), 'validation': findings, 'preview': result.stderr.strip()}
        if not write or not changed:
            return summary
        transaction = inside(project, 'research/transactions/' + dt.datetime.now().strftime('%Y%m%d-%H%M%S-') + uuid.uuid4().hex[:10])
        transaction.mkdir()
        original = {}
        journal = {'state': 'prepared', 'files': [], 'changesSha256': digest(changes), 'createdAt': today()}
        for file, value in changed.items():
            target = base / file
            original[file] = target.read_bytes() if target.exists() else None
            if original[file] is not None:
                (transaction / (file + '.before')).write_bytes(original[file])
            atomic_json(transaction / (file + '.after'), value)
            journal['files'].append({'file': file, 'existed': original[file] is not None,
                                     'beforeSha256': digest(target) if target.exists() else None})
        atomic_json(transaction / 'journal.json', journal)
        try:
            for file, value in changed.items():
                atomic_json(base / file, value)
            journal['state'] = 'committed'
            atomic_json(transaction / 'journal.json', journal)
        except BaseException:
            for file, content in original.items():
                target = base / file
                if content is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(content)
            journal['state'] = 'rolled-back'
            atomic_json(transaction / 'journal.json', journal)
            raise
        summary['transaction'] = str(transaction.relative_to(project))
        return summary


def log_search(project, input_file):
    project = Path(project).resolve()
    entry = read_json(input_file)
    required = ('question', 'repository', 'source', 'range', 'method', 'result', 'nextAction')
    if not isinstance(entry, dict) or any(not entry.get(field) for field in required):
        raise ValueError('Deník vyžaduje: ' + ', '.join(required))
    if entry['result'] not in ('found', 'not-found', 'partial', 'blocked'):
        raise ValueError('result: found | not-found | partial | blocked')
    entry.setdefault('recordedAt', dt.datetime.now(dt.timezone.utc).isoformat())
    entry.setdefault('id', 'search-' + uuid.uuid4().hex)
    with project_lock(project):
        path = inside(project, 'research/research_log.jsonl')
        with path.open('a', encoding='utf-8') as handle:
            handle.write(json.dumps(entry, ensure_ascii=False, allow_nan=False) + '\n')
            handle.flush()
            os.fsync(handle.fileno())
    return {'logged': entry['id'], 'result': entry['result']}


def doctor():
    result = {'platform': platform.system(), 'python': platform.python_version(), 'tools': {}}
    for tool, option in [('node', '--version'), ('git', '--version'), ('magick', '-version'), ('convert', '-version'), ('ffmpeg', '-version')]:
        resolved = shutil.which(tool)
        result['tools'][tool] = {'available': bool(resolved)}
        if resolved:
            completed = subprocess.run([resolved, option], capture_output=True, text=True, timeout=15)
            result['tools'][tool]['version'] = (completed.stdout or completed.stderr).splitlines()[0]
    result['requirements'] = {'core': 'Python >=3.9, Node >=22', 'archive_images': 'ImageMagick (magick nebo convert)',
                              'audio_optional': 'ffmpeg, faster-whisper; nové modely vyžadují stažení'}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('init', help='Nový projekt; nikdy nepřepisuje existující složku.')
    p.add_argument('target'); p.add_argument('--name'); p.add_argument('--birth-year')
    p.add_argument('--sex', choices=['male', 'female', 'unknown'], default='unknown')
    p.add_argument('--title', default='Rodová paměť'); p.add_argument('--sample', action='store_true')
    p = sub.add_parser('check', help='Odkazy, cykly, zdroje, rámečky, média a jistota jednotlivých tvrzení.')
    p.add_argument('project'); p.add_argument('--strict-evidence', action='store_true')
    p.add_argument('--output')
    p = sub.add_parser('apply', help='Připraví dávku; --write zapíše s transakcí a zálohou.')
    p.add_argument('project'); p.add_argument('changes'); p.add_argument('--write', action='store_true')
    p = sub.add_parser('log', help='Zaznamená i neúspěšné hledání, s konkrétním rozsahem.')
    p.add_argument('project'); p.add_argument('entry')
    sub.add_parser('doctor', help='Pouze zjistí programy; nic neinstaluje.')
    args = parser.parse_args()
    try:
        if args.command == 'init':
            result = initialize(args.target, name=args.name, birth_year=args.birth_year, sex=args.sex, title=args.title, sample=args.sample)
        elif args.command == 'check':
            result = check_project(args.project, strict=args.strict_evidence)
            if args.output:
                atomic_json(args.output, result)
        elif args.command == 'apply':
            result = apply_changes(args.project, args.changes, write=args.write)
        elif args.command == 'log':
            result = log_search(args.project, args.entry)
        else:
            result = doctor()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.command == 'check' and any(x['severity'] == 'error' for x in result['findings']):
            return 1
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        if isinstance(error, subprocess.CalledProcessError):
            print(error.stderr or '', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

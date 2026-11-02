"""Safety regressions: no network, no private fixtures, no model answer leakage."""
import json
from pathlib import Path
import tempfile
import unittest

from pamet_common import (COLLECTIONS, atomic_json, check_dataset, digest, inside,
                          possibly_living, project_lock, safe_legacy_python)
from migrate_rodokmen import migrate


def dataset():
    data = {key: [] for key in COLLECTIONS}
    data['meta'] = {'title': 'Syntetický test', 'version': '0.1.0', 'updatedAt': '2026-11-02'}
    data['people'] = [{'id': 'a', 'displayName': 'Test A'}, {'id': 'b', 'displayName': 'Test B'},
                      {'id': 'c', 'displayName': 'Test C'}]
    return data


class DataSafetyTests(unittest.TestCase):
    def test_migration_cannot_copy_into_itself(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / 'old'; original.mkdir()
            destination = original / 'new'
            with self.assertRaises(ValueError):
                migrate(original, destination)
            self.assertFalse(destination.exists())

    def test_python_data_never_executes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'osoby.py'
            sentinel = Path(directory) / 'should-not-exist'
            path.write_text('P = {1: dict(n="Jana", f=["asi 1800"])}\nSAME = {}', encoding='utf-8')
            self.assertEqual(safe_legacy_python(path)['P'][1]['f'], ['asi 1800'])
            for bad in ['import os\nP = {}', 'P = {x: x for x in [1]}',
                        f'P = __import__("pathlib").Path({str(sentinel)!r}).touch()',
                        'P = {1: dict(n="A"), 1: dict(n="B")}', 'P = {}\nP.update({1: 2})']:
                path.write_text(bad, encoding='utf-8')
                with self.assertRaises(ValueError):
                    safe_legacy_python(path)
            self.assertFalse(sentinel.exists())

    def test_paths_reject_escape_and_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'project'; root.mkdir()
            outside = Path(directory) / 'outside.txt'; outside.write_text('x')
            for path in ('../outside.txt', '/tmp/outside.txt', 'C:/outside.txt', '..\\outside.txt'):
                with self.assertRaises(ValueError):
                    inside(root, path)
            link = root / 'link'
            try:
                link.symlink_to(outside)
            except OSError:
                return
            with self.assertRaises(ValueError):
                inside(root, 'link')

    def test_only_specific_claim_can_be_verified(self):
        data = dataset()
        data['sources'] = [{'id': 's', 'title': 'Testovací záznam', 'type': 'parish-register',
            'url': 'https://example.org/test', 'transcriptionLines': ['Test'], 'locator': {'scan': 1},
            'provenance': {'inspection': 'not-reviewed'}}]
        data['claims'] = [{'id': 'c1', 'subjectType': 'person', 'subjectId': 'a', 'text': 'Test',
            'evidence': 'verified', 'sourceIds': ['s'], 'reasoning': 'Syntetický test'}]
        self.assertTrue(any(x['code'] == 'verified-without-audit' and x['severity'] == 'error'
                            for x in check_dataset(data, strict_evidence=True)))
        data['sources'][0]['provenance']['inspection'] = 'image-read'
        self.assertFalse(any(x['severity'] == 'error' for x in check_dataset(data, strict_evidence=True)))

    def test_missing_subject_and_duplicate_ids_are_errors(self):
        data = dataset()
        data['people'].append(data['people'][0].copy())
        data['claims'] = [{'id': 'c1', 'subjectType': 'person', 'subjectId': 'missing', 'text': 'X',
                           'evidence': 'hypothesis', 'sourceIds': ['missing-source']}]
        codes = {x['code'] for x in check_dataset(data)}
        self.assertIn('duplicate-id', codes)
        self.assertIn('dangling-reference', codes)

    def test_shared_ancestor_is_not_a_cycle(self):
        data = dataset()
        data['relationships'] = [
            {'id': 'r1', 'type': 'parent-child', 'from': 'a', 'to': 'b'},
            {'id': 'r2', 'type': 'parent-child', 'from': 'a', 'to': 'c'},
            {'id': 'r3', 'type': 'parent-child', 'from': 'b', 'to': 'c'}]
        self.assertFalse(any(x['code'] == 'ancestry-cycle' for x in check_dataset(data)))
        data['relationships'].append({'id': 'r4', 'type': 'parent-child', 'from': 'c', 'to': 'a'})
        self.assertTrue(any(x['code'] == 'ancestry-cycle' for x in check_dataset(data)))

    def test_demo_does_not_mix_into_research(self):
        data = dataset(); data['sources'] = [{'id': 's', 'sample': True}]
        self.assertTrue(any(x['code'] == 'sample-mixed' for x in check_dataset(data)))
        data['meta']['sample'] = True
        self.assertFalse(any(x['code'] == 'sample-mixed' for x in check_dataset(data)))
        self.assertTrue(any(x['code'] == 'sample' for x in check_dataset(data)))

    def test_unknown_life_is_private(self):
        self.assertTrue(possibly_living({'displayName': 'Test', 'death': {}}))
        self.assertTrue(possibly_living({'living': True, 'birth': {'date': '1800'}}))
        self.assertFalse(possibly_living({'death': {'date': '1900'}}))
        self.assertFalse(possibly_living({'birth': {'date': '1800'}}))

    def test_original_integrity_and_box(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'original'; path.write_text('scan')
            data = dataset(); data['sources'] = [{'id': 's', 'originalFile': 'original', 'sha256': digest(path),
                                                 'boxes': [[.2, .3, .8, .9]]}]
            self.assertFalse(any(x['severity'] == 'error' for x in check_dataset(data, directory)))
            path.write_text('changed')
            data['sources'][0]['boxes'] = [[.8, .3, .2, .9]]
            codes = {x['code'] for x in check_dataset(data, directory)}
            self.assertIn('original-changed', codes); self.assertIn('bbox', codes)

    def test_writer_lock_and_unfinished_journal(self):
        with tempfile.TemporaryDirectory() as directory:
            with project_lock(directory):
                with self.assertRaises(ValueError):
                    with project_lock(directory):
                        pass
            journal = Path(directory) / 'research/transactions/x/journal.json'
            atomic_json(journal, {'state': 'prepared'})
            with self.assertRaises(ValueError):
                with project_lock(directory):
                    pass
            atomic_json(journal, {'state': 'rolled-back'})
            with project_lock(directory):
                pass


if __name__ == '__main__':
    unittest.main()

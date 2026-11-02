"""Portable output contracts for the combined archive toolkit (no canonical data mutations)."""
from __future__ import annotations
import contextlib,json,os,pathlib,re,tempfile

def project_root():
    return os.path.abspath(os.environ.get('RODOVA_PROJECT') or os.getcwd())

def safe_key(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,179}',value) or value in ('.','..'):
        raise ValueError('Klíč musí být krátký identifikátor bez adresářů a mezer.')
    return value

def project_file(folder,key,suffix=''):
    safe_key(key)
    root=pathlib.Path(project_root()).resolve();base=root/folder
    path=base/(key+suffix)
    if not path.resolve().is_relative_to(root) or base.is_symlink() or path.is_symlink():
        raise ValueError('Cesta nebo symlink vede mimo pracovní projekt.')
    base.mkdir(parents=True,exist_ok=True)
    return str(path)

def emit_catalog(key,entry):
    """Print an inspection candidate, never inject an unverified catalogue into genealogy.json."""
    print(json.dumps({'id':key,'kind':'archive-catalog-candidate','reviewStatus':'unverified','catalog':entry},ensure_ascii=False,indent=2))

def atomic_json(path,data):
    path=pathlib.Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='.'+path.name+'.',suffix='.tmp',dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as fh:
            json.dump(data,fh,ensure_ascii=False,indent=2);fh.write('\n')
        os.replace(tmp,path)
    finally:
        with contextlib.suppress(FileNotFoundError):os.unlink(tmp)

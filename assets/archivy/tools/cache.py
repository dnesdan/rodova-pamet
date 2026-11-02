#!/usr/bin/env python3
"""Shared, atomic archive cache adapted from rodokmen-skill PR60 (MIT).

Keys are bounded relative paths. A per-key process/thread lock ensures one download,
not merely atomic competing downloads. Cache lives in RODOKMEN_SNIMKY or the platform
cache directory. Do not cache authenticated private records in a shared public account.
"""
import contextlib,os,pathlib,shutil,tempfile,threading,time
KOREN=os.environ.get('RODOKMEN_SNIMKY') or os.path.join(os.environ.get('LOCALAPPDATA') or os.path.join(os.path.expanduser('~'),'.cache'),'rodokmen_snimky')
_locks={};_guard=threading.Lock()

def cesta(klic):
    if not isinstance(klic,str) or not klic or len(klic)>400 or '\\' in klic or ':' in klic or '\x00' in klic:
        raise ValueError('Neplatný klíč cache.')
    parts=klic.split('/')
    if any(p in ('','.','..') or len(p)>180 for p in parts):raise ValueError('Neplatná relativní cesta cache.')
    root=pathlib.Path(KOREN).resolve();p=root.joinpath(*parts)
    if not p.resolve().is_relative_to(root):raise ValueError('Cache nesmí vést mimo svůj kořen.')
    cur=root
    for part in parts:
        cur=cur/part
        if cur.is_symlink():raise ValueError('Symlinky v cache nejsou povolené.')
    return str(p)

@contextlib.contextmanager
def zamkni(klic):
    p=cesta(klic);os.makedirs(os.path.dirname(p),exist_ok=True)
    with _guard:lock=_locks.setdefault(p,threading.Lock())
    with lock:
        lp=p+'.lock'
        if os.path.islink(lp):raise ValueError('Zámek cache je symlink.')
        with open(lp,'a+b') as fh:
            if os.name=='nt':
                import msvcrt
                fh.seek(0,2)
                if fh.tell()==0:fh.write(b'0');fh.flush()
                deadline=time.monotonic()+300
                while True:
                    try:fh.seek(0);msvcrt.locking(fh.fileno(),msvcrt.LK_NBLCK,1);break
                    except OSError:
                        if time.monotonic()>deadline:raise TimeoutError("Čekání na cache překročilo 5 minut.")
                        time.sleep(.05)
            else:
                import fcntl
                fcntl.flock(fh.fileno(),fcntl.LOCK_EX)
            try:yield p
            finally:
                if os.name=='nt':fh.seek(0);msvcrt.locking(fh.fileno(),msvcrt.LK_UNLCK,1)
                else:fcntl.flock(fh.fileno(),fcntl.LOCK_UN)

def _temp(p):
    fd,tmp=tempfile.mkstemp(prefix='.'+pathlib.Path(p).stem+'.',suffix=pathlib.Path(p).suffix,dir=os.path.dirname(p));os.close(fd)
    return tmp

def uloz(klic,data):
    with zamkni(klic) as p:
        tmp=_temp(p)
        try:
            with open(tmp,'wb') as f:f.write(data)
            os.replace(tmp,p)
        finally:
            with contextlib.suppress(FileNotFoundError):os.unlink(tmp)
    return p

def soubor(klic,out,stahni):
    with zamkni(klic) as p:
        hit=os.path.isfile(p) and os.path.getsize(p)>0
        if hit:print('z cache, bez stahování:',p)
        else:
            tmp=_temp(p)
            try:
                stahni(tmp)
                if not os.path.isfile(tmp) or os.path.getsize(tmp)==0:raise ValueError('Stažení nevytvořilo neprázdný soubor.')
                os.replace(tmp,p)
            finally:
                with contextlib.suppress(FileNotFoundError):os.unlink(tmp)
        if out and os.path.abspath(out)!=os.path.abspath(p):
            if os.path.islink(out):raise ValueError('Cíl stažení je symlink.')
            os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
            shutil.copyfile(p,out)
    return hit

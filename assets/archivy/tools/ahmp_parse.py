"""Pomocník pro ahmp_search.sh: z HTML stránky výsledků katalogu AHMP vypíše svazky (popis | farnost | XID, počet snímků)."""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__))); import slusne
from archive_common import project_root, emit_catalog, safe_key, project_file, atomic_json
import re,sys,html
for _s in (sys.stdout, sys.stderr):   # UTF-8 výstup i na Windows bez -X utf8 (cp1250 neumí třeba „→“)
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")
t=open(sys.argv[1],encoding='utf-8').read()
for blk in t.split('class="navigatorLine listArticle')[1:]:
    crumbs=re.findall(r'class="crumb">\s*<a[^>]*>([^<]*)</a>',blk)
    z=re.search(r'Zoomify.action\?xid=(\w+).*?%28(\d+)%29%29&amp;scanIndex=0" title="Zobrazit v plné kvalitě (\d+)',blk)
    lab=re.search(r'rowPg=\d+">(.*?)</a>',blk,re.S)
    l=re.sub(r'<[^>]+>','',lab.group(1)) if lab else '?'
    print(html.unescape(l).strip(),'|',(crumbs[-1][:40] if crumbs else ''),'|',z.groups() if z else '-')

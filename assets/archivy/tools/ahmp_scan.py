#!/usr/bin/env python3
"""AHMP Praha: ahmp_scan.py XID SNIMEK OUT.jpg [zmenseni] [x0,y0,x1,y1].
Používá pozorovanou URL obrázku z veřejného katalogu, společný Zoomify modul a cache.
"""
import os,re,sys,urllib.request,urllib.parse,hashlib
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import slusne,cache,soal_zoomify
from archive_common import safe_key

def main():
    if len(sys.argv)<4 or sys.argv[1] in ('-h','--help'):print(__doc__);return 0
    xid=safe_key(sys.argv[1]);n=int(sys.argv[2]);out=sys.argv[3]
    red=int(sys.argv[4]) if len(sys.argv)>4 else 0
    box=[float(x) for x in sys.argv[5].split(',')] if len(sys.argv)>5 else None
    if n<1 or red<0 or red>20:raise ValueError('Snímek kladný, zmenšení 0–20.')
    if box and (len(box)!=4 or not(0<=box[0]<box[2]<=1 and 0<=box[1]<box[3]<=1)):raise ValueError('Výřez musí být x0,y0,x1,y1 v rozsahu 0–1.')
    ref=f'https://katalog.ahmp.cz/pragapublica/permalink?xid={xid}&scan={n}'
    def download(target):
        req=urllib.request.Request(ref,headers={'User-Agent':'rodova-pamet/1.0 genealogy-research'})
        with urllib.request.urlopen(req,timeout=60) as response:page=response.read().decode('utf-8','replace')
        match=re.search(r'zoomifyImgPath = "([^"]+)"',page)
        if not match:raise ValueError('Katalog neposkytl cestu Zoomify, nic se nehádá.')
        path=urllib.parse.urljoin(ref,match.group(1));url=urllib.parse.urlsplit(path)
        if url.scheme!='https' or not(url.hostname=='ahmp.cz' or (url.hostname or '').endswith('.ahmp.cz')):
            raise ValueError('Neočekávaný hostitel obrázku AHMP.')
        soal_zoomify.download(path,red,target,box)
    key=f'ahmp/{xid}/sn{n:04d}-u{red}-{hashlib.sha256(str(box).encode()).hexdigest()[:16]}.jpg'
    cache.soubor(key,out,download);print(out,'odkaz:',ref);return 0

if __name__=='__main__':sys.exit(main())

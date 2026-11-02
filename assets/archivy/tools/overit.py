#!/usr/bin/env python3
"""Ověřovací výřezy z originálu. overit.py SNIMEK x0,y0,x1,y1 PREFIX [v]
Souřadnice jsou zlomky 0–1. v dělí shora dolů, jinak zleva doprava.
Nástroj jen připraví podklady pro čtení; úspěch výřezu neověřuje genealogické tvrzení.
"""
import os,sys,subprocess
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from obraz import magick

def main():
    if len(sys.argv)<4 or sys.argv[1] in ('-h','--help'):print(__doc__);return 0
    src,box,prefix=sys.argv[1:4];mode=sys.argv[4] if len(sys.argv)>4 else 'h'
    x0,y0,x1,y1=map(float,box.split(','))
    if not (0<=x0<x1<=1 and 0<=y0<y1<=1):raise ValueError('Souřadnice musí být zlomky 0–1, ne pixely.')
    if mode not in ('v','h'):raise ValueError('Směr musí být h nebo v.')
    cmd=magick();w,h=map(int,subprocess.run([cmd,src+'[0]','-format','%w %h','info:'],check=True,capture_output=True,text=True).stdout.split())
    if mode=='v':mid=(y0+y1)/2;pad=min(.02,(y1-y0)/4);parts=[(x0,y0,x1,mid+pad),(x0,mid-pad,x1,y1)]
    else:mid=(x0+x1)/2;pad=min(.02,(x1-x0)/4);parts=[(x0,y0,mid+pad,y1),(mid-pad,y0,x1,y1)]
    for i,(a,b,c,d) in enumerate(parts):
        out=f'{prefix}_{i}.jpg'
        if os.path.islink(out):raise ValueError('Výstup nesmí být symlink.')
        os.makedirs(os.path.dirname(os.path.abspath(out)),exist_ok=True)
        subprocess.run([cmd,src,'-crop',f'{max(1,round((c-a)*w))}x{max(1,round((d-b)*h))}+{round(a*w)}+{round(b*h)}','+repage','-resize','1900x1900>',out],check=True)
        if not os.path.isfile(out) or not os.path.getsize(out):raise OSError('Výřez nebyl vytvořen.')
        print(out)
    return 0

if __name__=='__main__':sys.exit(main())

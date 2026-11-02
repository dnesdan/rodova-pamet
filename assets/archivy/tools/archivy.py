#!/usr/bin/env python3
"""Archivní nástroje Rodové paměti: seznam | napoveda NAZEV | spust NAZEV [argumenty].
Spouštěj z pracovní složky projektu. Katalogové kandidáty připoj k důkazům až po kontrole.
"""
import ast,json,os,pathlib,shutil,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parent
TOOLS={
'aron_search':'aron_search.py','aron_img':'aron_img.py','trebon':'trebon.py','portafontium':'portafontium.py','ebadatelna':'ebadatelna.py',
'ahmp_search':'ahmp_search.sh','ahmp_scan':'ahmp_scan.py','policie_prihlasky':'policie_prihlasky.py','soal_zoomify':'soal_zoomify.py',
'mza':'mza.py','litomerice':'litomerice.py','vademecum':'vademecum.py','matricula':'matricula.py','matricula_snimek':'matricula_snimek.cjs',
'anno':'anno.py','anno_snap':'anno_snap.py','kramerius':'kramerius.py','brno_encyklopedie':'brno_encyklopedie.py',
'vezni':'vezni.py','arolsen':'arolsen.py','mauthausen':'mauthausen.py','obeti':'obeti.py',
'vyrez':'vyrez.py','overit':'overit.py','ramecek':'ramecek.py','ftb_export':'ftb_export.py','slusne':'slusne.py'}

def main():
    args=sys.argv[1:]
    if not args or args[0] in ('-h','--help'):print(__doc__);return 0
    if args==['seznam']:
        for name,filename in TOOLS.items():print(name,filename,sep='\t')
        return 0
    if len(args)<2 or args[1] not in TOOLS:raise ValueError('Neznámý nástroj; použij seznam.')
    file=HERE/TOOLS[args[1]]
    if args[0]=='napoveda':
        text=file.read_text(encoding='utf-8')
        doc=ast.get_docstring(ast.parse(text)) if file.suffix=='.py' else None
        print(doc or '\n'.join(text.splitlines()[:24]));return 0
    if args[0]!='spust':raise ValueError('Použij seznam, napoveda nebo spust.')
    if file.suffix=='.py':command=[sys.executable,'-I','-X','utf8',str(file)]
    elif file.suffix=='.sh':command=[shutil.which('bash') or 'bash',str(file)]
    else:command=[shutil.which('node') or 'node',str(file)]
    return subprocess.run(command+args[2:]).returncode

if __name__=='__main__':
    try:sys.exit(main())
    except (OSError,ValueError) as e:print(str(e),file=sys.stderr);sys.exit(2)

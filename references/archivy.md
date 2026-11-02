# Archivní sada: směrování a použití

Obsah: vstup · pokrytí · evidence · praktické reference · ověření.

## Jednotný vstup

Z kořene rodinného projektu používat kopii `archivy/tools/archivy.py`; přímo ze skillu lze použít absolutní cestu `assets/archivy/tools/archivy.py`. Pracovní kořen lze explicitně určit `RODOVA_PROJECT`. Nikdy nestahovat rodinné podklady do nainstalovaného skillu.

```text
python -I <skill>/assets/archivy/tools/archivy.py seznam
python -I <skill>/assets/archivy/tools/archivy.py napoveda ebadatelna
python -I <skill>/assets/archivy/tools/archivy.py spust ebadatelna matriky "Obec"
```

`napoveda` čte dokumentaci bez spuštění síťového adaptéru. Oproti nahodilému `--help` je bezpečná i u starších nástrojů. Přesné argumenty převzít z této nápovědy; netipovat přepínače podle jiného archivu. Python `-I` omezuje vliv lokálních modulů a prostředí, nikoli přístupová práva OS.

## Pokrytí

| Oblast / účel | Příkazy |
|---|---|
| ARON | `aron_search`, `aron_img` |
| Třeboň, Porta fontium, eBadatelna Praha | `trebon`, `portafontium`, `ebadatelna` |
| Praha AHMP a pobytové přihlášky | `ahmp_search`, `ahmp_scan`, `policie_prihlasky` |
| MZA, Litoměřice, Zoomify a Opava | `mza`, `litomerice`, `soal_zoomify`; Opava vyžaduje katalogovou orientaci v povoleném prohlížeči |
| Národní archiv a židovské matriky | `vademecum` |
| Matricula | `matricula`, `matricula_snimek` s podporovaným prohlížečem |
| Tisk a biografické stopy | `anno`, `anno_snap`, `kramerius`, `brno_encyklopedie` |
| Válečné osudy | `vezni`, `arolsen`, `mauthausen`, `obeti` |
| Obrazy | `vyrez`, `overit`, `ramecek` |
| Import FTB, síťový stav | `ftb_export`, `slusne` |

Jde o 27 vstupních příkazů, nikoli 27 garantovaně dostupných archivů. Síťové API/HTML a přístupnost se mění. Archiv určit podle konkrétní obce, období a původce, ne pouze podle současného kraje. MZA neobsahuje automaticky celé Slezsko a severní Moravu.

## Napojení na genealogická data

Katalogové příkazy poskytují kandidáta s `reviewStatus: unverified`; neprovádějí automatický zápis do `genealogy.json`. Knihu převést do `registers.json` až po kontrole území, typu a rozsahu. Nalezený index se nestává osobou ani rodičovským vztahem.

Stažený obraz uložit do projektu, otevřít, uchovat celý originál a teprve potom vytvářet výřezy. Po dokončení zapsat source/claim/event/relationship dávkou. Oříznutí nebo zvýraznění musí mít odkaz a souřadnice vůči uloženému originálu. Nástroj `overit` ověřuje obrazové soubory, nikoli historickou pravdivost přepisu.

## Podrobné znalosti

- [Portály, přesné příkazy, cache a známé pasti](../assets/archivy/reference/portaly.md): TILE odkazy ARON; okrajové dlaždice Třeboň; indexy po obcích; HTTP/2 MZA; správné URL Opavy; VadeMeCum; Matricula; časové limity.
- [Archivní metodika](../assets/archivy/reference/metodika.md): zadání čtenářům, důkazní balíček, vedlejší nálezy a checkpoint.
- [Další prameny a příběhy](../assets/archivy/reference/prameny-a-pribehy.md): vrchnostenské písemnosti, zemské desky, mlýny, dům, převody a vyprávění.
- [FTB import](../assets/archivy/reference/import-ftb.md): citace po jednotlivých faktech a omezení převodu.

Tyto reference jsou aktualizovanou syntézou licencovaných částí Rodokmenu a relevantních PR. Neobsahují nelicencovaný playbook. Přesný per-file původ je v `assets/archivy/PROVENANCE.json`.

## Šetrnost a ověření

Jeden stahující pracovník na archiv; sdílet cache mezi čtenáři. Limity nástroje nejsou povolením instituce. Neobcházet zákaz, CAPTCHA, uzamčený účet ani síťové omezení prostředí. Zjištěnou blokaci neřešit vypínáním TLS nebo resetem brzdy. Místní chybu proxy zaznamenat odděleně.

Lokální testy pokrývají vybrané parsování, ořez, skládání, cache, zámky, blokace a export citací. Neprokazují živou funkčnost každého portálu. Při konkrétní práci nejprve ověřit jeden potřebný katalogový záznam a obraz. Zapsat skutečný rozsah živé kontroly; neslibovat plošné pokrytí bez provedené rešerše.

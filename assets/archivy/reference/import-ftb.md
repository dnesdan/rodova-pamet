# Zálohy FTB a přenos dat

`ftb_export.py` je čtecí adaptér pro zálohu SQLite z MyHeritage Family Tree Builder.
Není přihlášením k MyHeritage a nic na cizí účet neposílá.

```bash
python3 -I SKILL_DIR/assets/archivy/tools/archivy.py spust ftb_export dokumenty/strom.ftb pracovni/strom.ged
```

Vznikne pracovní GEDCOM a `strom.ged.provenance.json`. Druhý soubor zachovává vytěžené osoby, rodiny, fakta, poznámky,
metadata médií a strukturované `citation_details` včetně `source_id`, `title`, `author`, `page`, `entity_id`, `item_type`, `person_id`.
Před importem do hlavního projektu je čti společně. Samotný GEDCOM této cesty nepřenáší plně citace na jednotlivá fakta.

## Zachování původu

- Původní `.ftb` a složka Photos jsou soukromé originály; nepracuj pouze s exportem. Neprováděj dotazy na živé rodinné účty bez potřeby úlohy.
- Databáze se otevírá read-only; adaptér není obecný čteč všech verzí FTB a neočekávané tabulky se nesmějí odhadovat.
- Používej dokončenou zálohu, nikoli běžící databázi s nedopsaným WAL; režim immutable předpokládá stabilní kopii.
- Existence citace v cizím stromu neznamená, že jsi dokument přečetla. Smart Match je vodítko, nikoli automaticky potvrzené tvrzení.
- Při shodných jménech vybírej podle stabilního ID a dalšího kontextu. Datum i místo může patřit jinému páru ze stejného domu.
- Smazané osoby se nepřenášejí jako neexistující odkazy v rodinách (oprava upstream PR #7).
- Pracovní přehled přímé linie je omezený pohled: více rodičovských rodin a opakované pozice nepředstavuje jako úplný biologický rodokmen.
- Párování fotografie podle velikosti souboru je pouze kandidát; ověř její obsah a metadata.

## Soukromí a ztráty

FTB adaptér filtruje známá kontaktní pole (ADDR, EMAIL, PHON a obdobná), **neanonymizuje volný text**.
Poznámky mohou stále obsahovat adresy, e-maily, citlivé osudy i žijící osoby. Příznak `is_alive` z této databázové cesty se nepovažuje za spolehlivý.
Oba výstupy jsou soukromé pracovní soubory, nikoli publikovaná rodinná edice.

Při dalším převodu uchovej původní ID, přibližná data, typ rodičovství, všechny svazky, vazby na zdroje a chyby importu.
Položky, pro které nový model nemá přímé pole, patří do konkrétního reportu nezachovaných údajů nebo připojeného originálu;
nevynechávej je tiše. Zálohu neoznačuj jako bezeztrátový GEDCOM round-trip.

## Podporované a nepodporované vstupy

GEDCOM import a bezpečné načítání starého `osoby.py` zajišťují hlavní nástroje Rodové paměti.
Tento balíček záměrně neobsahuje původní `ged_import.py` s neomezeným cyklickým průchodem ani `export_web.py` spouštějící datový Python.
GenoPro `.gno` je v komunitních hlášeních popsané jako ZIP/XML, zde však nemá ověřený převodník; originál nejdřív prohlédni a před převodem otestuj vztahy a chybějící pole.

# Původ, všechny PR a postup aktualizace

Obsah: rozsah auditu · rozhodnutí o PR · Paměť rodu · lokální opravy · aktualizace · omezení.

## Rozsah auditu

Ověřeno 2. listopadu 2026. Rodokmen: main `2b657135f9dbe6843cc7515883252ad799fb40c9`, 25 PR (21 otevřených, 4 sloučené, 0 zavřených bez merge), 38 samostatných issues. Prohlédnuty celé dostupné diffy, popisy a diskuse, nejen názvy. Tag v0.6.0 ukazuje na jiné SHA; pro reprodukci používat commit. Paměť rodu: main `d40b6512efb247859773f4cd4e273a1299d26f22`, 0 PR, 0 issues, 11 commitů, 160 souborů sledovaných Gitem.

Inventáře byly získány s `state=all`, stránkováním a kontrolou konce seznamu. Přesné SHA, změněné cesty, původ a rozhodnutí jsou v [pr-inventory.json](pr-inventory.json), [pamet-inventory.json](pamet-inventory.json), [manifestu](../upstream-manifest.json) a [archivním per-file manifestu](../assets/archivy/PROVENANCE.json).

## Rozhodnutí o každém PR Rodokmenu

„Zahrnuto do auditu“ neznamená bezvýhradné sloučení kódu. Rozporné implementace a starší větve byly posouzeny vůči jednotnému datovému modelu a síťové brzdě.

| PR | Stav při auditu | Zpracování | Výsledek |
|---|---|---|---|
| [#2](https://github.com/sarsonj/rodokmen-skill/pull/2) | sloučený | Zachováno z main | Windows/UTF-8, Porta fontium, eBadatelna, FTB a základní opravy bezpečného zápisu již patří do main; archivní části zachovány a upraveny. Astro šablona nepřevzata. |
| [#7](https://github.com/sarsonj/rodokmen-skill/pull/7) | sloučený | Zachováno z main | FTB odkazy na odstraněné osoby jsou opravené v main; zachováno. Nový provenance sidecar navíc uchovává zdrojové citace a stránky. |
| [#8](https://github.com/sarsonj/rodokmen-skill/pull/8) | sloučený | Zachováno z main | Správné párování snímků/permalinků Porta fontium a kontrola výřezů zachovány. Centrální stopka má přednost před starší automatickou opakovací logikou pro 429/503. |
| [#10](https://github.com/sarsonj/rodokmen-skill/pull/10) | sloučený | Alternativní řešení | Převzat princip zálohy a oddělení dat; nový inicializátor odmítá přepsání a transakční koordinátor uchovává stav před/po. Starý Astro updater není kompatibilní. |
| [#13](https://github.com/sarsonj/rodokmen-skill/pull/13) | otevřený | Alternativní řešení | Celý graf rodiny, sourozence, více partnerství a oddělené komponenty řeší převzatý full-tree modul Paměti rodu. Alternativní osoby.py/RODINA se nezavádí. |
| [#19](https://github.com/sarsonj/rodokmen-skill/pull/19) | otevřený | Metodika / část funkce | Převzaty znalosti o statistikách, původních jménech a historii domů. Statistiky/místopis existují v aplikaci; samostatná Astro stránka Domy a její odhadové párování nejsou převedeny. |
| [#20](https://github.com/sarsonj/rodokmen-skill/pull/20) | otevřený | Alternativní řešení | Alternativou je přibalený vývod a celý graf; konflikt s #13 vyřešen jednou databází. Přidán samostatný SVG vějíř. |
| [#22](https://github.com/sarsonj/rodokmen-skill/pull/22) | otevřený | Upravený kód | ARON odkaz vybírá TILE identifikátor ve správném DAO. Ručně sladěno s main, #29 a #60; chybějící či nejednoznačný TILE odmítá. Starý hromadný přepis osoby.py/svazky.json nebyl přidán. |
| [#23](https://github.com/sarsonj/rodokmen-skill/pull/23) | otevřený | Metodika / část funkce | Biografické směry a pramenné zásady zachovány. Automatický seznam významných osobností podle titulů se nepoužívá; samostatná původní stránka nepřevedena. |
| [#26](https://github.com/sarsonj/rodokmen-skill/pull/26) | otevřený | Nahrazeno | Nový frontmatter má citovaný description a prošel oficiálním validátorem skillů; stejný problém jako #59. |
| [#28](https://github.com/sarsonj/rodokmen-skill/pull/28) | otevřený | Upravená metodika | Převzaty principy malých dávek čtení, vedlejších stop a nekatolických pramenů. Odmítnuto souběžné stahování 6–8 pomocníky z jednoho archivu a neověřené univerzální sliby přesnosti/úspor. |
| [#29](https://github.com/sarsonj/rodokmen-skill/pull/29) | otevřený | Vybrané části upraveny | Přidány MZA, Litoměřice, VadeMeCum NA, Matricula, Brno, Arolsen, Terezín, Mauthausen a Holocaust.cz, sdílené obrazové funkce. Všechny nové síťové adaptéry doplněny společnou brzdou, protože větev vznikla před ní. Vynechány vlastní Astro/data změny, automatický síťový smoke test a obcházení browserových pravidel. |
| [#41](https://github.com/sarsonj/rodokmen-skill/pull/41) | otevřený | Metodika / část funkce | Zkušenosti s MZA, zaniklými místy a datováním výstupů zachovány. Nový projekt používá Node 22+, verze a changelog; původní LAN/Astro deployment není přenesen. |
| [#42](https://github.com/sarsonj/rodokmen-skill/pull/42) | otevřený | Alternativní řešení | Přenosný SKILL a projektové AGENTS s tenkým CLAUDE odkazem. Oprávnění hostitele ani model se automaticky nemění. |
| [#46](https://github.com/sarsonj/rodokmen-skill/pull/46) | otevřený | Upravená metodika | Oddělený přepis/interpretace, skutečný obraz, předání stavu, bezpečný AST import a revize GEDCOM; neprověřený import není důkaz. |
| [#47](https://github.com/sarsonj/rodokmen-skill/pull/47) | otevřený | Upravený kód | eBadatelna dostala srozumitelné chyby a cílené testy. Timeout/500 lze opakovat, 403/429/503 musí respektovat centrální stopku. Opavské URL se berou ze skutečného záznamu, žádné hádání. Staré tvrzení, že MZA nemá nástroj, nahrazeno novým adaptérem. |
| [#48](https://github.com/sarsonj/rodokmen-skill/pull/48) | otevřený | Upravený kód | Třeboň skládá nestejně velké krajní dlaždice vlevo nahoru bez vnitřních mezer; spojeno s cache #60. Prázdný rejstřík se nehlásí jako prokázané nenalezení. Zachován skutečný obrazový test 7×5. |
| [#49](https://github.com/sarsonj/rodokmen-skill/pull/49) | otevřený | Alternativní řešení | Převzata zásada více příběhů pro jednotlivé osoby/pár a větve, rodinné texty a knižní výstupy. Samostatný správce markdownových článků a Astro routy z PR nejsou implementovány. |
| [#52](https://github.com/sarsonj/rodokmen-skill/pull/52) | otevřený | Alternativní řešení | Společné AGENTS a klientově neutrální postup. Skutečně potřebná verze Node 22+ a kontrola prostředí; původní Cursor/Astro setup nepřevzat. |
| [#53](https://github.com/sarsonj/rodokmen-skill/pull/53) | otevřený | Upravený kód | Převzaty Windows CRLF, BASH_ENV, souběh vláken, podprocesy a stupňované stopky. Doplněna kontrola stopky po čekání, srozumitelná nejistá příčina a most pro Node. Klientský hook nepřibalen: samotný PR uvádí selhání Windows hookových testů. |
| [#55](https://github.com/sarsonj/rodokmen-skill/pull/55) | otevřený | Odloženo | Nově vytvořen čitelný SVG vějíř s dynamickým viewBoxem. GPU/canvas optimalizace původní Astro stránky je odložena; neprohlašujeme ji za přenesenou. |
| [#56](https://github.com/sarsonj/rodokmen-skill/pull/56) | otevřený | Jiný způsob provozu | Nginx/CapRover oprava zůstává zdokumentována, ale nový výchozí offline provoz nginx nepoužívá. |
| [#59](https://github.com/sarsonj/rodokmen-skill/pull/59) | otevřený | Duplicita | Duplicitní YAML oprava #26 je splněna validovaným novým frontmatter. |
| [#60](https://github.com/sarsonj/rodokmen-skill/pull/60) | otevřený | Přepracovaný kód | Cache zapojena do ARON, AHMP, Třeboně, Porta fontium, eBadatelny a Zoomify. Jádro přepsáno: zámek vláken i procesů pro jediný fetch, unikátní dočasné soubory, bezpečné klíče, atomické dokončení a úklid i při SystemExit. Řeší závody původního PID temp souboru. |
| [#62](https://github.com/sarsonj/rodokmen-skill/pull/62) | otevřený | Upravená metodika | Rozšířeny gruntovní, pozemkové, sirotčí, svatební a vrchnostenské prameny i návaznost na dějiny domu. Jde o metodické směry s citováním, ne automaticky doložená příbuzenství. |

## Paměť rodu

Převzata offline aplikace a zkušenosti šesti dovedností: první spuštění, úvodní rozhovor, nový nález, zpracování rozhovoru, vydání a sdílení, kontrola soukromí. Součástí jsou schema, stabilní ID, tvrzení/prameny, dávky změn, graf, mapy, rodinné texty, kniha, dotazníky, audio, GEDCOM a historický místopis.

Zachováno 41 obecných historických událostí se zdroji, 126 skupin variant jmen a 242 mapových prvků. Nejde o nově potvrzená rodinná fakta; při použití historické položky zkontrolovat její zdroj. Všechny knihovní licence zůstávají přiložené.

## Lokální opravy nad oběma projekty

Jistota po jednotlivých tvrzeních; skutečné prohlédnutí obrazu; AST import bez exec; zachování zdrojových souborů i pracovních přepisů; SHA a report nepromítnutých polí; jednoznačná ID; cykly a opakované předky; jeden zapisující pracovník s transakční zálohou; vymezení živých/neznámých osob; filtrované alternativní datasety; bezpečné cesty a media URI; heslo nejméně 16 znaků; opravené zobrazení přepisů, překladů a pracovních poznámek; nový kompaktní SVG vějíř; správné matriční lhůty. GEDCOM navíc zachovává původní bajty, AST, stránkové citace, kvalifikátory dat a všechny rodičovské rodiny; nepovyšuje PEDI BIRTH na biologický důkaz a odmítá ztrátový export nejednoznačných rodičovských rodin.

Z issue #25 zohledněny problémy starých médií ve výstupu, kolizí slugů, cyklů, více rodin/adopce, ztracených citací FTB, falešné přesnosti dat, neanonymizovaného volného textu, nesprávného cropu, falešného úspěchu ImageMagicku, metrik osob vs pozic, právních lhůt a nepodložených příběhů. Podrobnosti a zbylé limity jsou v inventáři.

## Aktualizace

1. Přečíst přesné upstream SHA a lokální modifikace v manifestu. Načíst všechny nové PR včetně closed/merged a jejich diskuse, s úplným stránkováním. Sledovat změny, ne pouze release číslo.
2. Znovu ověřit licence včetně výjimek. Nelicencovaný playbook zůstává vyloučen; nově přidaná cizí data posoudit samostatně.
3. Porovnat konkrétní upravené soubory. Starší PR nepřepsat přes současnou brzdu/cache a opravy soukromí. Katalogové adaptéry nesmí zapisovat do genealogické databáze.
4. Použít izolovaný nový projekt/syntetické fixture. Ověřit dotčené parsování, bezpečné cesty, citace, kvalifikátory dat, rodičovské typy a renderer. Neprovádět plošný živý smoke test archivů.
5. Spustit základní validátor skillu a relevantní testy. Při změně workflow provést nezávislý průchod novým úkolem z původních podkladů bez předání očekávaných odpovědí.
6. Aktualizovat manifest, rozhodnutí o PR, licence a omezení. Vlastní rodinná data aktualizací nástrojů nikdy nepřepisovat. Bez pokynu neposílat issues, komentáře ani PR autorům.

## Meze ověření

Lokální regresní sady a skutečný převod historického projektu prošly; importní originály byly porovnány SHA-256. Vizuální kontrola v místním prohlížeči nebyla dokončena, protože automatické schválení odmítlo eskalovaný přístup k runtime Playwright; nedošlo k obcházení. XML a renderery byly kontrolovány programově.

Nebyly plošně živě ověřeny všechny portály, Windows/macOS, aktuální FTB varianty, skutečný Whisper/TTS ani PDF/A. To nejsou potvrzené chyby, ale meze provedených testů. Rodinné vydání není automatická anonymizace. Vějíř s více než dvěma rodiči či konfliktními rolemi vyžaduje obecný graf a vědomé rozhodnutí, nikoli tichý výběr prvních dvou.

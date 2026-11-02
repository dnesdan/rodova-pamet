# Rodová paměť

Český skill pro genealogický výzkum, rodinné vzpomínky a přenositelnou offline kroniku. Provede tě od prvních známých údajů přes matriky a další prameny až k rodokmenu, příběhům a předání výsledku rodině.

Spojuje archivní nástroje a zkušenosti projektu [Rodokmen](https://github.com/sarsonj/rodokmen-skill) s datovým modelem a aplikací [Paměť rodu](https://github.com/thejanhromek/pamet-rodu). Zachovává jejich autorství a licence a přidává vlastní integrační vrstvu, opravy a regresní testy.

**Verze 1.0.0 · výchozí zdroje a všechny dostupné PR prověřeny 2. listopadu 2026.**

## Co umí

| Oblast | Možnosti |
|---|---|
| Začátek a pokračování | Rodinný rozhovor, plán hledání, badatelský deník, uložený stav a další konkrétní krok. |
| Archivy | 27 příkazů pro katalogy, snímky, výřezy, kontrolu obrazu a importy; ARON, Třeboň, Porta fontium, eBadatelna, AHMP, MZA a další. |
| Důkazy | Originál, citace, doslovný přepis, překlad, jednotlivá tvrzení, rozpory a vysvětlení nejistoty. |
| Rodinné materiály | Fotografie, popisky, vyprávění, rozhovory, dotazníky a volitelné zpracování zvuku. |
| Výstupy | Offline HTML s profily, vývodem, celým rodinným grafem, mapou, časovou osou a prameny; samostatný SVG vějíř, kniha a GEDCOM. |
| Převody | Projekt Rodokmen, GEDCOM a pomocný export Family Tree Builderu; zachování vstupů a zprávy o omezeních. |
| Sdílení | Badatelské, rodinné a lehké vydání, kontrola obsahu podle publika a volitelné šifrované HTML. |

Jedním zdrojem rodinných dat je `src/data/genealogy.json` vytvořeného projektu. Převzatá data a rodinná sdělení se automaticky nepovažují za ověřené archivní závěry.

## Použití jako skill

Vstupem pro asistenta je [SKILL.md](SKILL.md). Instaluj nebo předej **celý repozitář**, protože průvodce používá také přibalené reference, skripty a šablonu aplikace.

Asistentovi, který umí instalovat skilly z repozitáře, můžeš zadat:

> Nainstaluj mi skill z https://github.com/dnesdan/rodova-pamet. Použij celý balík včetně referencí, skriptů a assets.

Potom například:

> Použij $rodova-pamet. Mám jména prarodičů, několik fotografií a vyprávění babičky. Zapiš výchozí údaje, připrav konkrétní plán hledání, zachovej všechny prameny a nejistoty a vytvoř první offline kroniku pro rodinu.

Nebo při pokračování:

> Použij $rodova-pamet. Bezpečně převezmi můj existující projekt Rodokmen. Zachovej originály a pracovní poznámky, ukaž rozpory a připrav badatelské i rodinné vydání.

Konkrétní způsob registrace skillu závisí na klientovi. Příkazy níže lze použít také samostatně bez instalace do asistenta.

## Rychlá místní ukázka

Základ potřebuje **Python 3.9+ a Node.js 22+**. Sestavení základního HTML používá přibalené knihovny a nepotřebuje `npm install` ani CDN. Obrazové, zvukové a PDF nástroje mají vlastní volitelné závislosti; jejich stav vypíše kontrola prostředí.

Z adresáře, do kterého chceš uložit repozitář i ukázkový projekt:

```bash
git clone https://github.com/dnesdan/rodova-pamet.git
python rodova-pamet/scripts/pamet.py doctor
python rodova-pamet/scripts/pamet.py init ukazkova-kronika --sample
cd ukazkova-kronika
node scripts/build.mjs --edition research
```

Na systému, kde se Python spouští jako `python3`, použij tento název příkazu. Otevři výsledný HTML soubor na cestě vypsané sestavením. Ukázková rodina je **vymyšlená a viditelně označená**.

Pro vlastní výzkum vytvoř prázdný projekt bez `--sample`:

```bash
python rodova-pamet/scripts/pamet.py init moje-kronika
```

Inicializátor odmítá přepsat existující projekt. Další postup popisuje [průvodce projektem](references/projekt.md).

## Hlavní pracovní postup

1. Zachytit výchozí sdělení a jeho původ.
2. Přiřadit osoby, jednotlivá tvrzení a výslovně doložené vztahy.
3. Vybrat konkrétní událost, obec, farnost a pramen pro hledání.
4. Prohlédnout skutečný snímek, oddělit přepis od překladu a závěru.
5. Připravit dávku změn, zkontrolovat náhled a teprve potom ji zapsat.
6. Sestavit kroniku, ověřit zobrazení pramenů a nejistot a uložit další krok.

Přibližná data zůstávají přibližná. Neznámí rodiče se nevymýšlejí. Opakovaný předek má jedno ID a může mít více pozic ve vývodu. U nejednoznačného rodičovství se nevybere první dvojice podle pořadí.

## Dokumentace

- [Projekt a prostředí](references/projekt.md)
- [Data, důkazy a dávky změn](references/data-a-dukazy.md)
- [Archivy a adaptéry](references/archivy.md)
- [Badatelská metodika](references/metodika.md)
- [Strategie pro slepé větve](references/strategie.md)
- [Importy a zachování původních dat](references/importy.md)
- [Rozhovory, fotografie a zvuk](references/rodinne-materialy.md)
- [Výstupy a soukromí](references/vystupy-a-soukromi.md)
- [Původ, rozhodnutí o všech PR a aktualizace](references/puvod-a-pr.md)

## Původ a rozsah převzatých dat

| Projekt | Prověřená revize | Rozsah auditu |
|---|---|---|
| Rodokmen | [`2b657135`](https://github.com/sarsonj/rodokmen-skill/tree/2b657135f9dbe6843cc7515883252ad799fb40c9) | Všech 25 PR: 21 otevřených a 4 sloučené; celé změny a dostupné diskuse, 38 samostatných issues. |
| Paměť rodu | [`d40b6512`](https://github.com/thejanhromek/pamet-rodu/tree/d40b6512efb247859773f4cd4e273a1299d26f22) | 160 souborů, 11 commitů, 6 původních dovedností; při auditu žádné PR ani issues. |

Všechny PR jsou zahrnuté v auditu; jejich kód není bezvýhradně sloučen. Alternativní implementace byly sjednoceny nad jedním datovým modelem. Původní Astro runtime, jeho GPU optimalizace vějíře, samostatné stránky Domy/Osobnosti a správce markdownových článků nejsou převzaté jako stejné části aplikace. Podrobné rozhodnutí o každém PR je v dokumentaci výše.

Zachováno je také 41 historických událostí se zdroji, 126 skupin variant jmen a 242 prvků mapového podkladu. Jsou to referenční pomůcky, nikoli důkazy o konkrétním předkovi; nebyly znovu historicky ověřovány položku po položce.

Strojově čitelné inventáře a kontrolní součty:

- [Manifest zdrojů a ověření](upstream-manifest.json)
- [Inventář PR](references/pr-inventory.json)
- [Audit Paměti rodu](references/pamet-inventory.json)
- [Soubory aplikace](references/kronika-files.json)
- [Původ archivních nástrojů](assets/archivy/PROVENANCE.json)

## Ověření

Při přípravě verze 1.0.0 prošlo 10 testů integračních Python nástrojů, 14 archivních regresí a 28 testovacích souborů aplikace se 156 deklarovanými scénáři. Ověřen byl skutečný GEDCOM import a náhled zápisu i migrace historického projektu se zachováním kontrolních součtů původních podkladů.

Z kořene tohoto repozitáře:

```bash
python scripts/test_pamet.py
cd assets/kronika
npm test
```

Testy se týkají například bezpečného importu, odkazů a cest, cyklů, souběžného zápisu, kvalifikátorů dat, rodičovských typů, zobrazení pramenů a SVG vějíře. Aktuální rozsah ověření je uveden v manifestu; existence adaptéru sama nezaručuje aktuální funkčnost vzdáleného portálu.

## Praktické meze

- **Rodinné vydání není automatickou anonymizací.** Před sdílením je potřeba posoudit také vložená data, přepisy a média.
- **HTML není úplná záloha projektu.** Pro pokračování uchovej také originály, importní archiv, deník a zdrojová data.
- GEDCOM export není bezeztrátový převod zpět. Nepodporované nebo nejednoznačné rodičovské kombinace odmítá s vysvětlením; originál zůstává zachovaný.
- Některé časové grafy používají zjednodušené čtení roku. Nevyhodnocují spolehlivě všechny intervaly ani jiné kalendáře; rozhodující je doslovný údaj a jeho nejistota.
- Živé fungování všech archivů, Windows/macOS, volitelné hlasové nástroje a PDF/A nebyly plošně ověřeny. Vizuální kontrola v prohlížeči při přípravě této verze nebyla dokončena; programové kontroly ji nenahrazují.

## Licence a autorství

Nová integrační vrstva je pod [MIT licencí](LICENSE). Převzaté části zachovávají původní licence a copyrighty včetně oznámení autorů obou výchozích projektů. Knihovny a referenční data mají vlastní podmínky, uvedené v [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Nelicencovaný `reference/playbook.md` z Rodokmenu není přibalen ani přepsán. Autoři původních projektů nejsou vydáváni za schvalovatele této odvozené verze.

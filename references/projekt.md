# Projekt a prostředí

Obsah: nový projekt · pokračování · existující Paměť rodu · soubory · změny a zotavení · dostupnost.

## Nový projekt

Spustit `python <skill>/scripts/pamet.py doctor`, potom `init <nová-složka>`. Bez jména vznikne prázdná kronika; se známým jménem přidat `--name`. Pro vymyšlenou ukázku samostatně `--sample`. Existující složku inicializátor odmítne. Nespouštět jej přes rodinná data. Nový projekt nemá připojený upstream ani veřejný vzdálený repozitář.

Python 3.9+ obsluhuje koordinátor a archivy. Offline aplikace vyžaduje Node 22+ a nemá npm závislosti. Obrazové nástroje mohou vyžadovat ImageMagick; na Windows rozlišit systémový `convert.exe` od ImageMagicku, použít skutečně nalezenou binárku `magick`. Vybrané adaptéry mají další volitelné závislosti popsané v archivním indexu. Instalaci knihoven provést izolovaně a až pro skutečně potřebný krok.

## Pokračování

Přečíst `research/STAV.md`, konec `research/research_log.jsonl`, `src/data/genealogy.json`, `.rodova-pamet.json` a `AGENTS.md`. Ověřit poslední otevřený úkol a aktuální revizi dat. Opravit přerušenou transakci před novým zápisem. Nepřepisovat jména ani ID podle nově odhadnutého roku.

## Existující Paměť rodu

Není třeba měnit datový model ani ID. Nejprve zazálohovat soukromý projekt a porovnat jeho runtime s připnutou verzí v manifestu. Nejbezpečnější modernizace: založit nový projekt, přenést vlastní `src/data/`, `assets/` a `research/` beze změny, ověřit schéma a odkazy, potom porovnat oba výstupy. Zachovat vlastní `family-edition.json`, doplňkové soubory a původní adresář. Nic automaticky neslučovat podle stejného jména. Přímé přepsání všech skriptů ve vlastním projektu použít jen po vědomém porovnání lokálních úprav.

Pro legacy Rodokmen použít samostatný převod v `references/importy.md`. Vytvoří nový projekt a zachová původní soubory.

## Uspořádání

| Cesta | Úloha |
|---|---|
| `src/data/genealogy.json` | Jediná autoritativní databáze |
| `gazetteer.json`, `registers.json`, `history-local.json`, `media-notes.json` vedle dat | Historický místopis, katalog knih, obecní dějiny, oblasti fotografií |
| `assets/original/` | Neměnné originály; nezaměňovat za upravené výřezy |
| `assets/source/`, `assets/optimized/` | Pracovní obrazy a náhledy |
| `assets/interviews/` | Nahrávky, přepisy, časové úryvky |
| `research/` | Soukromý stav, deník, importy, dávky a transakce |
| `archivy/tools/` | Specializované adaptéry se společnou brzdou |
| `dist/` | Generované výstupy; upravit vstup a znovu sestavit |

## Dávky a zotavení

Koordinátor `scripts/pamet.py apply` nejprve používá nativní validátor v režimu dry-run, potom vlastní kontrolu důkazů. Bez `--write` nic v rodinných datech nemění. Zápis zamkne projekt a uloží journal i verze před/po do `research/transactions/`. Každý JSON nahrazuje atomicky; více souborů chrání journal a návrat při běžné výjimce. Výpadek procesu mezi dvěma soubory nelze tvrdit jako jedinou atomickou transakci.

Při pádu: zkontrolovat, zda jiný proces stále zapisuje; přečíst `journal.json`, porovnat SHA a soubory `.before/.after`, určit dokončení nebo návrat celé dávky. Teprve poté odstranit zbylý zámek. Zámek neodemykat naslepo a dvě relace nikdy nenechat zapisovat současně. Nativní `apply-changes.mjs` zůstává dostupný pro kompatibilitu; pro běžný zápis používat koordinátor.

## Doručení a zálohy

Offline HTML otevřít přímo ze souboru. Cloudový náhled či stažení zařídit dostupnou službou prostředí; nezobrazovat localhost jako odkaz pro uživatele. Výsledky uložit trvale dle pravidel hostitele. Projekt a originály zálohovat soukromě; záloha pouze v gitu bez velkých fotografií a nahrávek není úplná. Nespouštět automatické veřejné zálohování ani odesílání zpráv.

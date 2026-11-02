# Výstupy, kniha, vějíř a soukromí

Obsah: vydání · kontrola · tisk a audio · sdílení · limity.

## Vydání ze stejných dat

| Výstup | Příkaz / použití |
|---|---|
| Badatelské HTML | `node scripts/build.mjs --edition research`; badatelská prezentace vložených dat, lokální editor, kontrola dat, výzkumná fronta |
| Rodinné HTML | `node scripts/build.mjs --edition family`; přehlednější texty bez pracovních úkolů/reasoning |
| Lehké HTML | `node scripts/build.mjs --edition light`; bez nahrávek, menší mapový podklad a obrazy |
| Samostatný vějíř | `node scripts/vejir.mjs --data src/data/genealogy.json --output dist/vejir.svg` |
| Kniha | `node scripts/build-book.mjs`; volitelně `--person`, `--partner`, PDF podle dostupné tiskové závislosti |
| Dotazník | `node scripts/questionnaire.mjs --person <id>` |
| Audiokniha | `node scripts/build-audiobook.mjs`; podle skutečně dostupného hlasového runtime |
| GEDCOM | `node scripts/gedcom.mjs export --living private` |

Offline aplikace má vložené knihovny a mapový vektorový podklad, funguje z file:// bez serveru. Webová dlaždicová mapa není potřebná pro základní mapu. Dvě prezentace rodokmenu jsou vývod a celý graf s partnery/vedlejšími větvemi. Vějíř je doplňkový SVG výstup, nejvýše deset generací pro čitelnost; neznámá místa zůstávají prázdná, čísla jsou pozice, ne počet jedinečných lidí.

Samostatné HTML obsahuje vybraná data a média pro prohlížení. Nenahrazuje celý projekt: původní soubory, importní archivy, úplný deník, transakční zálohy a některá vlastní pole zůstávají mimo něj. Pro pokračování a úplné uchování předat také projektový balík podle zadání; soukromé podklady se nestávají veřejnou přílohou automaticky.

Úplné přepínače a podporované tiskové/hlasové systémy ověřit v hlavičce skriptu a `docs/navod.md`. Nepředstírat dostupnost PDF, audio či hostingu, pokud se nepodařily skutečně vytvořit. PDF/A netvrdit bez odpovídajícího validátoru.

## Kontrola výsledku

Validovat data a odkazy, poté vizuálně zkontrolovat hlavní stránku, malý i větší rodokmen, nejisté tvrzení, zdroj s obrazem, mapu a mobilní šířku. Při změnách runtime spustit `npm test` nebo explicitní `node --test tests/*.test.cjs tests/*.test.mjs`. Holé `node --test` může spustit i vizuální skript mimo sadu; používat definovaný vstup.

Pro finální soubor kontrolovat skutečně vložený `window.RK_DATA`, ne jen to, co je vidět na obrazovce. Vyzkoušet offline bez sítě. Pro vějíř kontrolovat malý vývod, opakované předky, nulové rodiče a skutečný rozsah SVG.

## Soukromí podle publika

Rodinné vydání **není automaticky anonymizované**. Žijící či možná žijící osoby, přepisy o nich, fotografie a kontakty posoudit podle konkrétního souhlasu a zamýšleného publika. Chybějící datum narození/úmrtí neznamená zesnulou osobu. Heuristika 120 let slouží jen konzervativnímu výběru, nevytváří údaj úmrtí.

Připravit schválený výběr do samostatného čistého výstupu. Prověřit JSON, volný text, zdroje, fotografie i jejich metadata, audio, jména souborů, mapové body, otázky a historii. Veřejné příjmení anonymizované osoby může uniknout v přepisu rodičova dokumentu. Nesmí se jen skrýt HTML karta.

Badatelské vydání, research/, surová DNA a importní archivy patří do soukromého prostoru. Výjimku pro odbornou spolupráci řešit konkrétním výběrem podle uživatelova zadání, ne plošným odesláním.

## Ochrana a publikování

`scripts/protect.mjs` vytváří šifrovaný HTML soubor, minimum 16 znaků; doporučit silnou frázi a předání jinou cestou. Neukládat heslo do gitu, deníku ani předávaného balíku a nevypisovat je do logu. Přesný způsob předání vstupu ověřit podle skriptu, preferovat interaktivní vstup/chráněný dočasný soubor před příkazovou historií.

Šifrování neřeší nevhodně vybraný obsah. Krátké rodinné heslo, klientská otázka, noindex nebo robots.txt nejsou účinnou náhradou soukromého hostingu. `publish-pages.mjs` má oddělený cíl a explicitní push; před nahráním musí existovat konkrétní náhled a autorizace v zadání. Vlastní data ani historii zdrojového projektu neposílat do veřejného repozitáře.

Předat uživateli vytvořený soubor nebo ověřenou URL; localhost nepovažovat za zveřejnění. Vždy pojmenovat skutečně dosažený stav (připravené, lokálně sestavené, nebo opravdu publikované).

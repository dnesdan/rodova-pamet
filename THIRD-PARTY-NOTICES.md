# Původ a licence

Rodová paměť je odvozená integrace dvou veřejných projektů a nově napsaného koordinátoru, metodiky, importéru a kontrol. Původní autoři nepřezkoumali ani neschválili tyto lokální změny; jejich jména nejsou tvrzením spoluautorství nových úprav.

## Rodokmen

- Projekt: https://github.com/sarsonj/rodokmen-skill
- Základ: `2b657135f9dbe6843cc7515883252ad799fb40c9`, vybrané změny veřejných PR podle manifestu.
- Copyright (c) 2026 Jindřich Šaršon; licence MIT, plné znění v `assets/archivy/LICENSE`.
- Původ jednotlivých nástrojů a lokální úpravy: `assets/archivy/PROVENANCE.json` a `references/pr-inventory.json`.
- `skills/rodokmen/reference/playbook.md` má výjimku z MIT a nebyl převzat. Nová metodika je vlastní syntéza primárních zdrojů uvedených v referenci.

## Paměť rodu / Rodová kronika

- Projekt: https://github.com/thejanhromek/pamet-rodu
- Základ: `d40b6512efb247859773f4cd4e273a1299d26f22`.
- Copyright (c) 2026 autor projektu Rodová kronika (https://janhromek.com); licence MIT, plné znění v `assets/kronika/LICENSE`.
- Změny v přibaleném runtime řeší důkazy, bezpečné cesty, soukromí vydání, import, verze závislostí a zobrazování podkladů. Viz manifest a audit PR.

## Přibalené knihovny a datové zdroje

- Leaflet: BSD-2-Clause; plný text `assets/kronika/src/vendor/leaflet-LICENSE.txt`.
- Leaflet.markercluster: MIT; plný text `assets/kronika/src/vendor/markercluster-LICENSE.txt`.
- ELK.js: EPL-2.0; beze změn, plný text `assets/kronika/src/vendor/elk-LICENSE.txt`. Zdrojový odkaz pro odpovídající verzi, copyright a manifest verzí jsou v `assets/kronika/docs/third-party-notices.md` a `assets/kronika/src/vendor/manifest.json`. Zachovat je při šíření výsledné aplikace.
- Natural Earth: public domain, vektorový mapový podklad. Zdroje/atribuce zachovány v manifestu a datech.
- Shared cM Project: CC BY 4.0, původní atribuce a odkaz zachovány v `assets/kronika/docs/third-party-notices.md` a DNA modulu. Rozsahy nejsou vypočítaná pravděpodobnost ani automatický důkaz příbuzenství.
- Obecné historické události a varianty jmen: zachovány s původními referencemi; nejsou nově ověřeny položku po položce. Při konkrétním tvrzení znovu otevřít uvedený zdroj.
- Ukázková rodina a ilustrace jsou smyšlená demonstrace; nejde o archivní obraz ani skutečný rodokmen.

Veřejná dostupnost archivního obrazu neuděluje automaticky právo dalšího zveřejnění. Při konkrétním výstupu uchovat citaci a respektovat podmínky instituce. Do tohoto skillu nejsou přibalena soukromá rodinná data uživatele.

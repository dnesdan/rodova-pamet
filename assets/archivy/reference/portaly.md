# Archivní nástroje a portály

## Obsah

- Spouštění a datový kontrakt
- Výběr portálu podle oblasti
- Přesné snímky, rejstříky a známé pasti
- Noviny, pobyt a válečné osudy
- Limity, souběh a cache
- Rozsah ověření a původ

## Spouštění a datový kontrakt

Tato sada doplňuje datový model Rodové paměti. Nezapisuje osoby do `genealogy.json` ani registry do `registers.json`.
Příkazy `svazek` vypíší JSON s `kind: archive-catalog-candidate`, `reviewStatus: unverified` a původním katalogovým popisem.
Nejdřív ověř správnou knihu, pak metadata převeď do canonical projektu. Katalogový popis není důkaz příbuzenství.

Spouštěj z kořene pracovního projektu. `RODOVA_PROJECT` může explicitně určit jiný pracovní kořen; adresář skillu není datový projekt.

```bash
python3 -I SKILL_DIR/assets/archivy/tools/archivy.py seznam
python3 -I SKILL_DIR/assets/archivy/tools/archivy.py napoveda trebon
python3 -I SKILL_DIR/assets/archivy/tools/archivy.py spust trebon misto "Třeboň"
```

Na Windows používej ověřený `python -I -X utf8` či `py -3 -I -X utf8`; shellový AHMP helper vyžaduje Git Bash.
Python alespoň 3.9, ImageMagick 7 (`magick`) nebo mimo Windows ImageMagick 6 (`convert`).
Matricula snímek navíc vyžaduje Node, Playwright a dostupný Chromium; jen v prostředí, kde je toto ovládání prohlížeče dovoleno.
Pokud prostředí nabízí vlastní prohlížečový nástroj, respektuj jeho předepsaný způsob práce.

## Výběr portálu podle oblasti

Oblast je začátek hledání, nikoli hranice historické farnosti či panství. Ověř vyznání, období, okres, německý název, filiálku a obec přímo v popisu knihy.

| Oblast / pramen | Veřejný vstup | Nástroj a běžný příkaz |
|---|---|---|
| Východní Čechy, SOA Zámrsk | https://aron.vychodoceskearchivy.cz/ | `aron_search "Obec"`, `aron_img APU info`, `aron_img APU link 20` |
| Jižní Čechy, SOA Třeboň | https://digi.ceskearchivy.cz/ | `trebon misto "Obec"`, `svazky ID`, `rejstrik KNIHA PÍSMENO`, `snimek KNIHA N OUT.jpg` |
| Západní Čechy, SOA Plzeň | https://www.portafontium.eu/ | `portafontium fara dolni-bela`, `info KNIHA`, `snimek KNIHA N OUT.jpg` |
| Střední Čechy, SOA Praha | https://ebadatelna.soapraha.cz/ | `ebadatelna hledat "Obec"`, `matriky "Obec"`, `info ID`, `snimek ID N OUT.jpg` |
| Praha, AHMP | https://katalog.ahmp.cz/pragapublica/ a https://digi.ahmp.cz/ | `ahmp_search "dotaz" [max-stran]`, `ahmp_scan XID N OUT.jpg` |
| Morava, MZA Brno | https://www.mza.cz/actapublica/ | `mza hledat "Obec" [další slovo] --stran 1`, `puvodce "Farnost"`, `info ID`, `snimek ID N OUT.jpg` |
| Severní Čechy, SOA Litoměřice | https://digi.soalitomerice.cz/digitalnibadatelna/ | `litomerice hledat "Obec"`, `info ID`, `snimek ID N OUT.jpg` |
| Slezsko a severní Morava, ZA Opava | https://digi.archives.cz/ | Knihu a skutečnou URL snímku zjisti povoleným prohlížečem; `soal_zoomify URL 0 OUT.jpg` jen pro přístupný snímek |
| Židovské matriky, Národní archiv | https://vademecum.nacr.cz/ | `vademecum hledat "Obec" --jen-snimky`, `info XID`, `snimek XID N OUT.jpg` |
| Rakousko, Vídeň a další katolické sbírky | https://data.matricula-online.eu/ | `matricula oblasti`, `fary oesterreich/wien`, `knihy CESTA`, `snimky CESTA` |

Pro zápis křtu, sňatku či úmrtí si ulož **číslo snímku i folio/paginu**, odkaz, signaturu, fond, archive, obec, druh a rozsah knihy.
U Třeboně příkaz `svazek` nerozpoznává automaticky fond nematriční knihy; připojí upozornění k ruční kontrole.

## Přesné snímky, rejstříky a známé pasti

### ARON

- Ke čtení použij úroveň `0`, ke hledání náhled `1` či `2`. Výřez tvoří zlomky `x0,y0,x1,y1`, např. `0,0,0.5,0.5`.
- Správný odkaz na konkrétní snímek používá **TILE** identifikátor ze správného DAO, nikoli PUBLISHED. Oprava vychází z PR #22; nástroj odmítne nejednoznačný výsledek.
- V jedné knize může být více digitálních objektů. Odkaz i snímek porovnej s vizuálním číslem v prohlížeči.
- Katalog i snímky mají cache. Přesný ořez po složení potřebných dlaždic zachovává žádané souřadnice; není jen zarovnaný na dlaždice.
- Chyba certifikátu je technický problém; nevypínej ověřování TLS.

### Třeboň

- Vyhledání místa může vrátit jinou stejnojmennou obec, okres či synagogu. Potvrď obec a okres.
- Knihy po vesnicích nemusí být ve výpisu malé osady; projdi seznam farnosti a skutečný obsah knihy.
- Dobrovolnický rejstřík není úplný fulltext. Prázdná odpověď může znamenat chybějící index, chybu parseru nebo nepokrytý oddíl.
- Rejstřík může být u každé obce či roku zvlášť, sňatky jen pod ženichy. Hledej obě příjmení a varianty.
- Originály a druhopisy mohou mít jiné řazení; kopie může obsahovat událost, kterou jsi v obecním oddílu minul.
- PR #48 opravuje skládání nestejně velkých okrajových dlaždic. Test opravdu kontroluje rozměr výsledného obrazu.
- Endpoint dobrovolnického rejstříku se upstreamu vracel i jako prázdná stránková šablona; online funkčnost není zde certifikovaná.

### Porta fontium a eBadatelna

- Porta fontium páruje permalink a snímek přímo z odkazu u náhledu. Neodvozuj jej pořadím nesouvisejících odkazů.
- Pro Porta fontium znát faru pomáhá, ale obec může být v knize sousední fary či pod historickým názvem. Katalogový fulltext je vhodná doplňková cesta.
- eBadatelna rozlišuje matriky `/d/ID/N` a archiválie `/a/ID/N`. Nástroj podporuje `a-info`, `a-snimek`, `a-svazek`.
- Kombinovaný index nemusí obsahovat všechny obce a celé časové období knihy.
- Číslo stránky se neshoduje trvale s pořadím snímku; zkontroluj vložené listy a začátky oddílů.
- Částečné přenosy a běžné technické výpadky nástroj pojmenuje. HTTP 403/429/503 zastaví společnou brzdu a nepřevádí se na automatické opakování.

### MZA a Litoměřice

- `mza hledat` může ukázat jen část knih. Ověř stránkování, samostatné obecní knihy, původce a katalogové části matriky. Žádný výsledek není důkaz nedochování.
- MZA obrazové požadavky využívají `curl --http2`. HTTP 426 je technický požadavek protokolu; pokud dostupný curl HTTP/2 neumí, skonči a použij povolený prohlížeč, nesnižuj ochrany.
- Litoměřice drží relaci hledání; `hledat` ukládá místní pracovní mapu ID → dotaz/pořadí. `--dotaz` pomůže obnovit kontext.
- `litomerice.py` prohledává matriky. Sčítání 1921 a civilní knihy mají odlišné katalogové typy: najdi je v katalogu, netvrď, že je pokrývá filtr matrik.
- Obrázkové servery podléhají společnému limitu stejně jako katalog. Nevydávej počty úspěšných dotazů z jednoho projektu za obecně bezpečný limit.

### Opava, VadeMeCum a Matricula

- URL snímku v Opavě ber jen ze skutečně otevřeného záznamu. UUID, podsložky a přístupové tokeny se nehádají.
- Ověřovací stránka, CAPTCHA či zákaz přístupu znamená zastavení, nikoli pokus jinou cestou.
- Židovské matriky HBMa/HBM patří do VadeMeCum NA; stará doména `badatelna.eu` není vhodný výchozí odkaz.
- Matricula navigace vychází z veřejných popisků. Snímek získává `.cjs` helper skutečným prohlížečem a ověří jeho název proti vybranému pořadí; nepřepočítává ochranný token.
- Staré shellové hromadné downloadery Matricula nejsou součástí nové sady. Jeden konkrétní potřebný snímek lze uložit běžným dovoleným postupem.

## Noviny, pobyt a válečné osudy

| Pramen | Nástroj | Co ověřit |
|---|---|---|
| Pražské policejní přihlášky | `policie_prihlasky`, `karta N OUT.jpg …` | Kartotéka může obsahovat manželku a děti na stejné kartě; vždy ověř obsah stažené karty proti zásahu, i nad první stránkou výsledků |
| Rakouské noviny ANNO | `anno`, `anno_snap` | OCR a hledací zásah jsou vodítko; cituj datum, titul, stranu a čti originál |
| Kramerius v5 | `kramerius 'SOLR_DOTAZ' [počet] --server HTTPS` | v7 API se liší; dostupnost metadat není oprávnění stáhnout chráněný obraz |
| Encyklopedie Brna | `brno_encyklopedie hledat "text"`, `detail typ:ID` | Biografická sekundární informace, ne úplná evidence obyvatel |
| Památník Terezín | `vezni hledat --prijmeni …`, `detail …` | Totožnost pomocí data, rodiště, vězeňského čísla a rodinných dokladů |
| Arolsen Archives | `arolsen hledat "jméno rok"`, `karta ID OUT.jpg` | Kandidát může mít více obrazů; podmínky užití ověř u instituce a cituj původní dokument |
| Mauthausen | `mauthausen hledat "text"` | Databáze zemřelých nezahrnuje automaticky přeživší |
| Holocaust.cz | `obeti hledat --prijmeni …`, `detail …` | Databázová karta a připojený dobový dokument mají odlišnou důkazní váhu |

Další směry: VÚA–VHA, Kriegsarchiv, legionářské databáze, Verlustlisten (`vll`) a Nachrichten über Verwundete (`nvv`) v ANNO,
obecní pomníky, domovské knihy a pobytové přihlášky. Ověř aktuální veřejnou adresu a dostupnost u instituce; tato sada nevydává nevyzkoušené endpointy za hotové adaptéry.

## Limity, souběh a cache

- Jeden pracující stahovač na archiv; více čtenářů sdílí již uložené snímky. Každý adaptér načítá `slusne.py`.
- Výchozí limit je 1 katalogový dotaz za 2 sekundy, nejvýše 10 obrazových požadavků za sekundu; Opava má pro dotazy 4 sekundy.
  Tyto limity jsou konzervativní nastavení nástroje, **ne záruka ani povolení archivu**. Zpomal podle podmínek a reakcí serveru.
- Stav je společný pro projekty ve stejném uživatelském prostředí. `SLUSNE_STAV` lze nastavit na společnou zapisovatelnou složku.
- 429/503, 403 katalogu, detekovaná blokovací stránka či opakované selhání spojení spustí stopku: 30 minut, podruhé 2 hodiny, potřetí 8 hodin za 24 hodin.
- Stopka neprokazuje přetížení: může jít o údržbu, přístupová práva nebo proxy. Zjisti příčinu z uložené chyby, neopakuj slepě a nepřepínej nástroje kvůli obcházení blokace.
- `slusne stav` jen vypíše stav. `odblokuj` použij jen po doložené místní chybě; není to běžný další krok po odmítnutí.
- Obal curl podporuje jednu přímou URL; explicitně odmítá paralelní/config/next režim. Hlídání je ohleduplnostní pomůcka, nikoli bezpečnostní izolace OS.
- Cache `RODOKMEN_SNIMKY` obsahuje materiály získané běžným přístupem. Per-key zámek sdílí vlákna i procesy, temp soubory jsou atomické a neúspěch se nekopíruje do cache.
- Cache soukromých rodinných dokladů se nesdílí napříč uživateli. Metadata portálu mohou zestárnout; při prokázané změně obnov konkrétní položku a zapiš důvod.

## Rozsah ověření a původ

Zdroj: `sarsonj/rodokmen-skill` commit `2b657135f9dbe6843cc7515883252ad799fb40c9`, 2. 11. 2026,
a vybrané změny PR #22, #29, #47, #48, #53, #60. Přesné head SHA a per-file původ jsou v `../PROVENANCE.json`.
Převzatá licence MIT je v `../LICENSE`; nelicencovaný `playbook.md` není součástí balíčku.

Ověřeno lokálně: syntaktické kontroly, přesný ořez ARON, Třeboň okrajové dlaždice, cache souběh a selhání,
TILE odkazy, izolace katalogových kandidátů, FTB provenance výstup a stopka ve společném stavu.
**Neověřeno plošně živě:** funkčnost všech dnešních portálových HTML/API, Windows/macOS chování upravené sady,
skutečný FTB formát všech verzí, Matricula Playwright a hromadné vyhledávání. Při každém použití ověř jeden konkrétní potřebný nález.

# Datový model a auditovatelný důkaz

Obsah: kontrakt · jistota · zdroj · tvrzení · zápis · deník · kontroly.

## Kontrakt

Autorita: `src/data/genealogy.json`. Úplný převzatý kontrakt je `assets/kronika/docs/data-contract.md`; schéma `assets/kronika/schema/kronika.schema.json`. Kořen obsahuje `meta` a kolekce se stabilními ID: `people, relationships, events, places, claims, sources, media, researchTasks, changelog`.

Vztah `parent-child` jde od rodiče `from` k dítěti `to`; partnerství nezakládá rodičovství. Sourozenci nemusí mít oba rodiče společné. Neznámé osoby nejsou položky databáze. Opakující se předek má jedno ID a více cest ve vývodu. Nevydávat ID odvozené ze jména za identifikaci totožnosti.

Typ rodičovství vést samostatně v `parentType`: například `biological`, `birth-recorded`, `adoptive`, `foster` či `unspecified`. Záznam o rodině při narození a neurčený typ nejsou automaticky biologickým vztahem. Původní rodinu a význam importovaného PEDI uchovat v metadatech. Více rodičovských rodin vyžaduje vyhodnocení; aplikace nesmí tvrdit biologickou příbuznost jen podle obecné rodičovské hrany.

Rozšíření Rodové paměti jsou běžná doplňková pole, která kompatibilní schéma toleruje. Nezahazovat je při přepisu nebo migraci.

## Jistota patří tvrzení

| evidence | Význam v tomto workflow |
|---|---|
| `verified` | Konkrétní vyhodnocený závěr s dohledatelným, osobně prohlédnutým obrazem a odůvodněním |
| `supported` | Podpořeno pramenem, ale chybí dostatečné vlastní ověření či vyřešení identity |
| `family-record` | Údaj připsaný rodinnému sdělení nebo dokumentu; míru spolehlivosti vysvětlit |
| `hypothesis` | Pracovní domněnka, neprověřený import, nevyřešený rozpor |

Původ pramene, znalost informátora a přímý/nepřímý/negativní důkaz jsou samostatné osy; vysvětlit je v `reasoning` a `assessment`. Ověřený zápis o narození dítěte nedělá z přibližného věku jeho otce přesné datum. Shodný opis a index téhož originálu nejsou nezávislé zdroje. `verified` není matematická jistota a program neumí ověřit správnost čtení.

## Úplný pramen

Příklad tvaru, **nikoli skutečný nález**; skutečné hodnoty vyplnit po ověření:

```json
{
  "id": "src-konkretni-zapis",
  "type": "parish-register",
  "title": "Archiv, fond, signatura, folio, zápis",
  "url": "https://example.org/konkretni-sken",
  "accessedAt": "2026-11-02",
  "locator": {
    "archive": "ověřený archiv",
    "collection": "fond nebo sbírka",
    "signature": "signatura",
    "book": "kniha, druh a roky",
    "folio": "19r",
    "scan": 20,
    "entry": "třetí zápis"
  },
  "provenance": {
    "kind": "digitized-original",
    "inspection": "not-reviewed",
    "independenceGroup": "puvodni-kniha-zapis"
  },
  "transcriptionLines": ["Doslovný text; [nečitelné]"],
  "translationLines": ["Oddělený český překlad"],
  "reliabilityNote": "Přesně vyjmenovat nejistá místa.",
  "originalFile": "assets/original/zapis.jpg",
  "sha256": "doplnit skutečný SHA-256",
  "boxes": [[0.05, 0.3, 0.95, 0.65]]
}
```

`inspection: image-read` nastavit jen po skutečném zobrazení a přečtení obrazu. Doplnit `reviewedAt` a `reviewedBy` podle reality. Nevyplňovat předem jména recenzentů nebo datum kontroly. Pro papírový dokument bez digitalizátu uchovat dostupnou citaci a konzervativní stav; chybějící snímek nevyrábět.

Rámeček používá `x1,y1,x2,y2` mezi 0–1 vůči původnímu obrazu; výřez i jeho rozměry musí odpovídat konkrétní uložené variantě. Původní celý snímek a odvozený výřez evidovat odděleně. `media.file` je cesta pod `assets/`, nikoli URL nebo cesta mimo projekt.

## Jednotlivé tvrzení a konflikt

Tvrzení má `id, subjectType, subjectId, text, evidence, sourceIds, reasoning`. Přidat `predicate` (např. birth-date, occupation, parentage), doslovnou `value`, případně `assessment: {directness, informant, uncertainty}`. Původní zápis zachovat v prameni, normalizaci používat pouze s vysvětlením.

Při konfliktu přidat další tvrzení; `contradictedBy` odkazuje na ID jiných tvrzení. Vyvrácené tvrzení označit `status: rejected`, nahrazené `status: superseded`, přijaté `status: accepted`, a ponechat odůvodnění i pramen. Prezentační vrstva nemusí tato rozšíření zobrazovat automaticky, proto rozpor vysvětlit také v textu a badatelském úkolu. Pole `birth/death` osoby používat jako vybraný souhrn, nikoli náhradu důkazů.

`date` používat jen pro skutečně podloženou přesnost YYYY / YYYY-MM / YYYY-MM-DD. `dateText` zachovává „asi“, interval, před/po a původní znění. Neodvozovat přesné datum ze zaokrouhleného věku při úmrtí.

Časová osa zobrazí události s pouhým `dateText` až za přesně datovanými; neumístí je přesně do skutečného intervalu. Filtr let a zobrazení životů používají zjednodušené čtení roku a nejsou kalendářním převodníkem. Pro intervaly a jiné kalendáře vycházet z doslovného data a odůvodnění, nikoli z geometrické polohy v grafu. Samotné `person.birth/death` nevytvoří řádek kolekce `events`.

## Dávka změn

`rk-changes/1` používá `ops` s `op: add|update|remove`, `file`, `collection`, `id` a `item` nebo `set`; úplný formát a preconditions v kontraktu. Nejprve připravit skutečný pramen; ukázkový example.org nesmí vstoupit do reálného důkazu.

```json
{
  "format": "rk-changes/1",
  "title": "Zapsání rodinného sdělení",
  "ops": [{
    "op": "add",
    "file": "genealogy",
    "collection": "sources",
    "id": "src-rozhovor-01",
    "item": {
      "id": "src-rozhovor-01",
      "type": "oral-history",
      "title": "Rozhovor — skutečně doplnit autora a datum",
      "transcriptionLines": ["Vložit doslovné sdělení uživatele."],
      "reliabilityNote": "Rodinné vyprávění; není archivně ověřeno."
    }
  }]
}
```

Příklady slouží pro strukturu. Náhled a zápis provést pomocí `pamet.py apply`. U velkých importů nejprve rozdělit kandidáty a konflikty, nikoli přeskočit kontrolu.

### První úplný nález v kronice

Ukázková dávka výše zakládá pouze pramen. Pro skutečný výsledek ji doplnit podle obsahu sdělení; nepovažovat uložení textu za dokončené zpracování.

1. Založit pramen s doslovnou citací a skutečným informátorem, datem a podmínkami, pokud jsou známé.
2. Přiřadit existující ID osob. Novou osobu vytvořit jen pro skutečně uvedeného člověka; neznámou totožnost zapsat jako úkol. Osobu založenou inicializátorem nepřidávat znovu.
3. Každý použitý údaj zapsat jako samostatné tvrzení se `sourceIds`, `family-record` a vysvětlením původu. Výslovně sdělený rodičovský vztah přidat s původem a `parentType: unspecified`, dokud druh vztahu není doložen. Nejednoznačný význam „babička“ nepřevést automaticky na novou rodičovskou hranu.
4. Zvolené souhrnné údaje promítnout do profilu osoby (`birth`, `death`, `occupations` atd.) a podstatnou událost do `events`; obojí odkázat na pramen. Například „narodila se asi roku 1930“ znamená `birth.dateText: "asi 1930"` a událost narození s týmž `dateText`, bez přesného `date`. Přibližnost zachovat i při řazení na časové ose.
5. Ověřit náhled dávky, zapsat ji, provést kontrolu dat a sestavit badatelské HTML. Otevřít profil, událost a pramen; zkontrolovat, že je vidět údaj, jeho rodinný původ a nejistota. Prázdná časová osa po pouhém uložení rozhovoru není dokončený výsledek.

Při nedostatku údajů lze vytvořit užitečný profil s citovanou vzpomínkou a další otázkou; chybějící data a události se nedoplňují odhadem.

## Deník

Soubor vstupu pro `pamet.py log` obsahuje `question, repository, source, range, method, result, nextAction`; `result` je found/not-found/partial/blocked. Doplnit varianty jména, mezery, index versus hlavní kniha, přesná folia/snímky a relevantní citace. Zdokumentovat i údajně „prázdný“ rozsah. Vlastní limit vyhledávače nevydávat za nedochovaný archivní pramen.

## Kontroly

`pamet.py check` kontroluje stabilní ID, odkazy, cykly, rámečky, média, SHA a auditní minimum tvrzení. `--strict-evidence` převádí chybějící oporu verified na chybu. Nativní schéma a věrohodnost kontroluje aplikace při build/dávce. Strojová kontrola neprokazuje, že příjmení bylo přečteno správně nebo že osoby jsou totožné. Neznámé vlastní pole se při převodu zachová.

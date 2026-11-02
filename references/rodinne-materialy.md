# Rozhovory, fotografie, dokumenty a zvuk

Obsah: rozhovor · fotografie · nahrávka · vytěžení · příběh · podrobné návody.

## Rozhovor

Navázat na známé údaje, ptát se po jedné až dvou otázkách. Nejprve kdo a kde, potom konkrétní vzpomínky: domácnost, škola, práce, svatba, přesun, předměty a fotografie. Rozlišit vlastní vzpomínku od „maminka říkala“. Zapsat autora, datum, jazyk, souvislosti a podmínky použití. Rozhovor nemusí být zaznamenaný zvukem, pokud uživatel dodal text.

Příbuznému lze připravit dotazník `node scripts/questionnaire.mjs --person <id>`; PDF vyžaduje podporovaný tiskový runtime. Vzory: `assets/kronika/docs/dotaznik-pro-pametniky.md` a `souhlas-s-nahravanim.md`. Předkládat je podle potřeby, ne jako povinnou překážku běžného zpracování uživatelem dodaného textu.

## Fotografie a písemnosti

Uchovat originál a původní název v evidenci. Zapsat vlastníka, autora, datum/interval, text rubu, osoby, místo, zdroj určení a co je nejisté. Příbuznost neodvozovat z podobnosti obličeje. Číslo na rubu nemusí být rok. OCR či automatická datace jsou pracovní pomůcky.

`media-notes.json` obsahuje oblasti `face|text` s `x,y,w,h` v0–1; to je jiný tvar než rámeček archivního pramene `x1,y1,x2,y2`. Neznámou tvář ponechat bez personId. Před vytvořením náhledu či ořezu zkontrolovat natočení obrazu. Neupravovat originál; popisky a odvozené náhledy vést odděleně.

## Zvuk a video

1. `node scripts/import-interview.mjs <id> <soubor...>` vytvoří pracovní audio pomocí ffmpeg; originál zůstává.
2. Vyplnit `assets/interviews/<id>/prompt.txt` ověřenými jmény a obcemi jako slovníkem, nikoli jako očekávanými větami.
3. Lokální přepis: `python scripts/transcribe.py assets/interviews/<id>` v izolovaném prostředí s faster-whisper. První získání modelu může potřebovat internet; samotný lokální přepis neodesílá rodinný zvuk.
4. Zkontrolovat sporné časy, jména a čísla skutečným poslechem. Není-li v prostředí možné audio přehrát/přepsat, říci to a zpracovat dostupný text s odpovídající nejistotou.
5. Zachovat TXT, SRT a JSON s časy. `audio-clip` má interview/start/end/speaker/quote a odkaz na pramen. `node scripts/make-clips.mjs` vytváří úryvky; build doplňuje synchronizovaná slova.

Pro cloudový přepis použít jen výslovně dovolenou službu a rozsah; neposílat nahrávky kvůli pohodlí. Neimitovat hlas žijícího příbuzného bez jeho souhlasu.

## Vytěžení a příběh

Fakta z vyprávění zapsat jako family-record, citovat čas a informátora. Nová jména jsou kandidáti, rozpor samostatné tvrzení. Nedoplňovat příjmení po poslechu podobného slova bez dalšího dokladu. Vzpomínku připisovat osobě, které se skutečně týká.

Dokončit také její zobrazení: přiřadit osoby a tvrzení, doložené vazby a vybrané profilové údaje, případně událost, a sestavit první kroniku podle části „První úplný nález“ v [datovém průvodci](data-a-dukazy.md). Uložený přepis sám nevytvoří životopis ani časovou osu.

Krátký příběh: konkrétní doložená událost → rodinná souvislost → samostatně citovaný dobový kontext → otevřená otázka. Podložené zajímavosti mohou vznikat i ze tří generací. Přibalené historické události a varianty jmen jsou pomůckou; při publikování fakt ověřit v uvedeném zdroji. Není doloženo, že člověk zažil osobně všechny události za svého života.

## Podrobné návody aplikace

`assets/kronika/docs/navod.md`, `pruvodce-vyzkumem.md`, `genealogicky-vyzkum-postupy.md`, `data-contract.md`. Reusable rodinné workflow je přeneseno z šesti původních skillů Paměti rodu. Aktuální hlavní SKILL a reference k jistotě/soukromí mají přednost před historickými platformními formulacemi.

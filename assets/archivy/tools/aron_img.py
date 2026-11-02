#!/usr/bin/env python3
"""Stažení snímku matriky z portálu ARON (SOA Zámrsk, aron.vychodoceskearchivy.cz).

Použití:
  aron_img.py <apu_id> <snimek> [uroven] [vystup.jpg] [x0,y0,x1,y1]
      uroven: 0 = plné rozlišení, 1 = polovina (výchozí), 2 = čtvrtina
      x0,y0,x1,y1: jen výřez (zlomky 0..1 celé stránky) – stahují se jen potřebné dlaždice
  aron_img.py <apu_id> info          -> název svazku a počet snímků
  aron_img.py <apu_id> link <n>      -> trvalý odkaz na snímek n v prohlížeči ARON (pole "odkaz" v zaznamy.json)
  aron_img.py <apu_id> svazek        -> vypíše katalogový kandidát jako JSON (bez zápisu do dat)

Popis svazků i celé snímky se ukládají do sdílené cache (tools/cache.py): aron/<apu_id>.json a aron/<apu_id>/sn<n>-u<uroven>.jpg.
"""
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__))); import slusne
from archive_common import project_root, emit_catalog, safe_key, project_file, atomic_json
import glob, json, math, os, shutil, subprocess, sys, tempfile, time, urllib.request
import concurrent.futures as cf
import xml.etree.ElementTree as ET
import cache  # noqa: E402 – sdílená cache stažených snímků (tools/cache.py)
for _s in (sys.stdout, sys.stderr):   # UTF-8 výstup i na Windows bez -X utf8 (cp1250 neumí třeba „→“)
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

API = "https://aron.vychodoceskearchivy.cz/api/aron"
ROOT = project_root()
CACHE = cache.cesta("aron")


def magick():
    """Cesta k ImageMagicku; když chybí, skončí hned (před stahováním) srozumitelnou hláškou."""
    m = (shutil.which("magick") or next(iter(sorted(glob.glob(r"C:\Program Files\ImageMagick*\magick.exe"))), None)
         or (os.name != "nt" and shutil.which("convert")))   # ImageMagick 6 bez magick; na Windows je convert.exe jiný program
    if not m:
        sys.exit("Chybí ImageMagick (příkaz magick). Nainstaluj ho (macOS: brew install imagemagick, "
                 "Windows: winget install ImageMagick.ImageMagick a restart agenta) a spusť nástroj znovu.")
    return m


def get(url, binary=False, tries=4):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                data = r.read()
            return data if binary else data.decode("utf-8")
        except OSError:
            if attempt == tries - 1:
                raise
            time.sleep(2 * (attempt + 1))


def volume(apu_id):
    safe_key(apu_id)
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, apu_id + ".json")
    if not os.path.exists(path):
        data = get(f"{API}/apu/{apu_id}")
        tmp = f"{path}.{os.getpid()}.tmp"
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(data)
        os.replace(tmp, path)  # atomic, safe when several processes fetch the same volume
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def tiles_by_order(vol):
    out = {}
    for dao in vol.get("digitalObjects", []):
        for f in dao["files"]:
            if f["type"] == "TILE":
                out[f["order"]] = f["referencedFile"]
    return out


def fetch_image(dzi_url, level_offset=1, out="page.jpg", crop=None):
    if level_offset < 0 or level_offset > 20:
        raise ValueError("Úroveň musí být celé číslo 0–20.")
    if crop and (len(crop) != 4 or not (0 <= crop[0] < crop[2] <= 1 and 0 <= crop[1] < crop[3] <= 1)):
        raise ValueError("Výřez musí být x0,y0,x1,y1 v rozsahu 0–1.")
    MAGICK = magick()
    dzi = ET.fromstring(get(dzi_url))
    ns = {"d": "http://schemas.microsoft.com/deepzoom/2009"}
    ts = int(dzi.get("TileSize"))
    ov = int(dzi.get("Overlap"))
    size = dzi.find("d:Size", ns)
    W, H = int(size.get("Width")), int(size.get("Height"))
    maxlevel = math.ceil(math.log2(max(W, H)))
    if level_offset > maxlevel: raise ValueError("Úroveň přesahuje obrazovou pyramidu.")
    level = maxlevel - level_offset
    scale = 2 ** level_offset
    w, h = math.ceil(W / scale), math.ceil(H / scale)
    cols, rows = math.ceil(w / ts), math.ceil(h / ts)
    c0, r0, c1, r1 = 0, 0, cols - 1, rows - 1
    if crop:
        x0, y0, x1, y1 = crop
        c0, c1 = int(x0 * w) // ts, (math.ceil(x1 * w) - 1) // ts
        r0, r1 = int(y0 * h) // ts, (math.ceil(y1 * h) - 1) // ts
    base = dzi_url[: -len(".dzi")] + "_files"
    tmp = tempfile.mkdtemp(prefix="aron_")
    try:
        jobs = []
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                jobs.append((c, r, f"{base}/{level}/{c}_{r}.jpg", os.path.join(tmp, f"{c}_{r}.jpg")))

        def dl(job):
            c, r, url, p = job
            with open(p, "wb") as f:
                f.write(get(url, binary=True))
            return job

        with cf.ThreadPoolExecutor(8) as ex:
            list(ex.map(dl, jobs))
        # a tile with c > 0 (r > 0) carries `ov` extra pixels on its left (top) edge;
        # crop every tile to its own ts x ts cell, then append rows and columns
        # po řádcích: jeden příkaz na celou stránku by na Windows přesáhl limit délky příkazové řádky (32 767 znaků)
        row_files = []
        for r in range(r0, r1 + 1):
            args = [MAGICK]
            for c in range(c0, c1 + 1):
                p = os.path.join(tmp, f"{c}_{r}.jpg")
                cw, ch = min(ts, w - c * ts), min(ts, h - r * ts)
                ox, oy = (ov if c > 0 else 0), (ov if r > 0 else 0)
                args += ["(", p, "-crop", f"{cw}x{ch}+{ox}+{oy}", "+repage", ")"]
            row_files.append(os.path.join(tmp, f"row_{r}.miff"))   # MIFF zachová vlastnosti JPEG (podvzorkování barev)
            subprocess.run(args + ["+append", row_files[-1]], check=True)
        tail = []
        if crop:
            px0, py0, px1, py1 = int(crop[0]*w), int(crop[1]*h), math.ceil(crop[2]*w), math.ceil(crop[3]*h)
            tail = ["-crop", f"{px1-px0}x{py1-py0}+{px0-c0*ts}+{py0-r0*ts}", "+repage"]
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        subprocess.run([MAGICK, *row_files, "-append", *tail, "-quality", "88", out], check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)   # uklidit i při chybě stahování nebo magick
    return out, (W, H)


def scan_link(vol, apu, n):
    candidates = [(d, f) for d in vol.get("digitalObjects", []) for f in d.get("files", [])
                  if f.get("type") == "TILE" and f.get("order") == n]
    if len(candidates) != 1:
        raise ValueError(f"Snímek {n} nemá jednoznačný TILE identifikátor.")
    dao, tile = candidates[0]
    return f"https://aron.vychodoceskearchivy.cz/apu/{apu}/dao/{dao['id']}/file/{tile['id']}"


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] in ("-h", "--help"):
        print(__doc__); sys.exit(0)
    apu = sys.argv[1]
    vol = volume(apu)
    tiles = tiles_by_order(vol)
    if sys.argv[2] == "info":
        print(vol["name"], "|", vol.get("description"))
        print("scans:", len(tiles))
        sys.exit(0)
    if sys.argv[2] == "svazek":
        fond, _, rest = vol["name"].partition(": ")
        emit_catalog(apu, dict(archiv=fond if rest else "", portal="ARON", svazek=rest or vol["name"],
            popis=vol.get("description") or "", snimku=len(tiles), url=f"https://aron.vychodoceskearchivy.cz/apu/{vol['id']}"))
        sys.exit(0)
    if sys.argv[2] == "link":
        print(scan_link(vol, apu, int(sys.argv[3])))
        sys.exit(0)
    n = int(sys.argv[2])
    if n not in tiles: sys.exit("Snímek není v katalogu TILE.")
    lo = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    out = sys.argv[4] if len(sys.argv) > 4 else f"{apu[:8]}_{n:04d}.jpg"
    crop = tuple(float(v) for v in sys.argv[5].split(",")) if len(sys.argv) > 5 else None
    if crop:
        path, dims = fetch_image(tiles[n], lo, out, crop)
        print(path, "full size", dims)
    else:
        cache.soubor(f"aron/{apu}/sn{n:04d}-u{lo}.jpg", out, lambda cil: fetch_image(tiles[n], lo, cil))
        print(out)

"""Reload SID/STAR/IAP display geometry for every airport from the national KMZ
"2026.11.01 DỮ LIỆU VÙNG TRỜI, PHƯƠNG THỨC BAY.kmz", merging into
WebATM/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_<ICAO>.geojson
and procedures_index.json.

Same recipe as rebuild_and_merge.py (extract with parse_procedures_kml, KEEP
each airport's existing HOLDING features/index entry untouched), but:
  * reads the .kmz directly (extracts doc.kml to a temp dir, never next to the
    source) and patches the missing ``xmlns:xsi`` declaration in the root tag
    (the file embeds an XSD-annotated Document; plain ElementTree refuses it
    with "unbound prefix");
  * runs the airports in parallel;
  * defaults to a DRY RUN -- pass --apply to write. The data files are tracked
    in git, so ``git checkout -- WebATM/static/data/vatm_kmz`` is the rollback.

VVGB is not in this KMZ and is left untouched. VVPQ has two effective-dated
folders; --vvpq picks which one becomes the VVPQ data ("new" = effective from
26/11/2026, adds ILS 10L; "current" = valid until 26/11/2026).

Usage (from this directory, with the project venv):
    python rebuild_from_kmz_2026_11_01.py --kmz "<path>.kmz" [--vvpq new|current] [--apply]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from parse_procedures_kml import extract, scan_boundaries  # noqa: E402

REPO = HERE.parents[2]
VATM = REPO / "WebATM" / "static" / "data" / "vatm_kmz"
GEOJSON_DIR = VATM / "procedures_by_airport"
INDEX_PATH = VATM / "procedures_index.json"

AIRPORTS = ("VVBM VVCA VVCI VVCM VVCR VVCS VVCT VVDB VVDH VVDL VVDN VVLT VVNB "
            "VVPB VVPC VVPK VVRG VVTH VVTS VVTX VVVD VVVH").split()
VVPQ_FOLDERS = {
    "current": "VVPQ (Hiệu lực ĐẾN 0000 26/11/2026)",
    "new": "VVPQ (Hiệu lực TỪ 0000 26/11/2026 - bổ sung ILS 10L)",
}
_XSI = b' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
_ROOT = b'<kml xmlns="http://www.opengis.net/kml/2.2"'


def prepare_kml(kmz: str, workdir: str) -> str:
    out = os.path.join(workdir, "doc.kml")
    with zipfile.ZipFile(kmz) as z, z.open("doc.kml") as s, open(out, "wb") as d:
        head = s.read(4096)
        if b"xmlns:xsi" not in head[:2048] and _ROOT in head:
            head = head.replace(_ROOT, _ROOT + _XSI, 1)
        d.write(head)
        while chunk := s.read(1 << 20):
            d.write(chunk)
    return out


def work(args):
    kml, icao, folder = args
    flags = scan_boundaries(kml, folder)
    gj, frag, diag = extract(kml, folder, icao, flags)
    return icao, gj, frag, diag


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kmz", required=True)
    ap.add_argument("--vvpq", choices=("new", "current"), default="new")
    ap.add_argument("--apply", action="store_true", help="write the data files (default: dry run)")
    args = ap.parse_args()

    jobs_spec = [(c, c) for c in AIRPORTS] + [("VVPQ", VVPQ_FOLDERS[args.vvpq])]
    with tempfile.TemporaryDirectory() as tmp:
        kml = prepare_kml(args.kmz, tmp)
        n = max(1, min(6, (os.cpu_count() or 4) - 1))
        with ProcessPoolExecutor(n) as ex:
            results = list(ex.map(work, [(kml, i, f) for i, f in jobs_spec]))

    with open(INDEX_PATH, encoding="utf-8") as f:
        index = json.load(f)

    for icao, gj, frag, diag in sorted(results):
        path = GEOJSON_DIR / f"vatm_procedures_{icao}.geojson"
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
        # Keep every feature the OLD index lists under HOLDING, whatever its
        # procedure_type says: VVNB's holdings are stored typed STAR/IAP/SID, so
        # filtering on procedure_type == "HOLDING" alone drops 513 of its 550.
        hold_ids = {i for ids in index.get(icao, {}).get("HOLDING", {}).values() for i in ids}
        holding = [x for x in old["features"]
                   if x["properties"].get("procedure_type") == "HOLDING" or x["properties"].get("id") in hold_ids]
        merged = {"type": "FeatureCollection", "features": gj["features"] + holding}
        old_counts = {t: len(index.get(icao, {}).get(t, {})) for t in ("SID", "STAR", "IAP")}
        new_counts = {t: len(frag.get(t, {})) for t in ("SID", "STAR", "IAP")}
        bad = len(frag.get("UNCLASSIFIED", {}))
        print(f"{icao}: old {old_counts} -> new {new_counts}  features {len(gj['features'])}+{len(holding)} holding"
              f"{'  UNCLASSIFIED=' + str(bad) if bad else ''}")
        if args.apply:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(merged, f, ensure_ascii=False)
            index[icao] = {"HOLDING": index.get(icao, {}).get("HOLDING", {}), **frag}

    if args.apply:
        with open(INDEX_PATH, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=1)
        print("\nWritten. Rollback: git checkout -- WebATM/static/data/vatm_kmz")
    else:
        print("\nDry run -- nothing written. Re-run with --apply.")


if __name__ == "__main__":
    main()

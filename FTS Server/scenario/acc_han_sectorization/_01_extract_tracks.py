"""
Trich xuat track ADS-B that trong vung trach nhiem ACC Ha Noi (PK1-4) tu
r72_tracks_20260605.csv (710MB, toan bo Viet Nam, 05/06/2026).

Nguon: vietnam_ats_routes_pack/ADSB 05.6.2026/r72_tracks_20260605/r72_tracks_20260605.csv
Cot fir_id trong tep nay SAI gan nhu hoan toan (4.131.858 VVHN / 9 VVHM trong
toan bo tep) -- da xac nhan khi lam KPI HCM ACC PK1/PK5 truoc do. Vi vay loc
theo toa do (polygon tung phan khu) chu KHONG loc theo fir_id.

Cot "ground_speed_kt" trong dung tep nay thuc chat la m/s (da xac nhan bang
cach do toc do tu hai toa do lien tiep: ty le gia tri/do = 1.95 ~ 1.944 kt
per m/s). Ghi lai ca gia tri goc va gia tri da quy doi sang knot de cac buoc
sau khong phai doan lai.

Polygon 4 phan khu hien trang lay tu WebATM/static/data/vatm_kmz/
vatm_acc_fir_sectors.geojson (nguon KMZ VATM 2026-04-20, da dung cho cac
phan khu ACC HCM/airport trong du an nay):
  VATM_000587 SECTOR 1, VATM_000588 SECTOR 2,
  VATM_000589 SECTOR 3, VATM_000590 SECTOR 4 (bo qua VATM_000591, mot
  manh polygon 37 diem bbox cuc nho 106.44-106.54E/16.97-17.00N, ro rang la
  artifact tach lop khi xuat KMZ chu khong phai Phan khu 4 that).

Chay:
    python scenario/acc_han_sectorization/_01_extract_tracks.py
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

from shapely.geometry import Point, Polygon
from shapely.prepared import prep

HERE = Path(__file__).resolve().parent
FTS = HERE.parent.parent
ROOT = FTS.parent

sys.path.insert(0, str(FTS))
from windkit.units import ms_to_kt  # noqa: E402

RAW_CSV = ROOT / "vietnam_ats_routes_pack" / "ADSB 05.6.2026" / "r72_tracks_20260605" / "r72_tracks_20260605.csv"
SECTORS_GEOJSON = ROOT / "WebATM" / "static" / "data" / "vatm_kmz" / "vatm_acc_fir_sectors.geojson"
OUT_CSV = HERE / "han_tracks_20260605.csv"

SECTOR_IDS = {
    "PK1": "VATM_000587",
    "PK2": "VATM_000588",
    "PK3": "VATM_000589",
    "PK4": "VATM_000590",
}


def load_sector_polygons():
    d = json.load(open(SECTORS_GEOJSON, encoding="utf-8"))
    by_id = {f["properties"]["id"]: f for f in d["features"]}
    polys = {}
    for name, fid in SECTOR_IDS.items():
        feat = by_id[fid]
        poly = Polygon(feat["geometry"]["coordinates"][0])
        polys[name] = prep(poly)
    return polys


def sector_of(lon, lat, polys):
    pt = Point(lon, lat)
    for name, poly in polys.items():
        if poly.contains(pt):
            return name
    return None


def main():
    polys = load_sector_polygons()
    print(f"Da nap {len(polys)} polygon phan khu ACC Ha Noi tu {SECTORS_GEOJSON.name}")

    n_total = 0
    n_kept = 0
    sector_counts = {k: 0 for k in SECTOR_IDS}

    with open(RAW_CSV, encoding="utf-8") as fin, open(OUT_CSV, "w", encoding="utf-8", newline="") as fout:
        reader = csv.DictReader(fin)
        writer = csv.writer(fout)
        writer.writerow([
            "callsign", "mode_s", "received_at_utc", "lat", "lon",
            "flight_level", "alt_ft", "gs_raw", "gs_kt", "heading_deg", "sector",
        ])
        for row in reader:
            n_total += 1
            if n_total % 2_000_000 == 0:
                print(f"  ... da doc {n_total:,} dong, giu {n_kept:,} dong trong ACC HAN")
            try:
                lat = float(row["lat"])
                lon = float(row["lon"])
                fl = float(row["flight_level"])
            except (ValueError, KeyError):
                continue
            # Loc tho truoc theo bbox gop ca 4 phan khu de khoi phai test
            # polygon tren moi dong cua ca nuoc.
            if not (14.0 < lat < 23.5 and 102.0 < lon < 110.5):
                continue
            sector = sector_of(lon, lat, polys)
            if sector is None:
                continue
            try:
                gs_raw = float(row["ground_speed_kt"]) if row["ground_speed_kt"] else 0.0
                hdg = float(row["heading_deg"]) if row["heading_deg"] else 0.0
            except ValueError:
                continue
            gs_kt = float(ms_to_kt(gs_raw))
            sector_counts[sector] += 1
            n_kept += 1
            writer.writerow([
                row["callsign"], row["mode_s"], row["received_at_utc"],
                f"{lat:.6f}", f"{lon:.6f}", f"{fl:.0f}", f"{fl * 100:.0f}",
                f"{gs_raw:.2f}", f"{gs_kt:.2f}", f"{hdg:.1f}", sector,
            ])

    print(f"\nTong {n_total:,} dong doc, {n_kept:,} dong nam trong ACC Ha Noi ({OUT_CSV.name})")
    for k, v in sector_counts.items():
        print(f"  {k}: {v:,} diem")


if __name__ == "__main__":
    main()

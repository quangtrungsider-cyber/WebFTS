"""Bo sung DO CAO / TOC DO (tu AIP PDF) vao du lieu PTB hien thi san co.

Khong doi ten phuong thuc, khong doi hinh hoc, khong doi procedures_index.json:
chi them thuoc tinh vao cac feature (cac chang) trong
WebATM/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_<ICAO>.geojson.

Dau vao: thu muc ket qua cua PDF AIP da tach (procedures.json trong do), tao boi
  aip_pdf/trich_aip_pdf.py  ->  aip_pdf/parse_aip_tables.py
  (xem hai script do; cac PDF AIP khong nam trong git)

Thuoc tinh them vao mot chang (chi them khi AIP CONG BO gia tri; thieu = AIP khong ghi):
  end_fix     diem cuoi cua chang (tu AIP)
  alt_m, alt_ft, alt_type     do cao rang buoc tai diem cuoi (AT / AT_OR_ABOVE / AT_OR_BELOW)
  speed_kmh, speed_kt, speed_type   gioi han toc do tai diem cuoi
  perf_src    trang AIP va ngay ban hanh (de truy nguon)
Don vi AIP la met va km/h; them ban quy doi feet / knots (lam tron 1 lan).

Ghep chang: ten phuong thuc (vd "MEVON 2E", "ILS S 09") + diem cuoi cua chang
("BM411-BM412" -> BM412; "CF BM411" -> BM411). Neu cung diem cuoi co nhieu rang buoc
KHAC NHAU trong 1 phuong thuc thi KHONG gan (ghi vao bao cao), khong doan.

Mac dinh chay thu (khong ghi). --apply de ghi. Hoan tac: git checkout -- <file>.

Dung:
  python add_perf_from_aip.py --parsed "<...>/PDF AIP/_out/VVBM" [--apply]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
GEOJSON_DIR = REPO / "WebATM" / "static" / "data" / "vatm_kmz" / "procedures_by_airport"
M2FT, KMH2KT = 3.28084, 0.539957
STRAIGHT = {"TF", "RF", "AF"}   # chang noi 2 diem co ten dang "A-B" trong du lieu hien thi


def kind_of(p) -> str:
    s = p["section"].upper()
    return "SID" if "DEPARTURE" in s else "STAR" if "ARRIVAL" in s else "IAP"


def proc_name(p, parsed: Path) -> str | None:
    k = kind_of(p)
    if k in ("SID", "STAR"):
        m = re.match(r"([A-Z]+)\s+(\d[A-Z])\b", p["section"])
        return f"{m[1]} {m[2]}" if m else None
    txt = (parsed / f"{p['page_file']}.txt").read_text(encoding="utf-8").splitlines()[:10]
    for ln in txt:
        m = re.search(r"\b(ILS|RNP|VOR|LOC|NDB)\s+([A-Z])\s+RWY\s*(\d{2}[LRC]?)", ln)
        if m:
            return f"{m[1]} {m[2]} {m[3]}"
    return None


def feature_key(name: str):
    """-> (path, fix, end_only) ; path None nghia la chang dang 'A-B'."""
    n = name.strip()
    m = re.fullmatch(r"([A-Z]{2})\s+(\S+)", n)
    if m:
        return m[1], m[2]
    m = re.fullmatch(r"(\S+)-(\S+)", n)
    if m:
        return None, m[2]
    if re.fullmatch(r"[A-Z]{2}", n):
        return n, None
    return "?", None


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--parsed", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--alias", action="append", default=[], metavar="TEN_AIP=TEN_HIEN_THI",
                    help="cung 1 diem nhung hai nguon dat ten khac nhau (vd XELEX=HARIZ). "
                         "Chi khai bao khi DA xac nhan; mac dinh khong ghep ten khac nhau.")
    a = ap.parse_args()
    alias = dict(x.split("=", 1) for x in a.alias)
    parsed = Path(a.parsed).resolve()
    icao = parsed.name
    procs = json.loads((parsed / "procedures.json").read_text(encoding="utf-8"))
    path = GEOJSON_DIR / f"vatm_procedures_{icao}.geojson"
    raw = path.read_bytes()
    g = json.loads(raw.decode("utf-8"))
    crlf = b"\r\n" in raw[:4000]

    # 1. rang buoc AIP theo (loai, ten phuong thuc)
    by_proc: dict[tuple[str, str], list[dict]] = {}
    for p in procs:
        n = proc_name(p, parsed)
        if not n:
            print(f"  ! bo qua {p['page_file']} {p['section']!r}: khong xac dinh ten phuong thuc")
            continue
        for l in p["legs"]:
            if l["wp"] in alias:
                l = {**l, "wp": alias[l["wp"]]}
            by_proc.setdefault((kind_of(p), n), []).append({**l, "_src": f"AIP {icao} {p['code'] or p['page_file'] + '.pdf'}"
                                                            + (f", {p['date']}" if p["date"] else "")})

    stats = {"matched": 0, "assigned": 0, "ambiguous": 0, "no_constraint": 0}
    ambiguous: list[str] = []
    used: set[tuple] = set()
    per_proc: dict[tuple[str, str], list[int]] = {}
    for f in g["features"]:
        pr = f["properties"]
        key = (pr.get("procedure_type"), pr.get("procedure_name"))
        legs = by_proc.get(key)
        if not legs:
            continue
        stats["matched"] += 1
        path_c, fix = feature_key(pr.get("name", ""))
        # Diem IF (dau phuong thuc) khong co chang rieng: rang buoc cua no gan vao DAU
        # chang "IF-xxx" ke tiep (start_*), khong lam lech nghia "tai diem cuoi".
        mstart = re.fullmatch(r"(\S+)-(\S+)", pr.get("name", "").strip())
        if mstart:
            ifs = [(i, l) for i, l in enumerate(legs) if l["path"] == "IF" and l["wp"] == mstart[1]]
            if ifs and len({(json.dumps(l["alt"]), json.dumps(l["speed"])) for _, l in ifs}) == 1 \
                    and (ifs[0][1]["alt"] or ifs[0][1]["speed"]):
                l = ifs[0][1]
                st: dict = {"start_fix": l["wp"]}
                if l["alt"] and l["alt"][0] != "RAW":
                    st.update(start_alt_m=l["alt"][1], start_alt_ft=round(l["alt"][1] * M2FT), start_alt_type=l["alt"][0])
                if l["speed"] and l["speed"][0] != "RAW":
                    st.update(start_speed_kmh=l["speed"][1], start_speed_kt=round(l["speed"][1] * KMH2KT),
                              start_speed_type=l["speed"][0])
                pr.update(st)
                for i, _ in ifs:
                    used.add((key, i))
                stats["start_assigned"] = stats.get("start_assigned", 0) + 1
        cand = []
        for i, l in enumerate(legs):
            if fix is not None and l["wp"] != fix:
                continue
            if fix is None and l["wp"] is not None:
                continue
            if path_c is None:
                if l["path"] not in STRAIGHT:
                    continue
            elif path_c != "?" and l["path"] != path_c:
                continue
            cand.append((i, l))
        if not cand or path_c == "?":
            continue
        vals = {(json.dumps(l["alt"]), json.dumps(l["speed"])) for _, l in cand}
        if len(vals) > 1:
            stats["ambiguous"] += 1
            ambiguous.append(f"{key[0]} {key[1]}: '{pr['name']}' -> " + " | ".join(sorted(f"alt={v[0]} spd={v[1]}" for v in vals)))
            continue
        i0, l0 = cand[0]
        for i, _ in cand:
            used.add((key, i))
        if not l0["alt"] and not l0["speed"]:
            stats["no_constraint"] += 1
            continue
        add: dict = {"end_fix": l0["wp"] or fix}
        if l0["alt"] and l0["alt"][0] != "RAW":
            add.update(alt_m=l0["alt"][1], alt_ft=round(l0["alt"][1] * M2FT), alt_type=l0["alt"][0])
        if l0["speed"] and l0["speed"][0] != "RAW":
            add.update(speed_kmh=l0["speed"][1], speed_kt=round(l0["speed"][1] * KMH2KT), speed_type=l0["speed"][0])
        add["perf_src"] = l0["_src"]
        # khong ghi de neu da co (chay lai nhieu lan van cho cung ket qua)
        pr.update(add)
        stats["assigned"] += 1
        per_proc.setdefault(key, [0, 0])[0] += 1

    # 2. rang buoc AIP khong gan vao feature nao
    orphan = []
    for key, legs in by_proc.items():
        for i, l in enumerate(legs):
            if (key, i) not in used and (l["alt"] or l["speed"]):
                orphan.append(f"{key[0]} {key[1]}: {l['path']} {l['wp'] or '-'} alt={l['alt_raw']} spd={l['speed_raw']}")
    known = {(f["properties"].get("procedure_type"), f["properties"].get("procedure_name")) for f in g["features"]}
    missing_proc = sorted(f"{k[0]} {k[1]}" for k in by_proc if k not in known)

    print(f"{icao}: feature thuoc phuong thuc co trong AIP = {stats['matched']}")
    print(f"  da gan do cao/toc do: {stats['assigned']}   chang AIP khong co rang buoc: {stats['no_constraint']}"
          f"   mo ho (bo qua): {stats['ambiguous']}")
    print(f"  rang buoc o DIEU DAU chang (diem IF) da gan: {stats.get('start_assigned', 0)}")
    print(f"  phuong thuc AIP khong co trong du lieu hien thi: {missing_proc or 'khong'}")
    print(f"  rang buoc AIP khong gan duoc vao chang nao: {len(orphan)}")
    for s in orphan[:15]:
        print("    -", s)
    for s in ambiguous[:10]:
        print("  mo ho:", s)

    if a.apply:
        out = json.dumps(g, ensure_ascii=False, indent=2)
        if crlf:
            out = out.replace("\n", "\r\n")
        path.write_bytes(out.encode("utf-8"))
        print(f"\nDa ghi {path}")
    else:
        print("\nChay thu -- chua ghi gi. Them --apply de ghi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

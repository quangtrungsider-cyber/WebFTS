"""Doc ket qua cua trich_aip_pdf.py (thu muc _out/<ICAO>) va tao du lieu co cau truc:

    _out/<ICAO>/procedures.json   cac phuong thuc (SID/STAR/IAP) va tung chang (leg)
    _out/<ICAO>/waypoints.json    toa do cac diem (WGS-84) lay tu bang "WAYPOINT LIST"
    _out/<ICAO>/parse_report.txt  nhung cho khong doc duoc / de nghi xac nhan

Khong doan so lieu: o nao la "–" thi de None. Don vi giu nguyen goc (met, km/h);
viec doi sang feet/knots lam o buoc sinh module cua FTS.

Dung:  .venv\\Scripts\\python.exe -I "FTS Server\\tools\\airways\\aip_pdf\\parse_aip_tables.py" "PDF AIP\\_out\\VVBM"
(chay sau trich_aip_pdf.py)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

DASH = {"–", "-", "—", "", None}
CODE_RE = re.compile(r"AD\s*2\.\d+\s*-\s*\w+\s*-\s*\w+")
RWY_RE = re.compile(r"RWY\s*(\d{2}[LRC]?)")
DMS_RE = re.compile(r"(\d{1,3})°(\d{1,2})'([\d.]+)\"?\s*([NS])\s*(\d{1,3})°(\d{1,2})'([\d.]+)\"?\s*([EW])")


def clean(c) -> str:
    return re.sub(r"\s+", " ", (c or "").replace("\n", " ")).strip()


def dms(m) -> tuple[float, float]:
    la = int(m[1]) + int(m[2]) / 60 + float(m[3]) / 3600
    lo = int(m[5]) + int(m[6]) / 60 + float(m[7]) / 3600
    return (round(-la if m[4] == "S" else la, 6), round(-lo if m[8] == "W" else lo, 6))


def constraint(cell: str):
    """'+1850' -> ('AT_OR_ABOVE', 1850); '-2450' -> ('AT_OR_BELOW', 2450); '@1350' -> ('AT', 1350);
    '–' -> None; anything else -> ('RAW', cell) so nothing is silently dropped."""
    s = clean(cell)
    if s in DASH:
        return None
    m = re.fullmatch(r"([+\-@])\s*(\d+(?:\.\d+)?)", s)
    if m:
        return ({"+": "AT_OR_ABOVE", "-": "AT_OR_BELOW", "@": "AT"}[m[1]], float(m[2]))
    m = re.fullmatch(r"(\d+(?:\.\d+)?)", s)
    if m:
        return ("AT", float(m[1]))
    return ("RAW", s)


def col_index(header: list[str]) -> dict[str, int]:
    idx: dict[str, int] = {}
    for i, h in enumerate(header):
        t = clean(h).lower()
        if t.startswith("serial"):
            idx["serial"] = i
        elif t.startswith("path"):
            idx["path"] = i
        elif t.startswith("waypoint"):
            idx["wp"] = i
        elif t.replace(" ", "").startswith("fly"):
            idx["flyover"] = i
        elif t.startswith("course"):
            idx["course"] = i
        elif t.startswith("magnetic"):
            idx["magvar"] = i
        elif t.startswith("distance"):
            idx["dist"] = i
        elif t.startswith("turn"):
            idx["turn"] = i
        elif t.startswith("altitude"):
            idx["alt"] = i
        elif t.startswith("speed"):
            idx["speed"] = i
        elif t.startswith("min cg") or t.startswith("vpa"):
            idx["vpa_cg"] = i
        elif t.startswith("nav"):
            idx["nav"] = i
    return idx


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    out = Path(sys.argv[1]).resolve()
    icao = out.name
    index_rows = (out / "index.csv").read_text(encoding="utf-8-sig").splitlines()[1:]
    procs: list[dict] = []
    wps: dict[str, dict] = {}
    wps_page: dict[str, dict] = {}   # toa do theo tung trang (cung 1 diem co the khac nhau giua cac trang)
    report: list[str] = []

    for tj in sorted(out.glob("*.tables.json")):
        stem = tj.name[: -len(".tables.json")]
        txt = (out / f"{stem}.txt").read_text(encoding="utf-8")
        head = "\n".join(txt.splitlines()[:9])
        m = CODE_RE.search(txt)
        code = re.sub(r"\s+", "", m.group(0)) if m else ""
        date = re.search(r"\b(\d{1,2} [A-Z]{3} 20\d\d)\b", head)
        title = " ".join(ln for ln in head.splitlines()[3:8]
                         if not ln.startswith(("DAP", "=====")) and not re.match(r"\d{1,2} [A-Z]{3} 20\d\d", ln))
        rwy = RWY_RE.search(title)
        tables = json.loads(tj.read_text(encoding="utf-8"))
        cur_section = ""
        for tb in tables:
            rows = tb["rows"]
            if not rows:
                continue
            first = clean(rows[0][0]) if rows[0] else ""
            flat0 = " ".join(clean(c) for c in rows[0])
            # waypoint list
            if first.upper().startswith("WAYPOINT") and "COORD" in flat0.upper():
                for r in rows[1:]:
                    if len(r) < 2:
                        continue
                    name = clean(r[0])
                    mm = DMS_RE.search(clean(r[1]))
                    if not name or not mm:
                        report.append(f"[{stem}] diem khong doc duoc toa do: {r}")
                        continue
                    wid = re.split(r"\s+\(|\s+[–-]\s+BRG", name)[0].strip()
                    lat, lon = dms(mm)
                    if wid in wps and (abs(wps[wid]["lat"] - lat) > 1e-4 or abs(wps[wid]["lon"] - lon) > 1e-4):
                        report.append(f"[{stem}] diem {wid} lech toa do so voi trang {wps[wid]['src']}")
                    wps.setdefault(wid, {"lat": lat, "lon": lon, "src": stem, "label": name})
                    wps_page.setdefault(stem, {})[wid] = {"lat": lat, "lon": lon, "label": name}
                continue
            # find header row of a leg table
            hdr_i = next((i for i, r in enumerate(rows[:3]) if r and clean(r[0]).lower().startswith("serial")), None)
            if hdr_i is None:
                # holding / other tables
                if "holding" in flat0.lower() or first.lower().startswith("holding"):
                    report.append(f"[{stem}] bang HOLDING bo qua (chua nap)")
                continue
            idx = col_index(rows[hdr_i])
            if hdr_i >= 1 and clean(rows[hdr_i - 1][0]):
                cur_section = clean(rows[hdr_i - 1][0])
            legs: list[dict] = []
            seqs: list[list[dict]] = []
            for r in rows[hdr_i + 1:]:
                if not r or not re.fullmatch(r"\d{3}", clean(r[0])):
                    if r and clean(r[0]) and len([c for c in r if clean(c)]) == 1:
                        cur_section = clean(r[0])  # tieu de phan giua bang
                    continue
                g = lambda k: clean(r[idx[k]]) if k in idx and idx[k] < len(r) else ""  # noqa: E731
                leg = {
                    "serial": g("serial"), "path": g("path"), "wp": None if g("wp") in DASH else g("wp"),
                    "flyover": g("flyover") == "Y", "course": None if g("course") in DASH else g("course"),
                    "dist_km": None if g("dist") in DASH else float(g("dist")),
                    "turn": None if g("turn") in DASH else g("turn"),
                    "alt": constraint(g("alt")), "speed": constraint(g("speed")),
                    "alt_raw": g("alt"), "speed_raw": g("speed"), "vpa_cg": g("vpa_cg"), "nav": g("nav"),
                }
                if g("serial") == "010" and legs:
                    seqs.append(legs)
                    legs = []
                legs.append(leg)
            if legs:
                seqs.append(legs)
            for k, seq in enumerate(seqs, 1):
                procs.append({
                    "page_file": stem, "code": code, "date": date.group(1) if date else "",
                    "chart": title, "runway": rwy.group(1) if rwy else "",
                    "section": cur_section, "branch": k if len(seqs) > 1 else 0, "legs": seq,
                })

    (out / "procedures.json").write_text(json.dumps(procs, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "waypoints.json").write_text(json.dumps(wps, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "waypoints_by_page.json").write_text(json.dumps(wps_page, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "parse_report.txt").write_text("\n".join(report), encoding="utf-8")
    nleg = sum(len(p["legs"]) for p in procs)
    with_alt = sum(1 for p in procs for l in p["legs"] if l["alt"])
    with_spd = sum(1 for p in procs for l in p["legs"] if l["speed"])
    print(f"{icao}: {len(procs)} chuoi chang, {nleg} chang, {with_alt} co do cao, {with_spd} co toc do, "
          f"{len(wps)} diem co toa do, {len(report)} ghi chu (xem parse_report.txt)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

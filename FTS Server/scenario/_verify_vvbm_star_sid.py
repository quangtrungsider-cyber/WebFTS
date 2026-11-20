"""Chay kich ban VVBM_TEST_STAR_SID_RWY09.scn bang BlueSky headless va doi chieu
DO CAO / TOC DO cua tung tau bay voi bang AIP (vvbm_aip_rules.json).

Doc lap voi module sinh kich ban: chi doc file .scn (de biet tau nao bay SID/STAR nao) va
vvbm_aip_rules.json (rang buoc AIP: do cao/toc do tai tung diem). Khong dung vvbm_procedures.py.

Cach hieu ket qua:
  * Moi diem AIP co rang buoc: tim luc tau bay di gan diem nhat (<= 1 NM), doc do cao/toc do luc do.
  * "tai"/"tai hoac tren"/"tai hoac duoi" duoc kiem dung dau rang buoc (sai so do cao +-150 ft, toc do +-5 kt).
  * Tau bay cat goc khi re (fly-by) co the di qua diem cach 1-2 km: se ghi KHONG DEN DIEM du do cao dung.

Dung:  .venv\\Scripts\\python.exe "FTS Server\\scenario\\_verify_vvbm_star_sid.py" [file.scn]
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
FTS = HERE.parent
sys.path.insert(0, str(FTS))
os.chdir(FTS)
sys.stdout.reconfigure(encoding="utf-8")

SCN = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "VVBM_TEST_STAR_SID_RWY09.scn"
RULES = json.loads((HERE / "vvbm_aip_rules.json").read_text(encoding="utf-8"))
TOL_FT, TOL_KT, NEAR_M = 150.0, 5.0, 1852.0
M2FT, KMH2KT = 3.28084, 0.539957
SYM = {"AT": "=", "AT_OR_ABOVE": ">=", "AT_OR_BELOW": "<="}


def simulate() -> dict[str, list]:
    events = []
    for ln in SCN.read_text(encoding="utf-8").splitlines():
        m = re.match(r"(\d+):(\d+):(\d+(?:\.\d+)?)>(.*)", ln.strip())
        if m:
            events.append((int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]), m[4].strip()))
    events.sort(key=lambda e: e[0])
    t_end = events[-1][0] + 30
    import bluesky as bs   # noqa: E402  (sau khi dat sys.path)

    bs.init(mode="sim", detached=True)
    bs.sim.op()
    traj: dict[str, list] = {}
    i, next_log, t0 = 0, 0.0, time.time()
    while bs.sim.simt < t_end:
        while i < len(events) and events[i][0] <= bs.sim.simt + 1e-6:
            bs.stack.stack(events[i][1])
            i += 1
        bs.sim.step()
        if bs.sim.simt >= next_log:
            next_log += 1.0
            for k, acid in enumerate(bs.traf.id):
                traj.setdefault(acid, []).append([
                    float(bs.sim.simt), float(bs.traf.lat[k]), float(bs.traf.lon[k]),
                    float(bs.traf.alt[k]) / 0.3048, float(bs.traf.cas[k]) / 0.514444])
    print(f"Mo phong xong: {bs.sim.simt:.0f} s trong {time.time() - t0:.0f} s that, {len(traj)} tau bay")
    return traj


def hav(la1, lo1, la2, lo2) -> float:
    a = math.sin(math.radians(la2 - la1) / 2) ** 2 + math.cos(math.radians(la1)) * math.cos(math.radians(la2)) * \
        math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 2 * 6371000.0 * math.asin(math.sqrt(a))


def check(tr: list, legs: list[dict]) -> tuple[list[str], int]:
    rows, fails, seen = [], 0, set()
    for l in legs:
        wp = l["wp"]
        if not wp or wp in seen or not (l["alt"] or l["speed"]):
            continue
        seen.add(wp)
        la, lo = RULES["waypoints"][wp]
        best = min(tr, key=lambda s: hav(s[1], s[2], la, lo))
        d = hav(best[1], best[2], la, lo)
        parts, ok_all = [], d <= NEAR_M
        if l["alt"]:
            typ, mval = l["alt"]
            want, alt = mval * M2FT, best[3]
            ok = abs(alt - want) <= TOL_FT if typ == "AT" else alt >= want - TOL_FT if typ == "AT_OR_ABOVE" else alt <= want + TOL_FT
            ok_all &= ok
            parts.append(f"ALT {alt:6.0f} ft  yeu cau {SYM[typ]:>2} {want:6.0f}  chenh {alt - want:+6.0f}")
        if l["speed"]:
            typ, kmh = l["speed"]
            want, cas = kmh * KMH2KT, best[4]
            ok = abs(cas - want) <= TOL_KT if typ == "AT" else cas >= want - TOL_KT if typ == "AT_OR_ABOVE" else cas <= want + TOL_KT
            ok_all &= ok
            parts.append(f"CAS {cas:4.0f} kt  yeu cau {SYM[typ]:>2} {want:4.0f}")
        fails += 0 if ok_all else 1
        rows.append(f"   {wp:<6} cach {d:5.0f} m   {' | '.join(parts)}   => "
                    + ("DAT" if ok_all else ("KHONG DEN DIEM" if d > NEAR_M else "KHONG DAT")))
    return rows, fails


def main() -> int:
    who = {}
    for ln in SCN.read_text(encoding="utf-8").splitlines():
        m = re.match(r"# --- (\S+) (ARR|DEP) \S+ RWY(\d\d) \((?:STAR|SID) (\w+)_(\w+)\)", ln)
        if m:
            who[m[1]] = ("STAR" if m[2] == "ARR" else "SID", f"{m[4]} {m[5]}", m[3])
    traj = simulate()
    total = fails = 0
    for ac in sorted(traj):
        if ac not in who:
            continue
        kind, name, rwy = who[ac]
        legs = list(RULES[kind][name])
        if kind == "STAR":
            legs += RULES["IAP_FINAL"][rwy]
        alts = [s[3] for s in traj[ac]]
        print(f"\n=== {ac}  {kind} {name}  (RWY{rwy})  doc cao {alts[0]:.0f} -> {alts[-1]:.0f} ft (cao nhat {max(alts):.0f})")
        rows, f = check(traj[ac], legs)
        print("\n".join(rows) or "   (khong co rang buoc AIP de kiem)")
        total += len(rows)
        fails += f
    print(f"\nTONG: {total} phep kiem, {fails} khong dat "
          f"(do cao +-{TOL_FT:.0f} ft, toc do +-{TOL_KT:.0f} kt, qua diem trong {NEAR_M:.0f} m)")
    return 0 if fails == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

"""Kiem chung DOC LAP kich ban VVDN_35R_ONLY.scn -- dong cua 35L, chi dung 35R.

Script nay KHONG import va KHONG goi lai bat ky ham nao cua generator
(gen_vvdn_35r_only.py). No tu doc:
  - vvdn_35r_only_rules.json   (quy tac phan cach, co ghi dieu khoan nguon)
  - VVDN_35R_ONLY/VVDN_35R_ONLY.scn  (tu phan tich lich: loai tau, moc thoi gian)
  - runway_centerlines.geojson / taxiway_centerlines.geojson  (hinh hoc THAT)
roi TU TINH lai tung dieu kien.

Khac biet can ban so voi kich ban xen ke 35L/35R: o day CHI CON MOT duong CHC,
nen rang buoc quan trong nhat khong phai phan cach giua hai duong ma la
CHIEM DUNG DUONG CHC -- tai moi thoi diem chi duoc co MOT tau tren 35R.
Muc B4 do dung dieu do, bang vi tri THAT trong mo phong.

Cach dung:
    python _verify_vvdn_35r_only.py           # ca phan A va B (co chay mo phong)
    python _verify_vvdn_35r_only.py --static  # chi phan A (vai giay)
"""
from __future__ import annotations

import sys

sys.stdout.reconfigure(encoding="utf-8")

import json
import math
import os
import re
from pathlib import Path

HERE = Path(__file__).parent
RULES = json.loads((HERE / "vvdn_35r_only_rules.json").read_text(encoding="utf-8"))
SCN_DIR = HERE / "VVDN_35R_ONLY"
SCN = SCN_DIR / "VVDN_35R_ONLY.scn"
LAYOUT = (HERE / "../data/aerodrome_layout/datasets/vietnam_kml_layout/"
          "normalized/airports/VVDN").resolve()

HEAVY = set(RULES["co_cau_tau_bay"]["heavy"])
LENGTHS = {k: v for k, v in RULES["chieu_dai_than_m"].items() if isinstance(v, (int, float))}
CODE = {k: v[0] for k, v in RULES["han_che_duong_lan_E"]["ma_chu_theo_loai"].items()}

results = []  # (muc, ket_luan, chi_tiet, dieu_khoan)


def check(muc, ok, chi_tiet, dieu_khoan):
    results.append((muc, "DAT" if ok else "KHONG DAT", chi_tiet, dieu_khoan))
    return ok


def so_lieu(muc, chi_tiet, dieu_khoan):
    """Muc chi BAO CAO so lieu, khong cham DAT/KHONG DAT -- dung cho truong hop
    van ban nguon khong co nguong dinh luong."""
    results.append((muc, "SO LIEU", chi_tiet, dieu_khoan))


def wake(t):
    return "HEAVY" if t in HEAVY else "MEDIUM"


def fmt(t):
    return f"{int(t // 3600):02d}:{int((t % 3600) // 60):02d}:{t % 60:04.1f}"


def hav_m(la1, lo1, la2, lo2):
    R = 6371000.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp, dl = math.radians(la2 - la1), math.radians(lo2 - lo1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ===========================================================================
# DOC LICH TRUC TIEP TU TEP .scn  (khong qua generator, khong co .plan.json)
# ===========================================================================
RE_T = r"(\d+):(\d+):([\d.]+)>"
RE_CRE = re.compile(RE_T + r"CRE\s+(\w+),(\w+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)")
RE_PUSH = re.compile(RE_T + r"PCALL\s+_KB5GEN_PUSHBACK_(\w+)\s+(\w+)\s+(\S+)\s+([\d.]+)")


def _tsec(h, m, s):
    return int(h) * 3600 + int(m) * 60 + float(s)


def doc_lich():
    arrs, deps, push_len, gates = [], [], {}, {}
    for line in SCN.read_text(encoding="utf-8").splitlines():
        m = RE_CRE.search(line)
        if m:
            h, mi, s, acid, actype, la, lo, hdg, alt, spd = m.groups()
            rec = {"id": acid, "type": actype, "t_cre": _tsec(h, mi, s),
                   "lat": float(la), "lon": float(lo), "alt": float(alt), "spd": float(spd)}
            (arrs if acid.startswith("ARR") else deps).append(rec)
            continue
        m = RE_PUSH.search(line)
        if m:
            _h, _mi, _s, gate, acid, _tpl, ln = m.groups()
            push_len[acid] = float(ln)
            gates[acid] = gate
    arrs.sort(key=lambda r: r["t_cre"])
    deps.sort(key=lambda r: r["t_cre"])
    return arrs, deps, push_len, gates


ARRS, DEPS, PUSH_LEN, GATES = doc_lich()
TYPES = {r["id"]: r["type"] for r in ARRS + DEPS}


# ===========================================================================
# HE TOA DO DOC TIM 35R -- do tu runway_centerlines.geojson
# ===========================================================================
def _he_35R():
    rc = json.loads((LAYOUT / "runway_centerlines.geojson").read_text(encoding="utf-8"))
    f = next(f for f in rc["features"] if f["properties"].get("name") == "17L/35R")
    c = f["geometry"]["coordinates"]
    c = c if f["geometry"]["type"] == "LineString" else c[0]
    pts = sorted((p[1], p[0]) for p in c)  # theo vi do: dau 35R (phia nam) truoc
    o = pts[0]

    def xy(la, lo):
        return ((lo - o[1]) * math.cos(math.radians(o[0])) * 111320.0,
                (la - o[0]) * 110574.0)

    ex, ey = xy(*pts[-1])
    n = math.hypot(ex, ey)
    ux, uy = ex / n, ey / n

    def st(la, lo):
        x, y = xy(la, lo)
        return x * ux + y * uy, x * uy - y * ux  # (doc tim, lech ngang; + = phia dong)

    return st, n, xy, o


ST35R, LEN35R, XY, THR35R_GEO = _he_35R()


def tren_duong_CHC(la, lo, alt_ft):
    """Dinh nghia 'dang o tren mat duong CHC 35R' -- theo vvdn_35r_only_rules.json
    > chiem_dung_duong_CHC_35R.dinh_nghia_do_dac."""
    cfg = RULES["chiem_dung_duong_CHC_35R"]["dinh_nghia_do_dac"]
    if alt_ft >= 35.0:
        return False
    s, x = ST35R(la, lo)
    return 0.0 <= s <= LEN35R and abs(x) <= 30.0


# ===========================================================================
# PHAN A -- KIEM TRA TINH TREN LICH
# ===========================================================================
def A1_co_cau_doi_tau():
    tl = RULES["co_cau_tau_bay"]
    for ten, ds in (("DEN", ARRS), ("DI", DEPS)):
        n = len(ds)
        nh = sum(1 for d in ds if wake(d["type"]) == "HEAVY")
        want_h = round(n * tl["ty_le_heavy"])
        check(f"A1. Co cau doi tau ({ten})", nh == want_h,
              f"{n - nh} MEDIUM + {nh} HEAVY tren {n} chuyen "
              f"({(n - nh) / n * 100:.0f}%/{nh / n * 100:.0f}%), han ngach yeu cau "
              f"{n - want_h}M+{want_h}H",
              "vvdn_35r_only_rules.json > co_cau_tau_bay")


def A2_chi_dung_35R():
    """Xac nhan 35L thuc su KHONG duoc dung: khong lenh nao dua tau toi vung
    35L. Do bang hinh hoc that -- 35L nam cach tim 35R khoang 214 m ve phia tay."""
    txt = SCN.read_text(encoding="utf-8")
    for p in sorted(SCN_DIR.glob("_KB5GEN_*.scn")):
        txt += "\n" + p.read_text(encoding="utf-8")
    xau = []
    for m in re.finditer(r"(?:ADDWPT|MOVE|CRE)\s+[^\n]*?(-?\d{2}\.\d{4,}),\s*(-?\d{3}\.\d{4,})", txt):
        la, lo = float(m.group(1)), float(m.group(2))
        s, x = ST35R(la, lo)
        # vung 35L: doc tim trong pham vi duong CHC, lech ngang -180..-250 m
        if 0 <= s <= LEN35R and -250.0 <= x <= -180.0:
            xau.append(f"({la:.5f},{lo:.5f}) lech tim 35R {x:.0f} m")
    check("A2. Khong co lenh nao dua tau bay vao vung duong CHC 35L", not xau,
          f"{len(xau)} toa do roi vao dai -180..-250 m (vung 35L)"
          + ("; " + "; ".join(xau[:3]) if xau else "; 35L dong cua dung nhu thiet ke"),
          "vvdn_35r_only_rules.json > _cau_hinh_khai_thac; hinh hoc do tu "
          "runway_centerlines.geojson")


def A3_doi_chieu_chieu_dai_than():
    """Doi chieu cheo bang chieu dai than trong file quy tac voi gia tri nhung
    san trong chinh tep .scn (tham so cuoi cua PCALL _KB5GEN_PUSHBACK_*)."""
    xau = []
    for acid, ln_scn in PUSH_LEN.items():
        t = TYPES.get(acid)
        ln_rule = LENGTHS.get(t)
        if ln_rule is None:
            xau.append(f"{acid}({t}): thieu trong bang quy tac")
        elif abs(ln_rule - ln_scn) > 0.15:
            xau.append(f"{acid}({t}): quy tac {ln_rule} m vs .scn {ln_scn} m")
    check("A3. Bang chieu dai than khop voi gia tri nhung trong kich ban", not xau,
          f"{len(PUSH_LEN)} tau bay DI doi chieu duoc, {len(xau)} lech"
          + ("; " + "; ".join(xau[:3]) if xau else ""),
          "vvdn_35r_only_rules.json > chieu_dai_than_m (doi chieu cheo voi .scn)")


def A4_gian_cach_lich():
    kb = RULES["kich_ban"]
    d_arr = [ARRS[i]["t_cre"] - ARRS[i - 1]["t_cre"] for i in range(1, len(ARRS))]
    d_dep = [DEPS[i]["t_cre"] - DEPS[i - 1]["t_cre"] for i in range(1, len(DEPS))]
    check("A4. Nhip tau DI theo lich dung tham so generator",
          all(abs(d - kb["gian_cach_lich_DEP_giay"]) < 1.0 for d in d_dep),
          f"{len(DEPS)} chuyen DI, nhip {min(d_dep):.0f}-{max(d_dep):.0f} s "
          f"(tham so {kb['gian_cach_lich_DEP_giay']} s)",
          "vvdn_35r_only_rules.json > kich_ban.gian_cach_lich_DEP_giay")
    so_lieu("A5. Nhip tau DEN theo lich (thoi diem tao tau, khong phai cham banh)",
            f"{len(ARRS)} chuyen DEN, nhip {min(d_arr):.0f}-{max(d_arr):.0f} s; "
            f"thoi diem tao tau bi lech do moi STAR co do dai khac nhau -- "
            f"moc cham banh THAT do o muc B3",
            "Doc truc tiep tu .scn")


# ===========================================================================
# PHAN B -- CHAY MO PHONG HEADLESS VA DO SO LIEU THAT
# ===========================================================================
def run_headless(t_end, dt_log=1.0):
    os.chdir(HERE.parent)
    sys.path.insert(0, str(HERE.parent))
    import bluesky as bs

    bs.init(mode="sim", detached=True)
    bs.stack.stack("IC VVDN_35R_ONLY/VVDN_35R_ONLY")
    bs.sim.op()

    track = {}
    next_log = 0.0
    while bs.sim.simt < t_end:
        bs.sim.step()
        if bs.sim.simt >= next_log:
            for i, acid in enumerate(bs.traf.id):
                track.setdefault(acid, []).append(
                    (bs.sim.simt, float(bs.traf.lat[i]), float(bs.traf.lon[i]),
                     float(bs.traf.alt[i]) / 0.3048, float(bs.traf.gs[i]) / 0.514444))
            next_log += dt_log
    return track


def B1_hoan_thanh(track):
    """Moi chuyen DEN phai cham banh duoc; moi chuyen DI phai roi mat dat."""
    td = {}
    for a in ARRS:
        for (t, la, lo, alt, gs) in track.get(a["id"], []):
            if alt < 50 and hav_m(la, lo, *THR35R_GEO) < 3000:
                td[a["id"]] = t
                break
    thieu_a = [a["id"] for a in ARRS if a["id"] not in td]
    check("B1. Moi chuyen DEN deu cham banh duoc trong mo phong", not thieu_a,
          f"{len(td)}/{len(ARRS)} chuyen cham banh"
          + (f"; thieu: {thieu_a[:5]}" if thieu_a else ""),
          "Do truc tiep tu mo phong headless")

    lift = {}
    for d in DEPS:
        for (t, la, lo, alt, gs) in track.get(d["id"], []):
            if alt > 35:
                lift[d["id"]] = t
                break
    thieu_d = [d["id"] for d in DEPS if d["id"] not in lift]
    check("B2. Moi chuyen DI deu roi mat dat duoc trong mo phong", not thieu_d,
          f"{len(lift)}/{len(DEPS)} chuyen cat canh"
          + (f"; thieu: {thieu_d[:5]}" if thieu_d else ""),
          "Do truc tiep tu mo phong headless")
    return td, lift


def B3_phan_cach_ha_canh(track, td):
    """Cu ly THAT giua tau den sau va nguong 35R, do dung luc tau truoc cham banh."""
    cfg = RULES["phan_cach_ha_canh_lien_tiep_35R"]
    M, rmin = cfg["ma_tran"], cfg["radar_toi_thieu"]
    order = sorted((a for a in ARRS if a["id"] in td), key=lambda a: td[a["id"]])
    xau, do_duoc = [], []
    for i in range(1, len(order)):
        lead, tr = order[i - 1], order[i]
        need = max(M.get(f"{wake(tr['type'])}_sau_{wake(lead['type'])}",
                         M["MEDIUM_sau_MEDIUM"]), rmin)
        t0 = td[lead["id"]]
        pts = track.get(tr["id"], [])
        if not pts:
            continue
        p = min(pts, key=lambda x: abs(x[0] - t0))
        if abs(p[0] - t0) > 3:
            continue
        got = hav_m(p[1], p[2], *THR35R_GEO) / 1852.0
        do_duoc.append((lead["id"], tr["id"], got, need))
        if got < need - 0.1:
            xau.append(f"{lead['id']}({wake(lead['type'])[0]})->{tr['id']}"
                       f"({wake(tr['type'])[0]}): {got:.2f} NM < {need} NM")
    check("B3. Cu ly THAT giua hai tau HA CANH lien tiep tren 35R", not xau,
          f"{len(do_duoc)} cap do duoc, nho nhat "
          f"{min((x[2] for x in do_duoc), default=0):.2f} NM, {len(xau)} cap khong dat"
          + ("; " + "; ".join(xau[:4]) if xau else ""),
          "vvdn_35r_only_rules.json > phan_cach_ha_canh_lien_tiep_35R "
          "(MANOP, bang nhieu dong cho tau dung CUNG duong CHC = ICAO Doc 4444 8.7.3.4)")
    return do_duoc


def _khoang_tren_CHC(track):
    """{acid: [(t_vao, t_ra)]} cac khoang thoi gian tau bay o TREN mat 35R."""
    out = {}
    for acid, pts in track.items():
        spans, cur = [], None
        for (t, la, lo, alt, gs) in pts:
            on = tren_duong_CHC(la, lo, alt)
            if on and cur is None:
                cur = [t, t]
            elif on:
                cur[1] = t
            elif cur is not None:
                spans.append(tuple(cur))
                cur = None
        if cur is not None:
            spans.append(tuple(cur))
        if spans:
            out[acid] = spans
    return out


def B4_chiem_dung_duong_CHC(track):
    """MUC QUAN TRONG NHAT cua cau hinh mot duong CHC: tai moi thoi diem chi
    duoc co MOT tau tren 35R."""
    spans = _khoang_tren_CHC(track)
    # Gop thanh su kien theo tung giay de tim thoi diem co >= 2 tau
    occ = {}
    for acid, sp in spans.items():
        for (t0, t1) in sp:
            for t in range(int(math.floor(t0)), int(math.ceil(t1)) + 1):
                occ.setdefault(t, set()).add(acid)
    chong = {t: s for t, s in occ.items() if len(s) >= 2}
    # Gop cac giay lien tiep cung mot cap thanh mot su kien
    sukien = []
    for t in sorted(chong):
        k = tuple(sorted(chong[t]))
        if sukien and sukien[-1][2] == k and t - sukien[-1][1] <= 2:
            sukien[-1][1] = t
        else:
            sukien.append([t, t, k])
    # Voi moi su kien, do khoang cach doc tim nho nhat giua hai tau
    chi_tiet = []
    for (t0, t1, k) in sukien:
        dmin, tmin = 1e9, None
        for t in range(t0, t1 + 1):
            ps = {}
            for acid in k:
                cand = [p for p in track[acid] if abs(p[0] - t) < 0.6]
                if cand:
                    ps[acid] = ST35R(cand[0][1], cand[0][2])[0]
            if len(ps) == 2:
                a, b = list(ps)
                d = abs(ps[a] - ps[b])
                if d < dmin:
                    dmin, tmin = d, t
        chi_tiet.append((t0, t1, k, dmin, tmin))
    chi_tiet.sort(key=lambda x: x[3])

    mo_ta = "; ".join(
        f"{k[0]}+{k[1]} tu {fmt(t0)} den {fmt(t1)} ({t1 - t0 + 1:.0f}s), "
        f"cach nhau doc tim toi thieu {d:.0f} m"
        for (t0, t1, k, d, _tm) in chi_tiet[:4])
    check("B4. Chi co MOT tau bay tren duong CHC 35R tai moi thoi diem",
          not sukien,
          f"{len(sukien)} khoang thoi gian co tu 2 tau tro len tren 35R"
          + ("; " + mo_ta if sukien else "; khong co chong lan"),
          "vvdn_35r_only_rules.json > chiem_dung_duong_CHC_35R (MANOP: khong cap "
          "huan lenh ha canh cho den khi tau truoc da roi khoi duong CHC)")
    return spans, chi_tiet


def B5_thoat_ly_duong_CHC(track, td, spans):
    """Thoi gian tu luc cham banh den luc roi khoi mat duong CHC (<= 100 s)."""
    lim = RULES["chiem_dung_duong_CHC_35R"]["thoat_ly_duong_CHC_toi_da_giay"]
    xau, do_duoc = [], []
    for a in ARRS:
        sp = spans.get(a["id"])
        if not sp or a["id"] not in td:
            continue
        t_ra = max(s[1] for s in sp)
        dt = t_ra - td[a["id"]]
        do_duoc.append((a["id"], dt))
        if dt > lim:
            xau.append(f"{a['id']}({a['type']}): {dt:.0f} s > {lim} s")
    check("B5. Thoi gian thoat ly duong CHC 35R cua tau DEN", not xau,
          f"{len(do_duoc)} chuyen do duoc, lau nhat "
          f"{max((d for _i, d in do_duoc), default=0):.0f} s (gioi han {lim} s)"
          + ("; " + "; ".join(xau[:3]) if xau else ""),
          "vvdn_35r_only_rules.json > chiem_dung_duong_CHC_35R.thoat_ly_duong_CHC_toi_da_giay "
          "(MANOP Phu luc 2 CHC song song)")
    return do_duoc


def B6_xung_dot_tren_khong(track):
    c = RULES["canh_bao_xung_dot"]
    times = {}
    for acid, pts in track.items():
        for p in pts:
            times.setdefault(round(p[0]), []).append((acid, p))
    gop = {}
    for t, lst in times.items():
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                a, pa = lst[i]
                b, pb = lst[j]
                if pa[3] < 10 or pb[3] < 10:
                    continue  # tau da cham banh / chua roi dat: khong xet tren khong
                d = hav_m(pa[1], pa[2], pb[1], pb[2]) / 1852.0
                if d >= c["cu_ly_ngang_toi_thieu_NM"]:
                    continue
                dep = pa if a.startswith("DEP") else (pb if b.startswith("DEP") else None)
                arr = pb if a.startswith("DEP") else (pa if b.startswith("DEP") else None)
                if dep is None or arr is None:
                    continue
                if dep[3] > c["tau_cat_canh_cao_hon_ft"] and arr[3] < c["tau_ha_canh_thap_hon_ft"]:
                    k = tuple(sorted((a, b)))
                    if k not in gop or d < gop[k][1]:
                        gop[k] = (t, d)
    check("B6. Canh bao xung dot tren khong (tau DI vs tau DEN)", not gop,
          f"{len(gop)} cap canh bao"
          + ("; " + "; ".join(f"{k[0]}/{k[1]} {v[1]:.2f} NM luc {fmt(v[0])}"
                              for k, v in list(gop.items())[:4]) if gop else ""),
          f"vvdn_35r_only_rules.json > canh_bao_xung_dot "
          f"(DI >{c['tau_cat_canh_cao_hon_ft']} ft, DEN <{c['tau_ha_canh_thap_hon_ft']} ft, "
          f"<{c['cu_ly_ngang_toi_thieu_NM']} NM)")
    return gop


def B7_xung_dot_mat_dat(track):
    """Hai tau bay dang lan khong duoc lai gan hon nua chieu dai hai tau + 20 m."""
    dem = RULES["tham_so_lan"]["dem_sau_duoi_tau_truoc_m"]
    times = {}
    for acid, pts in track.items():
        for (t, la, lo, alt, gs) in pts:
            if alt < 10 and gs < 40:  # dang lan tren san
                times.setdefault(round(t), []).append((acid, la, lo))
    gop = {}
    for t, lst in times.items():
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                a, la1, lo1 = lst[i]
                b, la2, lo2 = lst[j]
                need = (LENGTHS.get(TYPES.get(a), 45.0) + LENGTHS.get(TYPES.get(b), 45.0)) / 2.0 + dem
                d = hav_m(la1, lo1, la2, lo2)
                if d < need:
                    k = tuple(sorted((a, b)))
                    if k not in gop or d < gop[k][1]:
                        gop[k] = (t, d, need)
    check("B7. Cu ly giua hai tau bay dang lan tren san", not gop,
          f"{len(gop)} cap vi pham"
          + ("; " + "; ".join(f"{k[0]}/{k[1]} {v[1]:.0f} m < {v[2]:.0f} m luc {fmt(v[0])}"
                              for k, v in list(gop.items())[:4]) if gop else ""),
          "vvdn_35r_only_rules.json > tham_so_lan (nua chieu dai hai tau + 20 m)")
    return gop


def B8_ve_den_ben(track):
    gpos = {"G24": RULES["so_do_san_bay"]["ben_do"]["G24"],
            "G11": RULES["so_do_san_bay"]["ben_do"]["G11"]}
    xa = []
    for a in ARRS:
        pts = track.get(a["id"])
        if not pts:
            xa.append(f"{a['id']}: khong co du lieu")
            continue
        last = pts[-1]
        d = min(hav_m(last[1], last[2], g[0], g[1]) for g in gpos.values())
        if d > 150.0:
            xa.append(f"{a['id']}: dung cach ben gan nhat {d:.0f} m")
    check("B8. Moi chuyen DEN deu lan ve toi khu vuc ben do", not xa,
          f"{len(ARRS) - len(xa)}/{len(ARRS)} chuyen ve den ben"
          + ("; " + "; ".join(xa[:4]) if xa else ""),
          "vvdn_35r_only_rules.json > so_do_san_bay.ben_do (nguong 150 m)")


NUA_RONG_CHC_M = 22.5  # duong CHC 35R rong 45 m


def B9_chay_da_bam_tim(track, lift):
    """Chay da cat canh phai bam tim duong CHC 35R.

    Do LECH NGANG lon nhat so voi tim 35R trong suot pha chay da (tu luc toc do
    vuot 30 kt den luc roi mat dat). Chi xet khi tau con tren mat dat va trong
    pham vi doc tim cua duong CHC -- de khong dinh phai doan sau khi roi dat
    (xem HUONG_DAN_TAO_KICH_BAN.md muc 4.4: do lech tim khong gioi han pham vi
    se ra so vo nghia)."""
    xau, do_duoc = [], []
    for d in DEPS:
        if d["id"] not in lift:
            continue
        lech = []
        for (t, la, lo, alt, gs) in track.get(d["id"], []):
            if t > lift[d["id"]] or alt >= 35 or gs < 30:
                continue
            s, x = ST35R(la, lo)
            if 0 <= s <= LEN35R:
                lech.append(abs(x))
        if not lech:
            continue
        mx = max(lech)
        do_duoc.append((d["id"], mx))
        if mx > NUA_RONG_CHC_M:
            xau.append(f"{d['id']}({d['type']}): lech tim toi da {mx:.0f} m "
                       f"(> nua rong {NUA_RONG_CHC_M:.0f} m)")
    check("B9. Chay da cat canh bam tim duong CHC 35R", not xau,
          f"{len(do_duoc)} chuyen do duoc, lech tim lon nhat "
          f"{max((m for _i, m in do_duoc), default=0):.0f} m, {len(xau)} chuyen ra ngoai mep"
          + ("; " + "; ".join(xau[:3]) if xau else ""),
          "runway_centerlines.geojson (do truc tiep); nua rong duong CHC 22,5 m. "
          "HUONG_DAN_TAO_KICH_BAN.md muc 4.3: 'Toa do ke thua co the sai -- diem vao "
          "duong CHC lay tu kich ban cu lech tim 41,2 m'")
    return do_duoc


def B9b_tau_troi(track):
    """Tau bay 'troi' do khoang trong giua hai lenh MOVE: dich chuyen giua hai
    mau ghi ngu y toc do mat dat KHONG THE co ve vat ly (> 250 kt khi con tren
    mat dat). Do bang DICH CHUYEN giua hai mau, KHONG dung toc do tuc thoi cua
    engine (HUONG_DAN_TAO_KICH_BAN.md muc 4.4)."""
    xau = []
    for acid, pts in track.items():
        for i in range(1, len(pts)):
            t0, la0, lo0, al0, _g0 = pts[i - 1]
            t1, la1, lo1, al1, _g1 = pts[i]
            dt = t1 - t0
            if dt <= 0 or al0 > 10 or al1 > 10:
                continue
            v_kt = hav_m(la0, lo0, la1, lo1) / dt / 0.514444
            if v_kt > 250.0:
                xau.append(f"{acid} luc {fmt(t1)}: {v_kt:.0f} kt khi con tren mat dat")
    check("B9b. Khong co tau bay bi 'troi' (khoang trong giua hai lenh MOVE)", not xau,
          f"{len(xau)} lan dich chuyen vo ly"
          + ("; " + "; ".join(xau[:3]) if xau else ""),
          "HUONG_DAN_TAO_KICH_BAN.md muc 4.2 (nguong 250 kt: cao hon moi toc do "
          "roi dat thuc te nen chi bat loi that)")


def B10_duong_lan_E(track, lift):
    cfg = RULES["han_che_duong_lan_E"]
    allowed, tol, excl = cfg["khi_cat_canh_code"], cfg["dung_sai_quanh_tim_m"], cfg["loai_tru_quanh_PREHOLD_m"]
    tc = json.loads((LAYOUT / "taxiway_centerlines.geojson").read_text(encoding="utf-8"))
    segs = []
    for f in tc["features"]:
        if f["properties"].get("name") != "E":
            continue
        g = f["geometry"]
        for ln in ([g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]):
            P = [XY(c[1], c[0]) for c in ln]
            segs += list(zip(P, P[1:]))
    if not segs:
        so_lieu("B10. Han che duong lan E", "khong tim thay doan duong lan ten 'E' "
                "trong taxiway_centerlines.geojson -- khong do duoc",
                "taxiway_centerlines.geojson")
        return

    def dseg(p, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        l2 = dx * dx + dy * dy
        f = 0.0 if l2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
        return math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy)

    ph = RULES["so_do_san_bay"]["diem_cho_cat_canh_35R"]["PREHOLD"]
    php = XY(ph[0], ph[1])
    tren_E = {}
    for acid, pts in track.items():
        s = set()
        for (t, la, lo, alt, gs) in pts:
            if alt > 10:
                continue
            p = XY(la, lo)
            if math.dist(p, php) < excl:
                continue
            if min(dseg(p, *sg) for sg in segs) < tol:
                s.add(int(t))
        if s:
            tren_E[acid] = s

    xau = []
    for d in DEPS:
        if d["id"] not in lift:
            continue
        # cua so cat canh: tu luc bat dau lan nhanh tren CHC den luc roi dat
        pts = [p for p in track.get(d["id"], []) if p[3] < 35]
        on_rwy = [p[0] for p in pts if tren_duong_CHC(p[1], p[2], p[3])]
        if not on_rwy:
            continue
        w0, w1 = min(on_rwy), lift[d["id"]]
        ok_codes = allowed.get(CODE.get(d["type"], "C"), [])
        for other, secs in tren_E.items():
            if other == d["id"] or CODE.get(TYPES.get(other), "C") in ok_codes:
                continue
            hit = sorted(t for t in secs if w0 <= t <= w1)
            if hit:
                xau.append(f"{d['id']}({CODE.get(d['type'])}) cat canh {fmt(w0)}-{fmt(w1)} khi "
                           f"{other}({CODE.get(TYPES.get(other))}) tren E {fmt(hit[0])}-{fmt(hit[-1])}")
    check("B10. Duong lan E khi tau code D/E/F cat canh 35R", not xau,
          f"{len(DEPS)} lan cat canh, {len(xau)} vi pham"
          + ("; " + "; ".join(xau[:3]) if xau else ""),
          "vvdn_35r_only_rules.json > han_che_duong_lan_E "
          "[pham vi 'tren duong lan E': CAN XAC NHAN cach hieu]")


def B11_tau_DI_xen_giua(track, td, lift, spans):
    """SO LIEU (khong cham diem): tau DI xen giua hai tau DEN tren MOT duong CHC.
    Van ban nguon chi yeu cau 'gia tang gian cach mot cach thich hop', khong cho
    con so, nen muc nay chi do va bao cao."""
    order = sorted((a for a in ARRS if a["id"] in td), key=lambda a: td[a["id"]])
    xen = []
    for i in range(1, len(order)):
        t0, t1 = td[order[i - 1]["id"]], td[order[i]["id"]]
        giua = [d["id"] for d in DEPS if d["id"] in lift and t0 < lift[d["id"]] < t1]
        if giua:
            pts = track.get(order[i]["id"], [])
            p = min(pts, key=lambda x: abs(x[0] - t0)) if pts else None
            nm = hav_m(p[1], p[2], *THR35R_GEO) / 1852.0 if p else float("nan")
            xen.append((order[i - 1]["id"], order[i]["id"], giua, t1 - t0, nm))
    if xen:
        nms = [x[4] for x in xen if not math.isnan(x[4])]
        so_lieu("B11. Tau DI xen giua hai tau DEN tren CUNG duong CHC 35R",
                f"{len(xen)}/{len(order) - 1} cap tau den co tau di xen giua; "
                f"gian cach hai tau den khi do: nho nhat {min(nms):.2f} NM, "
                f"lon nhat {max(nms):.2f} NM, trung binh {sum(nms) / len(nms):.2f} NM; "
                f"cach nhau ve thoi gian {min(x[3] for x in xen):.0f}-{max(x[3] for x in xen):.0f} s",
                "vvdn_35r_only_rules.json > phan_cach_tau_DI_xen_giua_hai_tau_DEN_mot_duong_CHC "
                "[CAN XAC NHAN: MANOP chi noi 'gia tang mot cach thich hop', KHONG cho nguong so]")
    else:
        so_lieu("B11. Tau DI xen giua hai tau DEN tren CUNG duong CHC 35R",
                "khong co truong hop nao", "-")
    return xen


def B12_thong_luong(track, td, lift):
    if not td or not lift:
        return
    t_all = sorted(list(td.values()) + list(lift.values()))
    span_h = (t_all[-1] - t_all[0]) / 3600.0
    so_lieu("B12. Thong luong thuc te cua cau hinh mot duong CHC",
            f"{len(td)} chuyen den + {len(lift)} chuyen di = {len(td) + len(lift)} "
            f"lan su dung duong CHC trong {span_h:.2f} gio "
            f"= {(len(td) + len(lift)) / span_h:.1f} lan/gio",
            "Do truc tiep tu mo phong headless")


# ===========================================================================
def bao_cao():
    n_dat = sum(1 for r in results if r[1] == "DAT")
    n_xau = sum(1 for r in results if r[1] == "KHONG DAT")
    n_sl = sum(1 for r in results if r[1] == "SO LIEU")
    print("=" * 78)
    print("KIEM CHUNG KICH BAN VVDN_35R_ONLY -- dong cua 35L, chi dung 35R")
    print("=" * 78)
    for muc, kl, ct, dk in results:
        print(f"\n[{kl:9s}] {muc}")
        print(f"            {ct}")
        print(f"            Nguon: {dk}")
    print("\n" + "=" * 78)
    print(f"TONG: {len(results)} muc -- {n_dat} DAT, {n_xau} KHONG DAT, {n_sl} muc so lieu")
    print("=" * 78)
    return n_xau


def main():
    static_only = "--static" in sys.argv
    A1_co_cau_doi_tau()
    A2_chi_dung_35R()
    A3_doi_chieu_chieu_dai_than()
    A4_gian_cach_lich()
    if not static_only:
        t_end = max(d["t_cre"] for d in DEPS) + 2100.0
        print(f"Dang chay mo phong headless den t={t_end:.0f}s ...", file=sys.stderr, flush=True)
        track = run_headless(t_end)
        td, lift = B1_hoan_thanh(track)
        B3_phan_cach_ha_canh(track, td)
        spans, _ = B4_chiem_dung_duong_CHC(track)
        B5_thoat_ly_duong_CHC(track, td, spans)
        B6_xung_dot_tren_khong(track)
        B7_xung_dot_mat_dat(track)
        B8_ve_den_ben(track)
        B9_chay_da_bam_tim(track, lift)
        B9b_tau_troi(track)
        B10_duong_lan_E(track, lift)
        B11_tau_DI_xen_giua(track, td, lift, spans)
        B12_thong_luong(track, td, lift)
        out = SCN_DIR / "VVDN_35R_ONLY.verify.json"
        out.write_text(json.dumps(
            [{"muc": m, "ket_luan": k, "chi_tiet": c, "nguon": d} for m, k, c, d in results],
            ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Da ghi {out}", file=sys.stderr)
    return bao_cao()


if __name__ == "__main__":
    sys.exit(1 if main() else 0)

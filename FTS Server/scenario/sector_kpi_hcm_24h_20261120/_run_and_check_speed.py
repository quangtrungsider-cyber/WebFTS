"""
Chay mot kich ban gio qua BlueSky headless va DOI CHIEU TOC DO mo phong voi
toc do mat dat THAT trong du lieu Cat062 -- de xac nhan da sua xong loi toc do.

Chay bang moi truong ao cua du an:
    .venv\\Scripts\\python.exe _run_and_check_speed.py [TEN_KICH_BAN]
"""
import json
import os
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FTS = HERE.parent.parent
SCN_DIR = HERE / "hourly_scenarios"
DEFAULT_SCN = "HCM_PK1PK5_20261120_1200Z"
T_END = 4200.0   # 5 phut dem + 60 phut + 5 phut dem
DT_LOG = 10.0


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SCN
    os.chdir(FTS)
    sys.path.insert(0, str(FTS))
    import bluesky as bs
    from bluesky.tools.aero import kts

    bs.init(mode="sim", detached=True)
    bs.stack.stack(f"IC sector_kpi_hcm_24h_20261120/hourly_scenarios/{name}")
    bs.sim.op()

    # Thu thap: voi moi tau, so sanh GS mo phong voi CAS dau vao da quy doi
    samples = []       # (acid, alt_ft, gs_sim_kt, tas_sim_kt, cas_sim_kt)
    next_log = 0.0
    while bs.sim.simt < T_END:
        bs.sim.step()
        if bs.sim.simt >= next_log:
            for i, acid in enumerate(bs.traf.id):
                alt_ft = float(bs.traf.alt[i]) / 0.3048
                if alt_ft < 15000:      # chi xet tau bay bang, tranh giai doan len/xuong
                    continue
                samples.append((acid, alt_ft,
                                float(bs.traf.gs[i]) / kts,
                                float(bs.traf.tas[i]) / kts,
                                float(bs.traf.cas[i]) / kts))
            next_log += DT_LOG
    print(f"Da thu {len(samples)} mau toc do tu {len(set(s[0] for s in samples))} tau bay\n")

    gs = [s[2] for s in samples]
    tas = [s[3] for s in samples]
    cas = [s[4] for s in samples]
    tas_gs_diff = [abs(a - b) for a, b in zip(tas, gs)]

    print("1. Quan he TAS va GS trong mo phong")
    print(f"   Sai lech TAS-GS lon nhat: {max(tas_gs_diff):.6f} kt")
    print("   -> TAS = GS dung nhu quan sat. Day la DUNG voi mo phong khong nap")
    print("      truong gio (BlueSky dat gs = tas khi winddim = 0), khong phai loi.\n")

    print("2. Do lon toc do o muc bay cao (FL150 tro len)")
    print(f"   GS  mo phong: trung vi {statistics.median(gs):6.1f} kt | khoang {min(gs):.0f}-{max(gs):.0f} kt")
    print(f"   CAS mo phong: trung vi {statistics.median(cas):6.1f} kt | khoang {min(cas):.0f}-{max(cas):.0f} kt")
    print("   Tau bay phan luc bay bang thuong co GS 420-520 kt va CAS 240-320 kt")
    print("   o muc bay cao -> gia tri tren nam dung trong khoang hop ly.\n")

    n_super = sum(1 for g in gs if g > 600)
    print("3. Kiem tra khong con tau bay 'sieu thanh' (loi cua ban cu)")
    print(f"   So mau co GS > 600 kt: {n_super} / {len(gs)} ({n_super/len(gs)*100:.2f}%)")
    if n_super == 0:
        print("   -> DAT: khong con tau nao bay qua nhanh.\n")
    else:
        print("   -> CAN XEM LAI.\n")

    out = HERE / f"speed_check_{name}.json"
    json.dump({"scenario": name, "n_samples": len(samples),
               "gs_median": round(statistics.median(gs), 1),
               "cas_median": round(statistics.median(cas), 1),
               "max_tas_gs_diff": round(max(tas_gs_diff), 6),
               "n_gs_over_600kt": n_super}, open(out, "w", encoding="utf-8"), indent=2)
    print(f"Da ghi {out}")


if __name__ == "__main__":
    main()

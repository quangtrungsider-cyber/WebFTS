"""Chay HAN_PK2_PEAK_20260605_0950-1110.scn qua BlueSky headless de kiem tra
toc do/quy dao hop ly (khong sieu thanh, khong NaN)."""
import os
import sys
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
FTS = HERE.parent.parent

SCN_NAME = "HAN_PK2_PEAK_20260605_0950-1110"
T_END = 4800.0  # 09:50 -> 11:10 = 80 phut
DT_LOG = 5.0


def run_headless(t_end, dt_log=5.0):
    os.chdir(FTS)
    sys.path.insert(0, str(FTS))
    import bluesky as bs

    bs.init(mode="sim", detached=True)
    bs.stack.stack(f"IC acc_han_sectorization/{SCN_NAME}")
    bs.sim.op()

    speed_samples = []
    next_log = 0.0
    n_steps = 0
    max_cas = 0.0
    max_gs = 0.0
    n_aircraft_seen = set()
    while bs.sim.simt < t_end:
        bs.sim.step()
        n_steps += 1
        if bs.sim.simt >= next_log:
            for i, acid in enumerate(bs.traf.id):
                n_aircraft_seen.add(acid)
                cas_kt = float(bs.traf.cas[i]) / 0.514444
                gs_kt = float(bs.traf.gs[i]) / 0.514444
                max_cas = max(max_cas, cas_kt)
                max_gs = max(max_gs, gs_kt)
                if len(speed_samples) < 2_000_000:
                    speed_samples.append(gs_kt)
            next_log += dt_log
    return n_steps, len(n_aircraft_seen), max_cas, max_gs, speed_samples


def main():
    print(f"Dang chay headless {SCN_NAME} den t={T_END}s ...", flush=True)
    n_steps, n_ac, max_cas, max_gs, samples = run_headless(T_END, DT_LOG)
    samples.sort()
    n = len(samples)
    median = samples[n // 2] if n else 0.0
    p95 = samples[int(n * 0.95)] if n else 0.0
    n_over_700 = sum(1 for s in samples if s > 700.0)
    print(f"Hoan tat: {n_steps} step, {n_ac} may bay xuat hien.")
    print(f"GS: median={median:.1f} kt, p95={p95:.1f} kt, max={max_gs:.1f} kt, max CAS={max_cas:.1f} kt")
    print(f"So mau GS > 700 kt (sieu thanh): {n_over_700} / {n}")
    result = {
        "n_steps": n_steps, "n_aircraft": n_ac,
        "gs_median_kt": round(median, 1), "gs_p95_kt": round(p95, 1),
        "gs_max_kt": round(max_gs, 1), "cas_max_kt": round(max_cas, 1),
        "n_samples_over_700kt": n_over_700, "n_samples_total": n,
    }
    out = HERE / f"{SCN_NAME}.headless_check.json"
    json.dump(result, open(out, "w", encoding="utf-8"), indent=2)
    print(f"Da ghi {out}")


if __name__ == "__main__":
    main()

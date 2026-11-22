"""
Kiem chung phep quy doi toc do GS -> CAS.

Chay bang moi truong ao CUA DU AN (co BlueSky) de so sanh:
  - ham _vtas2cas() nhung trong _gen_scenarios_v2.py (ban sao chep)
  - ham vtas2cas() GOC cua BlueSky
va kiem tra khu hoi: vcas2tas(gs_to_cas(gs, alt), alt) == gs.

    .venv\\Scripts\\python.exe _verify_speed_fix.py
"""
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FTS = HERE.parent.parent
sys.path.insert(0, str(FTS))

from bluesky.tools.aero import vtas2cas, vcas2tas, kts, ft  # noqa: E402

# --- ban sao chep dang dung trong _gen_scenarios_v2.py --------------------
R_AIR, P0, RHO0, TSTRAT = 287.05287, 101325.0, 1.225, 216.65


def _vatmos(h_m):
    T = max(288.15 - 0.0065 * h_m, TSTRAT)
    rhotrop = 1.225 * (T / 288.15) ** 4.256848030018761
    rho = rhotrop * math.exp(-max(0.0, h_m - 11000.0) / 6341.552161)
    return rho * R_AIR * T, rho, T


def _vtas2cas(tas_ms, h_m):
    p, rho, _ = _vatmos(h_m)
    qdyn = p * ((1.0 + rho * tas_ms * tas_ms / (7.0 * p)) ** 3.5 - 1.0)
    return math.sqrt(7.0 * P0 / RHO0 * ((qdyn / P0 + 1.0) ** (2.0 / 7.0) - 1.0))


def main():
    print(f"{'FL':>5}{'GS that':>10}{'CAS (ban sao)':>15}{'CAS (BlueSky)':>15}{'lech':>10}{'TAS khu hoi':>13}{'lech kh':>10}")
    max_copy_err = max_roundtrip_err = 0.0
    for fl in range(50, 451, 25):
        for gs in (250.0, 350.0, 450.0, 520.0):
            h = fl * 100 * ft
            cas_copy = _vtas2cas(gs * kts, h) / kts
            cas_ref = float(vtas2cas(gs * kts, h)) / kts
            tas_back = float(vcas2tas(cas_copy * kts, h)) / kts
            e1, e2 = abs(cas_copy - cas_ref), abs(tas_back - gs)
            max_copy_err = max(max_copy_err, e1)
            max_roundtrip_err = max(max_roundtrip_err, e2)
            if fl % 100 == 0 and gs == 450.0:
                print(f"{fl:>5}{gs:>10.0f}{cas_copy:>15.3f}{cas_ref:>15.3f}{e1:>10.6f}{tas_back:>13.3f}{e2:>10.6f}")
    print()
    print(f"Sai lech LON NHAT giua ban sao va ham goc BlueSky : {max_copy_err:.9f} kt")
    print(f"Sai lech LON NHAT cua phep khu hoi GS->CAS->TAS   : {max_roundtrip_err:.9f} kt")
    ok = max_copy_err < 1e-6 and max_roundtrip_err < 1e-6
    print("\n" + ("DAT: phep quy doi chinh xac." if ok else "KHONG DAT!"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

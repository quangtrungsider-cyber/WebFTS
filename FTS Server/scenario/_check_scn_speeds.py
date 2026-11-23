"""Kiem tra nhanh tham so toc do trong cac tep .scn.

Chay trong CI hoac truoc khi ban giao kich ban. Bat dung loai loi da xay ra:
nap thang ground speed vao tham so ma BlueSky doc la CAS, khien tau bay o
~750 kt TAS.

    python scenario/_check_scn_speeds.py [thu_muc_hoac_tep ...]

Quy tac: voi may bay bay bang (FL250 tro len), tham so toc do PHAI la CAS
nam trong 180-360 kt. Neu thay 400-550 kt thi gan nhu chac chan ai do da ghi
ground speed vao thang.
"""

from __future__ import annotations

import re
import statistics
import sys
from pathlib import Path

CRE = re.compile(
    r"^[\d:.]+>CRE\s+\S+?,\S+?,[-\d.]+,[-\d.]+,[-\d.]+,([-\d.]+),([-\d.]+)", re.I
)
MIN_FL = 250.0
CAS_LO, CAS_HI = 180.0, 360.0


def check(path: Path) -> bool:
    spds, fls = [], []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = CRE.match(line)
        if not m:
            continue
        fl = float(m.group(1)) / 100.0
        if fl >= MIN_FL:
            fls.append(fl)
            spds.append(float(m.group(2)))
    if not spds:
        print(f"  {path.name}: khong co tau bay bang de kiem tra")
        return True

    med = statistics.median(spds)
    ok = CAS_LO <= med <= CAS_HI
    print(
        f"  {path.name}: {len(spds)} tau o FL{statistics.median(fls):.0f}+, "
        f"toc do trung vi {med:.0f} kt -> {'DAT' if ok else 'SAI'}"
    )
    if not ok:
        hint = (
            "co ve la ground speed ghi thang vao (phai quy doi sang CAS bang "
            "windkit.gs_to_cas_kt)"
            if med > CAS_HI
            else "thap bat thuong, kiem tra don vi cot nguon (m/s hay knot?)"
        )
        print(f"      {hint}")
    return ok


def main() -> int:
    args = sys.argv[1:] or ["scenario"]
    files: list[Path] = []
    for a in args:
        p = Path(a)
        files.extend(sorted(p.rglob("*.scn")) if p.is_dir() else [p])
    files = [f for f in files if "Backup" not in f.parts]
    if not files:
        print("Khong tim thay tep .scn nao")
        return 0

    print(f"Kiem tra {len(files)} tep kich ban:")
    bad = [f for f in files if not check(f)]
    print()
    if bad:
        print(f"SAI: {len(bad)}/{len(files)} tep co tham so toc do bat thuong")
        return 1
    print(f"DAT: ca {len(files)} tep deu hop le")
    return 0


if __name__ == "__main__":
    sys.exit(main())

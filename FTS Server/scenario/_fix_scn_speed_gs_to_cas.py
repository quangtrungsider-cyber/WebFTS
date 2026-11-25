"""Sua tham so toc do trong tep .scn: ground speed -> calibrated airspeed.

Dung cho cac kich ban duoc dung tu du lieu giam sat ma nguoi viet nap thang
ground speed vao tham so toc do cua CRE/MOVE. BlueSky doc tham so do la CAS,
nen o muc bay cao tau bay se bay nhanh hon thuc te 1.4-1.7 lan (nap 447 kt o
FL290 thanh ~640 kt TAS).

Chi sua con so toc do, giu nguyen tung byte con lai cua tep, ke ca dinh dang
lenh MOVE co hay khong co tham so vspd.

    python scenario/_fix_scn_speed_gs_to_cas.py <tep.scn> [tep.scn ...]
    python scenario/_fix_scn_speed_gs_to_cas.py --dry-run <tep.scn>

Chay lai nhieu lan khong gay hai: tep da sua mang dong danh dau o dau va se
bi bo qua.

TRUOC KHI DUNG phai kiem chung cot toc do cua nguon DUNG la ground speed
tinh bang knot, bang cach do toc do tu hai toa do lien tiep roi so sanh (xem
scenario/_check_scn_speeds.py). Neu nguon dung don vi khac, vi du m/s nhu
r72_tracks_20260605.csv, thi phai quy doi don vi truoc.
"""

from __future__ import annotations

import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from windkit import gs_to_cas_kt  # noqa: E402

MARKER = "# TOC DO: da quy doi GS -> CAS"

# CRE acid,type,lat,lon,hdg,alt,spd
CRE = re.compile(
    r"^(?P<pre>[\d:.]+>\s*CRE\s+[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,)"
    r"(?P<alt>[-\d.]+),(?P<spd>[-\d.]+)(?P<post>.*)$",
    re.I,
)
# MOVE acid,lat,lon,alt,hdg,spd[,vspd]
MOVE = re.compile(
    r"^(?P<pre>[\d:.]+>\s*MOVE\s+[^,]+,[^,]+,[^,]+,)"
    r"(?P<alt>[-\d.]+),(?P<hdg>[-\d.]+),(?P<spd>[-\d.]+)(?P<post>.*)$",
    re.I,
)


def convert(path: Path, dry_run: bool = False) -> tuple[int, bool]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if MARKER in text:
        print(f"  {path.name}: da sua truoc do, bo qua")
        return 0, False

    out, changed = [], 0
    for line in text.splitlines():
        m = CRE.match(line)
        if m:
            alt, spd = float(m.group("alt")), float(m.group("spd"))
            cas = float(gs_to_cas_kt(spd, alt))
            out.append(f"{m.group('pre')}{m.group('alt')},{cas:.1f}{m.group('post')}")
            changed += 1
            continue
        m = MOVE.match(line)
        if m:
            alt, spd = float(m.group("alt")), float(m.group("spd"))
            cas = float(gs_to_cas_kt(spd, alt))
            out.append(
                f"{m.group('pre')}{m.group('alt')},{m.group('hdg')},"
                f"{cas:.1f}{m.group('post')}"
            )
            changed += 1
            continue
        out.append(line)

    if not changed:
        print(f"  {path.name}: khong co lenh CRE/MOVE nao de sua")
        return 0, False

    header = [
        MARKER + " (ground speed -> calibrated airspeed),",
        "#          vi BlueSky doc tham so toc do cua CRE/MOVE la CAS.",
        f"#          Sua ngay {datetime.now().strftime('%Y-%m-%d')} bang "
        "scenario/_fix_scn_speed_gs_to_cas.py",
    ]
    new_text = "\n".join(header + out) + "\n"

    if dry_run:
        print(f"  {path.name}: se sua {changed} lenh (dry-run, chua ghi)")
        return changed, False

    backup = path.with_suffix(path.suffix + f".bak_{datetime.now():%Y%m%d_%H%M%S}")
    shutil.copy2(path, backup)
    path.write_text(new_text, encoding="utf-8")
    print(f"  {path.name}: da sua {changed} lenh (ban goc: {backup.name})")
    return changed, True


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        print(__doc__)
        return 2
    print(f"{'Thu' if dry else 'Sua'} {len(args)} tep:")
    total = sum(convert(Path(a), dry)[0] for a in args)
    print(f"\nTong {total} lenh {'se duoc' if dry else 'da'} quy doi")
    return 0


if __name__ == "__main__":
    sys.exit(main())

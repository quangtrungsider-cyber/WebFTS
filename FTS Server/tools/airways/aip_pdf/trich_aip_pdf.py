"""Trich chu va bang tu cac PDF AIP (AD 2) cua mot san bay, KHONG dua noi dung qua LLM.

Quy trinh 3 buoc de bo sung do cao / toc do vao PTB hien thi cua 1 san bay:
    1. trich_aip_pdf.py      PDF -> chu + bang        (script nay)
    2. parse_aip_tables.py   bang -> procedures.json
    3. ../add_perf_from_aip.py   procedures.json -> du lieu PTB (them thuoc tinh)
Dat PDF cua moi san bay trong 1 thu muc ten = ICAO (vd "PDF AIP\\VVBM"; thu muc PDF
AIP khong nam trong git). Dung python cua venv du an:
    .venv\\Scripts\\python.exe -I "FTS Server\\tools\\airways\\aip_pdf\\trich_aip_pdf.py" "PDF AIP\\VVBM"

Moi thu muc san bay cho ra thu muc "PDF AIP\\_out\\<ICAO>\\" gom:
    index.csv            1 dong / trang PDF: file, trang, ma trang AD 2-..., tieu de,
                         loai (bang mieu ta / thong so vet bay / so do ...), so ky tu,
                         so bang, canh bao quet-anh
    <ten file>.txt       chu cua tung trang
    <ten file>.tables.json  bang tach duoc (list cac bang, moi bang la list dong)
    SUMMARY.txt          thong ke ngan

Script chi DOC pdf, khong sua file nguon. Khong dung mang.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

import pdfplumber

# Ma trang: ban tieng Viet "AD 2-VVBM-9-4"; ban tieng Anh "AD 2.24-8b-1a"
CODE_RE = re.compile(r"AD\s*2\s*-\s*VV[A-Z]{2}\s*-\s*\d+\s*-\s*\d+|AD\s*2\.\d+\s*-\s*\w+\s*-\s*\w+")
SCAN_CHARS = 80  # it hon nguong nay = nghi la anh quet (hoac trang trong)

# (nhan, khoa tim trong van ban da bo dau thanh chu thuong khong dau)
KINDS = [
    ("DESCRIPTION_TABLE", ("bang mieu ta", "danh muc lo diem", "description table", "waypoint list",
                           "coding table")),
    ("TRACK_PARAMS", ("thong so vet bay", "connecting track")),
    ("SID", ("khoi hanh tieu chuan", "standard departure")),
    ("STAR", ("den tieu chuan", "standard arrival")),
    ("IAP", ("tiep can bang thiet bi", "tiep can bang mat", "instrument approach")),
    ("AERODROME", ("so do san bay", "san do", "chuong ngai vat", "tieu chuan khai thac",
                   "aerodrome chart", "parking", "obstacle")),
]


def strip_accents(s: str) -> str:
    import unicodedata

    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def classify(text: str) -> str:
    t = " " + strip_accents(text).lower() + " "
    hits = [name for name, keys in KINDS if any(k in t for k in keys)]
    if "DESCRIPTION_TABLE" in hits or "TRACK_PARAMS" in hits:
        return "+".join(h for h in hits if h in ("DESCRIPTION_TABLE", "TRACK_PARAMS"))
    return "+".join(hits) or "OTHER"


def process_pdf(pdf_path: Path, out_dir: Path, rows: list[dict]) -> None:
    pages_text: list[str] = []
    tables_out: list[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            try:
                text = page.extract_text() or ""
            except Exception as e:  # noqa: BLE001
                text = ""
                print(f"  ! {pdf_path.name} p{n}: extract_text loi: {e}")
            try:
                tables = page.extract_tables() or []
            except Exception as e:  # noqa: BLE001
                tables = []
                print(f"  ! {pdf_path.name} p{n}: extract_tables loi: {e}")
            m = CODE_RE.search(text)
            code = re.sub(r"\s+", "", m.group(0)) if m else ""
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
            # tieu de = vai dong dau co chu "So do"/"Bang" ... (lay 2 dong dau khong phai ma trang)
            head = " | ".join([ln for ln in lines[:6] if not CODE_RE.search(ln)][:3])
            chars = len(text.strip())
            rows.append(
                {
                    "file": pdf_path.name,
                    "page": n,
                    "code": code,
                    "kind": classify(text),
                    "chars": chars,
                    "tables": len(tables),
                    "scan_suspect": "YES" if chars < SCAN_CHARS else "",
                    "head": head[:160],
                }
            )
            pages_text.append(f"===== {pdf_path.name} | trang {n} | {code} =====\n{text}\n")
            for ti, tb in enumerate(tables, 1):
                tables_out.append({"page": n, "table": ti, "rows": tb})
    (out_dir / f"{pdf_path.stem}.txt").write_text("\n".join(pages_text), encoding="utf-8")
    (out_dir / f"{pdf_path.stem}.tables.json").write_text(
        json.dumps(tables_out, ensure_ascii=False, indent=1), encoding="utf-8"
    )


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    src = Path(sys.argv[1]).resolve()
    if not src.is_dir():
        print(f"Khong phai thu muc: {src}")
        return 2
    icao = src.name
    out_dir = src.parent / "_out" / icao   # canh thu muc chua cac thu muc san bay (vd PDF AIP/_out/VVBM)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(src.glob("*.pdf"), key=lambda p: (len(p.stem), p.stem))
    if not pdfs:
        print(f"Khong co .pdf trong {src}")
        return 1
    rows: list[dict] = []
    for p in pdfs:
        try:
            process_pdf(p, out_dir, rows)
        except Exception as e:  # noqa: BLE001
            print(f"  ! Khong mo duoc {p.name}: {e}")
            rows.append({"file": p.name, "page": 0, "code": "", "kind": "ERROR",
                         "chars": 0, "tables": 0, "scan_suspect": "", "head": str(e)[:160]})

    rows.sort(key=lambda r: tuple(int(x) for x in re.findall(r"\d+", r["code"])[-2:]) or (999, 999))
    with open(out_dir / "index.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    scan = sum(1 for r in rows if r["scan_suspect"])
    with_tables = sum(1 for r in rows if r["tables"])
    kinds: dict[str, int] = {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    summary = [
        f"San bay: {icao}",
        f"So file PDF: {len(pdfs)}   So trang: {len(rows)}",
        f"Trang nghi la anh quet (it chu): {scan}",
        f"Trang tach duoc bang: {with_tables}",
        "Phan loai: " + ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())),
        f"Ket qua: {out_dir}",
    ]
    (out_dir / "SUMMARY.txt").write_text("\n".join(summary), encoding="utf-8")
    print("\n".join(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

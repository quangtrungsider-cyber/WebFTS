"""
Them polygon "PK1 New" / "PK5 New" (du thao tach Phan khu 1 va Phan khu 5
ACC Ho Chi Minh) vao du lieu "Quan ly Phan khu" cua WebFTS, KHONG xoa/sua
cac Phan khu 1, Phan khu 5 cu.

Nguon toa do: file Word "Toa_do_tach_PK1_PK5_ACC_HCM.docx" nguoi dung cung
cap, trich tu Phu luc 3 va Phu luc 8 (Phuong an to chuc vung troi ACC Ho Chi
Minh, du thao tach PK1/PK5). Cac diem D29, DONDA lay bo sung tu
vietnam_acc_sector_boundaries.geojson (da doi chieu AIP SUP A37/23).

Doan bien gioi FIR (VN-Campuchia cho 1A; FIR HCM-Singapore/Manila cho 5B)
KHONG co toa do chi tiet trong nguon -- noi THANG giua 2 diem da biet, danh
dau geometry_caveat ro rang thay vi bia them diem.

Ghi vao:
  - WebATM/static/data/vatm_kmz/vatm_acc_fir_sectors.geojson  (them feature)
  - WebATM/static/data/vatm_kmz/airspace_index.json           (them muc chon)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GEOJSON_PATH = ROOT / "WebATM/static/data/vatm_kmz/vatm_acc_fir_sectors.geojson"
INDEX_PATH = ROOT / "WebATM/static/data/vatm_kmz/airspace_index.json"

# Toa do thap phan (lat, lon) tu bang Word nguoi dung cung cap, + D29/DONDA
# bo sung tu vietnam_acc_sector_boundaries.geojson (AIP SUP A37/23).
PTS = {
    "D01": (13.305556, 107.607778),
    "D02": (14.686111, 107.556667),
    "E01": (13.330833, 107.990833),
    "P10": (15.236944, 108.425278),
    "D23": (13.363889, 108.506111),
    "D04": (16.000000, 110.345278),
    "D05": (15.679444, 110.698056),
    "D24": (13.260556, 108.657500),
    "VIMUT": (13.962500, 109.521389),
    "DN4": (12.509722, 108.648611),
    "D21": (11.904444, 109.492778),
    "P09": (11.543889, 109.219722),
    "P12": (11.942222, 108.641389),
    "P08": (11.062778, 109.148056),
    "P07": (10.634444, 110.017778),
    "D29": (14.617222, 112.638333),
    "P11": (9.555000, 109.333889),
    "P06": (9.575833, 108.995000),
    "RUTIT": (10.454167, 107.757500),
    "P05": (10.590833, 107.447222),
    "P01": (12.101944, 108.406667),
    "OSIXA": (9.522222, 109.843889),
    "D08": (9.564722, 112.368889),
    "DONDA": (14.703333333, 112.021666667),  # tu vietnam_acc_sector_boundaries.geojson (AIP SUP A37/23)
}


def ring(names):
    """[lon, lat] theo dung thu tu GeoJSON, tu dong khep vong."""
    coords = [[PTS[n][1], PTS[n][0]] for n in names]
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    return coords


SECTORS = [
    {
        "id": "PK1NEW_1A",
        "name": "SECTOR 1A (PK1 New - du thao)",
        "points": ["D02", "P10", "D23", "E01", "D01"],
        "vert_lo": 0, "vert_lo_uom": "GND", "vert_hi": 460,
        "caveat": (
            "Doan D01-D02 trong du thao bam theo bien gioi Viet Nam-Campuchia "
            "(khong phai duong thang); o day ve THANG giua 2 diem do chua co "
            "toa do chi tiet duong bien gioi trong nguon duoc cung cap. Tru vung "
            "trach nhiem APP Da Nang (moi) va TWR Pleiku (moi) chua duoc tru ra "
            "khoi polygon (chi la vung trach nhiem toan phan khu)."
        ),
    },
    {
        "id": "PK1NEW_1B1",
        "name": "SECTOR 1B.1 (PK1 New - du thao)",
        "points": ["P10", "D04", "D05", "VIMUT", "DN4", "D24", "D23"],
        "vert_lo": 0, "vert_lo_uom": "GND", "vert_hi": 460,
        "caveat": "Tru vung trach nhiem APP Da Nang (moi) va TWR Phu Cat (moi) chua duoc tru ra khoi polygon.",
    },
    {
        "id": "PK1NEW_1B2",
        "name": "SECTOR 1B.2 (PK1 New - du thao)",
        "points": ["DN4", "VIMUT", "D21", "P09", "P12"],
        "vert_lo": 0, "vert_lo_uom": "GND", "vert_hi": 265,
        "caveat": "Tru vung trach nhiem APP Cam Ranh, TWR Phu Cat (moi) va TWR Tuy Hoa chua duoc tru ra khoi polygon.",
    },
    {
        "id": "PK5NEW_5A1",
        "name": "SECTOR 5A.1 (PK5 New - du thao)",
        "points": ["D05", "DONDA", "D29", "P07", "P08", "P09", "D21", "VIMUT"],
        "vert_lo": 0, "vert_lo_uom": "GND", "vert_hi": 460,
        "caveat": (
            "Doan D05-DONDA trong du thao la doan duong bay toi DONDA tren duong "
            "bay M771 (uy quyen cho ACC HCM dieu hanh), khong phai duong thang; "
            "o day ve THANG giua 2 diem vi thieu danh sach diem trung gian tren "
            "M771. Tru vung trach nhiem APP Cam Ranh, TWR Tuy Hoa va TWR Phu Cat "
            "(moi) chua duoc tru ra khoi polygon."
        ),
    },
    {
        "id": "PK5NEW_5A2",
        "name": "SECTOR 5A.2 (PK5 New - du thao)",
        "points": ["DN4", "VIMUT", "D21", "P09", "P12"],
        "vert_lo": 265, "vert_lo_uom": "FL", "vert_hi": 460,
    },
    {
        "id": "PK5NEW_5A3",
        "name": "SECTOR 5A.3 (PK5 New - du thao)",
        "points": ["DN4", "P12", "P09", "P08", "P07", "P11", "P06", "RUTIT", "P05", "P01"],
        "vert_lo": 305, "vert_lo_uom": "FL", "vert_hi": 460,
    },
    {
        "id": "PK5NEW_5B",
        "name": "SECTOR 5B (PK5 New - du thao)",
        "points": ["D29", "P07", "P11", "OSIXA", "UDOSI_MISSING", "D08"],
        "vert_lo": 0, "vert_lo_uom": "GND", "vert_hi": 460,
        "caveat": (
            "Doan D08 -> ranh gioi FIR HCM-Singapore -> ranh gioi FIR HCM-Manila "
            "(kinh tuyen 114 do Dong) -> giao cat vi tuyen 14 do 42'12\"B -> doc "
            "vi tuyen do -> D29 trong du thao bam theo duong bien FIR that, KHONG "
            "phai duong thang; o day ve THANG tu D08 toi giao diem toan hoc "
            "114 do Dong x 14 do 42'12\"B (14.703333N, 114.0E) roi toi D29, vi "
            "thieu toa do chi tiet duong bien FIR trong nguon duoc cung cap. "
            "CAN xac nhan lai tu AIP/KMZ ranh gioi FIR truoc khi dung chinh thuc."
        ),
    },
]


def main():
    # UDOSI toa do that (tu vietnam_ats_route_points.csv, AIP ENR 3.1), bo
    # sung truc tiep vi document nguon ghi ro "khong liet ke toa do UDOSI"
    PTS["UDOSI_MISSING"] = (9.546944, 111.181389)

    # diem giao toan hoc 114E x 14 do42'12"N dung de khep polygon 5B
    corner_114E = [114.0, 14.703333333]

    with open(GEOJSON_PATH, encoding="utf-8") as f:
        geo = json.load(f)
    existing_ids = {f["properties"]["id"] for f in geo["features"]}

    new_features = []
    for sec in SECTORS:
        if sec["id"] in existing_ids:
            raise RuntimeError(f"ID da ton tai, dung lai: {sec['id']}")
        coords = ring(sec["points"])
        if sec["id"] == "PK5NEW_5B":
            # chen diem goc toan hoc giua D08 va D29 (dong vong) truoc khi khep
            coords = coords[:-1] + [corner_114E, coords[-1]]
        props = {
            "id": sec["id"],
            "name": sec["name"],
            "category": "ACC_FIR_SECTOR",
            "top_folder": "VÙNG TRỜI ĐƯỜNG DÀI (ACC)",
            "folder_path": (
                "DỰ THẢO TÁCH PHÂN KHU 1 & 5 (2024)/ACC HO CHI MINH/" + sec["name"]
            ),
            "airport_icao": "",
            "procedure_type": "",
            "navigation_type": "",
            "runway": "",
            "geometry_type": "Polygon",
            "description": (
                f"Ident_Txt HO CHI MINH ACC (DU THAO) Name_Txt {sec['name']} "
                f"DistVertUpper_Val {sec['vert_hi']} DistVertUpper_UOM FL "
                f"DistVertLower_Val {sec['vert_lo']} DistVertLower_UOM {sec['vert_lo_uom']} "
                f"Diem_noi {' - '.join(p.replace('_MISSING','') for p in sec['points'])}"
            ),
            "source": (
                "Du thao Phuong an to chuc vung troi ACC Ho Chi Minh - Phu luc 3 va "
                "Phu luc 8 (tach PK1/PK5) + bang toa do WGS-84 xac nhan "
                "(Toa_do_tach_PK1_PK5_ACC_HCM.docx)"
            ),
            "status": "DỰ THẢO - CHƯA PHÊ DUYỆT / Decision-support / Non-operational",
        }
        if "caveat" in sec:
            props["geometry_caveat"] = sec["caveat"]
        new_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        })

    geo["features"].extend(new_features)
    with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
        json.dump(geo, f, ensure_ascii=False, indent=2)
    print(f"Da them {len(new_features)} polygon vao {GEOJSON_PATH}")

    with open(INDEX_PATH, encoding="utf-8") as f:
        idx = json.load(f)
    hcm = idx["ACC"]["ACC Hồ Chí Minh"]
    # 4 muc nhu cau dung (PK1A/PK1B/PK5A/PK5B New), moi muc gom cac manh theo
    # dai muc bay -- giong cach nhom "Phan khu 5 (Sector 5)" cu da gom 5 manh.
    hcm["Phân khu 1A New (dự thảo tách)"] = ["PK1NEW_1A"]
    hcm["Phân khu 1B New (dự thảo tách)"] = ["PK1NEW_1B1", "PK1NEW_1B2"]
    hcm["Phân khu 5A New (dự thảo tách)"] = ["PK5NEW_5A1", "PK5NEW_5A2", "PK5NEW_5A3"]
    hcm["Phân khu 5B New (dự thảo tách)"] = ["PK5NEW_5B"]
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)
    print(f"Da them 2 muc chon moi vao {INDEX_PATH}")


if __name__ == "__main__":
    main()

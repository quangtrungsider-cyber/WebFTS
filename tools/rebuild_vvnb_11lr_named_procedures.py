#!/usr/bin/env python3
"""
Rebuild VVNB RWY 11L/R SID/STAR procedures under their REAL published names
(BISON 3H, MC 3H, HUVAN 3H, DILEN 3H, NAKHA 3H, VDO 3H, GASSO 3H, DOKLA 3H
for STAR; DILEN 3A, NAKHA 3A, NAH 3A, MC 3A, HUVAN 3A, HUVAN 3B for SID),
replacing the old generic shape-family groupings ("11LR PMS", "11LR
TROMBONE", ...) that the Procedures Manager UI was displaying instead of
the individual named procedures.

Root cause: the existing vatm_procedures_VVNB.geojson groups RWY11L/R
SID/STAR features by an internal KMZ "shape family" label, and each such
group is actually only ONE LEG SEGMENT of a real multi-leg named procedure
(e.g. the "11LR PMS" group's only route leg, MUDAK-PUGIP, is leg 2 of the
real "MC 3H" arrival: MC -> MUDAK -> PUGIP -> NB374 -> ... -> VILOX). There
is no 1:1 mapping between "shape family" and "real named procedure".

Source of truth (real, not fabricated): AIP-style tabular description +
WGS-84 waypoint list PDFs at
"vietnam_ats_routes_pack/Dữ liệu PTB + code/PTB QLBMB/PTB Nội Bài/"
  - STAR BISON 3H.pdf (+ Coding 1/2)      -> BISON 3H, MC 3H, HUVAN 3H
  - STAR DILEN 3H.pdf (+ Coding 1/2/3)    -> DILEN 3H, NAKHA 3H, VDO 3H,
                                             GASSO 3H, DOKLA 3H
  - SID DILEN/HUVAN/MC/NAH/NAKHA 3A.pdf (+ Coding 1/2/3, all 5 filenames
    share identical content) -> DILEN 3A, NAKHA 3A, NAH 3A, MC 3A,
                                 HUVAN 3A, HUVAN 3B

Geometry is rebuilt as a straight leg-to-leg LineString through the real
published waypoint coordinates (DMS converted to decimal) -- this project's
existing convention for AIP-sourced procedures (matches how VVDN/VVPQ STAR
data is represented elsewhere), not a re-digitized curved track.

RWY 29L/R SID/STAR groups are left untouched: no real named-procedure
source document for 29L/R was found anywhere in this project, so the
existing "29LR ..." shape-family groupings are kept rather than guessing.
IAP and HOLDING data for VVNB are also left untouched.
"""
import json
import math
from pathlib import Path

GEOJSON_PATH = Path("WebATM/static/data/vatm_kmz/procedures_by_airport/vatm_procedures_VVNB.geojson")


def dms(d, m, s):
    return round(d + m / 60.0 + s / 3600.0, 6)


# ---------------------------------------------------------------------------
# Real waypoint coordinates (WGS-84), from the WAYPOINT LIST pages of the
# 3 source PDFs listed above.
# ---------------------------------------------------------------------------
WPT = {
    # STAR BISON 3H.pdf (Coding 2) -- BISON/MC/HUVAN group
    "BISAX": (dms(21, 1, 22), dms(105, 38, 11)),
    "BISON": (dms(20, 26, 0), dms(105, 38, 30)),
    "DUBSI": (dms(20, 41, 0), dms(105, 38, 20)),
    "GOMEP": (dms(21, 10, 38), dms(105, 35, 15)),
    "HUVAN": (dms(21, 12, 30), dms(105, 6, 41)),
    "MC": (dms(20, 49, 41), dms(104, 42, 1)),
    "MIMEK": (dms(20, 50, 33), dms(105, 38, 16)),
    "MUDAK": (dms(20, 56, 44), dms(105, 2, 53)),
    "NB371": (dms(21, 0, 50), dms(105, 16, 30)),
    "NB372": (dms(20, 51, 2), dms(105, 19, 30)),
    "NB373": (dms(20, 43, 39), dms(105, 27, 30)),
    "NB374": (dms(20, 50, 1), dms(105, 17, 40)),
    "NB375": (dms(20, 41, 55), dms(105, 26, 27)),
    "NB376": (dms(20, 39, 1), dms(105, 38, 21)),
    "PUGIP": (dms(21, 0, 47), dms(105, 14, 22)),
    "VEMOR": (dms(21, 1, 5), dms(105, 26, 39)),
    # STAR DILEN 3H.pdf (Coding 3) -- DILEN/NAKHA/VDO/GASSO/DOKLA group
    "ASUSO": (dms(21, 29, 54), dms(105, 57, 59)),
    "DILEN": (dms(22, 6, 35), dms(105, 28, 13)),
    "DOKLA": (dms(21, 4, 13), dms(106, 33, 9)),
    "ENDIV": (dms(21, 44, 22), dms(105, 41, 53)),
    "GASSO": (dms(21, 5, 12), dms(106, 45, 7)),
    "IBITO": (dms(21, 9, 1), dms(106, 33, 15)),
    "KADGA": (dms(21, 49, 22), dms(105, 30, 56)),
    "MEKAP": (dms(21, 23, 44), dms(106, 31, 52)),
    "MORKO": (dms(21, 35, 39), dms(106, 6, 4)),
    "NAKHA": (dms(21, 58, 0), dms(106, 29, 36)),
    "NB381": (dms(21, 42, 27), dms(105, 42, 31)),
    "NB382": (dms(21, 43, 17), dms(105, 51, 9)),
    "NB383": (dms(21, 40, 53), dms(105, 59, 27)),
    "NB384": (dms(21, 45, 17), dms(105, 51, 22)),
    "NB385": (dms(21, 42, 39), dms(106, 0, 28)),
    "NB386": (dms(21, 36, 54), dms(106, 7, 45)),
    "NIXEV": (dms(21, 33, 22), dms(105, 45, 34)),
    "SUBUP": (dms(21, 23, 2), dms(105, 49, 1)),
    "TUSPO": (dms(21, 43, 55), dms(106, 16, 10)),
    "VDO": (dms(21, 4, 24), dms(107, 23, 24)),
    "VILOX": (dms(21, 22, 8), dms(105, 39, 1)),
    # SID DILEN/HUVAN/MC/NAH/NAKHA 3A.pdf (Coding 3)
    "BUNBO": (dms(21, 42, 26), dms(106, 19, 48)),
    "EXOLI": (dms(20, 34, 36), dms(106, 4, 58)),
    "MULEX": (dms(21, 45, 19), dms(105, 24, 3)),
    "NAH": (dms(20, 23, 14), dms(106, 7, 4)),
    "NB110": (dms(21, 10, 3), dms(105, 59, 33)),
    "NB111": (dms(20, 57, 34), dms(105, 58, 8)),
    "NB112": (dms(21, 19, 5), dms(106, 2, 32)),
    "NB113": (dms(21, 25, 8), dms(105, 41, 52)),
    "NB114": (dms(20, 53, 6), dms(105, 45, 28)),
}

# ---------------------------------------------------------------------------
# Real STAR routes (RWY 11L/R), from the two STAR "Coding" tabular
# descriptions. IF -> ... -> VILOX (VILOX is the shared IAF for the RWY11L/R
# approach; the approach itself is a separate IAP procedure, not part of
# these STARs).
# ---------------------------------------------------------------------------
STAR_ROUTES = {
    "BISON 3H": ["BISON", "DUBSI", "NB373", "NB372", "NB371", "VEMOR", "BISAX", "GOMEP"],
    "MC 3H": ["MC", "MUDAK", "PUGIP", "NB374", "NB375", "NB376", "MIMEK", "BISAX", "GOMEP"],
    "HUVAN 3H": ["HUVAN", "PUGIP", "NB374", "NB375", "NB376", "MIMEK", "BISAX", "GOMEP"],
    "DILEN 3H": ["DILEN", "KADGA", "ENDIV", "NB384", "NB385", "NB386", "ASUSO", "SUBUP", "VILOX"],
    "NAKHA 3H": ["NAKHA", "TUSPO", "MORKO", "NB383", "NB382", "NB381", "NIXEV", "SUBUP", "VILOX"],
    "VDO 3H": ["VDO", "IBITO", "MORKO", "NB383", "NB382", "NB381", "NIXEV", "SUBUP", "VILOX"],
    "GASSO 3H": ["GASSO", "MEKAP", "MORKO", "NB383", "NB382", "NB381", "NIXEV", "SUBUP", "VILOX"],
    "DOKLA 3H": ["DOKLA", "MEKAP", "MORKO", "NB383", "NB382", "NB381", "NIXEV", "SUBUP", "VILOX"],
}
STAR_SOURCE = {
    "BISON 3H": "STAR BISON 3H.pdf", "MC 3H": "STAR BISON 3H.pdf", "HUVAN 3H": "STAR BISON 3H.pdf",
    "DILEN 3H": "STAR DILEN 3H.pdf", "NAKHA 3H": "STAR DILEN 3H.pdf", "VDO 3H": "STAR DILEN 3H.pdf",
    "GASSO 3H": "STAR DILEN 3H.pdf", "DOKLA 3H": "STAR DILEN 3H.pdf",
}

# Real SID routes (RWY 11L/R), from NB110 (common departure fix reached via
# initial climb from either 11L or 11R) onward.
SID_ROUTES = {
    "DILEN 3A": ["NB110", "NB112", "SUBUP", "NB113", "MULEX", "DILEN"],
    "NAKHA 3A": ["NB110", "BUNBO", "NAKHA"],
    "NAH 3A": ["NB110", "EXOLI", "NAH"],
    "MC 3A": ["NB110", "NB111", "NB114", "VEMOR", "MUDAK", "MC"],
    "HUVAN 3A": ["NB110", "NB111", "NB114", "VEMOR", "HUVAN"],
    "HUVAN 3B": ["NB110", "NB112", "SUBUP", "NB113", "HUVAN"],
}
SID_SOURCE = "SID DILEN 3A.pdf (đồng nội dung với SID HUVAN/MC/NAH/NAKHA 3A.pdf)"


def build_linestring(route_names):
    coords = []
    for name in route_names:
        lat, lon = WPT[name]
        coords.append([lon, lat])
    return {"type": "LineString", "coordinates": coords}


def main():
    with open(GEOJSON_PATH, "r", encoding="utf-8-sig") as f:
        data = json.load(f)

    features = data["features"]
    before = len(features)

    def is_old_11lr_sid_star(feat):
        props = feat.get("properties", {})
        if props.get("procedure_type") not in ("SID", "STAR"):
            return False
        pname = props.get("procedure_name") or ""
        return pname.startswith("11LR")

    kept = [f for f in features if not is_old_11lr_sid_star(f)]
    removed = before - len(kept)

    new_features = []
    for name, route in STAR_ROUTES.items():
        new_features.append({
            "type": "Feature",
            "properties": {
                "id": f"feat_VVNB_STAR_{name.replace(' ', '_')}",
                "name": name,
                "folder_path": f"PBN/STAR/RWY 11 L/R/{STAR_SOURCE[name]}",
                "airport_icao": "VVNB",
                "procedure_type": "STAR",
                "procedure_name": name,
                "source_document": STAR_SOURCE[name],
                "waypoint_sequence": route,
            },
            "geometry": build_linestring(route),
        })

    for name, route in SID_ROUTES.items():
        new_features.append({
            "type": "Feature",
            "properties": {
                "id": f"feat_VVNB_SID_{name.replace(' ', '_')}",
                "name": name,
                "folder_path": f"PBN/SID/RWY 11 L/R/{SID_SOURCE}",
                "airport_icao": "VVNB",
                "procedure_type": "SID",
                "procedure_name": name,
                "source_document": SID_SOURCE,
                "waypoint_sequence": route,
            },
            "geometry": build_linestring(route),
        })

    data["features"] = kept + new_features

    with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Removed {removed} old 11LR SID/STAR features (generic shape-family groups)")
    print(f"Added {len(new_features)} new real-named procedures "
          f"({len(STAR_ROUTES)} STAR + {len(SID_ROUTES)} SID)")
    print(f"Total features: {before} -> {len(data['features'])}")


if __name__ == "__main__":
    main()

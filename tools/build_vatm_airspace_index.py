#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Build Airspace (ACC/FIR/TMA/CTR) Sector Index.
Parses VATM GeoJSON files, groups boundaries by category (ACC, TMA, CTR), and compiles them into a unified JSON index.
"""

import json
import os
import re

def clean_name(name):
    # Strip whitespace and convert consecutive spaces to a single space
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    acc_path = os.path.join(base_dir, 'WebATM', 'static', 'data', 'vatm_kmz', 'vatm_acc_fir_sectors.geojson')
    tma_path = os.path.join(base_dir, 'WebATM', 'static', 'data', 'vatm_kmz', 'vatm_tma_ctr.geojson')
    output_path = os.path.join(base_dir, 'WebATM', 'static', 'data', 'vatm_kmz', 'airspace_index.json')

    print("Reading ACC/FIR sectors GeoJSON...")
    with open(acc_path, 'r', encoding='utf-8') as f:
        acc_data = json.load(f)

    print("Reading TMA/CTR boundaries GeoJSON...")
    with open(tma_path, 'r', encoding='utf-8') as f:
        tma_data = json.load(f)

    index = {
        "ACC": {
            "ACC Hà Nội": {},
            "ACC Hồ Chí Minh": {},
            "CTL Đà Nẵng": {}
        },
        "TMA": {},
        "CTR": {}
    }

    # 1. Parse ACC Sectors
    for feat in acc_data.get('features', []):
        props = feat.get('properties', {})
        fid = props.get('id')
        name = clean_name(props.get('name', ''))
        folder_path = props.get('folder_path', '').upper()

        if not fid or not name or name == 'NULL':
            continue

        # Standardize name (e.g. SECTOR 4 -> Sector 4, CTL DA NANG -> CTL Đà Nẵng)
        if name.startswith('SECTOR '):
            sector_num = name.split()[-1]
            display_name = f"Phân khu {sector_num} (Sector {sector_num})"
        else:
            display_name = name.title()

        # Group by ACC location
        if 'ACC HANOI' in folder_path:
            group = index["ACC"]["ACC Hà Nội"]
        elif 'ACC HO CHI MINH' in folder_path:
            group = index["ACC"]["ACC Hồ Chí Minh"]
        elif 'CTL DANANG' in folder_path or 'DA NANG' in name.upper():
            group = index["ACC"]["CTL Đà Nẵng"]
            display_name = "Đài Kiểm Soát Đà Nẵng (CTL Da Nang)"
        else:
            # Fallback
            group = index["ACC"]["ACC Hồ Chí Minh"]

        if display_name not in group:
            group[display_name] = []
        group[display_name].append(fid)

    # 2. Parse TMA & CTR
    for feat in tma_data.get('features', []):
        props = feat.get('properties', {})
        fid = props.get('id')
        name = clean_name(props.get('name', ''))
        folder_path = props.get('folder_path', '').upper()

        if not fid or not name or name.startswith('Style') or name == '':
            continue

        # Categorize into TMA or CTR
        name_upper = name.upper()
        
        # Clean up category prefix if present
        clean_display_name = re.sub(r'^(CTR|TMA|ARR)\s+', '', name, flags=re.IGNORECASE).strip()

        # Determine type
        if 'CTR' in name_upper:
            group_key = "CTR"
            display_name = f"Khu vực sân bay {clean_display_name} (CTR)"
        elif 'TMA' in name_upper or 'ARR' in name_upper:
            group_key = "TMA"
            display_name = f"Vùng kiểm soát tiếp cận {clean_display_name} (TMA)"
        elif 'CTR' in folder_path:
            group_key = "CTR"
            display_name = f"Khu vực sân bay {clean_display_name} (CTR)"
        else:
            group_key = "TMA"
            display_name = f"Vùng kiểm soát tiếp cận {clean_display_name} (TMA)"

        group = index[group_key]
        if display_name not in group:
            group[display_name] = []
        group[display_name].append(fid)

    # Clean empty categories
    for cat in list(index.keys()):
        if isinstance(index[cat], dict):
            for subcat in list(index[cat].keys()):
                if isinstance(index[cat][subcat], dict) and not index[cat][subcat]:
                    del index[cat][subcat]
            if not index[cat]:
                del index[cat]

    print(f"Writing index with {len(index.get('ACC', {}))} ACC groups, {len(index.get('TMA', {}))} TMAs, and {len(index.get('CTR', {}))} CTRs to airspace_index.json...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print("Success! Airspace index compiled.")

if __name__ == '__main__':
    main()

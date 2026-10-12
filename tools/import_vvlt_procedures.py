#!/usr/bin/env python3
"""
Long Thành (VVLT) Flight Procedures Nominal Track Importer.
Parses VVLT_out.kmz to extract nominal track LineStrings, cleans up existing VVLT data
in the global nominal track GeoJSON files, and merges the new nominal tracks.
Also normalizes the individual vatm_procedures_VVLT.geojson and updates procedures_index.json.
"""
import os
import json
import zipfile
import re
import xml.etree.ElementTree as ET

# Define Workspace paths
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KMZ_PATH = os.path.join(WORKSPACE_DIR, "vietnam_ats_routes_pack", "SID, STAR, AIP Nominal track", "VVLT_out.kmz")

STATIC_DIR = os.path.join(WORKSPACE_DIR, "WebATM", "static", "data", "vatm_kmz")
DATASET_DIR = os.path.join(WORKSPACE_DIR, "FTS Server", "data", "aixm", "datasets", "aixm_20260528_150109")

def get_folder_path_parts(elem, parent_map, ns):
    path = []
    curr = elem
    while curr in parent_map:
        curr = parent_map[curr]
        if curr.tag.endswith("Folder") or curr.tag.endswith("Document"):
            name_elem = curr.find("kml:name", ns)
            if name_elem is not None and name_elem.text:
                path.append(name_elem.text.strip())
    return list(reversed(path))

def parse_coordinates(coords_text):
    coords = []
    if not coords_text:
        return coords
    parts = coords_text.strip().split()
    for part in parts:
        if not part:
            continue
        subparts = part.split(',')
        if len(subparts) >= 2:
            try:
                lon = float(subparts[0])
                lat = float(subparts[1])
                alt = float(subparts[2]) if len(subparts) >= 3 else 0.0
                coords.append([lon, lat, alt])
            except ValueError:
                pass
    return coords

def parse_vvlt_kmz():
    if not os.path.exists(KMZ_PATH):
        print(f"[ERROR] KMZ file not found at: {KMZ_PATH}")
        return []
        
    print(f"Parsing KMZ file: {KMZ_PATH}...")
    with zipfile.ZipFile(KMZ_PATH, 'r') as zip_ref:
        kml_filenames = [f for f in zip_ref.namelist() if f.endswith('.kml')]
        if not kml_filenames:
            print("[ERROR] No KML found inside KMZ")
            return []
        kml_content = zip_ref.read(kml_filenames[0])
        
    root = ET.fromstring(kml_content)
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    
    parent_map = {c: p for p in root.iter() for c in p}
    placemarks = root.findall(".//kml:Placemark", ns)
    
    extracted_features = []
    
    for idx, pm in enumerate(placemarks):
        pm_name_elem = pm.find("kml:name", ns)
        pm_name = pm_name_elem.text.strip() if pm_name_elem is not None and pm_name_elem.text else "Unnamed"
        
        folder_path_parts = get_folder_path_parts(pm, parent_map, ns)
        folder_path = "/".join(folder_path_parts)
        folder_path_lower = folder_path.lower()
        
        # We only want LineStrings (nominal tracks)
        line_strings = pm.findall(".//kml:LineString", ns)
        if not line_strings:
            continue
            
        # Classify procedure type
        proc_type = "STAR"
        if "sid" in folder_path_lower or "departure" in folder_path_lower:
            proc_type = "SID"
        elif "holding" in folder_path_lower or "khu chờ" in folder_path_lower:
            proc_type = "HOLDING"
        elif "star" in folder_path_lower or "arrival" in folder_path_lower:
            proc_type = "STAR"
        elif "iap" in folder_path_lower or "approach" in folder_path_lower or "ils" in folder_path_lower or "vor" in folder_path_lower or "rnp" in folder_path_lower:
            proc_type = "IAP"
            
        # Skip holdings for nominal tracks
        if proc_type == "HOLDING":
            continue
            
        # Parse coordinates
        for ls_idx, ls in enumerate(line_strings):
            coords_elem = ls.find("kml:coordinates", ns)
            if coords_elem is None:
                continue
            coords = parse_coordinates(coords_elem.text)
            if not coords:
                continue
                
            feat_id = f"VATM_VVLT_{proc_type}_{idx}_{ls_idx}"
            full_folder_path = f"2026.04.20 DỮ LIỆU VÙNG TRỜI, PHƯƠNG THỨC BAY / PHƯƠNG THỨC BAY (SID, STAR, IAP) / VVLT / {folder_path}"
            
            feature = {
                "type": "Feature",
                "properties": {
                    "id": feat_id,
                    "name": pm_name,
                    "category": "PROCEDURE",
                    "procedure_type": proc_type,
                    "airport_icao": "VVLT",
                    "unit": "",
                    "folder_path": full_folder_path,
                    "top_group": "PHƯƠNG THỨC BAY (SID, STAR, IAP)",
                    "geometry_type": "LineString",
                    "is_protection_area": False,
                    "is_nominal_track": True,
                    "source": "VVLT_out.kmz",
                    "status": "Decision-support / Non-operational"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords
                }
            }
            extracted_features.append(feature)
            
    print(f"Extracted {len(extracted_features)} nominal track LineStrings for VVLT.")
    return extracted_features

def merge_geojson_file(file_path, new_features, filter_icao="VVLT"):
    if not os.path.exists(file_path):
        print(f"[WARN] File not found to merge: {file_path}")
        return
        
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    features = data.get("features", [])
    # Filter out existing VVLT entries
    cleaned_features = [
        feat for feat in features 
        if feat.get("properties", {}).get("airport_icao") != filter_icao
    ]
    
    # Append new features
    cleaned_features.extend(new_features)
    data["features"] = cleaned_features
    
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Updated {file_path}: total features = {len(cleaned_features)}.")

def main():
    new_features = parse_vvlt_kmz()
    if not new_features:
        print("[ERROR] No VVLT features extracted. Aborting.")
        return
        
    # Group by type
    sids = [f for f in new_features if f["properties"]["procedure_type"] == "SID"]
    stars = [f for f in new_features if f["properties"]["procedure_type"] == "STAR"]
    iaps = [f for f in new_features if f["properties"]["procedure_type"] == "IAP"]
    
    print(f"SID Count: {len(sids)}, STAR Count: {len(stars)}, IAP Count: {len(iaps)}")
    
    # Target files to update in both directories
    targets = [STATIC_DIR, DATASET_DIR]
    
    for base in targets:
        print(f"\nMerging features into directory: {base}...")
        
        # 1. Update SIDs
        sid_path = os.path.join(base, "procedures_sid_nominal_tracks.geojson")
        merge_geojson_file(sid_path, sids)
        
        # 2. Update STARs
        star_path = os.path.join(base, "procedures_star_nominal_tracks.geojson")
        merge_geojson_file(star_path, stars)
        
        # 3. Update IAPs
        iap_path = os.path.join(base, "procedures_iap_nominal_tracks.geojson")
        merge_geojson_file(iap_path, iaps)
        
        # 4. Update ALL
        all_path = os.path.join(base, "procedures_all_nominal_tracks.geojson")
        merge_geojson_file(all_path, new_features)
        
    # 5. Overwrite the dataset vatm_procedures_VVLT.geojson with the clean static one
    print("\nCopying clean static vatm_procedures_VVLT.geojson to dataset folder...")
    src_vvlt_geojson = os.path.join(STATIC_DIR, "procedures_by_airport", "vatm_procedures_VVLT.geojson")
    dest_vvlt_geojson = os.path.join(DATASET_DIR, "procedures_by_airport", "vatm_procedures_VVLT.geojson")
    
    if os.path.exists(src_vvlt_geojson):
        os.makedirs(os.path.dirname(dest_vvlt_geojson), exist_ok=True)
        with open(src_vvlt_geojson, "r", encoding="utf-8") as f:
            clean_data = json.load(f)
            
        with open(dest_vvlt_geojson, "w", encoding="utf-8") as f:
            json.dump(clean_data, f, ensure_ascii=False, indent=2)
        print("Success copying clean individual VVLT procedures file.")
    else:
        print(f"[ERROR] Source clean individual file not found: {src_vvlt_geojson}")

    print("\nLong Thành (VVLT) nominal track merging completed successfully!")

if __name__ == "__main__":
    main()

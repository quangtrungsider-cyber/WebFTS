#!/usr/bin/env python3
"""
WebFTS Unified KMZ Parser & Procedures Index Generator.
Parses all 22 airport KMZ files in the new dataset, outputs standardized GeoJSON files,
and generates the global procedures_index.json.
"""
import zipfile
import xml.etree.ElementTree as ET
import json
import os
import re

# Airport ICAO codes to clean Vietnamese name mappings
AIRPORT_NAMES = {
    "VVBM": "Buôn Ma Thuột",
    "VVCA": "Cát Bi",
    "VVCI": "Cát Bi", # Alternate or same
    "VVCM": "Cà Mau",
    "VVCR": "Cam Ranh",
    "VVCS": "Côn Đảo",
    "VVCT": "Cần Thơ",
    "VVDB": "Điện Biên",
    "VVDH": "Đồng Hới",
    "VVDL": "Liên Khương",
    "VVDN": "Đà Nẵng",
    "VVNB": "Nội Bài",
    "VVPB": "Phù Cát",
    "VVPC": "Phú Cát / Tuy Hòa",
    "VVPK": "Pleiku",
    "VVPQ": "Phú Quốc",
    "VVRG": "Rạch Giá",
    "VVTH": "Thọ Xuân",
    "VVTS": "Tân Sơn Nhất",
    "VVTX": "Thọ Xuân", # Alternate or same
    "VVVD": "Vân Đồn",
    "VVVH": "Vinh",
    "VVLT": "Long Thành"
}

def is_airport_root(part, icao):
    part_lower = part.lower().strip()
    icao_lower = icao.lower()
    part_clean = part_lower.replace(".kmz", "").replace(".kml", "").strip()
    part_clean_norm = re.sub(r'[^a-z0-9]', ' ', part_clean).strip()
    parts_norm = part_clean_norm.split()
    if not parts_norm:
        return False
    if parts_norm[0] == icao_lower:
        return True
    return False

def is_generic_category(part):
    part_lower = part.lower().strip()
    if part_lower in ["sid", "star", "iap", "holding", "holdings", "waypoints", "waypoint"]:
        return True
    if re.match(r'^(sid|star|iap|holding|holdings|waypoints)\s*[0-9]*[a-z]?$', part_lower):
        return True
    return False

def is_generic_rwy(part):
    part_lower = part.lower().strip()
    if re.match(r'^(rwy|rw|runway)\s*[0-9]+[lrc]?(?:/[lrc])?$', part_lower):
        return True
    return False

def is_segment(part):
    part_lower = part.lower().strip()
    segment_keywords = ["final", "intermediate", "missed", "departure", "arrival", "transition", "waypoints", "waypoint", "nom", "nominal"]
    for kw in segment_keywords:
        if kw in part_lower:
            return True
            
    if re.search(r'\binitial\b', part_lower):
        return True
        
    if "-" in part_lower:
        return True
        
    leg_types = r"\b(cf|df|tf|if|rf|va|vd|vi|vm|ca|fa|fc|fd|fm|ha|hf|hm|pi|cd|cr|ci)\b"
    if re.search(leg_types, part_lower):
        if part_lower in ["cf", "df", "tf", "if", "rf", "va", "vd", "vi", "vm", "ca", "fa", "fc", "fd", "fm", "ha", "hf", "hm", "pi", "cd", "cr", "ci"]:
            return True
        if re.match(r'^(cf|df|tf|if|rf|va|vd|vi|vm|ca|fa|fc|fd|fm|ha|hf|hm|pi|cd|cr|ci)\s+[a-z0-9_.-]+$', part_lower):
            return True
            
    return False

def extract_procedure_name(parts, airport_icao):
    raw_candidates = []
    for part in parts:
        if is_airport_root(part, airport_icao):
            continue
        if is_generic_category(part):
            continue
        if is_generic_rwy(part):
            continue
        if is_segment(part):
            continue
        raw_candidates.append(part)
        
    if not raw_candidates:
        return "Unknown"
        
    candidates = []
    for part in raw_candidates:
        part_clean = part.replace(".kmz", "").replace(".kml", "").strip()
        if not part_clean:
            continue
            
        is_short_variant = False
        if len(part_clean) <= 2:
            is_short_variant = True
        elif re.match(r'^[a-z]\s+[0-9]+[lrc]?$', part_clean, re.IGNORECASE):
            is_short_variant = True
            
        if is_short_variant and candidates:
            candidates[-1] = f"{candidates[-1]}/{part_clean}"
        else:
            candidates.append(part_clean)
            
    if not candidates:
        return "Unknown"
        
    filtered = []
    for i, c in enumerate(candidates):
        is_sub = False
        for j, other in enumerate(candidates):
            if i != j and c.lower() in other.lower():
                is_sub = True
                break
        if not is_sub:
            filtered.append(c)
            
    if filtered:
        return filtered[-1]
    return candidates[-1]

def parse_kmz(kmz_path, airport_icao):
    if not os.path.exists(kmz_path):
        print(f"[WARN] File not found: {kmz_path}")
        return [], {}
        
    print(f"Processing KMZ for {airport_icao} ({kmz_path})...")
    with zipfile.ZipFile(kmz_path, 'r') as zip_ref:
        kml_filenames = [f for f in zip_ref.namelist() if f.endswith('.kml')]
        if not kml_filenames:
            print(f"[WARN] No KML found in {kmz_path}")
            return [], {}
        kml_content = zip_ref.read(kml_filenames[0])
        
    root = ET.fromstring(kml_content)
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    
    # Map each element to its parent to build folder paths
    parent_map = {c: p for p in root.iter() for c in p}
    
    def get_folder_path_parts(elem):
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

    features = []
    index_data = {"SID": {}, "STAR": {}, "IAP": {}, "HOLDING": {}}
    placemarks = root.findall(".//kml:Placemark", ns)
    
    for idx, pm in enumerate(placemarks):
        pm_name_elem = pm.find("kml:name", ns)
        pm_name = pm_name_elem.text.strip() if pm_name_elem is not None and pm_name_elem.text else "Unnamed"
        
        folder_path_parts = get_folder_path_parts(pm)
        folder_path = "/".join(folder_path_parts)
        folder_path_lower = folder_path.lower()
        
        # Determine classification
        proc_type = "STAR"
        if "sid" in folder_path_lower or "departure" in folder_path_lower or "sid.kmz" in folder_path_lower:
            proc_type = "SID"
        elif "holding" in folder_path_lower or "khu chờ" in folder_path_lower:
            proc_type = "HOLDING"
        elif "star" in folder_path_lower or "arrival" in folder_path_lower or "star.kmz" in folder_path_lower:
            proc_type = "STAR"
        elif "iap" in folder_path_lower or "approach" in folder_path_lower or "iap.kmz" in folder_path_lower or "ils" in folder_path_lower or "vor" in folder_path_lower or "rnp" in folder_path_lower:
            proc_type = "IAP"
            
        # Extract core procedure name using the robust candidates algorithm
        proc_name = extract_procedure_name(folder_path_parts, airport_icao)
        
        # Find geometries
        geoms = []
        line_elems = pm.findall(".//kml:LineString", ns)
        point_elems = pm.findall(".//kml:Point", ns)
        polygon_elems = pm.findall(".//kml:Polygon", ns)
        
        for elem in line_elems:
            coords_elem = elem.find("kml:coordinates", ns)
            if coords_elem is not None:
                coords = parse_coordinates(coords_elem.text)
                if coords:
                    geoms.append({"type": "LineString", "coordinates": coords})
                    
        for elem in point_elems:
            coords_elem = elem.find("kml:coordinates", ns)
            if coords_elem is not None:
                coords = parse_coordinates(coords_elem.text)
                if coords:
                    geoms.append({"type": "Point", "coordinates": coords[0]})
                    
        for elem in polygon_elems:
            # For procedures, usually we only want the nominal track (lines), not the protection areas
            if proc_type in ["SID", "STAR", "IAP"] and "holding" not in folder_path_lower:
                if "area" in pm_name.lower() or "area" in folder_path_lower:
                    continue # Skip procedure protection areas
            outer = elem.find(".//kml:outerBoundaryIs//kml:coordinates", ns)
            if outer is not None:
                outer_coords = parse_coordinates(outer.text)
                if outer_coords:
                    geoms.append({"type": "Polygon", "coordinates": [outer_coords]})

        if not geoms:
            continue
            
        # Additional filter: if the user explicitly requested only nominal track for procedures
        if proc_type in ["SID", "STAR", "IAP"]:
            is_nominal = "nominal" in folder_path_lower or "nominal" in pm_name.lower() or "track" in pm_name.lower()
            is_area = "area" in pm_name.lower()
            if is_area:
                continue
            # If we only want nominal tracks and it's a LineString, we keep it. 
            # We assume LineStrings are nominal tracks even if not explicitly named "nominal" unless it's an area.
            
        for g_idx, geom in enumerate(geoms):
            feat_id = f"feat_{airport_icao}_{proc_type}_{idx}_{g_idx}"
            
            feature = {
                "type": "Feature",
                "id": feat_id,
                "geometry": geom,
                "properties": {
                    "id": feat_id,
                    "name": pm_name,
                    "folder_path": folder_path,
                    "airport_icao": airport_icao,
                    "procedure_type": proc_type,
                    "procedure_name": proc_name
                }
            }
            features.append(feature)
            
            # Map into index
            if proc_name not in index_data[proc_type]:
                index_data[proc_type][proc_name] = []
            if feat_id not in index_data[proc_type][proc_name]:
                index_data[proc_type][proc_name].append(feat_id)
                
    return features, index_data

def main():
    workspace_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    kmz_dir = os.path.join(workspace_dir, "vietnam_ats_routes_pack", "SID, STAR, AIP Nominal track")
    output_dir = os.path.join(workspace_dir, "WebATM", "static", "data", "vatm_kmz", "procedures_by_airport")
    index_output_path = os.path.join(workspace_dir, "WebATM", "static", "data", "vatm_kmz", "procedures_index.json")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Scan for KMZ files
    kmz_files = [f for f in os.listdir(kmz_dir) if f.lower().endswith(".kmz")]
    print(f"Found {len(kmz_files)} KMZ files to parse.")
    
    global_index = {}
    
    for filename in sorted(kmz_files):
        # Extract ICAO
        match = re.match(r"^([A-Z]{4})", filename.upper())
        if not match:
            print(f"Skipping file with unrecognized format: {filename}")
            continue
            
        icao = match.group(1)
        kmz_path = os.path.join(kmz_dir, filename)
        
        # Parse KMZ
        features, index_data = parse_kmz(kmz_path, icao)
        
        if not features:
            print(f"No features extracted for {icao}.")
            continue
            
        # Write individual GeoJSON file
        geojson_path = os.path.join(output_dir, f"vatm_procedures_{icao}.geojson")
        geojson_data = {
            "type": "FeatureCollection",
            "features": features
        }
        with open(geojson_path, "w", encoding="utf-8") as f:
            json.dump(geojson_data, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(features)} features for {icao} to {geojson_path}")
        
        # Store in global index
        global_index[icao] = index_data
        
    # Write unified procedures_index.json
    with open(index_output_path, "w", encoding="utf-8") as f:
        json.dump(global_index, f, ensure_ascii=False, indent=2)
        
    print("\n=========================================")
    print("ALL KMZ FILES PARSED & INDEX GENERATED!")
    print(f"Output files stored in: {output_dir}")
    print(f"Unified index created at: {index_output_path}")
    print("=========================================")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
VATM Airspace Procedures and Holdings Index Generator.
Generates procedures_index.json from vatm_holding_areas.geojson and individual airport geojsons.

VATM FTS / Decision-support / Non-operational. Not for operational air traffic control use.
"""
import json
import os
import math

# Center coordinates of airports for proximity mapping
AIRPORTS = {
    "VVTS": {"name": "Tân Sơn Nhất", "lat": 10.818, "lon": 106.662},
    "VVNB": {"name": "Nội Bài", "lat": 21.221, "lon": 105.806},
    "VVDN": {"name": "Đà Nẵng", "lat": 16.044, "lon": 108.200}
}

def get_distance(lon1, lat1, lon2, lat2):
    R = 6371.0 # Radius of Earth in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def get_geometry_center(geometry):
    if not geometry:
        return None
    
    geom_type = geometry.get("type")
    coords = []
    
    if geom_type == "Point":
        coords = [geometry.get("coordinates")]
    elif geom_type == "LineString":
        coords = geometry.get("coordinates")
    elif geom_type == "Polygon":
        coords = geometry.get("coordinates")[0]
    elif geom_type == "MultiPolygon":
        coords = geometry.get("coordinates")[0][0]
        
    if not coords:
        return None
        
    sum_lon = sum(c[0] for c in coords)
    sum_lat = sum(c[1] for c in coords)
    return {"lon": sum_lon / len(coords), "lat": sum_lat / len(coords)}

def extract_holding_base_name(name, folder_path):
    clean_name = (name or "").strip()
    
    if clean_name.startswith("Holding "):
        return clean_name[8:].strip()
    if clean_name.startswith("WP "):
        return clean_name[3:].strip()
    if clean_name.startswith("Navaid "):
        parts = clean_name.split(' ')
        if len(parts) >= 2:
            return parts[1].strip()
            
    parts = [p.strip() for p in (folder_path or "").split('/') if p.strip()]
    
    # Find parts starting with "Holding "
    for p in parts:
        if p.startswith("Holding ") and p.lower() not in ["holding", "holdings"]:
            return p[8:].strip()
            
    # Sibling lookup
    if "Holding" in parts:
        idx = parts.index("Holding")
        if idx + 1 < len(parts):
            next_part = parts[idx + 1]
            if next_part.startswith("Holding "):
                return next_part[8:].strip()
            return next_part
            
    # Generic keyword filter
    keywords = ["Primary Area", "Secondary Area", "Protection Areas", "Waypoints", "Holding", "Holdings", "Khu chờ"]
    for p in reversed(parts):
        if p not in keywords and not p.lower().endswith(".kmz") and len(p) > 2:
            return p
            
    return clean_name

def parse_procedure(folder_path):
    if not folder_path:
        return None
        
    parts = [p.strip() for p in folder_path.split('/') if p.strip()]
    
    # 1. Determine Type
    proc_type = "STAR"
    lower_path = folder_path.lower()
    if "/sid" in lower_path or "departure" in lower_path or "sid.kmz" in lower_path:
        proc_type = "SID"
    elif "/star" in lower_path or "arrival" in lower_path or "star.kmz" in lower_path:
        proc_type = "STAR"
    elif "/iap" in lower_path or "approach" in lower_path or "iap.kmz" in lower_path or "ils" in lower_path or "vor" in lower_path or "rnp" in lower_path:
        proc_type = "IAP"
        
    # 2. Extract Group Name
    kmz_idx = -1
    for i, p in enumerate(parts):
        if p.lower().endswith(".kmz"):
            kmz_idx = i
            break
            
    proc_name = ""
    if kmz_idx != -1:
        kmz_file = parts[kmz_idx]
        clean_kmz = kmz_file[:-4] # remove '.kmz'
        if len(clean_kmz) <= 3 and kmz_idx > 0:
            parent_dir = parts[kmz_idx - 1]
            proc_name = f"{parent_dir} ({clean_kmz})"
        else:
            proc_name = clean_kmz
    else:
        # No KMZ. Relative search from Airport code folder
        apt_idx = -1
        for i, p in enumerate(parts):
            if p in ["VVTS", "VVNB", "VVDN"]:
                apt_idx = i
                break
                
        if apt_idx == -1:
            return None
            
        proc_idx = apt_idx + 2
        skip_names = {
            "sid", "star", "iap", "rwy", "departure", "arrival", "approach",
            "07", "25", "11", "29", "17", "35", "07r", "07l", "25r", "25l",
            "11r", "11l", "29r", "29l", "17r", "17l", "35r", "35l", "pbn", "vor",
            "waypoints", "holding", "controlling obstacles", "controlling obstacle",
            "obstacles", "obstacle"
        }
        
        while proc_idx < len(parts):
            val = parts[proc_idx].lower()
            is_generic = (val in skip_names or 
                          len(val) == 1 or 
                          val.startswith("rwy") or 
                          any(val.endswith(suffix) for suffix in ["l", "r", "t"]) and val[:-1].isdigit() or
                          any(val.startswith(prefix) for prefix in ["11", "29", "17", "35"]) and len(val) <= 4)
            if not is_generic:
                break
            proc_idx += 1
            
        if proc_idx < len(parts):
            proc_name = parts[proc_idx]
        else:
            proc_name = parts[-1] if parts else "Unknown"
            
    proc_name = proc_name.strip()
    # Normalize multiple whitespaces
    proc_name = " ".join(proc_name.split())
    
    return {"name": proc_name, "type": proc_type}

def main():
    base_dir = r"d:\Coding\Dự án FTS\WebFTS v1\WebATM\static\data\vatm_kmz"
    procedures_dir = os.path.join(base_dir, "procedures_by_airport")
    output_path = os.path.join(base_dir, "procedures_index.json")
    
    print("VATM Index Builder Started...")
    
    index = {
        "VVTS": {"SID": {}, "STAR": {}, "IAP": {}, "HOLDING": {}},
        "VVNB": {"SID": {}, "STAR": {}, "IAP": {}, "HOLDING": {}},
        "VVDN": {"SID": {}, "STAR": {}, "IAP": {}, "HOLDING": {}}
    }
    
    # 1. Parse Holding Areas
    holding_file = os.path.join(base_dir, "vatm_holding_areas.geojson")
    if os.path.exists(holding_file):
        print("Parsing Holding Areas...")
        with open(holding_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        features = data.get("features", [])
        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry", {})
            feat_id = props.get("id") or props.get("name")
            if not feat_id:
                continue
                
            center = get_geometry_center(geom)
            if not center:
                continue
                
            # Geographic distance classification
            min_dist = float("inf")
            nearest_apt = "VVTS"
            for apt, coord in AIRPORTS.items():
                dist = get_distance(center["lon"], center["lat"], coord["lon"], coord["lat"])
                if dist < min_dist:
                    min_dist = dist
                    nearest_apt = apt
                    
            base_name = extract_holding_base_name(props.get("name"), props.get("folder_path"))
            holding_name = f"Holding {base_name}"
            
            if holding_name not in index[nearest_apt]["HOLDING"]:
                index[nearest_apt]["HOLDING"][holding_name] = []
            if feat_id not in index[nearest_apt]["HOLDING"][holding_name]:
                index[nearest_apt]["HOLDING"][holding_name].append(feat_id)
                
        print("Holding areas mapped successfully.")
    else:
        print(f"Holding areas file not found: {holding_file}")
        
    # 2. Parse Procedures
    for apt in ["VVTS", "VVNB", "VVDN"]:
        proc_file = os.path.join(procedures_dir, f"vatm_procedures_{apt}.geojson")
        if os.path.exists(proc_file):
            print(f"Parsing Procedures for {apt}...")
            with open(proc_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            features = data.get("features", [])
            for feat in features:
                props = feat.get("properties", {})
                feat_id = props.get("id")
                if not feat_id:
                    continue
                    
                folder_path = props.get("folder_path")
                proc = parse_procedure(folder_path)
                if not proc or not proc["name"]:
                    continue
                    
                ptype = proc["type"]
                pname = proc["name"]
                
                if pname not in index[apt][ptype]:
                    index[apt][ptype][pname] = []
                if feat_id not in index[apt][ptype][pname]:
                    index[apt][ptype][pname].append(feat_id)
        else:
            print(f"Procedure file not found for {apt}: {proc_file}")
            
    # Write Index JSON
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        
    print("VATM Procedures & Holdings Index generated successfully.")

if __name__ == "__main__":
    main()

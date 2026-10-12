#!/usr/bin/env python3
"""
VATM Airspace Procedures and Holdings Index Generator.
Generates procedures_index.json from vatm_holding_areas.geojson and individual airport geojsons dynamically.

VATM FTS / Decision-support / Non-operational. Not for operational air traffic control use.
"""
import json
import os
import math
import re

def load_airports_coordinates(base_dir):
    """Loads all airports and coordinates dynamically from vatm_aerodromes.geojson."""
    airports = {
        "VVTS": {"name": "Tân Sơn Nhất", "lat": 10.818, "lon": 106.662},
        "VVNB": {"name": "Nội Bài", "lat": 21.221, "lon": 105.806},
        "VVDN": {"name": "Đà Nẵng", "lat": 16.044, "lon": 108.200},
        "VVLT": {"name": "Long Thành", "lat": 10.741, "lon": 106.967}
    }
    aerodromes_file = os.path.join(base_dir, "vatm_aerodromes.geojson")
    if os.path.exists(aerodromes_file):
        try:
            with open(aerodromes_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            features = data.get("features", [])
            for feat in features:
                props = feat.get("properties", {})
                geom = feat.get("geometry", {})
                icao = props.get("icao")
                name = props.get("name", icao)
                if icao and geom and geom.get("type") == "Point":
                    coords = geom.get("coordinates")
                    if len(coords) >= 2:
                        airports[icao] = {
                            "name": name,
                            "lon": coords[0],
                            "lat": coords[1]
                        }
        except Exception as e:
            print(f"[WARN] Failed to load airports from {aerodromes_file}: {e}")
    return airports

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
            clean_p = p[:-4]
            # Skip if it is just the airport ICAO code itself (e.g. VVTS.kmz)
            if re.match(r"^[A-Z]{4}$", clean_p):
                continue
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
            if re.search(r"^[A-Z]{4}(\.kmz)?$", p, re.IGNORECASE):
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
    base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "WebATM", "static", "data", "vatm_kmz")
    procedures_dir = os.path.join(base_dir, "procedures_by_airport")
    output_path = os.path.join(base_dir, "procedures_index.json")
    
    print("VATM Index Builder Started...")
    
    # Load all airports coordinates dynamically
    airports_coords = load_airports_coordinates(base_dir)
    
    # Dynamically scan procedures_by_airport directory to find all airports
    geojson_files = [f for f in os.listdir(procedures_dir) if f.startswith("vatm_procedures_") and f.endswith(".geojson")]
    airports_list = []
    for filename in sorted(geojson_files):
        match = re.match(r"^vatm_procedures_([A-Z]{4})\.geojson$", filename)
        if match:
            airports_list.append(match.group(1))
            
    print(f"Found {len(airports_list)} airports with procedures data: {airports_list}")
    
    # Initialize index dynamically
    index = {}
    for apt in airports_list:
        index[apt] = {"SID": {}, "STAR": {}, "IAP": {}, "HOLDING": {}}
    
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
            for apt, coord in airports_coords.items():
                dist = get_distance(center["lon"], center["lat"], coord["lon"], coord["lat"])
                if dist < min_dist:
                    min_dist = dist
                    nearest_apt = apt
                    
            base_name = extract_holding_base_name(props.get("name"), props.get("folder_path"))
            holding_name = f"Holding {base_name}"
            
            # Ensure nearest_apt is initialized in index
            if nearest_apt not in index:
                index[nearest_apt] = {"SID": {}, "STAR": {}, "IAP": {}, "HOLDING": {}}
                
            if holding_name not in index[nearest_apt]["HOLDING"]:
                index[nearest_apt]["HOLDING"][holding_name] = []
            if feat_id not in index[nearest_apt]["HOLDING"][holding_name]:
                index[nearest_apt]["HOLDING"][holding_name].append(feat_id)
                
        print("Holding areas mapped successfully.")
    else:
        print(f"Holding areas file not found: {holding_file}")
        
    # 2. Parse Procedures for all found airports
    for apt in airports_list:
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

                # Holding patterns are frequently embedded INSIDE a SID/STAR/IAP
                # group's own features (e.g. an IAP's missed-approach hold, folder
                # path ".../11L ILS/Holding/Holding LATUS") rather than living in
                # the separate vatm_holding_areas.geojson file handled above. Route
                # these into the dedicated HOLDING bucket instead of lumping them
                # into their parent procedure's checkbox -- they are a distinct,
                # independently-relevant procedure (a holding pattern), not part of
                # the route itself.
                own_name = props.get("name") or ""
                folder_path = props.get("folder_path") or ""

                # "Controlling obstacle" sub-features (a Point + an "Area" ring
                # marking the tallest/most limiting obstacle on a leg) are chart
                # annotations, not part of the flyable route -- drop them
                # entirely so checking a procedure never renders them as a
                # circle on the map.
                if "controlling obstacle" in folder_path.lower():
                    continue

                if own_name.lower().startswith("holding") or "/holding/" in folder_path.lower():
                    base_name = extract_holding_base_name(own_name, folder_path)
                    holding_name = f"Holding {base_name}"
                    if holding_name not in index[apt]["HOLDING"]:
                        index[apt]["HOLDING"][holding_name] = []
                    if feat_id not in index[apt]["HOLDING"][holding_name]:
                        index[apt]["HOLDING"][holding_name].append(feat_id)
                    continue

                ptype = props.get("procedure_type")
                pname = props.get("procedure_name")

                if not ptype or not pname:
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
            print(f"[WARN] Procedure file not found for {apt}: {proc_file}")
            
    # Write Index JSON
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        
    print("VATM Procedures & Holdings Index generated successfully.")

if __name__ == "__main__":
    main()

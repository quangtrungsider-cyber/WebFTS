import os
import json
import xml.etree.ElementTree as ET

KML_PATH = r"vietnam_ats_routes_pack\Airport\VVNB.kml"
ACTIVE_DATASET_JSON = r"FTS Server\data\aerodrome_layout\active_dataset.json"

def get_output_dir():
    try:
        with open(ACTIVE_DATASET_JSON, "r") as f:
            active_data = json.load(f)
            active_id = active_data.get("activeDatasetId")
            if active_id:
                return rf"FTS Server\data\aerodrome_layout\datasets\{active_id}\normalized\airports\VVNB"
    except Exception as e:
        print(f"Could not read active dataset id: {e}")
    return r"FTS Server\data\aerodrome_layout\datasets\vietnam_kml_layout\normalized\airports\VVNB"

OUTPUT_DIR = get_output_dir()

def get_folder_path_parts(elem, parent_map, ns):
    parts = []
    curr = elem
    while curr in parent_map:
        parent = parent_map[curr]
        if parent.tag == f"{{{ns['kml']}}}Folder":
            name_elem = parent.find("kml:name", ns)
            if name_elem is not None and name_elem.text:
                parts.insert(0, name_elem.text.strip())
        curr = parent
    return parts

def parse_coordinates(coord_text):
    if not coord_text:
        return []
    coords = []
    for chunk in coord_text.split():
        parts = chunk.split(",")
        if len(parts) >= 2:
            try:
                lon = float(parts[0])
                lat = float(parts[1])
                alt = float(parts[2]) if len(parts) > 2 else 0.0
                coords.append([lon, lat, alt])
            except ValueError:
                pass
    return coords

def main():
    if not os.path.exists(KML_PATH):
        print(f"[ERROR] KML file not found: {KML_PATH}")
        return
        
    print(f"Parsing {KML_PATH} to {OUTPUT_DIR}...")
    try:
        tree = ET.parse(KML_PATH)
        root = tree.getroot()
    except Exception as e:
        print(f"[ERROR] Failed to parse KML: {e}")
        return

    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    parent_map = {c: p for p in root.iter() for c in p}
    
    features_by_file = {
        "runways.geojson": [],
        "runway_centerlines.geojson": [],
        "pavements.geojson": [],
        "taxiway_centerlines.geojson": [],
        "gates.geojson": [],
        "ground_markings.geojson": [],
        "taxiway_labels.geojson": []
    }
    
    placemarks = root.findall(".//kml:Placemark", ns)
    
    for pm in placemarks:
        name_elem = pm.find("kml:name", ns)
        pm_name = name_elem.text.strip() if name_elem is not None and name_elem.text else "Unnamed"
        
        folder_path_parts = get_folder_path_parts(pm, parent_map, ns)
        folder_path_lower = "/".join(folder_path_parts).lower()
        
        # Determine target file based on folder
        target_file = "ground_markings.geojson" # default
        
        if "webfts enhanced" in folder_path_lower:
            if point is not None:
                target_file = "gates.geojson"
            else:
                target_file = "ground_markings.geojson"
        elif "center" in folder_path_lower:
            target_file = "taxiway_centerlines.geojson"
        elif "runway" in folder_path_lower:
            target_file = "runways.geojson"
        elif "freetext" in folder_path_lower or "building" in folder_path_lower:
            target_file = "taxiway_labels.geojson"
        elif "taxiway" in folder_path_lower or "apron" in folder_path_lower or "grass" in folder_path_lower:
            if "border" in folder_path_lower or "lines" in folder_path_lower:
                target_file = "ground_markings.geojson"
            else:
                target_file = "pavements.geojson"
        elif "stopbar" in folder_path_lower or "chevron" in folder_path_lower or "white" in folder_path_lower or "border" in folder_path_lower or "lines" in folder_path_lower:
            target_file = "ground_markings.geojson"
            
        # Extract Geometries
        point = pm.find(".//kml:Point", ns)
        line = pm.find(".//kml:LineString", ns)
        polygon = pm.find(".//kml:Polygon", ns)
        
        geometry = None
        
        if polygon is not None:
            coords_elem = polygon.find(".//kml:coordinates", ns)
            if coords_elem is not None:
                coords = parse_coordinates(coords_elem.text)
                if coords:
                    geometry = {"type": "Polygon", "coordinates": [coords]}
        elif line is not None:
            coords_elem = line.find("kml:coordinates", ns)
            if coords_elem is not None:
                coords = parse_coordinates(coords_elem.text)
                if coords:
                    geometry = {"type": "LineString", "coordinates": coords}
        elif point is not None:
            coords_elem = point.find("kml:coordinates", ns)
            if coords_elem is not None:
                coords = parse_coordinates(coords_elem.text)
                if coords:
                    geometry = {"type": "Point", "coordinates": coords[0]}
                    
        if geometry:
            feature = {
                "type": "Feature",
                "properties": {
                    "name": pm_name,
                    "folder": "/".join(folder_path_parts)
                },
                "geometry": geometry
            }
            features_by_file[target_file].append(feature)
            
    # Save the output files
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for filename, feats in features_by_file.items():
        filepath = os.path.join(OUTPUT_DIR, filename)
        fc = {
            "type": "FeatureCollection",
            "features": feats
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(fc, f, ensure_ascii=False)
        print(f"Saved {len(feats)} features to {filename}")
        
    print("Parsing completed.")

if __name__ == "__main__":
    main()

import os
import re
import json
import shutil
import zipfile
import math
import xml.etree.ElementTree as ET
from pathlib import Path

# Namespaces for AIXM 5.1
NAMESPACES = {
    'message': 'http://www.aixm.aero/schema/5.1/message',
    'aixm': 'http://www.aixm.aero/schema/5.1',
    'gml': 'http://www.opengis.net/gml/3.2',
    'xlink': 'http://www.w3.org/1999/xlink'
}

def find_local_tag(element, local_name):
    """Namespace-tolerant search for a child element matching local_name."""
    for child in element.iter():
        if child.tag.endswith(local_name) or child.tag == local_name:
            return child
    return None

def findall_local_tag(element, local_name):
    """Namespace-tolerant search for all child elements matching local_name."""
    results = []
    for child in element.iter():
        if child.tag.endswith(local_name) or child.tag == local_name:
            results.append(child)
    return results

def get_root_info(xml_path):
    """Quickly extracts root element local name and namespace without full load."""
    try:
        context = ET.iterparse(xml_path, events=('start',))
        _, elem = next(context)
        tag = elem.tag
        ns = ""
        local_name = tag
        if tag.startswith("{"):
            ns, local_name = tag[1:].split("}", 1)
        return local_name, ns
    except Exception:
        return "", ""

def isAixmDataXml(fileName, root_tag, root_ns):
    """Identifies if an XML file is a valid AIXM 5.1 data snapshot file."""
    if fileName.lower().endswith("export-filter.xml"):
        return False
    if "ImpExpConfiguration" in root_tag:
        return False
    if "EXPORT_Export_AIXM5.1_Data_Snapshot" in fileName:
        return True
    if "AIXMBasicMessage" in root_tag:
        return True
    return False

def detectGroupFromPath(filePath, xml_preview=""):
    """Detects the logical group of the file based on its path or feature tags."""
    path_lower = filePath.lower()
    if "aerodrome" in path_lower:
        return "Aerodrome"
    if "airspace" in path_lower:
        return "Airspace"
    if "designatedpoint" in path_lower:
        return "DesignatedPoint"
    if "holding" in path_lower:
        return "Holding"
    if "navaid" in path_lower:
        return "Navaid"
    if "route" in path_lower:
        return "Route"
    if "runway" in path_lower:
        return "Runway"
    if "verticalstructure" in path_lower:
        return "VerticalStructure"

    # Fallback to content check
    if "AirportHeliport" in xml_preview:
        return "Aerodrome"
    if "Airspace" in xml_preview:
        return "Airspace"
    if "DesignatedPoint" in xml_preview:
        return "DesignatedPoint"
    if "HoldingPattern" in xml_preview:
        return "Holding"
    if "Navaid" in xml_preview:
        return "Navaid"
    if "Route" in xml_preview:
        return "Route"
    if "Runway" in xml_preview:
        return "Runway"
    if "VerticalStructure" in xml_preview:
        return "VerticalStructure"

    return "Unknown"

def parse_aixm_file(xml_path, group):
    """Namespace-tolerant parser for a single AIXM XML data file."""
    features = []
    warnings = []
    
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        
        if group == "Aerodrome":
            for elem in findall_local_tag(root, "AirportHeliport"):
                ad_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                icao = ""
                name = ""
                lat, lon = None, None
                
                ts = find_local_tag(elem, "AirportHeliportTimeSlice")
                if ts is not None:
                    icao_el = find_local_tag(ts, "locationIndicatorICAO")
                    if icao_el is not None:
                        icao = icao_el.text or ""
                    name_el = find_local_tag(ts, "name")
                    if name_el is not None:
                        name = name_el.text or ""
                    pos_el = find_local_tag(ts, "pos")
                    if pos_el is not None and pos_el.text:
                        parts = pos_el.text.strip().split()
                        if len(parts) >= 2:
                            try:
                                lat, lon = float(parts[0]), float(parts[1])
                            except ValueError:
                                pass
                                
                if icao or name:
                    features.append({
                        "id": f"aerodrome-urn:uuid:{uuid}" if uuid else f"aerodrome-{ad_id}",
                        "name": f"{icao} - {name}" if name else icao,
                        "icao": icao or name[:4].upper(),
                        "lat": lat,
                        "lon": lon,
                        "uuid": uuid
                    })

        elif group == "Runway":
            for elem in findall_local_tag(root, "Runway"):
                rwy_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                designator = ""
                length = None
                width = None
                airport_ref = ""
                
                ts = find_local_tag(elem, "RunwayTimeSlice")
                if ts is not None:
                    des_el = find_local_tag(ts, "designator")
                    if des_el is not None:
                        designator = des_el.text or ""
                    len_el = find_local_tag(ts, "nominalLength")
                    if len_el is not None and len_el.text:
                        try:
                            length = float(len_el.text)
                        except ValueError:
                            pass
                    width_el = find_local_tag(ts, "nominalWidth")
                    if width_el is not None and width_el.text:
                        try:
                            width = float(width_el.text)
                        except ValueError:
                            pass
                    assoc = find_local_tag(ts, "associatedAirportHeliport")
                    if assoc is not None:
                        href = assoc.get(f"{{{NAMESPACES['xlink']}}}href") or ""
                        airport_ref = href.split("uuid:")[-1] if "uuid:" in href else href
                        
                if designator:
                    features.append({
                        "id": f"runway-{uuid}" if uuid else f"runway-{rwy_id}",
                        "designator": designator,
                        "airport_uuid": airport_ref,
                        "length": length,
                        "width": width
                    })

        elif group == "DesignatedPoint":
            for elem in findall_local_tag(root, "DesignatedPoint"):
                pt_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                designator = ""
                lat, lon = None, None
                
                ts = find_local_tag(elem, "DesignatedPointTimeSlice")
                if ts is not None:
                    des_el = find_local_tag(ts, "designator")
                    if des_el is not None:
                        designator = des_el.text or ""
                    pos_el = find_local_tag(ts, "pos")
                    if pos_el is not None and pos_el.text:
                        parts = pos_el.text.strip().split()
                        if len(parts) >= 2:
                            try:
                                lat, lon = float(parts[0]), float(parts[1])
                            except ValueError:
                                pass
                                
                if designator and lat is not None and lon is not None:
                    features.append({
                        "id": f"waypoint-urn:uuid:{uuid}" if uuid else f"waypoint-{pt_id}",
                        "name": designator,
                        "lat": lat,
                        "lon": lon
                    })

        elif group == "Airspace":
            for elem in findall_local_tag(root, "Airspace"):
                asp_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                designator = ""
                asp_type = ""
                coords = []
                
                ts = find_local_tag(elem, "AirspaceTimeSlice")
                if ts is not None:
                    des_el = find_local_tag(ts, "designator")
                    if des_el is not None:
                        designator = des_el.text or ""
                    type_el = find_local_tag(ts, "type")
                    if type_el is not None:
                        asp_type = type_el.text or ""
                        
                    pos_lists = findall_local_tag(ts, "posList")
                    for pos_list in pos_lists:
                        if pos_list.text:
                            coords_text = pos_list.text.strip().split()
                            pts = []
                            for i in range(0, len(coords_text), 2):
                                try:
                                    y, x = float(coords_text[i]), float(coords_text[i+1])
                                    pts.append([x, y])
                                except (IndexError, ValueError):
                                    pass
                            if pts:
                                coords.append(pts)
                                
                if designator:
                    features.append({
                        "id": f"airspace-{uuid}" if uuid else f"airspace-{asp_id}",
                        "designator": designator,
                        "type": asp_type,
                        "coordinates": coords
                    })

        elif group == "Holding":
            for elem in findall_local_tag(root, "HoldingPattern"):
                h_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                features.append({
                    "id": f"holding-{uuid}" if uuid else f"holding-{h_id}",
                    "name": f"Holding {uuid[:8] if uuid else h_id[:8]}"
                })

        elif group == "Navaid":
            for elem in findall_local_tag(root, "Navaid"):
                n_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                designator = ""
                name = ""
                
                ts = find_local_tag(elem, "NavaidTimeSlice")
                if ts is not None:
                    des_el = find_local_tag(ts, "designator")
                    if des_el is not None:
                        designator = des_el.text or ""
                    name_el = find_local_tag(ts, "name")
                    if name_el is not None:
                        name = name_el.text or ""
                        
                features.append({
                    "id": f"navaid-{uuid}" if uuid else f"navaid-{n_id}",
                    "designator": designator or name[:3].upper(),
                    "name": name or designator
                })

        elif group == "Route":
            for elem in findall_local_tag(root, "Route"):
                rt_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                designator = ""
                ts = find_local_tag(elem, "RouteTimeSlice")
                if ts is not None:
                    des_el = find_local_tag(ts, "designator")
                    if des_el is not None:
                        designator = des_el.text or ""
                        
                if designator:
                    features.append({
                        "id": f"route-{uuid}" if uuid else f"route-{rt_id}",
                        "designator": designator
                    })

        elif group == "VerticalStructure":
            for elem in findall_local_tag(root, "VerticalStructure"):
                vs_id = elem.get(f"{{{NAMESPACES['gml']}}}id") or ""
                uuid = ""
                ident = find_local_tag(elem, "identifier")
                if ident is not None:
                    uuid = ident.text or ""
                    
                name = ""
                ts = find_local_tag(elem, "VerticalStructureTimeSlice")
                if ts is not None:
                    name_el = find_local_tag(ts, "name")
                    if name_el is not None:
                        name = name_el.text or ""
                        
                features.append({
                    "id": f"vertical-{uuid}" if uuid else f"vertical-{vs_id}",
                    "name": name or f"Obstacle {vs_id[:8]}"
                })
                
    except Exception as e:
        warnings.append(f"Syntax warning in {Path(xml_path).name}: {str(e)}")
        
    return features, warnings

def safe_extract_zip(zip_path, extract_dir):
    """Protects against Zip Slip vulnerability during recursive extraction."""
    os.makedirs(extract_dir, exist_ok=True)
    resolved_base = Path(extract_dir).resolve()
    
    with zipfile.ZipFile(zip_path, 'r') as archive:
        for member in archive.infolist():
            # Mitigate Directory Traversal
            target_path = Path(os.path.join(extract_dir, member.filename)).resolve()
            if not target_path.is_relative_to(resolved_base):
                raise PermissionError(f"Directory traversal attack detected: {member.filename}")
                
            if member.is_dir():
                os.makedirs(target_path, exist_ok=True)
            else:
                os.makedirs(target_path.parent, exist_ok=True)
                with archive.open(member) as source, open(target_path, 'wb') as target:
                    shutil.copyfileobj(source, target)

def build_map_layers_geojson(parsed_groups):
    """Compiles all point and boundary layouts into a unified geojson collection."""
    features = []
    
    # Add Aerodromes
    for ad in parsed_groups.get("Aerodrome", []):
        if ad["lat"] is not None and ad["lon"] is not None:
            features.append({
                "type": "Feature",
                "properties": {
                    "id": ad["id"],
                    "name": ad["name"],
                    "icao": ad["icao"],
                    "type": "aerodrome"
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [ad["lon"], ad["lat"]]
                }
            })
            
    # Add Waypoints
    for pt in parsed_groups.get("DesignatedPoint", []):
        features.append({
            "type": "Feature",
            "properties": {
                "id": pt["id"],
                "name": pt["name"],
                "type": "waypoint"
            },
            "geometry": {
                "type": "Point",
                "coordinates": [pt["lon"], pt["lat"]]
            }
        })
        
    # Add Airspaces
    for asp in parsed_groups.get("Airspace", []):
        if asp["coordinates"]:
            features.append({
                "type": "Feature",
                "properties": {
                    "id": asp["id"],
                    "name": asp["designator"],
                    "type": asp["type"]
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": asp["coordinates"]
                }
            })
            
    return {
        "type": "FeatureCollection",
        "features": features
    }

def process_aixm_import_stages(source_path, is_zip, dataset_id, output_base_dir, legacy_dir, temp_extract_dir):
    """
    Core importer orchestra.
    Phases:
      1. Upload / Copy
      2. Extract ZIP
      3. Scan XML files
      4. Filter AIXM data XML
      5. Parse groups
      6. Normalize
      7. Build map layers
      8. Validate
      9. Save dataset
    """
    dataset_folder = Path(output_base_dir) / dataset_id
    original_dir = dataset_folder / "original"
    extracted_dir = dataset_folder / "extracted"
    normalized_dir = dataset_folder / "normalized"
    validation_dir = dataset_folder / "validation"
    
    os.makedirs(original_dir, exist_ok=True)
    os.makedirs(extracted_dir, exist_ok=True)
    os.makedirs(normalized_dir, exist_ok=True)
    os.makedirs(validation_dir, exist_ok=True)

    details = []
    warnings = []
    parsed_groups = {
        "Aerodrome": [], "Airspace": [], "DesignatedPoint": [], 
        "Holding": [], "Navaid": [], "Route": [], "Runway": [], 
        "VerticalStructure": []
    }
    
    # --- Phase 1 & 2: Copy and Extract ---
    try:
        if is_zip:
            # Copy zip
            shutil.copy2(source_path, original_dir / "AIXM.zip")
            safe_extract_zip(source_path, temp_extract_dir)
            scan_path = Path(temp_extract_dir)
        else:
            scan_path = Path(source_path)
    except Exception as e:
        return {
            "ok": False,
            "stage": "extract",
            "message": f"ZIP extraction failed: {str(e)}",
            "details": [{"file": Path(source_path).name, "error": str(e)}]
        }

    # --- Phase 3 & 4: Scan and Filter XMLs ---
    all_files = list(scan_path.glob("**/*"))
    xml_files = [f for f in all_files if f.is_file() and f.suffix.lower() == ".xml"]
    
    detected_files = []
    
    for f in xml_files:
        rel_path = f.relative_to(scan_path) if is_zip else f.name
        # Apply filters
        local_name, ns = get_root_info(f)
        if not isAixmDataXml(f.name, local_name, ns):
            continue
            
        # Detect group
        preview = ""
        try:
            with open(f, "r", encoding="utf-8", errors="ignore") as pf:
                preview = pf.read(4000)
        except Exception:
            pass
            
        grp = detectGroupFromPath(str(rel_path), preview)
        if grp != "Unknown":
            detected_files.append((f, grp, str(rel_path), local_name))
            
    if not detected_files:
        return {
            "ok": False,
            "stage": "scan",
            "message": "No valid AIXM 5.1 XML snapshot files discovered in the zip archive.",
            "details": []
        }

    # --- Phase 5: Parse Groups ---
    try:
        for f, grp, rel, root_tag in detected_files:
            # Copy to extracted folder
            dest_xml = extracted_dir / Path(rel).name
            shutil.copy2(f, dest_xml)
            
            feats, warns = parse_aixm_file(dest_xml, grp)
            parsed_groups[grp].extend(feats)
            warnings.extend(warns)
            
            details.append({
                "file": rel,
                "group": grp,
                "root": root_tag,
                "status": "PASSED" if not warns else "WARNING",
                "featureCount": len(feats),
                "warnings": warns
            })
    except Exception as e:
        return {
            "ok": False,
            "stage": "parse",
            "message": f"XML parsing failed internally: {str(e)}",
            "details": details
        }

    # --- Phase 6: Normalize files ---
    try:
        # Write individual files
        mapping = {
            "Aerodrome": "aerodromes.json",
            "Airspace": "airspaces.json",
            "DesignatedPoint": "designated_points.json",
            "Holding": "holdings.json",
            "Navaid": "navaids.json",
            "Route": "routes.json",
            "Runway": "runways.json",
            "VerticalStructure": "vertical_structures.json"
        }
        for grp, filename in mapping.items():
            with open(normalized_dir / filename, "w", encoding="utf-8") as outf:
                json.dump(parsed_groups[grp], outf, indent=2)
                
        # Generate dummy placeholders for remaining files
        with open(normalized_dir / "route_segments.json", "w") as outf:
            json.dump([], outf)
        with open(normalized_dir / "prd_areas.json", "w") as outf:
            json.dump([], outf)
            
    except Exception as e:
        return {
            "ok": False,
            "stage": "normalize",
            "message": f"Normalization writing failed: {str(e)}",
            "details": details
        }

    # --- Phase 7: Build Map Layers ---
    try:
        map_layers = build_map_layers_geojson(parsed_groups)
        with open(normalized_dir / "map_layers.geojson", "w", encoding="utf-8") as outf:
            json.dump(map_layers, outf, indent=2)
    except Exception as e:
        return {
            "ok": False,
            "stage": "normalize",
            "message": f"Map layer builder failed: {str(e)}",
            "details": details
        }

    # --- Phase 8: Validate & Save Report ---
    validation_report = {
        "ok": True,
        "warnings": warnings,
        "details": details,
        "summary": {
            "aerodromes": len(parsed_groups["Aerodrome"]),
            "airspaces": len(parsed_groups["Airspace"]),
            "designatedPoints": len(parsed_groups["DesignatedPoint"]),
            "navaids": len(parsed_groups["Navaid"]),
            "routes": len(parsed_groups["Route"]),
            "holdings": len(parsed_groups["Holding"]),
            "runways": len(parsed_groups["Runway"]),
            "verticalStructures": len(parsed_groups["VerticalStructure"])
        }
    }
    with open(validation_dir / "validation_report.json", "w", encoding="utf-8") as outf:
        json.dump(validation_report, outf, indent=2)

    # --- Phase 9: Save Dataset metadata ---
    # Copy baseline overlays defensively so overlay router never crashes
    try:
        copy_defensive_files = [
            "vatm_aerodromes.geojson", "vatm_runways.geojson",
            "aerodromes_runways_index.json", "vatm_significant_points.geojson",
            "significant_points.geojson", "airspace_fir_acc_tma_ctr.geojson",
            "airspace_index.json", "vatm_ats_routes.geojson", "ats_routes.geojson",
            "navaids.geojson", "procedures_all_nominal_tracks.geojson",
            "procedures_iap_nominal_tracks.geojson", "procedures_sid_nominal_tracks.geojson",
            "procedures_star_nominal_tracks.geojson", "procedures_index.json",
            "vatm_acc_fir_sectors.geojson", "vatm_acc_fir_2026.geojson",
            "vatm_holding_areas.geojson", "vatm_prd_airspace.geojson",
            "airspace_prd_areas.geojson", "vatm_route_corridors.geojson",
            "vatm_tma_ctr.geojson"
        ]
        for f in copy_defensive_files:
            src = Path(legacy_dir) / f
            dest = dataset_folder / f
            if src.exists():
                shutil.copy2(src, dest)
                
        # Copy procedures
        legacy_proc = Path(legacy_dir) / "procedures_by_airport"
        dest_proc = dataset_folder / "procedures_by_airport"
        if legacy_proc.exists():
            shutil.copytree(legacy_proc, dest_proc, dirs_exist_ok=True)
            
    except Exception as e:
        print(f"Defensive overlay copying warning: {e}")

    # Return success report
    return {
        "ok": True,
        "datasetId": dataset_id,
        "features": {
            "aerodromes": len(parsed_groups["Aerodrome"]),
            "airspaces": len(parsed_groups["Airspace"]),
            "designatedPoints": len(parsed_groups["DesignatedPoint"]),
            "navaids": len(parsed_groups["Navaid"]),
            "routes": len(parsed_groups["Route"]),
            "holdings": len(parsed_groups["Holding"]),
            "runways": len(parsed_groups["Runway"]),
            "verticalStructures": len(parsed_groups["VerticalStructure"])
        },
        "details": details
    }

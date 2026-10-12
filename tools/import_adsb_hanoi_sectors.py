import json
import csv
import sys
from datetime import datetime
import collections

def poly_bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), max(xs), min(ys), max(ys)

def point_in_polygon(x, y, poly, bbox):
    minx, maxx, miny, maxy = bbox
    if x < minx or x > maxx or y < miny or y > maxy:
        return False
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(1, n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y) and y <= max(p1y, p2y) and x <= max(p1x, p2x):
            if p1y != p2y:
                xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                if p1x == p2x or x <= xinters:
                    inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def load_hanoi_sectors(geojson_path):
    with open(geojson_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    sectors = {1: [], 2: [], 3: [], 4: []}
    
    for feat in data.get('features', []):
        props = feat.get('properties', {})
        name = props.get('name', '').upper()
        folder = props.get('folder_path', '').upper()
        
        if 'HANOI' in folder:
            sector_id = None
            if 'SECTOR 1' in name:
                sector_id = 1
            elif 'SECTOR 2' in name:
                sector_id = 2
            elif 'SECTOR 3' in name:
                sector_id = 3
            elif 'SECTOR 4' in name:
                sector_id = 4
                
            if sector_id is not None:
                geom = feat.get('geometry', {})
                geom_type = geom.get('type')
                coords = geom.get('coordinates', [])
                
                if geom_type == 'Polygon':
                    for ring in coords:
                        sectors[sector_id].append((ring, poly_bbox(ring)))
                elif geom_type == 'MultiPolygon':
                    for poly in coords:
                        for ring in poly:
                            sectors[sector_id].append((ring, poly_bbox(ring)))
    return sectors

def parse_iso8601(time_str):
    if not time_str:
        return None
    try:
        time_str = time_str.replace("Z", "+00:00")
        return datetime.fromisoformat(time_str)
    except Exception:
        return None

def main():
    sys.stdout.reconfigure(encoding='utf-8')
    geojson_path = r"D:\Coding\Dự án FTS\WebFTS v4\WebATM\static\data\vatm_kmz\vatm_acc_fir_sectors.geojson"
    input_file = r"D:\Coding\Dự án FTS\WebFTS v4\vietnam_ats_routes_pack\r72_tracks_20260605.csv"
    output_dir = r"D:\Coding\Dự án FTS\WebFTS v4\FTS Server\scenario"

    print("Loading Hanoi ACC Sectors...")
    sectors = load_hanoi_sectors(geojson_path)
    for k, v in sectors.items():
        print(f"Sector {k}: {len(v)} polygons loaded")

    print(f"Reading ADS-B file: {input_file}")
    flights = collections.defaultdict(list)
    
    with open(input_file, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            callsign = row.get("callsign", "").strip()
            if not callsign:
                callsign = row.get("flight_id", "").strip()
            if not callsign:
                continue

            try:
                lat = float(row["lat"])
                lon = float(row["lon"])
                alt = float(row["flight_level"]) * 100 if row["flight_level"] else 0.0
                spd = float(row["ground_speed_kt"]) if row["ground_speed_kt"] else 0.0
                hdg = float(row["heading_deg"]) if row["heading_deg"] else 0.0
                dt = parse_iso8601(row["received_at_utc"])
            except ValueError:
                continue
                
            if not dt:
                continue

            flights[callsign].append({
                "time": dt,
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "spd": spd,
                "hdg": hdg
            })

            count += 1
            if count % 500000 == 0:
                print(f"Processed {count} lines...")

    print(f"Total flights identified: {len(flights)}")
    
    # Process each sector
    for sector_id in [1, 2, 3, 4]:
        polys = sectors[sector_id]
        if not polys:
            print(f"No polygons for Sector {sector_id}, skipping...")
            continue
            
        print(f"Filtering flights for Sector {sector_id}...")
        sector_flights = []
        
        for callsign, pts in flights.items():
            if len(pts) < 10:
                continue
                
            # Quick BBox check (optional, but let's just do full check for simplicity as dataset is ~4700 flights)
            pts.sort(key=lambda x: x["time"])
            
            is_in_sector = False
            # We don't need to check every point, every 10th point is enough to identify pass-through,
            # but we also check the first and last to ensure we catch ground taxiing if inside sector.
            check_indices = list(range(0, len(pts), 5))
            if len(pts)-1 not in check_indices:
                check_indices.append(len(pts)-1)
                
            for i in check_indices:
                pt = pts[i]
                lon = pt["lon"]
                lat = pt["lat"]
                # Test against all polygons of this sector
                for poly, bbox in polys:
                    if point_in_polygon(lon, lat, poly, bbox):
                        is_in_sector = True
                        break
                if is_in_sector:
                    break
                    
            if is_in_sector:
                sector_flights.append({
                    "callsign": callsign,
                    "points": pts
                })
            
        print(f"Total flights intersecting Sector {sector_id}: {len(sector_flights)}")
        
        if not sector_flights:
            continue
            
        # Generate scenario
        output_file = rf"{output_dir}\hanoi_sector_{sector_id}_adsb.scn"
        
        sector_flights.sort(key=lambda x: x["points"][0]["time"])
        min_time = sector_flights[0]["points"][0]["time"]
        
        # Center of sector for DEFWPT (just use the first point of the first flight to avoid crashing DEFWPT)
        center_lat = sector_flights[0]["points"][0]["lat"]
        center_lon = sector_flights[0]["points"][0]["lon"]
        
        with open(output_file, mode='w', encoding='utf-8') as out:
            out.write(f"# WebFTS Scenario for Hanoi ACC Sector {sector_id}\n")
            out.write("# Includes high-fidelity ground movements inside the sector coverage.\n")
            out.write("00:00:00>DEFWPT SECT%d,%.6f,%.6f\n\n" % (sector_id, center_lat, center_lon))
            
            valid_cnt = 0
            for flight in sector_flights:
                callsign = flight["callsign"]
                pts = flight["points"]
                first_pt = pts[0]
                
                delta = first_pt["time"] - min_time
                total_seconds = int(delta.total_seconds())
                t_str = f"{total_seconds // 3600:02d}:{(total_seconds % 3600) // 60:02d}:{total_seconds % 60:02d}"

                start_alt = max(first_pt["alt"], 0.0)
                start_spd = max(first_pt["spd"], 5.0)
                
                out.write(f"{t_str}>CRE {callsign},A320,{first_pt['lat']:.6f},{first_pt['lon']:.6f},{first_pt['hdg']:.1f},{start_alt:.0f},{start_spd:.0f}\n")
                
                last_added_pt = first_pt
                for i in range(1, len(pts)):
                    pt = pts[i]
                    time_diff = (pt["time"] - last_added_pt["time"]).total_seconds()
                    
                    if pt["alt"] < 500:
                        threshold = 5
                    elif pt["alt"] < 5000:
                        threshold = 15
                    else:
                        threshold = 30
                        
                    if time_diff >= threshold:
                        wpt_alt = max(pt["alt"], 0.0)
                        wpt_spd = max(pt["spd"], 5.0)
                        out.write(f"{t_str}>ADDWPT {callsign},{pt['lat']:.6f},{pt['lon']:.6f},{wpt_alt:.0f},{wpt_spd:.0f}\n")
                        last_added_pt = pt

                out.write(f"{t_str}>LNAV {callsign},ON\n")
                out.write(f"{t_str}>VNAV {callsign},ON\n")
                valid_cnt += 1
                
        print(f"Successfully wrote {valid_cnt} flights to {output_file}")

if __name__ == "__main__":
    main()

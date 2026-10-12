import csv
import math
import sys
from datetime import datetime, timezone
import collections

# VVTS Coordinates
VVTS_LAT = 10.818
VVTS_LON = 106.662

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in km
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

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
    input_file = r"D:\Coding\Dự án FTS\WebFTS v4\vietnam_ats_routes_pack\r72_tracks_20260605.csv"
    output_file = r"D:\Coding\Dự án FTS\WebFTS v4\FTS Server\scenario\vvts_adsb_all_movements.scn"

    print(f"Reading file: {input_file}")
    
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
    
    # Filter VVTS flights (Arrivals + Departures including ground)
    vvts_flights = []
    
    for callsign, pts in flights.items():
        if len(pts) < 10:
            continue
            
        pts.sort(key=lambda x: x["time"])
        
        # Check if the flight has any point near VVTS and below 2000ft
        is_vvts_flight = False
        for pt in pts:
            if pt["alt"] < 2000:
                dist = haversine(pt["lat"], pt["lon"], VVTS_LAT, VVTS_LON)
                if dist < 5.0: # within 5km of VVTS
                    is_vvts_flight = True
                    break
                    
        if is_vvts_flight:
            vvts_flights.append({
                "callsign": callsign,
                "points": pts
            })

    print(f"Total VVTS flights (Arr/Dep/Ground) identified: {len(vvts_flights)}")

    if not vvts_flights:
        print("No scenarios generated.")
        return

    # Sort flights by their first appearance time
    vvts_flights.sort(key=lambda x: x["points"][0]["time"])
    min_time = vvts_flights[0]["points"][0]["time"]
    
    with open(output_file, mode='w', encoding='utf-8') as out:
        out.write("# WebFTS Detailed Track Scenario extracted from ADS-B data for VVTS All Movements\n")
        out.write("# Includes high-fidelity ground taxiing and apron coordinates.\n")
        out.write("# Date: 2026-06-05\n")
        out.write(f"00:00:00>DEFWPT VVTS,{VVTS_LAT:.6f},{VVTS_LON:.6f}\n\n")
        
        valid_cnt = 0
        for flight in vvts_flights:
            callsign = flight["callsign"]
            pts = flight["points"]
            first_pt = pts[0]
            
            # Start time formatting
            delta = first_pt["time"] - min_time
            total_seconds = int(delta.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            t_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

            start_alt = max(first_pt["alt"], 0.0) # Ground level allowed
            start_spd = max(first_pt["spd"], 5.0) # Ensure it moves slightly if on ground
            
            out.write(f"{t_str}>CRE {callsign},A320,{first_pt['lat']:.6f},{first_pt['lon']:.6f},{first_pt['hdg']:.1f},{start_alt:.0f},{start_spd:.0f}\n")
            
            # Adaptive Downsample
            last_added_pt = first_pt
            for i in range(1, len(pts)):
                pt = pts[i]
                time_diff = (pt["time"] - last_added_pt["time"]).total_seconds()
                
                # Adaptive logic based on altitude
                # Ground / Taxi: < 500ft -> 5s interval
                # Approach / Climb: < 5000ft -> 15s interval
                # Cruise: >= 5000ft -> 30s interval
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
            
    print(f"Successfully wrote {valid_cnt} detailed high-fidelity flight tracks to {output_file}")

if __name__ == "__main__":
    main()

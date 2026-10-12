import csv
import math
import sys
from datetime import datetime, timezone
import collections

# Tọa độ sân bay Nội Bài (VVNB)
VVNB_LAT = 21.2212
VVNB_LON = 105.8072

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Bán kính trái đất (km)
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
    output_file = r"D:\Coding\Dự án FTS\WebFTS v4\FTS Server\scenario\vvnb_adsb_arrivals_track.scn"

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
                alt = float(row["flight_level"]) * 100 if row["flight_level"] else 0
                spd = float(row["ground_speed_kt"]) if row["ground_speed_kt"] else 250
                hdg = float(row["heading_deg"]) if row["heading_deg"] else 0
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
    
    # Filter VVNB arrivals
    vvnb_arrivals = []
    
    for callsign, pts in flights.items():
        if len(pts) < 10:
            continue
            
        pts.sort(key=lambda x: x["time"])
        last_pt = pts[-1]
        
        # Check if last point is near VVNB (within 40km) and altitude < 15000ft
        dist = haversine(last_pt["lat"], last_pt["lon"], VVNB_LAT, VVNB_LON)
        if dist < 40 and last_pt["alt"] < 15000:
            # It's an arrival to VVNB
            vvnb_arrivals.append({
                "callsign": callsign,
                "points": pts
            })

    print(f"Total VVNB arrivals identified: {len(vvnb_arrivals)}")

    if not vvnb_arrivals:
        print("No scenarios generated.")
        return

    # Sort flights by their first appearance time to maintain logical order
    vvnb_arrivals.sort(key=lambda x: x["points"][0]["time"])
    min_time = vvnb_arrivals[0]["points"][0]["time"]
    
    with open(output_file, mode='w', encoding='utf-8') as out:
        out.write("# WebFTS Detailed Track Scenario extracted from ADS-B data for VVNB arrivals\n")
        out.write("# Date: 2026-06-05\n")
        out.write("00:00:00>DEFWPT VVNB,21.221200,105.807200\n\n")
        
        valid_cnt = 0
        for flight in vvnb_arrivals:
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

            start_alt = max(first_pt["alt"], 1000)
            start_spd = max(first_pt["spd"], 150)
            
            out.write(f"{t_str}>CRE {callsign},A320,{first_pt['lat']:.6f},{first_pt['lon']:.6f},{first_pt['hdg']:.1f},{start_alt:.0f},{start_spd:.0f}\n")
            out.write(f"{t_str}>DEST {callsign},VVNB\n")
            
            # Downsample points: Add waypoint if 60 seconds have passed or distance > 5 NM
            last_added_pt = first_pt
            for i in range(1, len(pts)):
                pt = pts[i]
                time_diff = (pt["time"] - last_added_pt["time"]).total_seconds()
                
                if time_diff >= 60:
                    # Formatting waypoint time just in case (though ADDWPT happens instantly for the FMS plan)
                    # We will just write ADDWPT at creation time, so the FMS has the full flight plan immediately
                    # BlueSky accepts: ADDWPT callsign, lat, lon, alt, spd
                    # Note: alt should be FL or feet. We pass numeric for feet.
                    wpt_alt = max(pt["alt"], 1000)
                    wpt_spd = max(pt["spd"], 150)
                    out.write(f"{t_str}>ADDWPT {callsign},{pt['lat']:.6f},{pt['lon']:.6f},{wpt_alt:.0f},{wpt_spd:.0f}\n")
                    last_added_pt = pt

            out.write(f"{t_str}>LNAV {callsign},ON\n")
            out.write(f"{t_str}>VNAV {callsign},ON\n")
            valid_cnt += 1
            
    print(f"Successfully wrote {valid_cnt} detailed flight tracks to {output_file}")

if __name__ == "__main__":
    main()

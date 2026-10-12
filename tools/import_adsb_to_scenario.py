import csv
import math
import sys
from datetime import datetime, timezone
import collections

# Tọa độ các sân bay lớn tại Việt Nam
AIRPORTS = {
    "VVNB": (21.2212, 105.8072),
    "VVTS": (10.8188, 106.6519),
    "VVDN": (16.0439, 108.1994),
    "VVPB": (16.4017, 107.7028),
    "VVCR": (11.9981, 109.2194),
    "VVCI": (20.8194, 106.7264),
    "VVVD": (21.1167, 107.4150),
    "VVBM": (12.6681, 108.1200),
    "VVUI": (11.7511, 108.3711),
    "VVCT": (10.0847, 105.7119),
    "VVPQ": (10.1694, 103.9961),
    "VVTH": (19.9022, 105.4678),
    "VVVN": (18.7369, 105.5700),
    "VVDH": (17.5147, 106.2625),
    "VVPC": (13.9547, 109.0442),
    "VVCA": (9.1764, 105.1808),
    "VVCS": (8.7328, 106.6294)
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0 # Bán kính trái đất (km)
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def find_closest_airport(lat, lon, max_dist_km=40):
    closest_ap = None
    min_dist = float('inf')
    for ap, (ap_lat, ap_lon) in AIRPORTS.items():
        dist = haversine(lat, lon, ap_lat, ap_lon)
        if dist < min_dist:
            min_dist = dist
            closest_ap = ap
    if min_dist <= max_dist_km:
        return closest_ap
    return None

def parse_iso8601(time_str):
    if not time_str:
        return None
    try:
        time_str = time_str.replace("Z", "+00:00")
        return datetime.fromisoformat(time_str)
    except Exception:
        return None

def main():
    input_file = r"D:\Coding\Dự án FTS\WebFTS v4\vietnam_ats_routes_pack\r72_tracks_20260605.csv"
    output_file = r"D:\Coding\Dự án FTS\WebFTS v4\FTS Server\scenario\vietnam_adsb.scn"

    sys.stdout.reconfigure(encoding='utf-8')
    print(f"Reading file: {input_file}")
    
    flights = {}
    
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

            point = {
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "spd": spd,
                "hdg": hdg,
                "time": dt
            }

            if callsign not in flights:
                flights[callsign] = {"first": point, "last": point, "count": 1}
            else:
                if dt < flights[callsign]["first"]["time"]:
                    flights[callsign]["first"] = point
                if dt > flights[callsign]["last"]["time"]:
                    flights[callsign]["last"] = point
                flights[callsign]["count"] += 1

            count += 1
            if count % 500000 == 0:
                print(f"Processed {count} lines...")

    print(f"Total flights identified: {len(flights)}")
    
    scenarios = []
    
    for callsign, data in flights.items():
        if data["count"] < 10:
            continue
            
        first_pt = data["first"]
        last_pt = data["last"]
        
        orig = find_closest_airport(first_pt["lat"], first_pt["lon"], max_dist_km=40)
        dest = find_closest_airport(last_pt["lat"], last_pt["lon"], max_dist_km=40)
        
        if not orig and not dest:
            continue

        orig_str = orig if orig else "UNKNOWN"
        dest_str = dest if dest else "UNKNOWN"

        scenarios.append({
            "callsign": callsign,
            "orig": orig_str,
            "dest": dest_str,
            "time": first_pt["time"],
            "lat": first_pt["lat"],
            "lon": first_pt["lon"],
            "hdg": first_pt["hdg"],
            "alt": first_pt["alt"],
            "spd": first_pt["spd"]
        })

    print(f"Total valid scenarios matching VN airports: {len(scenarios)}")

    scenarios.sort(key=lambda x: x["time"])

    if not scenarios:
        print("No scenarios generated.")
        return

    min_time = scenarios[0]["time"]
    
    with open(output_file, mode='w', encoding='utf-8') as out:
        out.write("# WebFTS Scenario extracted from ADS-B data (Vietnam)\n")
        out.write("# Date: 2026-06-05\n\n")
        
        for ap, (ap_lat, ap_lon) in AIRPORTS.items():
            out.write(f"00:00:00>DEFWPT {ap},{ap_lat:.6f},{ap_lon:.6f}\n")
            
        out.write("\n")
        
        valid_cnt = 0
        for sc in scenarios:
            delta = sc["time"] - min_time
            total_seconds = int(delta.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            seconds = total_seconds % 60
            t_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

            alt = max(sc["alt"], 1000)
            spd = max(sc["spd"], 150)
            
            out.write(f"{t_str}>CRE {sc['callsign']},A320,{sc['lat']:.6f},{sc['lon']:.6f},{sc['hdg']:.1f},{alt:.0f},{spd:.0f}\n")
            if sc["orig"] != "UNKNOWN":
                out.write(f"{t_str}>ORIG {sc['callsign']},{sc['orig']}\n")
            if sc["dest"] != "UNKNOWN":
                out.write(f"{t_str}>DEST {sc['callsign']},{sc['dest']}\n")
                out.write(f"{t_str}>ADDWPT {sc['callsign']},{sc['dest']},1500,160\n")
            out.write(f"{t_str}>LNAV {sc['callsign']},ON\n")
            out.write(f"{t_str}>VNAV {sc['callsign']},ON\n")
            valid_cnt += 1
            
    print(f"Successfully wrote {valid_cnt} flights to {output_file}")

if __name__ == "__main__":
    main()

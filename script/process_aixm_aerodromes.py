import xml.etree.ElementTree as ET
import json
import math

def calculate_destination(lat, lon, distance_m, bearing_deg):
    R = 6378137.0 # Earth radius in meters
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    bearing = math.radians(bearing_deg)
    
    lat2 = math.asin(math.sin(lat1) * math.cos(distance_m / R) +
                     math.cos(lat1) * math.sin(distance_m / R) * math.cos(bearing))
    lon2 = lon1 + math.atan2(math.sin(bearing) * math.sin(distance_m / R) * math.cos(lat1),
                             math.cos(distance_m / R) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lat2), math.degrees(lon2)

def process_data():
    aerodrome_xml = "vietnam_ats_routes_pack/EXPORT-Aerodrome_AIXM5.1_Data_Snapshot-Wed_Aug_20_07_04_54_GMT_00_00_2025/EXPORT_Export_AIXM5.1_Data_Snapshot_WEF2025-08-20_EXP2025-08-20_CRC_40B5D3D4.xml"
    runway_xml = "vietnam_ats_routes_pack/EXPORT-Runway_AIXM5.1_Data_Snapshot-Wed_Aug_20_07_05_54_GMT_00_00_2025/EXPORT_Export_AIXM5.1_Data_Snapshot_WEF2025-08-20_EXP2025-08-20_CRC_BD8FFFC9.xml"
    
    namespace = {
        'aixm': 'http://www.aixm.aero/schema/5.1',
        'gml': 'http://www.opengis.net/gml/3.2',
        'message': 'http://www.aixm.aero/schema/5.1/message',
        'xlink': 'http://www.w3.org/1999/xlink'
    }

    airports = {} # uuid -> {icao, name, lat, lon}
    
    # Process Aerodromes
    tree = ET.parse(aerodrome_xml)
    for feature in tree.getroot().findall('message:hasMember/*', namespace):
        uuid_elem = feature.find('gml:identifier', namespace)
        if uuid_elem is None: continue
        uuid = uuid_elem.text
        if uuid.startswith('urn:uuid:'):
            uuid = uuid
        else:
            uuid = 'urn:uuid:' + uuid

        ts = feature.find('aixm:timeSlice/*', namespace)
        if ts is None: continue

        icao = ts.find('aixm:locationIndicatorICAO', namespace)
        icao = icao.text if icao is not None else "UNKNOWN"
        name = ts.find('aixm:name', namespace)
        name = name.text if name is not None else "UNKNOWN"

        lat, lon = 0, 0
        pos = ts.find('.//aixm:ARP//gml:pos', namespace)
        if pos is not None and pos.text:
            parts = pos.text.split()
            if len(parts) >= 2:
                lat, lon = float(parts[0]), float(parts[1])

        airports[uuid] = {
            'uuid': uuid,
            'icao': icao,
            'name': name,
            'lat': lat,
            'lon': lon,
            'runways': []
        }

    # Process Runways
    tree2 = ET.parse(runway_xml)
    for feature in tree2.getroot().findall('message:hasMember/*', namespace):
        uuid_elem = feature.find('gml:identifier', namespace)
        if uuid_elem is None: continue
        rwy_uuid = uuid_elem.text

        ts = feature.find('aixm:timeSlice/*', namespace)
        if ts is None: continue

        designator = ts.find('aixm:designator', namespace)
        designator = designator.text if designator is not None else "RWY"

        length_elem = ts.find('aixm:nominalLength', namespace)
        length = float(length_elem.text) if length_elem is not None and length_elem.text else 2000.0

        assoc_elem = ts.find('aixm:associatedAirportHeliport', namespace)
        if assoc_elem is not None:
            href = assoc_elem.get('{http://www.w3.org/1999/xlink}href')
            if href in airports:
                airports[href]['runways'].append({
                    'id': f"runway-{rwy_uuid}",
                    'designator': designator,
                    'length': length
                })

    # Generate GeoJSON and Index
    aerodrome_features = []
    runway_features = []
    index_data = {}

    for uuid, apt in airports.items():
        icao = apt['icao']
        index_data[icao] = {
            'id': f"aerodrome-{uuid}",
            'name': apt['name'],
            'runways': {}
        }
        
        # Aerodrome Feature
        aerodrome_features.append({
            "type": "Feature",
            "properties": {
                "id": f"aerodrome-{uuid}",
                "name": f"{icao} - {apt['name']}",
                "icao": icao,
                "type": "aerodrome"
            },
            "geometry": {
                "type": "Point",
                "coordinates": [apt['lon'], apt['lat']]
            }
        })

        # Runway Features
        for rwy in apt['runways']:
            rwy_id = rwy['id']
            index_data[icao]['runways'][rwy['designator']] = rwy_id
            
            # Simple Geometry calculation for Runway
            heading = 0
            offset_dist = 0
            offset_bearing = 0
            des = rwy['designator'].upper()
            
            if '/' in des:
                parts = des.split('/')
                try:
                    base_des = parts[0]
                    heading = int(base_des.strip('LRC')) * 10
                    if 'L' in base_des:
                        offset_dist = 200 # 200 meters left
                        offset_bearing = heading - 90
                    elif 'R' in base_des:
                        offset_dist = 200 # 200 meters right
                        offset_bearing = heading + 90
                except:
                    heading = 0
            
            center_lat, center_lon = apt['lat'], apt['lon']
            if offset_dist > 0:
                center_lat, center_lon = calculate_destination(apt['lat'], apt['lon'], offset_dist, offset_bearing)
            
            p1_lat, p1_lon = calculate_destination(center_lat, center_lon, rwy['length']/2, heading)
            p2_lat, p2_lon = calculate_destination(center_lat, center_lon, rwy['length']/2, heading + 180)

            runway_features.append({
                "type": "Feature",
                "properties": {
                    "id": rwy_id,
                    "name": f"RWY {rwy['designator']} ({icao})",
                    "airport": icao,
                    "type": "runway"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [p2_lon, p2_lat],
                        [p1_lon, p1_lat]
                    ]
                }
            })

    aerodromes_geojson = {
        "type": "FeatureCollection",
        "features": aerodrome_features
    }

    runways_geojson = {
        "type": "FeatureCollection",
        "features": runway_features
    }

    with open('WebATM/static/data/vatm_kmz/vatm_aerodromes.geojson', 'w', encoding='utf-8') as f:
        json.dump(aerodromes_geojson, f, indent=2, ensure_ascii=False)

    with open('WebATM/static/data/vatm_kmz/vatm_runways.geojson', 'w', encoding='utf-8') as f:
        json.dump(runways_geojson, f, indent=2, ensure_ascii=False)

    with open('WebATM/static/data/vatm_kmz/aerodromes_runways_index.json', 'w', encoding='utf-8') as f:
        json.dump(index_data, f, indent=2, ensure_ascii=False)

    print("Successfully generated geojson and index files.")

if __name__ == "__main__":
    process_data()

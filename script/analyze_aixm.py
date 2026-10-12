import xml.etree.ElementTree as ET
import json

def analyze_xml(filepath):
    print(f"Analyzing {filepath}")
    tree = ET.parse(filepath)
    root = tree.getroot()
    namespace = {
        'aixm': 'http://www.aixm.aero/schema/5.1',
        'gml': 'http://www.opengis.net/gml/3.2',
        'message': 'http://www.aixm.aero/schema/5.1/message',
        'xlink': 'http://www.w3.org/1999/xlink'
    }
    
    features = root.findall('message:hasMember/*', namespace)
    for i, feature in enumerate(features[:2]):
        print(f"Feature {i}: {feature.tag} (ID: {feature.get('{http://www.opengis.net/gml/3.2}id')})")
        for ts in feature.findall('aixm:timeSlice/*', namespace):
            for child in ts:
                if 'ARP' in child.tag:
                    pos = child.find('.//gml:pos', namespace)
                    if pos is not None:
                        print(f"  ARP pos: {pos.text}")
                elif 'associatedAirportHeliport' in child.tag:
                    href = child.get('{http://www.w3.org/1999/xlink}href')
                    print(f"  associatedAirportHeliport href: {href}")
                elif 'extent' in child.tag:
                    print("  Found extent tag!")
                
                # Check for any gml:pos inside runway
                poses = child.findall('.//gml:posList', namespace) + child.findall('.//gml:pos', namespace)
                if poses:
                    for p in poses:
                        print(f"  Found coordinates in {child.tag}: {p.text}")

analyze_xml("vietnam_ats_routes_pack/EXPORT-Aerodrome_AIXM5.1_Data_Snapshot-Wed_Aug_20_07_04_54_GMT_00_00_2025/EXPORT_Export_AIXM5.1_Data_Snapshot_WEF2025-08-20_EXP2025-08-20_CRC_40B5D3D4.xml")
print("-" * 50)
analyze_xml("vietnam_ats_routes_pack/EXPORT-Runway_AIXM5.1_Data_Snapshot-Wed_Aug_20_07_05_54_GMT_00_00_2025/EXPORT_Export_AIXM5.1_Data_Snapshot_WEF2025-08-20_EXP2025-08-20_CRC_BD8FFFC9.xml")

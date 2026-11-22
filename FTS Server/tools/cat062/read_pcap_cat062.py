"""
Doc truc tiep file PCAP (khong qua scapy de nhanh hon voi file lon), trich
UDP payload (gia dinh khung Ethernet II + IPv4 + UDP chuan, khong VLAN tag),
dua qua cat062_decoder de giai ma, xuat ra CSV track giong dinh dang da dung
truoc do (callsign, lat, lon, flight_level, ground_speed_kt, heading_deg,
received_at_utc).
"""
import csv
import math
import struct
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cat062_decoder import decode_data_block  # noqa: E402

MS_TO_KT = 1.0 / 0.514444


def iter_udp_payloads(pcap_path: str):
    """Yield (ts_epoch_float, udp_payload_bytes) cho moi goi tin UDP trong pcap."""
    with open(pcap_path, "rb") as f:
        global_header = f.read(24)
        magic = struct.unpack("<I", global_header[0:4])[0]
        if magic != 0xA1B2C3D4:
            raise ValueError(f"Khong phai pcap chuan (magic={hex(magic)})")
        while True:
            rec_hdr = f.read(16)
            if len(rec_hdr) < 16:
                break
            ts_sec, ts_usec, incl_len, _orig_len = struct.unpack("<IIII", rec_hdr)
            data = f.read(incl_len)
            if len(data) < 14 + 20 + 8:
                continue
            eth_type = struct.unpack(">H", data[12:14])[0]
            if eth_type != 0x0800:  # chi xu ly IPv4
                continue
            ip_ver_ihl = data[14]
            ihl = (ip_ver_ihl & 0x0F) * 4
            proto = data[14 + 9]
            if proto != 17:  # chi xu ly UDP
                continue
            udp_start = 14 + ihl
            udp_len = struct.unpack(">H", data[udp_start + 4:udp_start + 6])[0]
            payload_start = udp_start + 8
            payload = data[payload_start:payload_start + (udp_len - 8)]
            ts = ts_sec + ts_usec / 1_000_000.0
            yield ts, payload


def decode_pcap_to_rows(pcap_path: str, max_packets: int = None, progress_every: int = 50000):
    rows = []
    n_packets = 0
    n_blocks = 0
    n_records = 0
    n_with_pos = 0
    bad_cat_count = 0

    for ts, payload in iter_udp_payloads(pcap_path):
        n_packets += 1
        if max_packets and n_packets > max_packets:
            break
        if not payload:
            continue
        pos = 0
        while pos < len(payload):
            if payload[pos] != 62:
                bad_cat_count += 1
                break
            try:
                reports, next_pos = decode_data_block(payload, pos, None)
            except (IndexError, struct.error):
                break
            n_blocks += 1
            for rpt in reports:
                n_records += 1
                if rpt.lat_deg is None or rpt.lon_deg is None:
                    continue
                n_with_pos += 1
                alt_fl = None
                if rpt.baro_alt_fl is not None:
                    alt_fl = rpt.baro_alt_fl
                elif rpt.measured_fl is not None:
                    alt_fl = rpt.measured_fl
                elif rpt.geo_alt_ft is not None:
                    alt_fl = rpt.geo_alt_ft / 100.0

                gs_kt = None
                hdg_deg = None
                if rpt.vx_ms is not None and rpt.vy_ms is not None:
                    gs_ms = math.hypot(rpt.vx_ms, rpt.vy_ms)
                    gs_kt = gs_ms * MS_TO_KT
                    hdg_deg = math.degrees(math.atan2(rpt.vx_ms, rpt.vy_ms)) % 360.0

                callsign = rpt.callsign_390 or rpt.callsign_380 or rpt.callsign_245 or ""
                callsign = callsign.strip()

                # Thoi diem: dung timestamp cua goi tin pcap (UTC that, chinh
                # xac hon suy tu I070 vi khong biet chinh xac ngay UTC-midnight
                # tham chieu cua may phat -- pcap ts da la epoch UTC that).
                rows.append({
                    "callsign": callsign if callsign else f"TRK{rpt.track_number}",
                    "track_number": rpt.track_number,
                    "icao24": f"{rpt.target_address:06X}" if rpt.target_address else "",
                    "lat": rpt.lat_deg,
                    "lon": rpt.lon_deg,
                    "flight_level": alt_fl,
                    "ground_speed_kt": gs_kt,
                    "heading_deg": hdg_deg,
                    "received_at_utc": ts,
                })
            pos = next_pos

        if progress_every and n_packets % progress_every == 0:
            print(f"  ... {n_packets} goi, {n_records} record, {n_with_pos} co vi tri", flush=True)

    print(f"Tong: {n_packets} goi UDP, {n_blocks} data block, {n_records} record, {n_with_pos} co vi tri, {bad_cat_count} block khong phai CAT62")
    return rows


if __name__ == "__main__":
    pcap_path = r"D:/OneDrive - Tong cong ty Quan ly bay Viet Nam - Cong ty TNHH/Coding/Code gốc/Dự án FTS/ADSB FPL/cat062_20nov26.pcap"
    rows = decode_pcap_to_rows(pcap_path, max_packets=2000)
    print(f"\nSample rows ({len(rows)} total from first 2000 packets):")
    for r in rows[:10]:
        t = datetime.fromtimestamp(r["received_at_utc"], tz=timezone.utc)
        print(f"  {r['callsign']:10s} lat={r['lat']:.4f} lon={r['lon']:.4f} FL={r['flight_level']} gs={r['ground_speed_kt']} hdg={r['heading_deg']} t={t}")

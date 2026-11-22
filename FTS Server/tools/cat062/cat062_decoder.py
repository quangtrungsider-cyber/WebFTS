"""
Bo giai ma ASTERIX Category 062 (System Track Data), dung cho du lieu PCAP
thu duoc tu luong UDP multicast ADS-B/radar fusion track.

Nguon chuan: EUROCONTROL-SPEC-0149-9, "EUROCONTROL Specification for
Surveillance Data Exchange ASTERIX Part 9 Category 062" - Bang UAP (User
Application Profile) chinh thuc lay tu Edition 1.18 (Table 1, muc 5.3) vi
Edition 1.20 da XOA bang tom tat nay khoi tai lieu nhung noi dung item khong
doi. Thu tu FRN duoi day la thu tu THAT trong FSPEC - KHAC HOAN TOAN so voi
thu tu muc luc 5.2.x cua tai lieu (da kiem chung bang cach tai ca 2 edition
va doi chieu truc tiep bang UAP, khong doan tu thu tu trinh bay).

FRN  Item      Do dai (octet)      Ghi chu
1    I010      2                   Data Source Identifier (SAC/SIC)
2    (spare)   -
3    I015      1                   Service Identification
4    I070      3                   Time Of Track Information (BAT DUOC, LSB=1/128s)
5    I105      8                   Calculated Position WGS-84 (BAT DUOC)
6    I100      6                   Calculated Position Cartesian
7    I185      4                   Calculated Velocity Cartesian (BAT DUOC)
     FX
8    I210      2                   Calculated Acceleration Cartesian
9    I060      2                   Track Mode 3/A Code
10   I245      7                   Target Identification (du phong lay callsign)
11   I380      1+ (compound)       Aircraft Derived Data (BAT DUOC: Target Address, Callsign)
12   I040      2                   Track Number (BAT DUOC)
13   I080      1+ (FX-chain)       Track Status
14   I290      1+ (compound)       System Track Update Ages
     FX
15   I200      1                   Mode of Movement
16   I295      1+ (compound)       Track Data Ages
17   I136      2                   Measured Flight Level
18   I130      2                   Calculated Track Geometric Altitude
19   I135      2                   Calculated Track Barometric Altitude (BAT DUOC)
20   I220      2                   Calculated Rate Of Climb/Descent
21   I390      1+ (compound)       Flight Plan Related Data (BAT DUOC: Callsign that)
     FX
22   I270      1+ (FX-chain)       Target Size & Orientation
23   I300      1                   Vehicle Fleet Identification
24   I110      1+ (compound)       Mode 5 Data
25   I120      2                   Track Mode 2 Code
26   I510      3+ (FX-chain, 3B)   Composed Track Number
27   I500      1+ (compound)       Estimated Accuracies
28   I340      1+ (compound)       Measured Information
     FX
29-33 (spare x5)
34   RE        1+ (len-prefixed)   Reserved Expansion Field
35   SP        1+ (len-prefixed)   Special Purpose Indicator
     FX
"""
import struct
from dataclasses import dataclass, field


def sign_extend(value: int, bits: int) -> int:
    sign_bit = 1 << (bits - 1)
    return (value & (sign_bit - 1)) - (value & sign_bit)


@dataclass
class TrackReport:
    sac: int = None
    sic: int = None
    time_of_day_s: float = None
    lat_deg: float = None
    lon_deg: float = None
    vx_ms: float = None
    vy_ms: float = None
    track_number: int = None
    geo_alt_ft: float = None
    baro_alt_fl: float = None
    measured_fl: float = None
    target_address: int = None
    callsign_380: str = None
    callsign_390: str = None
    callsign_245: str = None


def decode_6bit_char(code: int) -> str:
    # Bang ky tu 6-bit chuan ASTERIX / ICAO Annex 10 (giong het Mode-S BDS 2,0)
    if code == 0:
        return " "
    if 1 <= code <= 26:
        return chr(ord("A") + code - 1)
    if 48 <= code <= 57:
        return chr(ord("0") + code - 48)
    return " "


def decode_callsign_6bit(raw6bytes: bytes) -> str:
    bits = int.from_bytes(raw6bytes, "big")
    chars = []
    for i in range(7, -1, -1):
        code = (bits >> (i * 6)) & 0x3F
        chars.append(decode_6bit_char(code))
    return "".join(chars).rstrip()


def _fx_chain_skip(buf: bytes, pos: int, octet_width: int = 1) -> int:
    """Items with a first part + FX-extensible same-width extents (I080, I270,
    I510). FX bit is the LAST bit of the LAST octet in each extent."""
    while True:
        last_octet = buf[pos + octet_width - 1]
        pos += octet_width
        if not (last_octet & 0x01):
            break
    return pos


def _parse_compound_primary(buf: bytes, pos: int, max_octets: int):
    """Reads an FX-chained primary subfield (each octet's bit0 = FX), up to
    max_octets. Returns (presence_bits_msb_first_list, new_pos)."""
    bits = []
    octets_read = 0
    while True:
        b = buf[pos]
        pos += 1
        octets_read += 1
        for shift in range(7, 0, -1):
            bits.append((b >> shift) & 1)
        fx = b & 1
        if not fx or octets_read >= max_octets:
            break
    return bits, pos


def _skip_compound(buf: bytes, pos: int, max_primary_octets: int, subfield_lengths: list,
                    repetitive_subfields: dict = None) -> int:
    """Generic compound-item skipper: parse FX-chained primary subfield,
    then skip each present subfield by its fixed length (or, for repetitive
    subfields -- keyed by 0-based index in subfield_lengths -- read a 1-byte
    REP count first and skip REP * unit_length)."""
    presence_bits, pos = _parse_compound_primary(buf, pos, max_primary_octets)
    repetitive_subfields = repetitive_subfields or {}
    for idx, present in enumerate(presence_bits):
        if idx >= len(subfield_lengths):
            break
        if not present:
            continue
        if idx in repetitive_subfields:
            rep = buf[pos]
            pos += 1 + rep * repetitive_subfields[idx]
        else:
            pos += subfield_lengths[idx]
    return pos


def _skip_len_prefixed(buf: bytes, pos: int) -> int:
    length = buf[pos]
    return pos + length


I290_SUBFIELD_LENGTHS = [1, 1, 1, 1, 2, 1, 1, 1, 1, 1]
I295_SUBFIELD_LENGTHS = [1] * 31
I390_SUBFIELD_LENGTHS = [2, 7, 4, 1, 4, 1, 4, 4, 3, 2, 2, None, 6, 1, 7, 7, 2, 7]
I500_SUBFIELD_LENGTHS = [4, 2, 4, 1, 1, 2, 2, 1]
I340_SUBFIELD_LENGTHS = [2, 4, 2, 2, 2, 1]
I110_SUBFIELD_LENGTHS = [1, 4, 6, 2, 2, 1, 1]


def decode_record(buf: bytes, offset: int, pcap_date_epoch_midnight: float) -> tuple[TrackReport, int]:
    """Giai ma 1 record ASTERIX Cat062 bat dau tai offset trong buf (da bao
    gom FSPEC). Tra ve (TrackReport, so_octet_da_tieu_thu)."""
    start = offset
    pos = offset

    # --- FSPEC: cac octet FX-chained, bit0 = FX ---
    fspec_bits = []
    while True:
        b = buf[pos]
        pos += 1
        for shift in range(7, 0, -1):
            fspec_bits.append((b >> shift) & 1)
        if not (b & 1):
            break

    def present(frn: int) -> bool:
        return frn - 1 < len(fspec_bits) and fspec_bits[frn - 1] == 1

    rpt = TrackReport()

    # FRN1 I010 (2)
    if present(1):
        rpt.sac, rpt.sic = buf[pos], buf[pos + 1]
        pos += 2
    # FRN2 spare -- never present
    # FRN3 I015 (1)
    if present(3):
        pos += 1
    # FRN4 I070 (3)
    if present(4):
        raw = int.from_bytes(buf[pos:pos + 3], "big")
        rpt.time_of_day_s = raw / 128.0
        pos += 3
    # FRN5 I105 (8)
    if present(5):
        lat_raw = struct.unpack(">i", buf[pos:pos + 4])[0]
        lon_raw = struct.unpack(">i", buf[pos + 4:pos + 8])[0]
        scale = 180.0 / (2 ** 25)
        rpt.lat_deg = lat_raw * scale
        rpt.lon_deg = lon_raw * scale
        pos += 8
    # FRN6 I100 (6)
    if present(6):
        pos += 6
    # FRN7 I185 (4)
    if present(7):
        vx_raw = struct.unpack(">h", buf[pos:pos + 2])[0]
        vy_raw = struct.unpack(">h", buf[pos + 2:pos + 4])[0]
        rpt.vx_ms = vx_raw * 0.25
        rpt.vy_ms = vy_raw * 0.25
        pos += 4
    # FRN8 I210 (2)
    if present(8):
        pos += 2
    # FRN9 I060 (2)
    if present(9):
        pos += 2
    # FRN10 I245 (7)
    if present(10):
        sti = buf[pos] >> 6
        rpt.callsign_245 = decode_callsign_6bit(buf[pos + 1:pos + 7])
        pos += 7
    # FRN11 I380 (compound, max 4 primary octets)
    if present(11):
        i380_bits, p2 = _parse_compound_primary(buf, pos, 4)
        pos = p2
        # i380_bits order: ADR,ID,MHG,IAS,TAS,SAL,FSS, TIS,TID,COM,SAB,ACS,BVR,GVR, RAN,TAR,TAN,GSP,VUN,MET,EMC, POS,GAL,PUN,MB,IAR,MAC,BPS
        subfield_lengths = [3, 6, 2, 2, 2, 2, 2, 1, None, 2, 2, 7, 2, 2, 2, 2, 2, 2, 1, 8, 1, 6, 2, 1, 7, 2, 2, 2]
        repetitive = {8: 15, 24: 8}  # SF9 TrajIntentData (idx8): REP*15B ; SF25 BDS data (idx24): REP*8B
        for idx, pr in enumerate(i380_bits):
            if idx >= len(subfield_lengths):
                break
            if not pr:
                continue
            if idx == 0:  # Target Address
                rpt.target_address = int.from_bytes(buf[pos:pos + 3], "big")
                pos += 3
            elif idx == 1:  # Target Identification / callsign
                rpt.callsign_380 = decode_callsign_6bit(buf[pos:pos + 6])
                pos += 6
            elif idx in repetitive:
                rep = buf[pos]
                pos += 1 + rep * repetitive[idx]
            else:
                pos += subfield_lengths[idx]
    # FRN12 I040 (2)
    if present(12):
        rpt.track_number = struct.unpack(">H", buf[pos:pos + 2])[0]
        pos += 2
    # FRN13 I080 (FX-chain, 1 byte/extent, max 6 octets: primary+5 extents)
    if present(13):
        pos = _fx_chain_skip(buf, pos, 1)
    # FRN14 I290 (compound, max 2 primary octets)
    if present(14):
        pos = _skip_compound(buf, pos, 2, I290_SUBFIELD_LENGTHS)
    # FRN15 I200 (1)
    if present(15):
        pos += 1
    # FRN16 I295 (compound, max 5 primary octets)
    if present(16):
        pos = _skip_compound(buf, pos, 5, I295_SUBFIELD_LENGTHS)
    # FRN17 I136 (2)
    if present(17):
        raw = struct.unpack(">h", buf[pos:pos + 2])[0]
        rpt.measured_fl = raw * 0.25
        pos += 2
    # FRN18 I130 (2)
    if present(18):
        raw = struct.unpack(">h", buf[pos:pos + 2])[0]
        rpt.geo_alt_ft = raw * 6.25
        pos += 2
    # FRN19 I135 (2)
    if present(19):
        raw = struct.unpack(">H", buf[pos:pos + 2])[0]
        val15 = sign_extend(raw & 0x7FFF, 15)
        rpt.baro_alt_fl = val15 * 0.25
        pos += 2
    # FRN20 I220 (2)
    if present(20):
        pos += 2
    # FRN21 I390 (compound, max 3 primary octets)
    if present(21):
        i390_bits, p2 = _parse_compound_primary(buf, pos, 3)
        pos = p2
        for idx, pr in enumerate(i390_bits):
            if idx >= len(I390_SUBFIELD_LENGTHS):
                break
            if not pr:
                continue
            if idx == 1:  # Callsign (plain ASCII, 7 bytes)
                rpt.callsign_390 = buf[pos:pos + 7].decode("ascii", errors="replace").rstrip()
                pos += 7
            elif idx == 11:  # Time of Departure/Arrival: repetitive, REP + REP*4
                rep = buf[pos]
                pos += 1 + rep * 4
            else:
                pos += I390_SUBFIELD_LENGTHS[idx]
    # FRN22 I270 (FX-chain, 1 byte/extent, max 3 octets)
    if present(22):
        pos = _fx_chain_skip(buf, pos, 1)
    # FRN23 I300 (1)
    if present(23):
        pos += 1
    # FRN24 I110 (compound, primary treated as 1 octet -- Mode 5/military, rare)
    if present(24):
        pos = _skip_compound(buf, pos, 1, I110_SUBFIELD_LENGTHS)
    # FRN25 I120 (2)
    if present(25):
        pos += 2
    # FRN26 I510 (FX-chain, 3 bytes/extent)
    if present(26):
        pos = _fx_chain_skip(buf, pos, 3)
    # FRN27 I500 (compound, max 2 primary octets)
    if present(27):
        pos = _skip_compound(buf, pos, 2, I500_SUBFIELD_LENGTHS)
    # FRN28 I340 (compound, primary treated as 1 octet)
    if present(28):
        pos = _skip_compound(buf, pos, 1, I340_SUBFIELD_LENGTHS)
    # FRN29-33 spare -- never present
    # FRN34 RE (length-prefixed)
    if present(34):
        pos = _skip_len_prefixed(buf, pos)
    # FRN35 SP (length-prefixed)
    if present(35):
        pos = _skip_len_prefixed(buf, pos)

    return rpt, pos - start


def decode_data_block(buf: bytes, offset: int, pcap_date_epoch_midnight: float):
    """Giai ma 1 Data Block (CAT + LEN + N records). Tra ve (list[TrackReport], next_offset)."""
    cat = buf[offset]
    if cat != 62:
        return [], offset + 1  # khong phai Cat062, bo qua 1 byte de tranh vong lap vo han
    length = struct.unpack(">H", buf[offset + 1:offset + 3])[0]
    block_end = offset + length
    pos = offset + 3
    reports = []
    while pos < block_end:
        rpt, consumed = decode_record(buf, pos, pcap_date_epoch_midnight)
        reports.append(rpt)
        pos += consumed
        if consumed <= 0:
            break  # an toan: tranh vong lap vo han neu co du lieu hong
    return reports, block_end

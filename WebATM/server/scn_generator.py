"""
BlueSky .scn file generator.

generate_scn_content(scenario) produces a complete, runnable .scn file:
  - VVDN with ILS arrival (35L or 17R) + RNAV SID departure (35R or 17L):
    timed sequence with correct runway coords, SID waypoints, and
    glideslope vertical-speed commands.
  - All other airports: spaced CRE commands using known centre-point coords.
"""

import math
import random
import re
from datetime import datetime

# ---------------------------------------------------------------------------
# Aircraft performance
# ---------------------------------------------------------------------------
AIRCRAFT_PERF = {
    "A321": {"v2": 160, "vapp": 147, "climb_fpm": 2500},
    "A21N": {"v2": 158, "vapp": 145, "climb_fpm": 2600},
    "A320": {"v2": 155, "vapp": 142, "climb_fpm": 2500},
    "A20N": {"v2": 153, "vapp": 140, "climb_fpm": 2600},
    "B738": {"v2": 162, "vapp": 150, "climb_fpm": 2400},
    "B38M": {"v2": 158, "vapp": 146, "climb_fpm": 2500},
    "A333": {"v2": 168, "vapp": 155, "climb_fpm": 2000},
    "B77W": {"v2": 175, "vapp": 162, "climb_fpm": 1800},
    "B789": {"v2": 165, "vapp": 152, "climb_fpm": 2200},
    "AT76": {"v2": 115, "vapp": 105, "climb_fpm": 1800},
    "GLF4": {"v2": 140, "vapp": 125, "climb_fpm": 2500},
    # Added for Hanoi_FlightPlan_Jan14_2026.csv coverage -- reference figures
    # in the same style as above (typical published V2/Vapp/climb rate),
    # not precise BADA/OEM data.
    "A359": {"v2": 155, "vapp": 145, "climb_fpm": 2200},
    "B744": {"v2": 180, "vapp": 165, "climb_fpm": 1500},
    "B77L": {"v2": 175, "vapp": 160, "climb_fpm": 1800},
    "B78X": {"v2": 160, "vapp": 150, "climb_fpm": 2100},
    "B763": {"v2": 165, "vapp": 150, "climb_fpm": 2000},
    "B739": {"v2": 160, "vapp": 148, "climb_fpm": 2300},
    "B788": {"v2": 155, "vapp": 145, "climb_fpm": 2200},
    "B773": {"v2": 178, "vapp": 163, "climb_fpm": 1700},
    "A332": {"v2": 155, "vapp": 140, "climb_fpm": 2000},
    "AJ27": {"v2": 140, "vapp": 130, "climb_fpm": 2200},
    "GLF6": {"v2": 130, "vapp": 120, "climb_fpm": 4000},
    "B772": {"v2": 170, "vapp": 155, "climb_fpm": 1900},
    "FA8X": {"v2": 125, "vapp": 115, "climb_fpm": 3500},
    "E190": {"v2": 140, "vapp": 130, "climb_fpm": 2500},
    "B748": {"v2": 180, "vapp": 165, "climb_fpm": 1600},
}

FLEET_MIX = {
    "VVDN": [("A321",50.3),("A21N",17.0),("A320",8.9),("A20N",6.3),
             ("B738",3.9),("B38M",1.5),("A333",3.1),("AT76",1.0)],
    "VVTS": [("A321",48.0),("A21N",18.0),("A320",11.0),("A20N",5.0),
             ("B738",7.0),("B38M",3.0),("A333",5.0),("B77W",1.0)],
    "VVNB": [("A321",45.0),("A21N",16.0),("A320",12.0),("A20N",7.0),
             ("B738",7.0),("B38M",3.0),("A333",7.0),("B77W",2.0)],
    "_default": [("A321",50.0),("A320",20.0),("B738",15.0),("A333",10.0),("AT76",5.0)],
}

AIRPORT_CENTRE = {
    "VVTS": (10.8182, 106.6520), "VVDN": (16.0439, 108.1993),
    "VVNB": (21.2187, 105.8072), "VVCR": (11.9982, 109.2194),
    "VVPQ": (10.1700, 103.9931), "VVCI": (20.8194, 106.7244),
    "VVCA": (15.4033, 108.7058), "VVVH": (18.7375, 105.6714),
    "VVDL": (11.7500, 108.3750), "VVPB": (16.4011, 107.7025),
    "VVPC": (13.9550, 109.0422), "VVPK": (14.0044, 108.0169),
    "VVGB": (21.042644, 106.202514),
}

# ---------------------------------------------------------------------------
# VVDN SID data — AIP Vietnam AIRAC 01/26
# (name, lat, lon, alt_constraint_ft | None)
# ---------------------------------------------------------------------------
_VVDN_SIDS_35R = {
    "SADIN1G": [
        ("DN450",16.174444,108.194722,None), ("DN451",16.176944,108.387778,None),
        ("DN452",16.093333,108.388889,8000), ("DN453",15.909444,108.391389,10000),
        ("KEMSY",15.543333,108.395833,None), ("SADIN",15.080000,108.177222,None),
    ],
    "KUMUN1G": [
        ("DN450",16.174444,108.194722,None), ("DN451",16.176944,108.387778,None),
        ("DN452",16.093333,108.388889,8000), ("DN453",15.909444,108.391389,10000),
        ("KEMSY",15.543333,108.395833,None), ("KUMUN",14.971389,108.807500,None),
    ],
    "PAPRA2G": [
        ("DN450",16.174444,108.194722,None), ("DN451",16.176944,108.387778,None),
        ("DN452",16.093333,108.388889,8000), ("DN453",15.909444,108.391389,10000),
        ("DN454",15.906944,108.061944,18000),("DN455",15.905833,107.931111,None),
        ("TANNA",15.903333,107.658889,None), ("PAPRA",15.766667,107.183333,None),
    ],
    "XAQUA1G": [
        ("DN450",16.174444,108.194722,None), ("DN451",16.176944,108.387778,None),
        ("DN452",16.093333,108.388889,8000), ("DN453",15.909444,108.391389,10000),
        ("KEMSY",15.543333,108.395833,None), ("SADIN",15.080000,108.177222,None),
        ("XAQUA",14.919444,108.101667,None),
    ],
}
_SID_W = {"SADIN1G": 50, "KUMUN1G": 25, "PAPRA2G": 15, "XAQUA1G": 10}

_VVDN_RWY = {
    "35L": {"thr_lat":16.010556,"thr_lon":108.184444,"hdg":350,
            "entry_lat":15.846421,"entry_lon":108.214554},
    # entry_lat/lon: 10 NM south on the runway's own heading (350deg), same
    # geometry as 35L's entry point above -- without this, arrivals on 35R
    # previously reused 35L's entry point/heading and never actually
    # converged on the real 35R threshold, causing a lateral jump where
    # the real ADS-B taxi-in track (_VVDN_35R_TAXI_TRUNK) picks up.
    "35R": {"thr_lat":16.010556,"thr_lon":108.207778,"hdg":350,
            "entry_lat":15.846417,"entry_lon":108.237863},
    "17L": {"thr_lat":16.066667,"thr_lon":108.207778,"hdg":170},
    "17R": {"thr_lat":16.066667,"thr_lon":108.184444,"hdg":170,
            "entry_lat":16.230556,"entry_lon":108.177778},
}

# Real landing-rollout + taxi-in track for RWY 35R, derived from actual
# ADS-B ground returns (vietnam_ats_routes_pack/ADSB 05.6.2026/ADSB Attech/
# ADSB DAN/181 -- 20 real arrivals, binned by latitude and averaged into one
# smoothed centerline). The sensor only captured position reports from
# ~800m past the threshold onward, so the short gap from the real 35R
# threshold to the track's first point is a straight-line fill, not real
# telemetry. No equivalent real data exists for 35L/17L/17R, so this only
# applies when arr_rwy == "35R"; other runways keep the prior instant-
# landing behavior unchanged.
_VVDN_35R_TAXI_TRUNK = [
    (16.018114, 108.203379), (16.020452, 108.203044), (16.021654, 108.202881),
    (16.022947, 108.202680), (16.024519, 108.202454), (16.025906, 108.202264),
    (16.027441, 108.202049), (16.028838, 108.201849), (16.030433, 108.201626),
    (16.031890, 108.201385), (16.033439, 108.201163), (16.035131, 108.201863),
    (16.036675, 108.201680), (16.037970, 108.201361), (16.039499, 108.201297),
    (16.040960, 108.201029), (16.042512, 108.200684), (16.043997, 108.200951),
    (16.045456, 108.200998), (16.047072, 108.200760), (16.048491, 108.200998),
    (16.050014, 108.200785), (16.051322, 108.200593), (16.052794, 108.200299),
]
_TAXI_SPEED_KT_VVDN = 15.0

_AIRLINES = ["HVN", "VJC", "VNA", "BAV", "PIC"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt(sec: float) -> str:
    s = int(sec)
    return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}.00"

def _haversine_nm(lat1, lon1, lat2, lon2) -> float:
    r = 3440.065
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))

def _rod(vapp: int) -> int:
    return int(vapp * math.tan(math.radians(3.0)) * 101.27)

def _pick(fleet):
    types = [t for t,_ in fleet]; weights = [w for _,w in fleet]
    total = sum(weights); r = random.random() * total; upto = 0.0
    for t, w in zip(types, weights):
        upto += w
        if upto >= r:
            return t
    return types[-1]

def _pick_sid(selected, fallback):
    pool = {k: v for k,v in fallback.items() if k in selected} if selected else fallback
    if not pool:
        pool = fallback
    names = list(pool.keys())
    weights = [_SID_W.get(n, 1) for n in names]
    total = sum(weights); r = random.random() * total; upto = 0.0
    for n, w in zip(names, weights):
        upto += w
        if upto >= r:
            return n, pool[n]
    return names[-1], pool[names[-1]]

def _all_wpts(fallback):
    seen = {}
    for wpts in fallback.values():
        for name, lat, lon, _ in wpts:
            seen[name] = (lat, lon)
    return [(n, la, lo) for n, (la, lo) in seen.items()]

# ---------------------------------------------------------------------------
# VVDN ILS arrival + RNAV SID departure
# ---------------------------------------------------------------------------

def _generate_vvdn(scenario, arr_rwy, dep_rwy, count, sel_sids):
    fleet   = FLEET_MIX["VVDN"]
    rwy_a   = _VVDN_RWY.get(arr_rwy, _VVDN_RWY["35L"])
    rwy_d   = _VVDN_RWY.get(dep_rwy, _VVDN_RWY["35R"])
    entry_lat = rwy_a.get("entry_lat", 15.846421)
    entry_lon = rwy_a.get("entry_lon", 108.214554)

    # Interval from _aiMeta if available
    interval_s = 180
    ai_meta = scenario.get("_aiMeta") or {}
    if ai_meta.get("intervalMinutes"):
        interval_s = int(float(ai_meta["intervalMinutes"]) * 60)

    pairs = max(count // 2, 1)
    lines = []

    # DEFWPT block
    for wname, wlat, wlon in _all_wpts(_VVDN_SIDS_35R):
        lines.append(f"00:00:00.00>DEFWPT {wname},{wlat:.6f},{wlon:.6f},fix")
    lines.append("")

    for i in range(pairs):
        t_land = i * interval_s
        t_faf  = t_land + 82                        # 5NM at 220kt

        lcall = f"{_AIRLINES[(i*2)   % 5]}{(i*2+1):03d}"
        dcall = f"{_AIRLINES[(i*2+1) % 5]}{(i*2+2):03d}"
        ltype = _pick(fleet); dtype = _pick(fleet)
        lperf = AIRCRAFT_PERF.get(ltype, AIRCRAFT_PERF["A321"])
        dperf = AIRCRAFT_PERF.get(dtype, AIRCRAFT_PERF["A321"])

        vapp  = lperf["vapp"]
        rod   = _rod(vapp)
        t_thr = t_faf + int((5.0 / vapp) * 3600)   # FAF → threshold
        t_dep = t_thr + 30

        # Real landing-rollout + taxi-in track only exists for 35R (see
        # _VVDN_35R_TAXI_TRUNK) -- other runways keep the prior instant-
        # landing behavior (delete shortly after touchdown).
        if arr_rwy == "35R":
            taxi_nm = _haversine_nm(rwy_a["thr_lat"], rwy_a["thr_lon"], *_VVDN_35R_TAXI_TRUNK[0])
            for (lat1, lon1), (lat2, lon2) in zip(_VVDN_35R_TAXI_TRUNK, _VVDN_35R_TAXI_TRUNK[1:]):
                taxi_nm += _haversine_nm(lat1, lon1, lat2, lon2)
            t_taxi = t_thr + 20  # brief rollout deceleration after touchdown
            t_del = t_taxi + int(taxi_nm / _TAXI_SPEED_KT_VVDN * 3600)
        else:
            t_del = t_thr + 30

        sid_name, wpts = _pick_sid(sel_sids, _VVDN_SIDS_35R)

        lines.append(f"# --- Pair {i+1}: {lcall} arr {arr_rwy} / {dcall} dep {dep_rwy} {sid_name} ---")
        # Arrival -- CRE takes the callsign as its own first argument; a
        # "{lcall} CRE ..." prefix line is silently rejected since {lcall}
        # doesn't exist as an aircraft yet at creation time.
        lines.append(f"{_fmt(t_land)}>CRE {lcall},{ltype},{entry_lat:.6f},{entry_lon:.6f},{rwy_a['hdg']},3000,220")
        lines.append(f"{_fmt(t_land)}>{lcall} ALT 3000")
        lines.append(f"{_fmt(t_faf)}>{lcall} SPD {vapp}")
        lines.append(f"{_fmt(t_faf)}>{lcall} VS -{rod}")
        lines.append(f"{_fmt(t_faf)}>{lcall} ALT 30")
        if arr_rwy == "35R":
            # Real ADS-B-derived taxi-in: decelerate to taxi speed, follow
            # the real ground track (alt=0) into the ramp area.
            lines.append(f"{_fmt(t_taxi)}>{lcall} SPD {_TAXI_SPEED_KT_VVDN:.0f}")
            lines.append(f"{_fmt(t_taxi)}>{lcall} ALT 0")
            for lat, lon in _VVDN_35R_TAXI_TRUNK:
                lines.append(f"{_fmt(t_taxi)}>{lcall} ADDWPT {lat:.6f},{lon:.6f},0")
            lines.append(f"{_fmt(t_taxi)}>{lcall} LNAV ON")
        # Plain "DEL {lcall}" (no "{lcall} " target prefix) -- see
        # flightplan_scenario_builder._emit_dep's comment: the prefix form
        # gets parsed by BlueSky's stack as a duplicate acid argument,
        # which desyncs the aircraft id list from the numpy position
        # arrays on every delete and eventually crashes the sim.
        lines.append(f"{_fmt(t_del)}>DEL {lcall}")
        # Departure
        v2 = dperf["v2"]
        lines.append(f"{_fmt(t_dep)}>CRE {dcall},{dtype},{rwy_d['thr_lat']:.6f},{rwy_d['thr_lon']:.6f},{rwy_d['hdg']},50,{v2}")
        lines.append(f"{_fmt(t_dep)}>{dcall} ALT FL200")
        for wname, wlat, wlon, walt in wpts:
            if walt:
                lines.append(f"{_fmt(t_dep)}>{dcall} ADDWPT {wlat:.6f},{wlon:.6f},{walt}")
            else:
                lines.append(f"{_fmt(t_dep)}>{dcall} ADDWPT {wlat:.6f},{wlon:.6f}")
        lines.append(f"{_fmt(t_dep)}>{dcall} LNAV ON")
        lines.append(f"{_fmt(t_dep + 600)}>DEL {dcall}")
        lines.append("")

    return "\n".join(lines)

# ---------------------------------------------------------------------------
# Generic airport generator
# ---------------------------------------------------------------------------

def _generate_generic(scenario, airport, count):
    lat, lon = AIRPORT_CENTRE.get(airport, (16.0, 108.0))
    fleet    = FLEET_MIX.get(airport, FLEET_MIX["_default"])
    hdgs     = [70, 90, 250, 270]; alts = [3000, 5000, 7000]; lines = []

    for i in range(count):
        t     = _fmt(i * 60)
        atype = _pick(fleet); perf = AIRCRAFT_PERF.get(atype, AIRCRAFT_PERF["A321"])
        cs    = f"{_AIRLINES[i % 5]}{i+1:03d}"
        spd   = perf["v2"] + 80
        dlat  = (i % 5 - 2) * 0.01; dlon = (i % 3 - 1) * 0.01
        lines.append(f"{t}>CRE {cs},{atype},{lat+dlat:.4f},{lon+dlon:.4f},{hdgs[i%4]},{alts[i%3]},{spd}")
        lines.append(f"{t}>{cs} ORIG {airport}")
        lines.append(f"{t}>{cs} DEST VVNB")
        lines.append(f"{t}>{cs} LNAV ON")
        lines.append(f"{t}>{cs} VNAV ON")
    return "\n".join(lines)

# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------

def _weather_lines(scenario: dict, airport: str) -> list:
    """Real WIND stack command (see FTS Server/bluesky/traffic/windsim.py's
    WindSim.add) built from scenario.weatherConfig, injected at the top of the
    .scn so it's active before any aircraft is created. Only wind is a real,
    executable BlueSky command -- visibility/ceiling have no equivalent stack
    command in this engine, so they stay reference-only metadata on the
    scenario (surfaced in the UI, not turned into a fabricated command)."""
    weather = scenario.get("weatherConfig") or {}
    if weather.get("mode", "none") == "none":
        return []
    wind_dir = weather.get("windDirection")
    wind_spd = weather.get("windSpeedKt")
    if wind_dir is None or wind_spd is None:
        return []
    lat, lon = AIRPORT_CENTRE.get(airport, (16.0, 108.0))
    return [
        f"# Weather: {weather.get('mode')} -- {weather.get('description', '')}".rstrip(),
        f"00:00:00.00>WIND {lat:.6f},{lon:.6f},{wind_dir:.0f},{wind_spd:.0f}",
        "",
    ]

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def sanitize_scenario_filename(name: str, scenario_id: str) -> str:
    if not name:
        name = f"scenario_{scenario_id}"
    # Vietnamese diacritic map
    _vn = {
        'á':'a','à':'a','ả':'a','ã':'a','ạ':'a','ă':'a','ắ':'a','ằ':'a','ẳ':'a','ẵ':'a','ặ':'a',
        'â':'a','ấ':'a','ầ':'a','ẩ':'a','ẫ':'a','ậ':'a','đ':'d',
        'é':'e','è':'e','ẻ':'e','ẽ':'e','ẹ':'e','ê':'e','ế':'e','ề':'e','ể':'e','ễ':'e','ệ':'e',
        'í':'i','ì':'i','ỉ':'i','ĩ':'i','ị':'i',
        'ó':'o','ò':'o','ỏ':'o','õ':'o','ọ':'o','ô':'o','ố':'o','ồ':'o','ổ':'o','ỗ':'o','ộ':'o',
        'ơ':'o','ớ':'o','ờ':'o','ở':'o','ỡ':'o','ợ':'o',
        'ú':'u','ù':'u','ủ':'u','ũ':'u','ụ':'u','ư':'u','ứ':'u','ừ':'u','ử':'u','ữ':'u','ự':'u',
        'ý':'y','ỳ':'y','ỷ':'y','ỹ':'y','ỵ':'y',
    }
    s = name.lower()
    for k, v in _vn.items():
        s = s.replace(k, v)
    s = re.sub(r'[^a-z0-9_\-]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    if not s:
        s = f"scenario_{scenario_id}"
    if not s.endswith('.scn'):
        s += '.scn'
    return s


def generate_scn_content(scenario: dict) -> str:
    name     = scenario.get("name", "Unnamed Scenario")
    airport  = (scenario.get("airport") or "VVTS").upper()
    rwy_cfg  = scenario.get("runwayConfig") or {}
    arr_rwy  = (rwy_cfg.get("arrivalRunway")   or "").upper()
    dep_rwy  = (rwy_cfg.get("departureRunway") or "").upper()
    proc_cfg = scenario.get("procedureConfig") or {}
    sel_sids = proc_cfg.get("selectedSids") or []
    traffic  = scenario.get("trafficDemand") or {}
    count    = int(traffic.get("movementCount") or 10)
    scn_file = sanitize_scenario_filename(name, scenario.get("id", "xxx"))
    base     = scn_file.replace(".scn", "")
    now      = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    header = (
        f"# Generated by WebFTS — VATM Fast-Time Simulation Platform\n"
        f"# Decision-support / Non-operational use only\n"
        f"#\n"
        f"# Scenario : {name}\n"
        f"# Study    : {scenario.get('studyId','')}\n"
        f"# AIRAC    : {scenario.get('airacCycle','')}\n"
        f"# Airport  : {airport}  ARR {arr_rwy} / DEP {dep_rwy}\n"
        f"# File     : {scn_file}\n"
        f"# Command  : IC {base}\n"
        f"# Exported : {now}\n"
        f"# SIDs     : {', '.join(sel_sids) if sel_sids else 'N/A'}\n"
        f"# STARs    : {', '.join(proc_cfg.get('selectedStars') or []) or 'N/A'}\n"
        f"# IAPs     : {', '.join(proc_cfg.get('selectedIaps')  or []) or 'N/A'}\n"
        f"\n"
    )

    # "35R" is included as an arrival option because real ADS-B ground
    # tracks (see _VVDN_35R_TAXI_TRUNK) confirm it as a genuine landing
    # runway, not just a departure runway as the original default assumed.
    vvdn_arr = {"35L", "17R", "35R"}
    vvdn_dep = {"35R", "17L"}

    if traffic.get("source") == "seasonal_schedule":
        # Deferred import: flightplan_scenario_builder imports this module
        # for AIRCRAFT_PERF/AIRPORT_CENTRE/_fmt, so importing it at module
        # load time here would be circular.
        from WebATM.server.flightplan_scenario_builder import build_day_scenario, emit_scn_body

        xlsx_path = traffic.get("seasonalPlanPath")
        if not xlsx_path:
            raise ValueError("trafficDemand.seasonalPlanPath is required for source=seasonal_schedule")
        scenario_date = datetime.strptime(traffic["scenarioDate"], "%Y-%m-%d").date() \
            if traffic.get("scenarioDate") else datetime.utcnow().date()
        day = build_day_scenario(xlsx_path, airport, scenario_date)
        body = emit_scn_body(day)
    elif traffic.get("source") == "procedure_capacity":
        # Deferred import: same circularity concern as the seasonal_schedule
        # branch above. Real SID/STAR/IAP-based capacity test (movements/hour
        # via a SID/STAR mix, BADA climb/descent, staggered takeoff roll,
        # 3-minute arrival / 30-second dep-after-arr separation) -- see
        # capacity_scenario_engine.py's module docstring.
        from WebATM.server.capacity_scenario_engine import build_and_emit

        body = build_and_emit(airport, traffic.get("capacityConfig") or {})
    elif airport == "VVDN" and arr_rwy in vvdn_arr and dep_rwy in vvdn_dep:
        body = _generate_vvdn(scenario, arr_rwy, dep_rwy, count, sel_sids)
    else:
        body = _generate_generic(scenario, airport, count)

    weather = "\n".join(_weather_lines(scenario, airport))
    return header + weather + body

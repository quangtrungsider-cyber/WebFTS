"""
AI-assisted scenario generation.

Three modes:
  rule_based  – deterministic, no API key required
  claude      – Anthropic claude-sonnet-4-6
  gemini      – Google gemini-2.5-flash

All modes return the same dict shape that scenarios_api.py persists as a
draft Scenario. The enhanced scn_generator.py then uses that config when
the user exports the .scn file.
"""

import json
import logging
import re
import uuid
from datetime import datetime

logger = logging.getLogger("webatm")

# ---------------------------------------------------------------------------
# Known procedure metadata per airport (used by rule-based + as context for AI)
# ---------------------------------------------------------------------------

AIRPORT_META = {
    "VVDN": {
        "name": "Da Nang International",
        "sids": {
            "35R": ["SADIN1G", "KUMUN1G", "PAPRA2G", "XAQUA1G"],
            "17L": ["BUNTA2G", "VIDEN2G", "PHULU2G"],
        },
        "stars": {"35L": ["BUNTA3A", "PAPRA1A", "VIDEN2A"], "17R": ["BUNTA3A"]},
        "iaps":  {"35L": ["ILS V 35L"], "35R": ["ILS V 35R"], "17R": ["ILS X 17R"]},
        "default_arr": "35L",
        "default_dep": "35R",
        "default_iap": "ILS V 35L",
    },
    "VVTS": {
        "name": "Tan Son Nhat International",
        "sids": {
            "25R": ["SAPEN5K", "DOVIN5E", "TELEX5K"],
            "07L": ["BOVEM5P", "DUBSA5P"],
        },
        "stars": {"25L": ["SAPEN3A", "DOLIR3A"], "07R": ["DOLIR3A"]},
        "iaps":  {"25L": ["ILS W 25L"], "25R": ["ILS Y 25R"]},
        "default_arr": "25L",
        "default_dep": "25R",
        "default_iap": "ILS W 25L",
    },
    "VVNB": {
        "name": "Noi Bai International",
        "sids": {
            "11R": ["NAPTA5B", "NIXUS5B"],
            "29L": ["NAPTA5A", "NIXUS5A"],
        },
        "stars": {"11L": ["NAPTA3A", "NIXUS3A"], "29R": ["NAPTA3A"]},
        "iaps":  {"11L": ["ILS Y 11L"], "11R": ["ILS Y 11R"]},
        "default_arr": "11L",
        "default_dep": "11R",
        "default_iap": "ILS Y 11L",
    },
}


# ---------------------------------------------------------------------------
# System prompt shared by Claude and Gemini
# ---------------------------------------------------------------------------

def _build_system_prompt(airport: str, arr_rwy: str, dep_rwy: str) -> str:
    meta = AIRPORT_META.get(airport, {})
    available_sids = meta.get("sids", {}).get(dep_rwy, [])
    available_iaps = meta.get("iaps", {}).get(arr_rwy, [])
    available_stars = meta.get("stars", {}).get(arr_rwy, [])

    return f"""You are an Air Traffic Management (ATM) scenario designer for Vietnam airspace.
Your job is to interpret a natural-language scenario description and return a structured JSON configuration.

AIRPORT: {airport} — {meta.get('name', airport)}
ARRIVAL RUNWAY:   {arr_rwy}
DEPARTURE RUNWAY: {dep_rwy}
AVAILABLE SIDs (dep runway {dep_rwy}): {available_sids}
AVAILABLE STARs (arr runway {arr_rwy}): {available_stars}
AVAILABLE IAPs (arr runway {arr_rwy}): {available_iaps}

RULES:
- Select SIDs only from the AVAILABLE SIDs list above.
- Select IAPs only from the AVAILABLE IAPs list.
- movementCount is total movements (arrivals + departures combined).
- intervalMinutes is the gap between successive arrivals (typically 2–5 min).
- durationMinutes is total scenario duration (20–120 min typical).
- Return ONLY valid JSON — no markdown, no explanation.

OUTPUT SCHEMA (return exactly this structure):
{{
  "name": "<concise scenario name in English>",
  "description": "<1-2 sentence description>",
  "selectedSids": ["<sid1>", "<sid2>"],
  "selectedStars": ["<star1>"],
  "selectedIaps": ["<iap1>"],
  "movementCount": <integer>,
  "intervalMinutes": <number>,
  "durationMinutes": <integer>
}}"""


def _parse_ai_json(raw: str) -> dict:
    """Strip markdown fences and parse JSON from AI response."""
    text = raw.strip()
    # Remove ```json ... ``` or ``` ... ```
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text.strip())


# ---------------------------------------------------------------------------
# Rule-based fallback
# ---------------------------------------------------------------------------

def _rule_based(airport: str, arr_rwy: str, dep_rwy: str,
                movement_count: int, duration_min: int, prompt: str) -> dict:
    meta = AIRPORT_META.get(airport, {})
    sids = meta.get("sids", {}).get(dep_rwy, [])
    iaps = meta.get("iaps", {}).get(arr_rwy, [])
    stars = meta.get("stars", {}).get(arr_rwy, [])

    # Parse interval from prompt if mentioned ("mỗi X phút" / "every X min")
    interval = duration_min / max(movement_count // 2, 1)
    for pattern in (r"mỗi\s+(\d+)\s*phút", r"every\s+(\d+)\s*min",
                    r"(\d+)\s*phút\s+một", r"(\d+)-minute\s+interval"):
        m = re.search(pattern, prompt, re.IGNORECASE)
        if m:
            interval = float(m.group(1))
            break

    # Select SIDs: default top-2
    selected_sids = sids[:2] if sids else []
    # Select up to first 2 IAPs/STARs
    selected_iaps = iaps[:1] if iaps else []
    selected_stars = stars[:1] if stars else []

    # Generate scenario name
    iap_label = selected_iaps[0] if selected_iaps else "VFR"
    sid_label  = "/".join(selected_sids[:2]) if selected_sids else "DEP"
    name = f"{airport} {arr_rwy} {iap_label} / {dep_rwy} {sid_label}"

    return {
        "name": name,
        "description": (
            f"Rule-based scenario: {movement_count} movements over {duration_min} min, "
            f"arrivals {arr_rwy} / departures {dep_rwy}, interval ~{interval:.0f} min."
        ),
        "selectedSids": selected_sids,
        "selectedStars": selected_stars,
        "selectedIaps": selected_iaps,
        "movementCount": movement_count,
        "intervalMinutes": round(interval, 1),
        "durationMinutes": duration_min,
    }


# ---------------------------------------------------------------------------
# Claude (Anthropic)
# ---------------------------------------------------------------------------

def _call_claude(api_key: str, system: str, user_prompt: str) -> dict:
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("anthropic package not installed. Run: pip install anthropic")

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
    )
    raw = msg.content[0].text
    logger.info(f"Claude response ({msg.usage.input_tokens}in/{msg.usage.output_tokens}out): {raw[:200]}")
    return _parse_ai_json(raw), msg.usage.input_tokens + msg.usage.output_tokens


# ---------------------------------------------------------------------------
# Gemini (Google)
# ---------------------------------------------------------------------------

def _call_gemini(api_key: str, system: str, user_prompt: str) -> dict:
    try:
        import google.generativeai as genai
    except ImportError:
        raise RuntimeError(
            "google-generativeai package not installed. Run: pip install google-generativeai"
        )

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system,
    )
    response = model.generate_content(user_prompt)
    raw = response.text
    logger.info(f"Gemini response: {raw[:200]}")
    return _parse_ai_json(raw), None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_scenario_config(
    *,
    provider: str,
    api_key: str,
    airport: str,
    arr_runway: str,
    dep_runway: str,
    movement_count: int,
    duration_minutes: int,
    prompt: str,
    study_id: str,
    airac_cycle: str = "01/26",
) -> dict:
    """
    Generate a Scenario config dict (suitable for persisting as a draft).
    Returns the full scenario dict ready to insert into scenarios.json.
    """
    airport = airport.upper()
    arr_runway = arr_runway.upper()
    dep_runway = dep_runway.upper()

    # Fallback: fill in defaults from airport meta if caller left them blank
    meta = AIRPORT_META.get(airport, {})
    if not arr_runway:
        arr_runway = meta.get("default_arr", "")
    if not dep_runway:
        dep_runway = meta.get("default_dep", "")

    tokens_used = None
    provider_used = provider
    ai_error = None

    try:
        system = _build_system_prompt(airport, arr_runway, dep_runway)
        user_msg = (
            f"{prompt}\n\n"
            f"Airport: {airport}, Arrival runway: {arr_runway}, "
            f"Departure runway: {dep_runway}, "
            f"Total movements: {movement_count}, "
            f"Duration: {duration_minutes} minutes."
        )

        if provider == "claude" and api_key:
            ai_out, tokens_used = _call_claude(api_key, system, user_msg)
        elif provider == "gemini" and api_key:
            ai_out, tokens_used = _call_gemini(api_key, system, user_msg)
        else:
            # rule_based or missing key → deterministic
            ai_out = _rule_based(airport, arr_runway, dep_runway,
                                 movement_count, duration_minutes, prompt)
            provider_used = "rule_based"

    except Exception as exc:
        logger.warning(f"AI provider '{provider}' failed ({exc}); falling back to rule-based.")
        ai_error = f"{provider} provider failed: {exc}"
        ai_out = _rule_based(airport, arr_runway, dep_runway,
                             movement_count, duration_minutes, prompt)
        provider_used = "rule_based"

    now = datetime.utcnow().isoformat() + "Z"
    scenario_id = str(uuid.uuid4())

    scenario = {
        "id": scenario_id,
        "studyId": study_id,
        "name": ai_out.get("name", f"{airport} AI Scenario"),
        "description": ai_out.get("description", ""),
        "type": "baseline",
        "status": "draft",
        "airport": airport,
        "airacCycle": airac_cycle,
        "runwayConfig": {
            "airport": airport,
            "arrivalRunway": arr_runway,
            "departureRunway": dep_runway,
        },
        "procedureConfig": {
            "sidStarMode": "manual",
            "selectedSids":  ai_out.get("selectedSids", []),
            "selectedStars": ai_out.get("selectedStars", []),
            "selectedIaps":  ai_out.get("selectedIaps", []),
        },
        "trafficDemand": {
            "source": "manual",
            "movementCount": int(ai_out.get("movementCount", movement_count)),
            "notes": (
                f"Generated by {provider_used}. "
                f"Interval: {ai_out.get('intervalMinutes', '?')} min, "
                f"Duration: {ai_out.get('durationMinutes', duration_minutes)} min."
            ),
        },
        "validationStatus": "not_checked",
        "validationMessages": [],
        "createdAt": now,
        "updatedAt": now,
        # Metadata for UI
        "_aiMeta": {
            "providerUsed": provider_used,
            "tokensUsed": tokens_used,
            "generatedAt": now,
            "originalPrompt": prompt[:500],
            "intervalMinutes": ai_out.get("intervalMinutes"),
            "durationMinutes": ai_out.get("durationMinutes", duration_minutes),
            "error": ai_error,
        },
    }
    return scenario

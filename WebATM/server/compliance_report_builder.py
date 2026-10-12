"""
Pure functions building the compliance report in the 9-section format matching the organization's
own real reporting template (Bao_cao_FTS_40_tau_bay_1_gio.docx): scenario overview + separation
standard, overall operations, separation-violation detail, 10-minute activity distribution,
critical-margin analysis, capability assessment, overall safety assessment, recommendations,
conclusion. Every value is computed from real derived data -- nothing here is a placeholder.
"""

CONCLUSION_NO_VIOLATION = (
    "Toàn bộ hoạt động được thực hiện mà không phát hiện trường hợp vi phạm tiêu chuẩn phân cách "
    "tối thiểu. Kết quả cho thấy phương án đáp ứng yêu cầu phân cách trong phạm vi điều kiện và "
    "giả thiết của kịch bản mô phỏng."
)

CONCLUSION_WITH_VIOLATION_TEMPLATE = (
    "Hệ thống phát hiện {count} trường hợp vi phạm phân cách. Do đó chưa đủ cơ sở xác nhận phương "
    "án đáp ứng yêu cầu an toàn đối với mức lưu lượng đã mô phỏng. Các vị trí và thời điểm phát "
    "sinh vi phạm cần được điều chỉnh và mô phỏng lại trước khi đưa ra kết luận cuối cùng."
)


def _format_duration(seconds):
    if seconds is None:
        return "N/A"
    total_min = int(round(seconds / 60.0))
    hrs, mins = divmod(total_min, 60)
    if hrs and mins:
        return f"{hrs:02d} giờ {mins:02d} phút"
    if hrs:
        return f"{hrs:02d} giờ"
    return f"{mins:02d} phút"


def _format_time_label(t_seconds):
    if t_seconds is None:
        return "N/A"
    total_sec = int(round(t_seconds))
    hh, rem = divmod(total_sec, 3600)
    mm, ss = divmod(rem, 60)
    return f"{hh:02d}:{mm:02d}:{ss:02d}"


def _separation_pair_evaluations(separation_evaluations):
    """Only the entries that actually resolved to a real numeric pair (has leadCallsign)."""
    return [e for e in separation_evaluations if e.get("leadCallsign") and e.get("trailCallsign")]


def build_section1_overview(dataset, airport, mode, wake_categories, flight_phases,
                             separation_evaluations, ruleset):
    metadata = (dataset or {}).get("metadata", {})
    samples = (dataset or {}).get("trackSamples", [])
    t_values = [s.get("t") for s in samples if s.get("t") is not None]
    duration_sec = (max(t_values) - min(t_values)) if t_values else None

    total_aircraft = len({s.get("callsign") for s in samples if s.get("callsign")})
    departure_count = len(flight_phases.get("departures", []))
    arrival_count = len(flight_phases.get("arrivals", []))
    other_count = len(flight_phases.get("other", []))

    heavy_count = sum(1 for c in wake_categories.values() if c == "HEAVY")
    medium_count = sum(1 for c in wake_categories.values() if c == "MEDIUM")
    unknown_count = sum(1 for c in wake_categories.values() if c == "UNKNOWN")

    pair_evals = _separation_pair_evaluations(separation_evaluations)
    violation_evals = [e for e in pair_evals if e["verdict"] == "VIOLATION"]
    violating_pairs = {(e["leadCallsign"], e["trailCallsign"]) for e in violation_evals}

    # Separation standard table: pivot the ruleset's AIRCRAFT_SEPARATION rules into a
    # lead-category x trail-category matrix, built only from categories actually configured.
    sep_rules = [r for r in ruleset.get("rules", []) if r["operation_context"] == "AIRCRAFT_SEPARATION"]
    lead_cats, trail_cats = [], []
    matrix = {}
    for r in sep_rules:
        lc, tc = r["conditions"].get("leadCategory"), r["conditions"].get("trailCategory")
        if lc is None or tc is None:
            continue
        if lc not in lead_cats:
            lead_cats.append(lc)
        if tc not in trail_cats:
            trail_cats.append(tc)
        matrix[(lc, tc)] = f"{r['threshold']['value']} {r['threshold']['unit']}"
    standard_table = {
        "headers": ["Tàu bay bay trước"] + [f"{tc} bay sau" for tc in trail_cats],
        "rows": [[lc] + [matrix.get((lc, tc), "-") for tc in trail_cats] for lc in lead_cats]
    }

    return {
        "title": "1. Tổng quan kịch bản mô phỏng",
        "scenarioName": metadata.get("scenarioBaseName") or metadata.get("scenarioFileName") or "N/A",
        "airport": airport or "N/A",
        "durationLabel": _format_duration(duration_sec),
        "durationSec": duration_sec,
        "totalAircraft": total_aircraft,
        "departureCount": departure_count,
        "arrivalCount": arrival_count,
        "otherPhaseCount": other_count,
        "heavyCount": heavy_count,
        "mediumCount": medium_count,
        "unknownWakeCount": unknown_count,
        "totalViolations": len(violation_evals),
        "violatingPairCount": len(violating_pairs),
        "separationStandardTable": standard_table,
        "note": (
            "Ghi chú: Bảng trên chỉ liệt kê các cặp hạng nhiễu động (wake category) đã được cấu hình "
            "trong bộ tiêu chí áp dụng cho sân bay này; các tàu bay không xác định được hạng nhiễu động "
            "sẽ không được đánh giá phân cách và được ghi nhận là NOT_EVALUATED."
        )
    }


def build_section2_overall_operations(section1, separation_evaluations):
    pair_evals = _separation_pair_evaluations(separation_evaluations)
    violation_evals = [e for e in pair_evals if e["verdict"] == "VIOLATION"]
    violating_pairs = {(e["leadCallsign"], e["trailCallsign"]) for e in violation_evals}
    actual_values = [e["actualValue"] for e in pair_evals if e.get("actualValue") is not None]
    min_separation = min(actual_values) if actual_values else None

    return {
        "title": "2. Kết quả khai thác tổng thể",
        "intro": (
            f"Trong thời gian mô phỏng {section1['durationLabel']}, hệ thống ghi nhận "
            f"{section1['totalAircraft']} lượt hoạt động tàu bay. Các chỉ tiêu tổng hợp được trình bày như sau:"
        ),
        "table": {
            "headers": ["Chỉ tiêu", "Kết quả"],
            "rows": [
                ["Tổng số hoạt động", section1["totalAircraft"]],
                ["Cất cánh", section1["departureCount"]],
                ["Hạ cánh", section1["arrivalCount"]],
                ["HEAVY", section1["heavyCount"]],
                ["MEDIUM", section1["mediumCount"]],
                ["Hoạt động hoàn thành bình thường", section1["totalAircraft"] - section1["otherPhaseCount"]],
                ["Cặp tàu bay vi phạm phân cách", len(violating_pairs)],
                ["Cự ly nhỏ nhất toàn kịch bản", f"{round(min_separation, 2)} NM" if min_separation is not None else "N/A"],
            ]
        }
    }


def build_section3_violation_detail(separation_evaluations):
    pair_evals = _separation_pair_evaluations(separation_evaluations)
    violation_evals = sorted(
        [e for e in pair_evals if e["verdict"] == "VIOLATION"],
        key=lambda e: e["evidence"].get("t", 0)
    )

    rows = []
    for idx, e in enumerate(violation_evals, start=1):
        shortfall = round(e["requiredValue"] - e["actualValue"], 2)
        rows.append([
            idx, e["leadCallsign"], e["leadCategory"], e["trailCallsign"], e["trailCategory"],
            f"{e['requiredValue']} {e['unit']}", f"{e['actualValue']} {e['unit']}",
            f"{shortfall} {e['unit']}", _format_time_label(e["evidence"].get("t"))
        ])

    return {
        "title": "3. Thống kê vi phạm phân cách",
        "hasViolations": len(violation_evals) > 0,
        "noViolationText": (
            "Trong toàn bộ thời gian mô phỏng, hệ thống không phát hiện cặp tàu bay nào có cự ly "
            "giảm xuống dưới tiêu chuẩn phân cách tối thiểu tương ứng với hạng nhiễu động của tàu "
            "bay bay trước và tàu bay bay sau."
        ),
        "violationIntroText": (
            "Hệ thống liệt kê từng cặp tàu bay có cự ly thực tế nhỏ hơn ngưỡng áp dụng, đồng thời "
            "ghi nhận mức thiếu hụt, thời điểm xảy ra."
        ),
        "table": {
            "headers": ["STT", "Bay trước", "Loại tàu bay", "Bay sau", "Loại tàu bay", "Yêu cầu", "Min thực tế", "Thiếu hụt", "Thời điểm"],
            "rows": rows
        },
        "formulaNote": "Công thức đánh giá: Mức thiếu hụt phân cách = Phân cách tối thiểu yêu cầu - Cự ly thực tế nhỏ nhất."
    }


def build_section4_activity_distribution(flight_phases, bin_minutes=10):
    """Bins each departure/arrival exactly once, at its real transition timestamp (not once per
    sample it appears in -- an aircraft airborne across several bins must not be double-counted)."""
    bin_width_sec = bin_minutes * 60

    bins = {}
    for dep in flight_phases.get("departures", []):
        bin_index = int(dep["t"] // bin_width_sec)
        bins.setdefault(bin_index, {"departures": 0, "arrivals": 0})
        bins[bin_index]["departures"] += 1
    for arr in flight_phases.get("arrivals", []):
        bin_index = int(arr["t"] // bin_width_sec)
        bins.setdefault(bin_index, {"departures": 0, "arrivals": 0})
        bins[bin_index]["arrivals"] += 1

    rows = []
    total_dep, total_arr = 0, 0
    for bin_index in sorted(bins.keys()):
        dep_count = bins[bin_index]["departures"]
        arr_count = bins[bin_index]["arrivals"]
        total_dep += dep_count
        total_arr += arr_count
        start_min = bin_index * bin_minutes
        rows.append([f"{start_min:02d}-{start_min + bin_minutes:02d} phút", dep_count, arr_count, dep_count + arr_count])

    return {
        "title": "4. Phân bố hoạt động trong thời gian mô phỏng",
        "intro": f"Để đánh giá mức độ tập trung lưu lượng, các hoạt động được thống kê theo từng khoảng {bin_minutes} phút:",
        "table": {
            "headers": ["Khoảng thời gian", "Cất cánh", "Hạ cánh", "Tổng"],
            "rows": rows,
            "totalsRow": ["TỔNG CỘNG", total_dep, total_arr, total_dep + total_arr]
        },
        "note": (
            "Phân bố này giúp xác định các thời điểm có mật độ hoạt động cao và đối chiếu với các "
            "thời điểm cự ly giữa các tàu bay giảm thấp hoặc xuất hiện vi phạm phân cách."
        )
    }


def build_section5_critical_margin(separation_evaluations, top_n=5):
    pair_evals = [e for e in _separation_pair_evaluations(separation_evaluations) if e.get("margin") is not None]
    pair_evals.sort(key=lambda e: e["margin"])
    top = pair_evals[:top_n]

    rows = []
    for idx, e in enumerate(top, start=1):
        rows.append([
            idx, f"{e['leadCallsign']} → {e['trailCallsign']}",
            f"{e['leadCategory']} → {e['trailCategory']}",
            f"{e['requiredValue']} {e['unit']}",
            f"{e['actualValue']} {e['unit']}",
            f"{round(e['margin'], 2)} {e['unit']}"
        ])

    return {
        "title": "5. Phân tích các điểm tới hạn về phân cách",
        "intro": "Hệ thống xác định các cặp tàu bay có mức dự phòng phân cách nhỏ nhất trong toàn bộ kịch bản:",
        "table": {
            "headers": ["STT", "Cặp tàu bay", "Loại", "Chuẩn", "Min", "Dự phòng"],
            "rows": rows
        },
        "formulaNote": (
            "Dự phòng phân cách = Cự ly nhỏ nhất thực tế - Cự ly tối thiểu yêu cầu. Giá trị dự phòng "
            "càng nhỏ (hoặc âm) thì cặp tàu bay càng hoạt động gần (hoặc vượt) giới hạn phân cách cho phép."
        )
    }


def build_section6_capability_assessment(section1, section3):
    title = "6. Đánh giá năng lực khai thác"
    if not section3["hasViolations"]:
        return {
            "title": title,
            "subtitle": f"6.1. Trường hợp {section1['totalAircraft']}/{section1['totalAircraft']} hoạt động hoàn thành và không vi phạm",
            "text": (
                f"Kết quả mô phỏng cho thấy {section1['totalAircraft']} lượt cất/hạ cánh được thực hiện "
                f"trong thời gian {section1['durationLabel']} mà không phát sinh trường hợp vi phạm tiêu "
                f"chuẩn phân cách tối thiểu. Kết quả này cho thấy kịch bản mô phỏng có khả năng xử lý mức "
                f"lưu lượng đã thiết lập trong các điều kiện và giả thiết đã thiết lập cho kịch bản.\n"
                "Việc đánh giá cần được xem xét cùng cơ cấu HEAVY/MEDIUM, tỷ lệ cất/hạ cánh, trình tự tàu "
                "bay, tốc độ tàu bay, cấu hình đường CHC, phương thức SID/STAR và mức dự phòng phân cách "
                "tại các thời điểm mật độ cao."
            )
        }
    return {
        "title": title,
        "subtitle": "6.2. Trường hợp phát hiện vi phạm",
        "text": (
            "Hệ thống ghi nhận một hoặc nhiều trường hợp vi phạm, do đó chưa đủ cơ sở kết luận rằng "
            "phương án có khả năng khai thác an toàn ở mức lưu lượng đã mô phỏng chỉ dựa trên việc tất "
            "cả tàu bay đã hoàn thành hành trình mô phỏng. Cần xác định các điểm nghẽn và điều chỉnh "
            "trình tự, thời gian, tốc độ hoặc phương thức khai thác trước khi chạy lại kịch bản."
        )
    }


def build_section7_overall_safety(section1, section2):
    has_violations = section1["totalViolations"] > 0
    min_sep = None
    for row in section2["table"]["rows"]:
        if row[0] == "Cự ly nhỏ nhất toàn kịch bản":
            min_sep = row[1]

    return {
        "title": "7. Đánh giá an toàn tổng hợp",
        "resultLabel": "PHÁT HIỆN VI PHẠM PHÂN CÁCH" if has_violations else "ĐẠT YÊU CẦU PHÂN CÁCH",
        "bullets": [
            f"Tổng số hoạt động: {section1['totalAircraft']}",
            f"Tổng số vi phạm phân cách: {section1['totalViolations']}",
            f"Cự ly nhỏ nhất: {min_sep}",
        ],
        "concludingText": (
            "Đáp ứng yêu cầu phân cách trong điều kiện và giả thiết của kịch bản mô phỏng."
            if not has_violations else
            f"Ghi nhận {section1['totalViolations']} trường hợp vi phạm, liên quan {section1['violatingPairCount']} "
            f"cặp tàu bay. Cần điều chỉnh và mô phỏng lại trước khi đưa ra kết luận cuối cùng."
        )
    }


def build_section8_recommendations(section1, section3):
    items = []
    if section3["hasViolations"]:
        items.append("Xác định các cặp tàu bay và khoảng thời gian phát sinh vi phạm phân cách để điều chỉnh trình tự hoặc thời điểm hoạt động.")
        items.append("Rà soát lại các cặp có hạng nhiễu động yêu cầu phân cách lớn (ví dụ HEAVY dẫn đầu MEDIUM bay sau) do có ngưỡng yêu cầu cao hơn.")
    items.append("Xác định các khoảng thời gian có mật độ hoạt động lớn nhất.")
    items.append("Xác định các cặp tàu bay có dự phòng phân cách thấp nhất để theo dõi sát trong các lần chạy tiếp theo.")
    items.append("Phân tích riêng các trường hợp cất cánh xen kẽ hạ cánh.")
    if section1["unknownWakeCount"] > 0:
        items.append(f"Bổ sung dữ liệu hạng nhiễu động cho {section1['unknownWakeCount']} tàu bay hiện chưa xác định được (UNKNOWN), vì các tàu bay này không được đánh giá phân cách.")
    items.append("Chạy lại nhiều lần với các cơ cấu HEAVY/MEDIUM và tỷ lệ cất/hạ cánh khác nhau để kiểm nghiệm độ ổn định của kết quả.")
    items.append("Thử nghiệm các mức lưu lượng cao hơn và thấp hơn mức đã mô phỏng để xác định giới hạn vận hành của cấu hình mô phỏng.")

    return {"title": "8. Khuyến nghị", "items": items}


def build_section9_conclusion(section1, section3):
    text = CONCLUSION_NO_VIOLATION if not section3["hasViolations"] else CONCLUSION_WITH_VIOLATION_TEMPLATE.format(count=section1["totalViolations"])
    return {
        "title": "9. Kết luận",
        "intro": f"Kịch bản mô phỏng đã thực hiện {section1['totalAircraft']} lượt cất và hạ cánh trong khoảng thời gian {section1['durationLabel']}.",
        "text": text
    }


def assemble_full_report(dataset, airport, mode, timeline_segments, ruleset, geometry,
                          overall_verdict, sub_verdicts, all_evaluations,
                          separation_evaluations, runway_procedure_evaluations, track_samples,
                          wake_categories, flight_phases):
    section1 = build_section1_overview(dataset, airport, mode, wake_categories, flight_phases, separation_evaluations, ruleset)
    section2 = build_section2_overall_operations(section1, separation_evaluations)
    section3 = build_section3_violation_detail(separation_evaluations)
    section4 = build_section4_activity_distribution(flight_phases)
    section5 = build_section5_critical_margin(separation_evaluations)
    section6 = build_section6_capability_assessment(section1, section3)
    section7 = build_section7_overall_safety(section1, section2)
    section8 = build_section8_recommendations(section1, section3)
    section9 = build_section9_conclusion(section1, section3)

    return {
        "section1Overview": section1,
        "section2OverallOperations": section2,
        "section3ViolationDetail": section3,
        "section4ActivityDistribution": section4,
        "section5CriticalMargin": section5,
        "section6CapabilityAssessment": section6,
        "section7OverallSafety": section7,
        "section8Recommendations": section8,
        "section9Conclusion": section9
    }

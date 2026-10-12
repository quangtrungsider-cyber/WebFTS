import tempfile
from pathlib import Path

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH


def _add_bullets(doc, items):
    for item in items:
        doc.add_paragraph(str(item), style="List Bullet")


def _add_table(doc, headers, rows, totals_row=None, style="Table Grid"):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = style
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = str(h)
        for p in hdr[i].paragraphs:
            for r in p.runs:
                r.font.bold = True
    for row in rows:
        cells = table.add_row().cells
        for i, val in enumerate(row):
            cells[i].text = str(val)
    if totals_row is not None:
        cells = table.add_row().cells
        for i, val in enumerate(totals_row):
            cells[i].text = str(val)
            for p in cells[i].paragraphs:
                for r in p.runs:
                    r.font.bold = True
    return table


def render_compliance_docx(report_result: dict) -> Path:
    """
    Renders compliance_result.json into a DOCX matching the organization's real reporting
    template (Bao_cao_FTS_40_tau_bay_1_gio.docx): a title block, then 9 numbered sections
    (Heading1/Heading2 native styles, List Bullet lists, Table Grid tables) built entirely from
    real computed values in report_result['report'].
    """
    report = report_result.get("report", {})
    s1 = report.get("section1Overview", {})
    s2 = report.get("section2OverallOperations", {})
    s3 = report.get("section3ViolationDetail", {})
    s4 = report.get("section4ActivityDistribution", {})
    s5 = report.get("section5CriticalMargin", {})
    s6 = report.get("section6CapabilityAssessment", {})
    s7 = report.get("section7OverallSafety", {})
    s8 = report.get("section8Recommendations", {})
    s9 = report.get("section9Conclusion", {})

    doc = Document()

    title = doc.add_paragraph()
    title_run = title.add_run("BÁO CÁO KẾT QUẢ MÔ PHỎNG KHAI THÁC VÀ AN TOÀN PHÂN CÁCH (FTS)")
    title_run.bold = True
    title_run.font.size = Pt(16)
    title_run.font.color.rgb = RGBColor(0, 51, 102)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    subtitle = doc.add_paragraph()
    sub_run = subtitle.add_run(f"Kịch bản: {s1.get('scenarioName')} tại {s1.get('airport')}")
    sub_run.italic = True
    sub_run.font.color.rgb = RGBColor(102, 102, 102)
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER

    watermark_p = doc.add_paragraph()
    watermark_run = watermark_p.add_run(report_result.get("watermark", "Decision-support / Non-operational"))
    watermark_run.italic = True
    watermark_run.font.color.rgb = RGBColor(153, 153, 153)
    watermark_p.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # 1. Tổng quan kịch bản mô phỏng
    doc.add_heading(s1.get("title", "1. Tổng quan kịch bản mô phỏng"), level=1)
    _add_bullets(doc, [
        f"Tên kịch bản: {s1.get('scenarioName')}",
        f"Sân bay/khu vực mô phỏng: {s1.get('airport')}",
        f"Thời lượng mô phỏng: {s1.get('durationLabel')}",
        f"Tổng số tàu bay tham gia: {s1.get('totalAircraft')} tàu bay",
        f"Số tàu bay cất cánh: {s1.get('departureCount')}",
        f"Số tàu bay hạ cánh: {s1.get('arrivalCount')}",
        f"Số tàu bay HEAVY: {s1.get('heavyCount')}",
        f"Số tàu bay MEDIUM: {s1.get('mediumCount')}",
        f"Tổng số trường hợp vi phạm phân cách: {s1.get('totalViolations')}",
        f"Số cặp tàu bay liên quan đến vi phạm: {s1.get('violatingPairCount')}",
    ])
    doc.add_paragraph(
        f"Mục tiêu mô phỏng: đánh giá khả năng khai thác {s1.get('totalAircraft')} lượt cất/hạ cánh "
        f"trong {s1.get('durationLabel')}, đồng thời kiểm tra việc duy trì tiêu chuẩn phân cách tối "
        f"thiểu giữa các tàu bay trong quá trình hoạt động."
    )
    doc.add_heading("1.1. Tiêu chuẩn phân cách áp dụng", level=2)
    sep_table = s1.get("separationStandardTable", {})
    if sep_table.get("rows"):
        _add_table(doc, sep_table["headers"], sep_table["rows"])
    else:
        doc.add_paragraph("Không có bộ tiêu chuẩn phân cách nào được cấu hình cho sân bay này.")
    doc.add_paragraph(s1.get("note", ""))

    # 2. Kết quả khai thác tổng thể
    doc.add_heading(s2.get("title", "2. Kết quả khai thác tổng thể"), level=1)
    doc.add_paragraph(s2.get("intro", ""))
    t2 = s2.get("table", {})
    _add_table(doc, t2.get("headers", []), t2.get("rows", []))

    # 3. Thống kê vi phạm phân cách
    doc.add_heading(s3.get("title", "3. Thống kê vi phạm phân cách"), level=1)
    if not s3.get("hasViolations"):
        doc.add_paragraph(s3.get("noViolationText", ""))
    else:
        doc.add_paragraph(s3.get("violationIntroText", ""))
        t3 = s3.get("table", {})
        _add_table(doc, t3.get("headers", []), t3.get("rows", []))
        doc.add_paragraph(s3.get("formulaNote", ""))

    # 4. Phân bố hoạt động trong thời gian mô phỏng
    doc.add_heading(s4.get("title", "4. Phân bố hoạt động trong thời gian mô phỏng"), level=1)
    doc.add_paragraph(s4.get("intro", ""))
    t4 = s4.get("table", {})
    _add_table(doc, t4.get("headers", []), t4.get("rows", []), totals_row=t4.get("totalsRow"))
    doc.add_paragraph(s4.get("note", ""))

    # 5. Phân tích các điểm tới hạn về phân cách
    doc.add_heading(s5.get("title", "5. Phân tích các điểm tới hạn về phân cách"), level=1)
    doc.add_paragraph(s5.get("intro", ""))
    t5 = s5.get("table", {})
    if t5.get("rows"):
        _add_table(doc, t5.get("headers", []), t5.get("rows", []))
    else:
        doc.add_paragraph("Không có đủ dữ liệu để xác định các điểm tới hạn về phân cách.")
    doc.add_paragraph(s5.get("formulaNote", ""))

    # 6. Đánh giá năng lực khai thác
    doc.add_heading(s6.get("title", "6. Đánh giá năng lực khai thác"), level=1)
    doc.add_heading(s6.get("subtitle", ""), level=2)
    for para in str(s6.get("text", "")).split("\n"):
        doc.add_paragraph(para)

    # 7. Đánh giá an toàn tổng hợp
    doc.add_heading(s7.get("title", "7. Đánh giá an toàn tổng hợp"), level=1)
    result_p = doc.add_paragraph()
    result_run = result_p.add_run(f"KẾT QUẢ: {s7.get('resultLabel', '')}")
    result_run.bold = True
    result_run.font.color.rgb = RGBColor(178, 34, 34) if "VI PHẠM" in str(s7.get("resultLabel", "")) else RGBColor(34, 120, 34)
    _add_bullets(doc, s7.get("bullets", []))
    doc.add_paragraph(s7.get("concludingText", ""))

    # 8. Khuyến nghị
    doc.add_heading(s8.get("title", "8. Khuyến nghị"), level=1)
    _add_bullets(doc, s8.get("items", []))

    # 9. Kết luận
    doc.add_heading(s9.get("title", "9. Kết luận"), level=1)
    doc.add_paragraph(s9.get("intro", ""))
    doc.add_paragraph(s9.get("text", ""))

    tmp_dir = Path(tempfile.gettempdir())
    out_path = tmp_dir / f"compliance_report_{report_result.get('recordingId', 'unknown')}.docx"
    doc.save(str(out_path))
    return out_path

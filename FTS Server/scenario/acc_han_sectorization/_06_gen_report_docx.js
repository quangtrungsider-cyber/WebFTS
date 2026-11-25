const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, PageOrientation,
} = require("docx");

const HERE = __dirname;

function cell(text, opts = {}) {
  const lines = String(text).split("|");
  const runs = lines.map((ln, i) => new TextRun({
    text: ln, bold: !!opts.b, size: opts.sz || 18, break: i > 0 ? 1 : undefined,
  }));
  return new TableCell({
    width: { size: opts.w || 1000, type: WidthType.DXA },
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined,
    children: [new Paragraph({ children: runs, alignment: opts.center ? AlignmentType.CENTER : undefined })],
  });
}

function headerRow(cells, widths) {
  return new TableRow({
    children: cells.map((c, i) => cell(c, { b: true, w: widths[i], shade: "D9E2F3", center: true })),
  });
}

function dataRow(cells, widths, opts = {}) {
  return new TableRow({
    children: cells.map((c, i) => cell(c, { w: widths[i], center: opts.center })),
  });
}

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow(headers, widths), ...rows.map((r) => dataRow(r, widths, { center: true }))],
  });
}

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
}
function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, italics: !!opts.i, bold: !!opts.b, size: opts.sz || 20 })],
    spacing: { after: 120 },
  });
}
function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}

const WIDTH_FULL = 9360; // US Letter minus margins, DXA

const doc = new Document({
  sections: [
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } },
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: "ĐÁNH GIÁ KPI NHÓM A", bold: true, size: 32 })],
          alignment: AlignmentType.CENTER, spacing: { after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Ba phương án phân tầng Phân khu 2 — ACC Hà Nội", bold: true, size: 26 })],
          alignment: AlignmentType.CENTER, spacing: { after: 200 },
        }),
        p("Nguồn đề xuất: Đề cương Tổ chức lại vùng trời ACC Hà Nội (2026.11.22); ba bản vẽ SECTORIZATION ACC HANOI – PA1/PA2/PA3.pdf; KPI_ACC_HAN.md (bộ KPI theo ERNIP Part 1 ed. 3.3, Nhóm A).", { i: true, sz: 18 }),
        p("Dữ liệu mô phỏng: quỹ đạo ADS-B thật ngày 05/06/2026 (r72_tracks_20260605.csv, toàn bộ Việt Nam, 710 MB), lọc theo polygon 4 phân khu hiện trạng ACC Hà Nội (nguồn KMZ VATM 2026-04-20, đối chiếu khớp 100% — sai lệch 0,00 km — với 4 điểm tọa độ ranh giới PK1/PK2 trong đề cương).", { sz: 18 }),

        new Paragraph({
          children: [new TextRun({
            text: "GIỚI HẠN QUAN TRỌNG: đây là dữ liệu MỘT NGÀY, không phải khung 15/4–15/5/2026 mà KPI_ACC_HAN.md dẫn chiếu làm mốc chính thức để trình Cục HKVN. Kết quả là so sánh minh họa giữa ba phương án trên cùng một nguồn dữ liệu thật, dùng để thấy xu hướng và mức độ chênh lệch — không thay thế việc chạy lại trên khung dữ liệu chính thức trước khi phê duyệt.",
            bold: true, size: 19, color: "C00000",
          })],
          spacing: { after: 200 },
          shading: { type: ShadingType.CLEAR, fill: "FFF2CC" },
        }),

        h1("1. Ba phương án đang so sánh"),
        p("Theo đề cương mục 4.2, cả ba phương án giữ nguyên ranh giới ngang của 4 phân khu hiện trạng và giữ nguyên mức phân tầng FL285 cho Phân khu 1, 3, 4. Khác biệt duy nhất là mức phân tầng của Phân khu 2, xác nhận trực tiếp từ ba bản vẽ PDF:"),
        table(
          ["Phương án", "Mức phân tầng PK2 (2L / 2U)"],
          [["PA1", "FL285"], ["PA2", "FL245"], ["PA3", "FL265"]],
          [2000, 5000],
        ),
        p("(FL305 — kịch bản thứ tư đề cương có nhắc tới — không có bản vẽ tương ứng nên không đưa vào so sánh này.)", { i: true, sz: 18 }),

        h1("2. Lỗi dữ liệu đã sửa trước khi tính KPI"),
        bullet("Cột fir_id sai gần như toàn bộ (4.131.858/4.134.175 dòng mang fir_id=VVHN bất kể vị trí thật, đã phát hiện khi làm KPI PK1/PK5 ACC HCM) — phân khu được xác định lại bằng polygon + độ cao thật."),
        bullet("Cột ground_speed_kt thực chất là m/s (tỷ lệ đo được 1,94 ≈ 1,9438 kt/(m/s)) — đã quy đổi đúng sang knot."),
        bullet("Một số cặp bản tin gần trùng dấu thời gian (chênh lệch cỡ mili-giây, cùng tàu bay, độ cao lệch vài chục ft — đặc trưng ADS-B nhiều trạm thu) khiến tốc độ đổi độ cao tính ra nổ lên hàng tỷ ft/phút nếu không chặn Δt ≥ 1,0 giây."),
        bullet("Một số ít bản tin có ground_speed phi lý (ví dụ 1263,5 kt tại FL279, lỗi giải mã vận tốc nguồn ADS-B) — đã lọc bỏ khi dựng kịch bản mô phỏng (ngưỡng > 600 kt)."),
        bullet("Nhiễu định vị giữa hai mẫu liên tiếp: khoảng cách hai tọa độ liên tiếp (~4s) đôi khi ngụ ý tốc độ tức thời 700–2000+ kt dù độ cao/tốc độ ghi nhận ổn định — đặc trưng nhiễu multilateration/đa trạm thu, chỉ ảnh hưởng độ chân thực khi xem lại trực quan qua BlueSky, không ảnh hưởng KPI."),
        p("Không lỗi nào trong năm lỗi trên ảnh hưởng A1 (đỉnh đồng thời) và A3 (chuyển giao) — chỉ dùng thời điểm vào/ra, không dùng Δt hay tốc độ. Đã kiểm chứng độc lập (thuật toán lưới thời gian + máy trạng thái, khác hoàn toàn sweep-line) và khớp tuyệt đối. A4 có phụ thuộc Δt nên đã tính lại; chênh lệch trước/sau chỉ 80→71 đoạn ở PA1, không đổi kết luận."),

        h1("3. Bối cảnh: Phân khu 1, 3, 4 (FL285 cố định, giống nhau ở cả ba phương án)"),
        p("Không phải mục tiêu quyết định, nhưng cho thấy quy mô điển hình của một cặp tầng chuyên môn hóa chức năng (khác bản chất với PK2 — tách để cân bằng tải, không phải để chuyên môn hóa):"),
        table(
          ["Phân khu", "Tầng dưới: đỉnh đồng thời", "Tầng trên: đỉnh đồng thời", "Tỷ lệ max/min"],
          [
            ["PK1", "1L: 17", "1U: 9", "1,89"],
            ["PK3", "3L: 7", "3U: 20", "2,86"],
            ["PK4", "4L: 13", "4U: 16", "1,23"],
          ],
          [1800, 2500, 2500, 2000],
        ),
        p("PK3 lệch rất mạnh (2,86 lần) — đúng như thiết kế: phần lớn lưu lượng PK3 là quá cảnh tầng cao (3U), còn 3L chỉ phục vụ số ít chuyến về Vinh/Đồng Hới/Phú Bài/Đà Nẵng. Ngưỡng cân bằng 1,25 (dùng cho PK2) không áp dụng cho các phân khu chuyên môn hóa.", { i: true, sz: 18 }),

        h1("4. Kết quả Nhóm A cho Phân khu 2 — PA1 vs PA2 vs PA3"),
        h2("A1 — Cân bằng khối lượng công việc 2L/2U (ngưỡng tỷ lệ max/min ≤ 1,25)"),
        table(
          ["", "PA1 (FL285)", "PA2 (FL245)", "PA3 (FL265)"],
          [
            ["Đỉnh đồng thời 2L", "11", "8", "9"],
            ["Đỉnh đồng thời 2U", "8", "11", "10"],
            ["Tỷ lệ max/min", "1,38", "1,38", "1,11"],
            ["Đỉnh lượt vào/giờ 2L", "33", "34", "34"],
            ["Đỉnh lượt vào/giờ 2U", "29", "37", "34"],
            ["Tỷ lệ max/min (lượt vào)", "1,14", "1,09", "1,00"],
            ["Đạt ngưỡng A1?", "Không", "Không", "ĐẠT"],
          ],
          [2800, 2200, 2200, 2200],
        ),
        p("PA3 là phương án duy nhất đạt ngưỡng cân bằng 1,25. PA1 và PA2 lệch cùng mức độ (1,38) nhưng ngược hướng nhau: PA1 đẩy tải sang 2L (tầng dưới), PA2 đẩy tải sang 2U (tầng trên) — đúng quy luật đề cương đã nêu (mức phân tầng càng cao thì khối lượng công việc càng dịch từ 2U sang 2L)."),

        h2("A2 — Thời gian trong mỗi tầng (ngưỡng: TB ≥ 5 phút; tỷ lệ < 3 phút ≤ 10%)"),
        table(
          ["", "PA1", "PA2", "PA3"],
          [
            ["TB thời gian 2L (phút)", "10,9", "8,0", "9,2"],
            ["TB thời gian 2U (phút)", "7,9", "9,8", "8,8"],
            ["Tỷ lệ 2L < 3 phút", "0%", "0%", "0%"],
            ["Tỷ lệ 2U < 3 phút", "0%", "10%", "10%"],
            ["Đạt ngưỡng A2?", "Đạt", "Đạt", "Đạt"],
          ],
          [2800, 2200, 2200, 2200],
        ),
        p("Cả ba phương án đều đạt A2 — chỉ tiêu này không phân biệt được giữa ba phương án trong dữ liệu một ngày này."),

        h2("A3 — Số lần chuyển giao thêm 2L↔2U (hiện trạng = 0)"),
        table(
          ["", "PA1", "PA2", "PA3"],
          [["Số lần chuyển giao/ngày", "356", "411", "407"]],
          [2800, 2200, 2200, 2200],
        ),
        p("Dao động trong khoảng hẹp (356–411), không phân biệt rõ ba phương án. Đây là mức tăng tuyệt đối, không so sánh trực tiếp được với ngưỡng \"+20%\" của B10 — đúng như KPI_ACC_HAN.md mục 6.1 đã cảnh báo, chỉ tiêu này cần đổi sang chuyển giao có trọng số trước khi dùng."),

        h2("A4 — Bay bằng tạm quanh mực phân tầng (chỉ tiêu CCO/CDO)"),
        table(
          ["", "PA1 (FL285)", "PA2 (FL245)", "PA3 (FL265)"],
          [
            ["Số đoạn bay bằng tạm (≥60s, ±1000ft)", "71", "3", "14"],
            ["Trên 100 chuyến qua PK2", "13,0", "0,5", "2,6"],
          ],
          [2800, 2200, 2200, 2200],
        ),
        p("PA2 vượt trội ở chỉ tiêu này — ít hơn PA3 khoảng 5 lần, ít hơn PA1 khoảng 26 lần. Khớp với nhận định KPI_ACC_HAN.md: đây là KPI phân biệt rõ nhất trong Nhóm A, và FL285 (mức cao nhất) tạo nhiều bay bằng tạm nhất vì phần lớn tàu bay đi/đến Nội Bài đang đổi độ cao đúng quanh FL285."),

        h2("A5 — Kiểm chứng thực nghiệm: các mực phân tầng có phải mực bay bằng hay không"),
        table(
          ["FL245", "FL265", "FL285", "FL305"],
          [["0", "0", "0", "0"]],
          [2340, 2340, 2340, 2340],
        ),
        p("Số đoạn bay bằng liên tục ≥ 5 phút tại đúng mực đó, trong PK2. Không tàu bay nào thực sự dùng bốn mực này làm mực bay bằng dài hạn — xác nhận bằng thực nghiệm khẳng định của đề cương rằng cả bốn mực đều nằm giữa hai mực bay bằng RVSM."),

        h1("5. Mâu thuẫn A1 ↔ A4 — đúng như KPI_ACC_HAN.md mục 6.3 đã cảnh báo trước"),
        p("KPI_ACC_HAN.md viết: \"A1 (cân bằng) và A2 (thời gian trong tầng) đối nghịch nhau... khi hai tiêu chí chính kéo ngược chiều, rất dễ rơi vào tình huống không kịch bản nào thắng rõ.\" Trong dữ liệu thật, sự đối nghịch rõ nhất hóa ra không phải giữa A1 và A2 (cả ba phương án đều đạt A2), mà giữa A1 và A4:"),
        bullet("PA3 là phương án duy nhất đạt ngưỡng cân bằng tải A1 (1,11 ≤ 1,25)."),
        bullet("PA2 vượt trội tuyệt đối ở A4 (0,5 so với 2,6 và 13,0 đoạn/100 chuyến) nhưng không đạt A1 (1,38, tải dồn sang 2U)."),
        bullet("PA1 là phương án duy nhất thua trên cả hai chỉ tiêu quyết định (không đạt A1, tệ nhất A4) — có thể loại trừ với dữ liệu hiện có."),
        p("Giữa PA2 và PA3 là một đánh đổi thật: PA3 cân bằng tải tốt hơn nhưng chấp nhận nhiều bay bằng tạm hơn 5 lần so với PA2; PA2 gần như loại bỏ hoàn toàn bay bằng tạm (tốt cho CCO/CDO) nhưng lệch tải 11% ngoài ngưỡng 25% (mức lệch khiêm tốn, không nghiêm trọng)."),

        h1("6. Khuyến nghị (dựa trên dữ liệu một ngày — cần xác nhận lại trên khung chính thức)"),
        bullet("Loại PA1 (FL285 cho PK2): duy nhất không đạt A1 và tệ nhất ở A4. Dù thống nhất hình thức với PK1/3/4 (A6), cả hai chỉ tiêu định lượng chính đều không ủng hộ."),
        bullet("PA3 (FL265) đáp ứng đầy đủ ngưỡng định lượng đã đặt ra (A1 đạt, A2 đạt, A4 ở mức trung bình thấp 2,6/100 chuyến) — lựa chọn an toàn nếu ưu tiên đúng ngưỡng cân bằng tải đã công bố."),
        bullet("PA2 (FL245) đáng cân nhắc nếu Tổng công ty coi hiệu quả bay theo chiều đứng (CCO/CDO) là ưu tiên cao hơn cân bằng tải tuyệt đối — mức lệch tải 1,38 so với ngưỡng 1,25 vượt khiêm tốn (phần tải thừa rơi vào 2U, tầng ít phức tạp hơn do không có hoạt động cất/hạ cánh cục bộ), trong khi lợi ích giảm bay bằng tạm gấp ~5 lần PA3."),
        bullet("Quyết định cuối giữa PA2 và PA3 cần dữ liệu khung 15/4–15/5/2026 chính thức (không chỉ một ngày) và nên tham khảo thêm Critical Review với kiểm soát viên đang trực (B22 của KPI_ACC_HAN.md)."),

        h1("7. Kiểm chứng và tệp đính kèm"),
        bullet("_01_extract_tracks.py — trích 823.255 điểm ACC Hà Nội từ 4.134.175 dòng gốc (toàn Việt Nam)."),
        bullet("_02_kpi_group_a.py — tính KPI Nhóm A, kết quả: kpi_group_a_result.json."),
        bullet("_05_verify_independent.py — kiểm chứng độc lập (thuật toán lưới thời gian 10s + máy trạng thái, không dùng lại hàm của _02): khớp tuyệt đối A1/A3 ở cả ba phương án."),
        bullet("_03_gen_peak_scn.py / HAN_PK2_PEAK_20260605_0950-1110.scn — kịch bản BlueSky giờ cao điểm PK2 thật (09:50–11:10 UTC, 166 tàu bay)."),
        bullet("_04_run_headless.py — chạy kịch bản qua BlueSky; CAS ghi trong kịch bản sạch (tối đa 407,8 kt); 128/112.480 mẫu GS tức thời > 700kt do nhiễu định vị nguồn dữ liệu (mục 2), không ảnh hưởng KPI."),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(HERE, "BaoCao_KPI_NhomA_ACC_HAN.docx");
  fs.writeFileSync(out, buf);
  console.log("Da ghi " + out);
});

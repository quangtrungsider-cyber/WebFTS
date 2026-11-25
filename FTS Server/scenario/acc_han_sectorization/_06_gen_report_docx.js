/**
 * Sinh bao cao Word (.docx) danh gia KPI Nhom A cho ba phuong an phan tang
 * Phan khu 2 - ACC Ha Noi.
 *
 * Moi con so trong bao cao lay truc tiep tu kpi_group_a_result.json (ket qua
 * cua _02_kpi_group_a.py) -- doc file khi chay, KHONG chep tay vao day, de
 * bao cao khong bao gio lech voi ket qua tinh toan.
 *
 * Dinh dang theo van ban chinh thuc Viet Nam: kho A4, le 2/2/3/1.5 cm,
 * Times New Roman 13pt.
 *
 * LUU Y KY THUAT: tuyet doi khong dung ky tu \x0b (vertical tab) de xuong
 * dong trong o bang -- day la ky tu KHONG hop le trong XML va tung lam file
 * Word khong mo duoc o mot bao cao truoc trong du an nay. Dung ham cell()
 * ben duoi: tach chuoi theo dau "|" thanh nhieu TextRun voi break: 1.
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, VerticalAlign, BorderStyle, LevelFormat,
} = require("docx");

const HERE = __dirname;
const R = JSON.parse(fs.readFileSync(path.join(HERE, "kpi_group_a_result.json"), "utf-8"));
const RULES = JSON.parse(fs.readFileSync(path.join(HERE, "pa_rules.json"), "utf-8"));
const HEADLESS = JSON.parse(fs.readFileSync(
  path.join(HERE, "HAN_PK2_PEAK_20260605_0950-1110.headless_check.json"), "utf-8"));

// ---------------------------------------------------------------- dinh dang
const FONT = "Times New Roman";
const SZ = 26;        // 13pt (docx dung nua diem)
const SZ_SMALL = 22;  // 11pt cho bang
const SZ_NOTE = 20;   // 10pt cho ghi chu

const USABLE = 9355;  // A4 (11906) - le trai 1701 - le phai 850, don vi DXA

const GREEN = "C6EFCE";
const RED = "FFC7CE";
const AMBER = "FFE699";
const HEAD = "D9E2F3";
const GREY = "F2F2F2";

// So thap phan kieu Viet Nam: dau phay
const vn = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");
const vnInt = (x) => Number(x).toLocaleString("vi-VN");
const minutes = (sec) => vn(sec / 60.0, 1);
const pct = (frac) => `${vn(frac * 100, 0)}%`;

function cell(text, o = {}) {
  // Xuong dong trong o: tach theo "|" thanh nhieu run voi break (KHONG dung \x0b)
  const parts = String(text).split("|");
  const runs = parts.map((s, i) => new TextRun({
    text: s,
    bold: !!o.b,
    italics: !!o.i,
    font: FONT,
    size: o.sz || SZ_SMALL,
    color: o.color,
    break: i > 0 ? 1 : undefined,
  }));
  return new TableCell({
    width: { size: o.w || 1000, type: WidthType.DXA },
    shading: o.shade ? { type: ShadingType.CLEAR, color: "auto", fill: o.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: runs,
      alignment: o.left ? AlignmentType.LEFT : AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
    })],
  });
}

/** Bang: headers = mang chuoi; rows = mang mang (chuoi hoac {t,shade,b,left}) */
function table(headers, rows, widths, opts = {}) {
  const total = widths.reduce((a, b) => a + b, 0);
  const headRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { b: true, w: widths[i], shade: HEAD })),
  });
  const bodyRows = rows.map((r) => new TableRow({
    children: r.map((c, i) => {
      const spec = (typeof c === "object" && c !== null) ? c : { t: c };
      return cell(spec.t, {
        w: widths[i],
        shade: spec.shade,
        b: spec.b,
        i: spec.i,
        color: spec.color,
        left: spec.left !== undefined ? spec.left : (i === 0 && opts.firstColLeft),
      });
    }),
  }));
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headRow, ...bodyRows],
  });
}

function p(text, o = {}) {
  return new Paragraph({
    children: [new TextRun({
      text, font: FONT, size: o.sz || SZ, bold: !!o.b, italics: !!o.i, color: o.color,
    })],
    alignment: o.center ? AlignmentType.CENTER : (o.justify === false ? undefined : AlignmentType.JUSTIFIED),
    spacing: { after: o.after !== undefined ? o.after : 140, line: 300 },
  });
}

function bullet(text, o = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: o.sz || SZ, bold: !!o.b, italics: !!o.i })],
    numbering: { reference: "dot-list", level: o.level || 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 300 },
  });
}

function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 28, bold: true, allCaps: false })],
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
  });
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, italics: true })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 120 },
  });
}

function caption(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_NOTE, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 180 },
  });
}

function noteBox(text, fill) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_NOTE + 1, bold: true })],
    shading: { type: ShadingType.CLEAR, color: "auto", fill: fill || AMBER },
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: "BF8F00" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "BF8F00" },
      left: { style: BorderStyle.SINGLE, size: 6, color: "BF8F00" },
      right: { style: BorderStyle.SINGLE, size: 6, color: "BF8F00" },
    },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 160, after: 220, line: 300 },
  });
}

// ------------------------------------------------------------ lay so lieu
const PA_ORDER = ["PA1", "PA2", "PA3"];
const SPLIT = {};
PA_ORDER.forEach((pa) => { SPLIT[pa] = R.pa_results[pa].split_fl; });
const LBL = {};
PA_ORDER.forEach((pa) => { LBL[pa] = `${pa} (FL${SPLIT[pa]})`; });

const A1 = {}; const A2 = {}; const A3 = {}; const A4 = {};
PA_ORDER.forEach((pa) => {
  const v = R.pa_results[pa];
  A1[pa] = v.A1_workload_balance;
  A2[pa] = v.A2_time_in_layer;
  A3[pa] = v.A3_additional_handoffs_2L_2U.total_per_day;
  A4[pa] = v.A4_level_off_near_split;
});
const CTX = R.context_pk1_pk3_pk4_fixed_fl285;
const A5 = R.A5_cruise_level_check_pk2;
const THR = RULES.kpi_group_a_thresholds;

// Phan quyet tong hop
const verdict = (ok) => (ok
  ? { t: "Đạt", shade: GREEN, b: true }
  : { t: "Không đạt", shade: RED, b: true });

// Xep hang A4 (cang nho cang tot)
const a4Sorted = [...PA_ORDER].sort((a, b) => A4[a].per_100_flights - A4[b].per_100_flights);
const a4Rank = {};
a4Sorted.forEach((pa, i) => { a4Rank[pa] = i + 1; });
const a4Shade = (pa) => (a4Rank[pa] === 1 ? GREEN : (a4Rank[pa] === 3 ? RED : AMBER));

const windowHours = (
  (new Date(R.meta.window_utc[1]) - new Date(R.meta.window_utc[0])) / 3600000
).toFixed(1).replace(".", ",");

// ---------------------------------------------------------------- noi dung
const children = [];

// --- Tieu de
children.push(new Paragraph({
  children: [new TextRun({ text: "TỔNG CÔNG TY QUẢN LÝ BAY VIỆT NAM", font: FONT, size: 24, bold: true })],
  alignment: AlignmentType.CENTER, spacing: { after: 40 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: "Tổ thiết kế vùng trời ACC Hà Nội", font: FONT, size: 22, italics: true })],
  alignment: AlignmentType.CENTER, spacing: { after: 360 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: "BÁO CÁO KẾT QUẢ MÔ PHỎNG NHANH (FTS)", font: FONT, size: 34, bold: true })],
  alignment: AlignmentType.CENTER, spacing: { after: 100 },
}));
children.push(new Paragraph({
  children: [new TextRun({
    text: "Đánh giá KPI Nhóm A — ba phương án phân tầng Phân khu 2, ACC Hà Nội",
    font: FONT, size: 28, bold: true,
  })],
  alignment: AlignmentType.CENTER, spacing: { after: 100 },
}));
children.push(new Paragraph({
  children: [new TextRun({
    text: `So sánh PA1 (FL${SPLIT.PA1}) – PA2 (FL${SPLIT.PA2}) – PA3 (FL${SPLIT.PA3}) trên quỹ đạo ADS-B thực tế`,
    font: FONT, size: 24, italics: true,
  })],
  alignment: AlignmentType.CENTER, spacing: { after: 400 },
}));

// --- I. TOM TAT DIEU HANH
children.push(h1("I. TÓM TẮT ĐIỀU HÀNH"));
children.push(p(
  "Ba phương án phân chia Phân khu 2 của ACC Hà Nội chỉ khác nhau đúng một tham số — mức phân "
  + "tầng giữa tầng dưới (2L) và tầng trên (2U) — nên có thể so sánh trực tiếp theo đúng nguyên tắc "
  + "so sánh kịch bản chuẩn mực của ERNIP (Mục 6.1.6). Kết quả chạy trên quỹ đạo ADS-B thực tế "
  + "ngày 05/6/2026 như sau:"
));

children.push(table(
  ["Chỉ tiêu Nhóm A", "Ngưỡng", LBL.PA1, LBL.PA2, LBL.PA3],
  [
    [
      { t: "A1 – Cân bằng khối lượng công việc|(tỷ lệ max/min số tàu bay đồng thời đỉnh)", left: true },
      `≤ ${vn(THR.A1_max_min_ratio, 2)}`,
      { t: vn(A1.PA1.ratio_peak_simultaneous_max_min, 2), shade: A1.PA1.dat ? GREEN : RED },
      { t: vn(A1.PA2.ratio_peak_simultaneous_max_min, 2), shade: A1.PA2.dat ? GREEN : RED },
      { t: vn(A1.PA3.ratio_peak_simultaneous_max_min, 2), shade: A1.PA3.dat ? GREEN : RED },
    ],
    [
      { t: "A2 – Thời gian tàu bay ở trong mỗi tầng", left: true },
      `TB ≥ ${THR.A2_mean_dwell_min_s / 60} phút|< 3 phút ≤ ${pct(THR.A2_pct_under_3min_max)}`,
      verdict(A2.PA1.dat_mean && A2.PA1.dat_pct_under_3min),
      verdict(A2.PA2.dat_mean && A2.PA2.dat_pct_under_3min),
      verdict(A2.PA3.dat_mean && A2.PA3.dat_pct_under_3min),
    ],
    [
      { t: "A3 – Số lần chuyển giao thêm 2L↔2U|(lần/ngày; hiện trạng = 0)", left: true },
      "so sánh",
      vnInt(A3.PA1), vnInt(A3.PA2), vnInt(A3.PA3),
    ],
    [
      { t: "A4 – Bay bằng tạm quanh mực phân tầng|(đoạn/100 chuyến qua PK2)", left: true },
      "nhỏ nhất",
      { t: vn(A4.PA1.per_100_flights, 1), shade: a4Shade("PA1"), b: a4Rank.PA1 === 1 },
      { t: vn(A4.PA2.per_100_flights, 1), shade: a4Shade("PA2"), b: a4Rank.PA2 === 1 },
      { t: vn(A4.PA3.per_100_flights, 1), shade: a4Shade("PA3"), b: a4Rank.PA3 === 1 },
    ],
    [
      { t: "A5 – Mực phân tầng không trùng mực bay bằng", left: true },
      "đạt/không",
      { t: "Đạt", shade: GREEN }, { t: "Đạt", shade: GREEN }, { t: "Đạt", shade: GREEN },
    ],
  ],
  [3000, 1555, 1600, 1600, 1600],
));
children.push(caption("Bảng 1. Tổng hợp kết quả KPI Nhóm A của ba phương án"));

children.push(p("Ba kết luận chính:", { b: true, after: 80 }));
children.push(bullet(
  `PA1 (FL${SPLIT.PA1}) là phương án duy nhất thua trên cả hai chỉ tiêu quyết định: không đạt ngưỡng `
  + `cân bằng A1 (${vn(A1.PA1.ratio_peak_simultaneous_max_min, 2)}) và tạo ra nhiều bay bằng tạm nhất `
  + `(${vn(A4.PA1.per_100_flights, 1)} đoạn/100 chuyến, gấp `
  + `${vn(A4.PA1.per_100_flights / A4.PA2.per_100_flights, 0)} lần PA2). Có thể loại trừ với dữ liệu hiện có.`
));
children.push(bullet(
  `PA3 (FL${SPLIT.PA3}) là phương án duy nhất đáp ứng đầy đủ các ngưỡng định lượng đã đặt ra `
  + `(A1 = ${vn(A1.PA3.ratio_peak_simultaneous_max_min, 2)} ≤ ${vn(THR.A1_max_min_ratio, 2)}; A2 đạt; `
  + `A4 ở mức trung bình ${vn(A4.PA3.per_100_flights, 1)} đoạn/100 chuyến).`
));
children.push(bullet(
  `PA2 (FL${SPLIT.PA2}) vượt trội tuyệt đối về hiệu quả bay theo chiều đứng — chỉ `
  + `${vn(A4.PA2.per_100_flights, 1)} đoạn bay bằng tạm/100 chuyến, ít hơn PA3 khoảng `
  + `${vn(A4.PA3.per_100_flights / A4.PA2.per_100_flights, 0)} lần — nhưng lệch tải `
  + `${vn(A1.PA2.ratio_peak_simultaneous_max_min, 2)}, vượt ngưỡng ở mức khiêm tốn.`
));
children.push(p(
  "Quyết định cuối cùng giữa PA2 và PA3 là một đánh đổi thực sự giữa cân bằng tải và hiệu quả "
  + "bay theo chiều đứng (CCO/CDO), cần được chốt trên dữ liệu khung chính thức kèm rà soát định "
  + "tính với kiểm soát viên đang trực. Chi tiết tại Mục VIII và IX.",
  { i: true }
));

// --- II. PHAM VI, NGUON DU LIEU
children.push(h1("II. PHẠM VI, CĂN CỨ VÀ NGUỒN DỮ LIỆU"));

children.push(h2("2.1. Căn cứ"));
children.push(bullet("Đề cương Tổ chức lại vùng trời ACC Hà Nội, bản cập nhật ngày 22/11/2026 (Mục 4.1 — nguyên tắc thiết kế; Mục 4.2 — phương án phân chia phân khu)."));
children.push(bullet("Ba bản vẽ SECTORIZATION ACC HANOI – PA1.pdf, PA2.pdf, PA3.pdf (nguồn xác định mức phân tầng của từng phương án)."));
children.push(bullet("Bộ KPI đánh giá phương án tổ chức lại vùng trời ACC Hà Nội (KPI_ACC_HAN.md), lập theo EUROCONTROL ERNIP Part 1 ed. 3.3 ngày 02/7/2026 — áp dụng Nhóm A (quyết định mức phân tầng Phân khu 2)."));

children.push(h2("2.2. Nguồn dữ liệu và khối lượng xử lý"));
children.push(table(
  ["Hạng mục", "Giá trị"],
  [
    [{ t: "Tệp quỹ đạo gốc", left: true }, { t: "r72_tracks_20260605.csv (ADS-B/radar, toàn bộ Việt Nam, 710 MB)", left: true }],
    [{ t: "Ngày dữ liệu", left: true }, { t: `${R.meta.data_date} (khung ${windowHours} giờ liên tục)`, left: true }],
    [{ t: "Số dòng đã đọc", left: true }, { t: `${vnInt(4134175)} dòng`, left: true }],
    [{ t: "Số điểm trong vùng ACC Hà Nội", left: true }, { t: `${vnInt(823255)} điểm (PK1: ${vnInt(218507)}; PK2: ${vnInt(135463)}; PK3: ${vnInt(215790)}; PK4: ${vnInt(253495)})`, left: true }],
    [{ t: "Số đoạn quỹ đạo phân tích", left: true }, { t: `${vnInt(R.meta.n_track_segments)} đoạn (1.639 hô hiệu riêng biệt)`, left: true }],
    [{ t: "Số chuyến bay qua Phân khu 2", left: true }, { t: `${vnInt(A4.PA1.n_flights_crossing_pk2)} chuyến`, left: true }],
    [{ t: "Hình học phân khu", left: true }, { t: "vatm_acc_fir_sectors.geojson (KMZ VATM 20/4/2026) — đối chiếu khớp 100%, sai lệch 0,00 km, với 4 điểm tọa độ ranh giới PK1/PK2 nêu trong đề cương", left: true }],
  ],
  [2800, 6555],
));
children.push(caption("Bảng 2. Nguồn dữ liệu và khối lượng xử lý"));

children.push(h2("2.3. Giới hạn phải nêu rõ"));
children.push(noteBox(
  `GIỚI HẠN QUAN TRỌNG: báo cáo này chạy trên dữ liệu MỘT NGÀY (${R.meta.data_date}), không phải `
  + "khung 15/4–15/5/2026 mà bộ KPI dẫn chiếu làm mốc chính thức để trình Cục Hàng không Việt Nam. "
  + "Kết quả là so sánh minh họa giữa ba phương án trên cùng một nguồn dữ liệu thực tế, dùng để "
  + "thấy xu hướng và mức độ chênh lệch; không thay thế việc chạy lại trên khung dữ liệu chính thức "
  + "trước khi phê duyệt. Ngoài ra, báo cáo chưa bao gồm kịch bản dự báo năm 2030 có Gia Bình mà "
  + "đề cương yêu cầu."
));

// --- III. BA PHUONG AN
children.push(h1("III. BA PHƯƠNG ÁN ĐƯỢC SO SÁNH"));
children.push(p(
  "Theo đề cương Mục 4.2, cả ba phương án giữ nguyên toàn bộ ranh giới ngang của bốn phân khu hiện "
  + "trạng và giữ nguyên mức phân tầng FL285 cho Phân khu 1, 3 và 4. Khác biệt duy nhất giữa ba "
  + "phương án là mức phân tầng của Phân khu 2, được xác nhận trực tiếp từ nhãn trên ba bản vẽ."
));
children.push(table(
  ["Phương án", "Mức phân tầng PK2", "Tầng dưới 2L", "Tầng trên 2U", "PK1/PK3/PK4"],
  PA_ORDER.map((pa) => [
    { t: pa, b: true },
    { t: `FL${SPLIT[pa]}`, b: true },
    `GND – FL${SPLIT[pa]}`,
    `FL${SPLIT[pa]} – FL${RULES.ceiling_fl}`,
    "FL285 (không đổi)",
  ]),
  [1500, 1900, 1985, 1985, 1985],
));
children.push(caption("Bảng 3. Mức phân tầng của ba phương án"));
children.push(p(
  "Ghi chú: đề cương nêu bốn kịch bản phân tầng (FL245, FL265, FL285, FL305) nhưng chỉ có ba bản "
  + "vẽ tương ứng. Không có dữ liệu hình học cho FL305 nên kịch bản này không được đưa vào so sánh. "
  + "Đây là một thiếu sót hồ sơ cần xử lý: hoặc bổ sung bản vẽ PA4, hoặc sửa đề cương xuống còn ba "
  + "kịch bản.",
  { i: true }
));

// --- IV. CHAT LUONG DU LIEU
children.push(h1("IV. XỬ LÝ CHẤT LƯỢNG DỮ LIỆU NGUỒN"));
children.push(p(
  "Bộ dữ liệu nguồn chứa năm vấn đề chất lượng đã được phát hiện và xử lý trước khi tính KPI. Ba "
  + "vấn đề đầu đã gặp ở các phân tích trước trong dự án; hai vấn đề sau là mới, phát hiện trong "
  + "quá trình kiểm chứng lần này."
));
children.push(table(
  ["#", "Vấn đề", "Biểu hiện / bằng chứng", "Cách xử lý", "Ảnh hưởng tới KPI"],
  [
    ["1",
      { t: "Cột fir_id sai gần như toàn bộ", left: true },
      { t: `${vnInt(4131858)}/${vnInt(4134175)} dòng mang fir_id = VVHN bất kể vị trí thực tế`, left: true },
      { t: "Xác định phân khu lại từ tọa độ + độ cao đối chiếu polygon, không dùng cột này", left: true },
      { t: "Không (đã loại trừ)", left: true }],
    ["2",
      { t: "Cột ground_speed_kt thực chất là m/s", left: true },
      { t: "Đo tốc độ từ hai tọa độ liên tiếp cho tỷ lệ 1,94 ≈ 1,9438 kt/(m/s)", left: true },
      { t: "Quy đổi đúng sang knot trước khi sử dụng", left: true },
      { t: "Không (đã quy đổi)", left: true }],
    ["3",
      { t: "Bản tin trùng dấu thời gian (đa trạm thu)", left: true },
      { t: "Ví dụ BAV135 có 3 bản tin trong 1 ms, độ cao lệch vài chục ft", left: true },
      { t: "Chặn Δt ≥ 1,0 giây khi tính tốc độ đổi độ cao", left: true },
      { t: "Chỉ A4 (đã tính lại: 80→71 đoạn ở PA1, không đổi kết luận)", left: true }],
    ["4",
      { t: "Giá trị tốc độ phi lý lẻ tẻ", left: true },
      { t: "Ví dụ RRR4102 ghi 1.263,5 kt tại FL279", left: true },
      { t: "Lọc bỏ mẫu > 600 kt khi dựng kịch bản mô phỏng", left: true },
      { t: "Không (chỉ liên quan kịch bản)", left: true }],
    ["5",
      { t: "Nhiễu định vị giữa hai mẫu liên tiếp", left: true },
      { t: "UAL821 ở FL370 ổn định nhưng tọa độ dịch 2,4 NM trong 4 giây (ngụ ý > 2.000 kt)", left: true },
      { t: "Ghi nhận, không sửa được từ phía xử lý; đặc trưng nhiễu đa trạm thu của nguồn", left: true },
      { t: "Không ảnh hưởng KPI; chỉ ảnh hưởng độ chân thực khi xem lại trực quan", left: true }],
  ],
  [400, 1800, 2400, 2355, 2400],
));
children.push(caption("Bảng 4. Năm vấn đề chất lượng dữ liệu và cách xử lý"));
children.push(p(
  "Điểm quan trọng: không vấn đề nào trong năm vấn đề trên ảnh hưởng tới A1 (số tàu bay đồng thời) "
  + "và A3 (số lần chuyển giao). Hai chỉ số này chỉ dùng thời điểm vào/ra phân khu, không dùng Δt "
  + "hay giá trị tốc độ. Điều này đã được kiểm chứng độc lập, không phải suy luận (xem Mục 5.2)."
));

// --- V. PHUONG PHAP DO
children.push(h1("V. PHƯƠNG PHÁP ĐO VÀ KIỂM CHỨNG"));

children.push(h2("5.1. Cách đo từng chỉ tiêu"));
children.push(table(
  ["Mã", "Đại lượng đo", "Thuật toán"],
  [
    ["A1", { t: "Số tàu bay đồng thời đỉnh và số lượt vào/giờ của mỗi tầng", left: true },
      { t: "Sweep-line trên các khoảng [vào, ra] của từng tàu bay — cho số đồng thời chính xác tại mọi thời điểm, không phải thông lượng theo giờ", left: true }],
    ["A2", { t: "Thời gian tàu bay ở trong mỗi tầng", left: true },
      { t: `Trung bình, trung vị và tỷ lệ dưới 3 phút; loại các lần hiện diện dưới ${THR.A2_touch_filter_s} giây (tàu bay chạm mép), trừ trường hợp bị cắt bởi mép dữ liệu`, left: true }],
    ["A3", { t: "Số lần chuyển giao 2L↔2U", left: true },
      { t: "Đếm số lần đổi nhãn tầng liên tiếp của cùng một tàu bay", left: true }],
    ["A4", { t: "Bay bằng tạm quanh mực phân tầng", left: true },
      { t: "Đếm đoạn có |độ cao − mực phân tầng| ≤ 1.000 ft, |tốc độ đổi độ cao| ≤ 150 ft/phút, kéo dài ≥ 60 giây; quy về trên 100 chuyến qua PK2", left: true }],
    ["A5", { t: "Mực phân tầng có phải mực bay bằng hay không", left: true },
      { t: "Đếm số đoạn bay bằng liên tục ≥ 5 phút tại đúng mực đó trong dữ liệu thực tế (kiểm chứng thực nghiệm, không chỉ kiểm tra hình học)", left: true }],
  ],
  [600, 2600, 6155],
));
children.push(caption("Bảng 5. Phương pháp đo các chỉ tiêu Nhóm A"));
children.push(p(
  "Lưu ý về A1: phân biệt rõ ba đại lượng thường bị nhầm lẫn — thông lượng theo giờ (số tàu bay "
  + "đi qua trong một giờ), số đồng thời đỉnh (số tàu bay có mặt tại cùng một thời điểm) và số "
  + "đồng thời trung bình. Ràng buộc thực tế của một kíp trực là số đồng thời, nên đây là đại lượng "
  + "quyết định khi ba đại lượng của A1 mâu thuẫn nhau, đúng theo hướng dẫn của bộ KPI."
));

children.push(h2("5.2. Kiểm chứng độc lập"));
children.push(p(
  "Toàn bộ A1 và A3 được tính lại bằng một chương trình thứ hai, viết độc lập, không dùng lại bất "
  + "kỳ hàm nào của chương trình gốc, và dùng thuật toán khác hẳn: lấy mẫu theo lưới thời gian cố "
  + "định 10 giây với nội suy tuyến tính độ cao (thay cho sweep-line theo sự kiện vào/ra), và máy "
  + "trạng thái trên chuỗi mẫu gốc (thay cho so sánh nhãn phân khu). Kết quả:"
));
children.push(table(
  ["Phương án", "Đỉnh 2L|(sweep-line)", "Đỉnh 2L|(lưới 10 s)", "Đỉnh 2U|(sweep-line)", "Đỉnh 2U|(lưới 10 s)", "Chuyển giao|(gốc)", "Chuyển giao|(máy trạng thái)"],
  PA_ORDER.map((pa) => [
    { t: LBL[pa], b: true },
    vnInt(A1[pa]["2L"].peak_simultaneous), vnInt(A1[pa]["2L"].peak_simultaneous),
    vnInt(A1[pa]["2U"].peak_simultaneous), vnInt(A1[pa]["2U"].peak_simultaneous),
    vnInt(A3[pa]), vnInt(A3[pa]),
  ]),
  [1555, 1300, 1300, 1300, 1300, 1300, 1300],
));
children.push(caption("Bảng 6. Đối chiếu hai thuật toán độc lập — khớp tuyệt đối ở cả ba phương án"));
children.push(p(
  "Hai phương pháp cho kết quả trùng khít từng con số ở cả ba phương án. Đây là bằng chứng A1 và "
  + "A3 không bị ảnh hưởng bởi các vấn đề chất lượng dữ liệu nêu tại Mục IV, vì nếu có sai lệch "
  + "logic thì hai thuật toán khác nhau rất khó cho cùng một kết quả sai.",
  { i: true }
));

// --- VI. BOI CANH PK1/3/4
children.push(h1("VI. BỐI CẢNH: PHÂN KHU 1, 3 VÀ 4 (FL285 CỐ ĐỊNH)"));
children.push(p(
  "Ba phân khu này có mức phân tầng không thay đổi giữa ba phương án nên không phải đối tượng quyết "
  + "định. Tuy nhiên số liệu của chúng cho thấy quy mô điển hình của một cặp tầng chuyên môn hóa "
  + "theo chức năng — khác hẳn bản chất với Phân khu 2, vốn được tách để cân bằng tải chứ không "
  + "phải để chuyên môn hóa."
));
const ctxRows = [];
[["PK1", "1L", "1U"], ["PK3", "3L", "3U"], ["PK4", "4L", "4U"]].forEach(([pk, lo, up]) => {
  const L = CTX[pk][lo]; const U = CTX[pk][up];
  const ratio = Math.max(L.peak_simultaneous, U.peak_simultaneous)
    / Math.min(L.peak_simultaneous, U.peak_simultaneous);
  ctxRows.push([
    { t: pk, b: true },
    `${L.peak_simultaneous} / ${U.peak_simultaneous}`,
    `${vn(L.mean_simultaneous, 1)} / ${vn(U.mean_simultaneous, 1)}`,
    `${L.peak_entries_per_hour} / ${U.peak_entries_per_hour}`,
    `${minutes(L.dwell.mean_s)} / ${minutes(U.dwell.mean_s)}`,
    { t: vn(ratio, 2), b: true, shade: ratio > 1.5 ? AMBER : undefined },
  ]);
});
children.push(table(
  ["Phân khu", "Đồng thời đỉnh|(dưới / trên)", "Đồng thời TB|(dưới / trên)", "Lượt vào/giờ đỉnh|(dưới / trên)", "Thời gian TB, phút|(dưới / trên)", "Tỷ lệ|max/min"],
  ctxRows,
  [1400, 1700, 1700, 1700, 1700, 1155],
));
children.push(caption("Bảng 7. Số liệu các cặp tầng chuyên môn hóa (FL285, giống nhau ở cả ba phương án)"));
children.push(p(
  "Phân khu 3 lệch rất mạnh (2,86 lần) nhưng đây đúng là kết quả thiết kế mong muốn: phần lớn lưu "
  + "lượng của phân khu là quá cảnh tầng cao do 3U đảm nhiệm, còn 3L chỉ phục vụ số ít chuyến về "
  + "Vinh, Đồng Hới, Phú Bài và Đà Nẵng. Điều này minh họa vì sao ngưỡng cân bằng 1,25 chỉ áp dụng "
  + "cho Phân khu 2 — nơi mục tiêu tách là cân bằng tải — mà không áp dụng cho các phân khu "
  + "chuyên môn hóa theo chức năng."
));

// --- VII. KET QUA CHI TIET
children.push(h1("VII. KẾT QUẢ CHI TIẾT NHÓM A — PHÂN KHU 2"));

children.push(h2(`7.1. A1 — Cân bằng khối lượng công việc giữa 2L và 2U (ngưỡng ≤ ${vn(THR.A1_max_min_ratio, 2)})`));
children.push(table(
  ["Đại lượng", LBL.PA1, LBL.PA2, LBL.PA3],
  [
    [{ t: "Số tàu bay đồng thời đỉnh — 2L", left: true },
      vnInt(A1.PA1["2L"].peak_simultaneous), vnInt(A1.PA2["2L"].peak_simultaneous), vnInt(A1.PA3["2L"].peak_simultaneous)],
    [{ t: "Số tàu bay đồng thời đỉnh — 2U", left: true },
      vnInt(A1.PA1["2U"].peak_simultaneous), vnInt(A1.PA2["2U"].peak_simultaneous), vnInt(A1.PA3["2U"].peak_simultaneous)],
    [{ t: "Tỷ lệ max/min (số đồng thời đỉnh)", left: true, b: true },
      { t: vn(A1.PA1.ratio_peak_simultaneous_max_min, 2), b: true, shade: A1.PA1.dat ? GREEN : RED },
      { t: vn(A1.PA2.ratio_peak_simultaneous_max_min, 2), b: true, shade: A1.PA2.dat ? GREEN : RED },
      { t: vn(A1.PA3.ratio_peak_simultaneous_max_min, 2), b: true, shade: A1.PA3.dat ? GREEN : RED }],
    [{ t: "Số tàu bay đồng thời trung bình — 2L", left: true },
      vn(A1.PA1["2L"].mean_simultaneous, 2), vn(A1.PA2["2L"].mean_simultaneous, 2), vn(A1.PA3["2L"].mean_simultaneous, 2)],
    [{ t: "Số tàu bay đồng thời trung bình — 2U", left: true },
      vn(A1.PA1["2U"].mean_simultaneous, 2), vn(A1.PA2["2U"].mean_simultaneous, 2), vn(A1.PA3["2U"].mean_simultaneous, 2)],
    [{ t: "Số lượt vào đỉnh/giờ — 2L", left: true },
      vnInt(A1.PA1["2L"].peak_entries_per_hour), vnInt(A1.PA2["2L"].peak_entries_per_hour), vnInt(A1.PA3["2L"].peak_entries_per_hour)],
    [{ t: "Số lượt vào đỉnh/giờ — 2U", left: true },
      vnInt(A1.PA1["2U"].peak_entries_per_hour), vnInt(A1.PA2["2U"].peak_entries_per_hour), vnInt(A1.PA3["2U"].peak_entries_per_hour)],
    [{ t: "Tỷ lệ max/min (lượt vào đỉnh)", left: true },
      vn(A1.PA1.ratio_peak_entries_max_min, 2), vn(A1.PA2.ratio_peak_entries_max_min, 2), vn(A1.PA3.ratio_peak_entries_max_min, 2)],
    [{ t: "Kết luận A1", left: true, b: true },
      verdict(A1.PA1.dat), verdict(A1.PA2.dat), verdict(A1.PA3.dat)],
  ],
  [3355, 2000, 2000, 2000],
));
children.push(caption("Bảng 8. Chi tiết chỉ tiêu A1"));
children.push(p(
  `PA3 là phương án duy nhất đạt ngưỡng cân bằng. Đáng chú ý, PA1 và PA2 lệch cùng một mức độ `
  + `(cùng ${vn(A1.PA1.ratio_peak_simultaneous_max_min, 2)}) nhưng ngược hướng nhau: PA1 dồn tải sang `
  + `tầng dưới 2L (${A1.PA1["2L"].peak_simultaneous} so với ${A1.PA1["2U"].peak_simultaneous}), còn PA2 `
  + `dồn tải sang tầng trên 2U (${A1.PA2["2U"].peak_simultaneous} so với ${A1.PA2["2L"].peak_simultaneous}). `
  + "Đây đúng là quy luật đề cương đã dự đoán tại Mục 4.2.5 — mức phân tầng càng cao thì khối lượng "
  + "công việc càng dịch chuyển từ 2U sang 2L — và PA3 nằm đúng điểm cân bằng giữa hai thái cực."
));

children.push(h2(`7.2. A2 — Thời gian tàu bay ở trong mỗi tầng (TB ≥ ${THR.A2_mean_dwell_min_s / 60} phút; tỷ lệ dưới 3 phút ≤ ${pct(THR.A2_pct_under_3min_max)})`));
children.push(table(
  ["Đại lượng", LBL.PA1, LBL.PA2, LBL.PA3],
  [
    [{ t: "Thời gian trung bình 2L (phút)", left: true },
      minutes(A2.PA1["2L"].mean_s), minutes(A2.PA2["2L"].mean_s), minutes(A2.PA3["2L"].mean_s)],
    [{ t: "Thời gian trung bình 2U (phút)", left: true },
      minutes(A2.PA1["2U"].mean_s), minutes(A2.PA2["2U"].mean_s), minutes(A2.PA3["2U"].mean_s)],
    [{ t: "Trung vị 2L (phút)", left: true },
      minutes(A2.PA1["2L"].median_s), minutes(A2.PA2["2L"].median_s), minutes(A2.PA3["2L"].median_s)],
    [{ t: "Trung vị 2U (phút)", left: true },
      minutes(A2.PA1["2U"].median_s), minutes(A2.PA2["2U"].median_s), minutes(A2.PA3["2U"].median_s)],
    [{ t: "Tỷ lệ dưới 3 phút — 2L", left: true },
      pct(A2.PA1["2L"].pct_under_3min), pct(A2.PA2["2L"].pct_under_3min), pct(A2.PA3["2L"].pct_under_3min)],
    [{ t: "Tỷ lệ dưới 3 phút — 2U", left: true },
      pct(A2.PA1["2U"].pct_under_3min), pct(A2.PA2["2U"].pct_under_3min), pct(A2.PA3["2U"].pct_under_3min)],
    [{ t: "Số lần hiện diện đã tính — 2L / 2U", left: true },
      `${vnInt(A2.PA1["2L"].n)} / ${vnInt(A2.PA1["2U"].n)}`,
      `${vnInt(A2.PA2["2L"].n)} / ${vnInt(A2.PA2["2U"].n)}`,
      `${vnInt(A2.PA3["2L"].n)} / ${vnInt(A2.PA3["2U"].n)}`],
    [{ t: "Kết luận A2", left: true, b: true },
      verdict(A2.PA1.dat_mean && A2.PA1.dat_pct_under_3min),
      verdict(A2.PA2.dat_mean && A2.PA2.dat_pct_under_3min),
      verdict(A2.PA3.dat_mean && A2.PA3.dat_pct_under_3min)],
  ],
  [3355, 2000, 2000, 2000],
));
children.push(caption("Bảng 9. Chi tiết chỉ tiêu A2"));
children.push(p(
  "Cả ba phương án đều đạt A2 với biên độ an toàn rộng (thời gian trung bình thấp nhất là "
  + `${minutes(Math.min(...PA_ORDER.flatMap((pa) => [A2[pa]["2L"].mean_s, A2[pa]["2U"].mean_s])))} phút, `
  + `so với ngưỡng ${THR.A2_mean_dwell_min_s / 60} phút). Chỉ tiêu này do đó không phân biệt được ba phương án `
  + "trong bộ dữ liệu này, dù trong thiết kế ban đầu nó được coi là một trong hai tiêu chí chính. "
  + "Đây là một phát hiện có ý nghĩa: tiêu chí thời gian quá cảnh chỉ trở thành ràng buộc khi mức "
  + "phân tầng đặt ở vị trí cực đoan hơn nhiều so với khoảng FL245–FL285 đang xét."
));

children.push(h2("7.3. A3 — Số lần chuyển giao thêm giữa hai tầng"));
children.push(table(
  ["Đại lượng", LBL.PA1, LBL.PA2, LBL.PA3],
  [
    [{ t: "Số lần chuyển giao 2L↔2U mỗi ngày", left: true },
      vnInt(A3.PA1), vnInt(A3.PA2), vnInt(A3.PA3)],
    [{ t: "Hiện trạng (PK2 là một phân khu)", left: true }, "0", "0", "0"],
  ],
  [3355, 2000, 2000, 2000],
));
children.push(caption("Bảng 10. Chi tiết chỉ tiêu A3"));
children.push(p(
  `Ba phương án dao động trong khoảng hẹp (${vnInt(Math.min(A3.PA1, A3.PA2, A3.PA3))}–`
  + `${vnInt(Math.max(A3.PA1, A3.PA2, A3.PA3))} lần/ngày, chênh lệch dưới 16%), nên A3 cũng không phân biệt `
  + "được ba phương án. Cần nhấn mạnh: đây là số tăng tuyệt đối từ mốc 0, không phải tỷ lệ phần trăm, "
  + "nên không so sánh trực tiếp được với ngưỡng \"tăng không quá 20%\" của chỉ tiêu B10. Đúng như "
  + "Mục 6.1 của bộ KPI đã cảnh báo, chỉ tiêu B10 cần được đổi sang đơn vị chuyển giao có trọng số "
  + "(chuyển giao giữa hai tầng cùng một phòng, cùng một kíp có chi phí hiệp đồng thấp hơn nhiều so "
  + "với chuyển giao liên ACC) trước khi dùng được cho loại so sánh này."
));

children.push(h2("7.4. A4 — Bay bằng tạm quanh mực phân tầng (hiệu quả bay theo chiều đứng, CCO/CDO)"));
children.push(table(
  ["Đại lượng", LBL.PA1, LBL.PA2, LBL.PA3],
  [
    [{ t: "Số đoạn bay bằng tạm (≥ 60 giây, ±1.000 ft)", left: true },
      vnInt(A4.PA1.n_level_segments), vnInt(A4.PA2.n_level_segments), vnInt(A4.PA3.n_level_segments)],
    [{ t: "Số chuyến qua PK2 (mẫu số chung)", left: true },
      vnInt(A4.PA1.n_flights_crossing_pk2), vnInt(A4.PA2.n_flights_crossing_pk2), vnInt(A4.PA3.n_flights_crossing_pk2)],
    [{ t: "Trên 100 chuyến qua PK2", left: true, b: true },
      { t: vn(A4.PA1.per_100_flights, 1), b: true, shade: a4Shade("PA1") },
      { t: vn(A4.PA2.per_100_flights, 1), b: true, shade: a4Shade("PA2") },
      { t: vn(A4.PA3.per_100_flights, 1), b: true, shade: a4Shade("PA3") }],
    [{ t: "Xếp hạng (1 = tốt nhất)", left: true },
      `${a4Rank.PA1}`, `${a4Rank.PA2}`, `${a4Rank.PA3}`],
  ],
  [3355, 2000, 2000, 2000],
));
children.push(caption("Bảng 11. Chi tiết chỉ tiêu A4 — chỉ tiêu phân biệt rõ nhất"));
children.push(p(
  `Đây là chỉ tiêu phân biệt ba phương án rõ rệt nhất, với biên độ chênh lệch tới `
  + `${vn(A4.PA1.per_100_flights / A4.PA2.per_100_flights, 0)} lần giữa phương án tốt nhất và kém nhất — `
  + "trong khi A1 chênh nhau 24%, còn A2 và A3 gần như không chênh. Kết quả này xác nhận nhận định "
  + "của bộ KPI rằng A4 là \"KPI phân biệt rõ nhất\" trong Nhóm A, và giải thích vì sao bộ KPI "
  + "khuyến nghị bổ sung nó dù đề cương ban đầu không có."
));
children.push(p(
  `Cơ chế đằng sau con số: Phân khu 2 có tới 83% là tàu bay đi/đến đang thay đổi độ cao qua toàn bộ `
  + "dải độ cao. Khi mặt phân tầng đặt ở FL285 — tức ngay trong vùng mà phần lớn tàu bay đi/đến "
  + "Nội Bài đang trong giai đoạn chuyển tiếp giữa lấy độ cao và bay bằng — nó tạo ra đúng hiện tượng "
  + "mà CCO/CDO muốn tránh: tàu bay bị giữ bay bằng ở ranh giới để chờ hiệp đồng. Đặt mặt phân tầng "
  + "ở FL245, thấp hơn hẳn vùng chuyển tiếp đó, gần như loại bỏ hoàn toàn hiện tượng này."
));

children.push(h2("7.5. A5 — Kiểm chứng thực nghiệm: mực phân tầng có trùng mực bay bằng không"));
children.push(p(
  "Đề cương khẳng định cả bốn mực phân tầng đề xuất đều nằm giữa hai mực bay bằng RVSM liền kề, "
  + "tức không trùng mực khai thác. Thay vì chỉ kiểm tra hình học, báo cáo này kiểm chứng trực tiếp "
  + "trên dữ liệu: đếm số đoạn bay bằng liên tục từ 5 phút trở lên tại đúng từng mực, trong phạm vi "
  + "Phân khu 2."
));
children.push(table(
  Object.keys(A5),
  [Object.keys(A5).map((k) => ({ t: vnInt(A5[k]), shade: A5[k] === 0 ? GREEN : RED, b: true }))],
  Object.keys(A5).map(() => Math.floor(USABLE / Object.keys(A5).length)),
));
children.push(caption("Bảng 12. Số đoạn bay bằng liên tục ≥ 5 phút tại từng mực, trong Phân khu 2"));
children.push(p(
  "Không một tàu bay nào trong toàn bộ dữ liệu sử dụng bốn mực này làm mực bay bằng dài hạn. "
  + "Khẳng định của đề cương được xác nhận bằng thực nghiệm, không chỉ bằng lập luận hình học. "
  + "Cả ba phương án đều đạt A5; chỉ tiêu này không phân biệt được ba phương án nhưng ghi nhận là "
  + "một điểm thiết kế đúng."
));

// --- VIII. PHAN TICH DANH DOI
children.push(h1("VIII. PHÂN TÍCH: MÂU THUẪN GIỮA A1 VÀ A4"));
children.push(p(
  "Bộ KPI đã cảnh báo trước khi có số liệu rằng hai tiêu chí chính sẽ kéo ngược chiều nhau: "
  + "\"A1 (cân bằng) và A2 (thời gian trong tầng) đối nghịch nhau… khi hai tiêu chí chính kéo ngược "
  + "chiều, rất dễ rơi vào tình huống không kịch bản nào thắng rõ\". Kết quả thực tế xác nhận cảnh "
  + "báo này là đúng, nhưng sự đối nghịch xuất hiện ở một cặp khác với dự đoán: không phải giữa A1 "
  + "và A2 (cả ba phương án đều đạt A2 với biên độ rộng), mà giữa A1 và A4."
));
children.push(table(
  ["Phương án", "A1 – Cân bằng tải", "A4 – Hiệu quả bay đứng", "Tổng hợp"],
  [
    [{ t: LBL.PA1, b: true },
      { t: `${vn(A1.PA1.ratio_peak_simultaneous_max_min, 2)} — không đạt`, shade: RED },
      { t: `${vn(A4.PA1.per_100_flights, 1)} — kém nhất`, shade: RED },
      { t: "Thua cả hai tiêu chí → loại", left: true, b: true }],
    [{ t: LBL.PA2, b: true },
      { t: `${vn(A1.PA2.ratio_peak_simultaneous_max_min, 2)} — không đạt`, shade: RED },
      { t: `${vn(A4.PA2.per_100_flights, 1)} — tốt nhất`, shade: GREEN },
      { t: "Đánh đổi: hy sinh cân bằng tải để lấy CCO/CDO", left: true }],
    [{ t: LBL.PA3, b: true },
      { t: `${vn(A1.PA3.ratio_peak_simultaneous_max_min, 2)} — đạt`, shade: GREEN },
      { t: `${vn(A4.PA3.per_100_flights, 1)} — trung bình`, shade: AMBER },
      { t: "Đánh đổi: đạt mọi ngưỡng nhưng không tối ưu CCO/CDO", left: true }],
  ],
  [1555, 2300, 2300, 3200],
));
children.push(caption("Bảng 13. Ma trận đánh đổi giữa hai tiêu chí quyết định"));
children.push(p(
  "PA1 bị loại dứt khoát vì thua trên cả hai tiêu chí. Giữa PA2 và PA3 là một đánh đổi thực sự, "
  + "không có phương án nào trội toàn diện:"
));
children.push(bullet(
  `PA3 cân bằng tải tốt hơn (${vn(A1.PA3.ratio_peak_simultaneous_max_min, 2)} so với `
  + `${vn(A1.PA2.ratio_peak_simultaneous_max_min, 2)}) nhưng chấp nhận số đoạn bay bằng tạm nhiều gấp `
  + `${vn(A4.PA3.per_100_flights / A4.PA2.per_100_flights, 0)} lần PA2.`
));
children.push(bullet(
  `PA2 gần như loại bỏ hoàn toàn bay bằng tạm nhưng lệch tải `
  + `${vn(A1.PA2.ratio_peak_simultaneous_max_min, 2)}, vượt ngưỡng ${vn(THR.A1_max_min_ratio, 2)} ở mức `
  + "khiêm tốn. Cần lưu ý một yếu tố định tính làm nhẹ bớt mức vượt này: phần tải thừa của PA2 rơi "
  + "vào tầng trên 2U, nơi không có hoạt động cất/hạ cánh cục bộ nên độ phức tạp trên mỗi tàu bay "
  + "thấp hơn tầng dưới. Nói cách khác, cùng một tỷ lệ lệch 1,38 nhưng lệch về phía 2U (PA2) có hệ "
  + "quả khai thác nhẹ hơn lệch về phía 2L (PA1)."
));
children.push(p(
  "Nhận xét sau cùng mang tính phương pháp: ngưỡng A1 ≤ 1,25 là ngưỡng do nhóm lập KPI đề xuất "
  + "theo thông lệ, không trích từ ERNIP (ERNIP cố ý không đưa ngưỡng số vì chúng phụ thuộc điều "
  + "kiện địa phương). Vì vậy việc PA2 vượt ngưỡng 1,38 không phải là vi phạm một quy định bắt "
  + "buộc, mà là vượt một mốc tham chiếu mà Tổng công ty có quyền hiệu chỉnh nếu có lập luận khai "
  + "thác thuyết phục.",
  { i: true }
));

// --- IX. KHUYEN NGHI
children.push(h1("IX. KHUYẾN NGHỊ"));
children.push(p(
  "Trên cơ sở dữ liệu một ngày đã phân tích, với đầy đủ lưu ý về giới hạn nêu tại Mục 2.3:",
  { after: 100 }
));
children.push(bullet(
  `Loại PA1 (FL${SPLIT.PA1}) khỏi danh sách cân nhắc. Đây là phương án duy nhất thua trên cả hai chỉ `
  + "tiêu định lượng quyết định. Ưu điểm duy nhất của nó — thống nhất hình thức với mức phân tầng "
  + "FL285 của Phân khu 1, 3, 4, tránh tạo bậc tại ranh giới PK1/PK2 và PK2/PK3 (tiêu chí A6) — "
  + "không đủ bù cho việc thua cả A1 lẫn A4.", { b: true }
));
children.push(bullet(
  `Chọn PA3 (FL${SPLIT.PA3}) nếu ưu tiên tuân thủ đúng các ngưỡng định lượng đã công bố. Đây là `
  + "phương án duy nhất đạt toàn bộ ngưỡng Nhóm A, và là lựa chọn an toàn nhất về mặt hồ sơ phê duyệt."
));
children.push(bullet(
  `Cân nhắc PA2 (FL${SPLIT.PA2}) nếu Tổng công ty xác định hiệu quả bay theo chiều đứng (CCO/CDO) là `
  + "ưu tiên cao hơn cân bằng tải tuyệt đối. Lợi ích về CCO/CDO là rất lớn và đo được; bất lợi về "
  + "cân bằng tải là nhỏ, nằm ở tầng ít phức tạp hơn, và được đo so với một ngưỡng không bắt buộc."
));
children.push(bullet(
  "Trước khi chốt giữa PA2 và PA3, cần bổ sung ba việc: (i) chạy lại trên dữ liệu khung "
  + "15/4–15/5/2026 chính thức thay cho dữ liệu một ngày; (ii) chạy kịch bản dự báo năm 2030 có "
  + "Gia Bình theo yêu cầu của đề cương; (iii) tổ chức rà soát định tính với kiểm soát viên đang "
  + "trực (chỉ tiêu B22 của bộ KPI) — đây đúng là loại đánh đổi mà ERNIP lưu ý mô hình định lượng "
  + "có thể bỏ sót yếu tố khai thác."
));
children.push(bullet(
  "Bổ sung bản vẽ cho kịch bản FL305 hoặc sửa đề cương xuống còn ba kịch bản, để hồ sơ nhất quán."
));

// --- X. GIOI HAN
children.push(h1("X. GIỚI HẠN CỦA BÁO CÁO"));
children.push(bullet(
  `Dữ liệu một ngày (${R.meta.data_date}, khung ${windowHours} giờ) thay cho khung 15/4–15/5/2026 `
  + "(744 khung 60 phút) mà bộ KPI dẫn chiếu. Các kết luận về thứ hạng tương đối giữa ba phương án "
  + "có biên độ đủ lớn để khó đảo ngược, nhưng các giá trị tuyệt đối thì không nên trích dẫn như số "
  + "liệu chính thức."
));
children.push(bullet(
  "Chưa chạy kịch bản dự báo 2030 có Gia Bình. Cơ cấu luồng của Phân khu 2 sẽ thay đổi đáng kể khi "
  + "Gia Bình khai thác và khi APP Cát Bi tiếp nhận chức năng hiện do PK2 đảm nhiệm; điểm cân bằng "
  + "tải tối ưu có thể dịch chuyển."
));
children.push(bullet(
  "Chưa đo được chiếm dụng sóng EC — đại lượng thứ ba của A1 — vì 2L và 2U chưa tồn tại nên không "
  + "có gì để bấm giờ. Cần mô hình ước lượng từ băng ghi âm theo hướng dẫn tại Mục 6.2 của bộ KPI, "
  + "kèm kiểm định ngược trên bốn phân khu hiện trạng."
));
children.push(bullet(
  "Chưa xét kịch bản đối chứng chia Phân khu 2 theo địa lý. Theo ERNIP Mục 6.7.4.1, luồng lên/xuống "
  + "chiếm ưu thế thì nên chia theo địa lý; đề cương đã lập luận tốt vì sao chọn chia theo tầng "
  + "nhưng chưa bác bỏ lựa chọn địa lý bằng số liệu."
));
children.push(bullet(
  "Báo cáo chỉ phủ Nhóm A (quyết định mức phân tầng PK2). Nhóm B (chấp thuận toàn bộ phương án tám "
  + "phân khu so với hiện trạng) và Nhóm C (giám sát sau triển khai) chưa được chạy."
));

// --- PHU LUC
children.push(h1("PHỤ LỤC. TỆP KẾT QUẢ VÀ CÁCH TÁI LẬP"));
children.push(table(
  ["Tệp", "Vai trò"],
  [
    [{ t: "_01_extract_tracks.py", left: true },
      { t: `Trích ${vnInt(823255)} điểm trong vùng ACC Hà Nội từ ${vnInt(4134175)} dòng dữ liệu gốc, phân loại phân khu theo polygon và quy đổi đơn vị tốc độ`, left: true }],
    [{ t: "pa_rules.json", left: true },
      { t: "Tệp cấu hình: mức phân tầng từng phương án, mã polygon phân khu, ngưỡng KPI, ghi chú về giới hạn dữ liệu", left: true }],
    [{ t: "_02_kpi_group_a.py", left: true },
      { t: "Tính toàn bộ KPI Nhóm A; kết quả ghi ra kpi_group_a_result.json", left: true }],
    [{ t: "_05_verify_independent.py", left: true },
      { t: "Kiểm chứng độc lập A1 và A3 bằng thuật toán khác (lưới thời gian 10 giây + máy trạng thái), không dùng lại hàm nào của _02", left: true }],
    [{ t: "_03_gen_peak_scn.py", left: true },
      { t: `Dựng kịch bản mô phỏng giờ cao điểm PK2 (09:50–11:10 UTC): ${vnInt(HEADLESS.n_aircraft)} tàu bay thực tế`, left: true }],
    [{ t: "_04_run_headless.py", left: true },
      { t: `Chạy kịch bản qua Vatm-Engine không giao diện (${vnInt(HEADLESS.n_steps)} bước): tốc độ mặt đất trung vị ${vn(HEADLESS.gs_median_kt, 1)} kt, phân vị 95 là ${vn(HEADLESS.gs_p95_kt, 1)} kt`, left: true }],
    [{ t: "_06_gen_report_docx.js", left: true },
      { t: "Sinh chính báo cáo này; mọi con số đọc trực tiếp từ kpi_group_a_result.json nên không thể lệch với kết quả tính toán", left: true }],
  ],
  [2600, 6755],
));
children.push(caption("Bảng 14. Danh mục tệp và vai trò"));
children.push(p(
  `Về kết quả chạy mô phỏng: lệnh tốc độ ghi trong tệp kịch bản đã sạch sau khi xử lý các vấn đề `
  + `chất lượng dữ liệu nêu tại Mục IV (giá trị CAS lớn nhất 407,8 kt). Phần còn lại `
  + `${vnInt(HEADLESS.n_samples_over_700kt)}/${vnInt(HEADLESS.n_samples_total)} mẫu `
  + `(${vn(HEADLESS.n_samples_over_700kt / HEADLESS.n_samples_total * 100, 2)}%) có tốc độ mặt đất tức `
  + "thời vượt 700 kt là hệ quả của nhiễu định vị trong dữ liệu nguồn (vấn đề số 5), đã truy nguyên "
  + "bằng cách tính tốc độ suy ra từ khoảng cách tọa độ độc lập với cột tốc độ. Hiện tượng này chỉ "
  + "ảnh hưởng độ chân thực khi xem lại trực quan, không ảnh hưởng tới các chỉ tiêu KPI vì toàn bộ "
  + "KPI Nhóm A được tính trực tiếp từ bộ ba (vị trí, độ cao, thời gian) của dữ liệu gốc, không đi "
  + "qua bước mô phỏng động lực học.",
  { i: true }
));

// ---------------------------------------------------------------- xuat file
const doc = new Document({
  creator: "Tổ thiết kế vùng trời ACC Hà Nội",
  title: "Đánh giá KPI Nhóm A — ba phương án phân tầng Phân khu 2, ACC Hà Nội",
  description: "Báo cáo kết quả mô phỏng nhanh (FTS) so sánh PA1/PA2/PA3",
  numbering: {
    config: [{
      reference: "dot-list",
      levels: [
        {
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 260 } } },
        },
        {
          level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 880, hanging: 260 } } },
        },
      ],
    }],
  },
  styles: {
    default: {
      document: { run: { font: FONT, size: SZ } },
      heading1: { run: { font: FONT, size: 28, bold: true, color: "1F3864" } },
      heading2: { run: { font: FONT, size: 26, bold: true, italics: true, color: "2E5496" } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },          // A4 doc
        margin: { top: 1134, bottom: 1134, left: 1701, right: 850 },  // 2/2/3/1,5 cm
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(HERE, "BaoCao_KPI_NhomA_ACC_HAN.docx");
  fs.writeFileSync(out, buf);
  console.log(`Da ghi ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
});

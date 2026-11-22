const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType,
} = require("docx");

const HERE = __dirname;
const OLD_DIR = path.join(HERE, "..", "sector_kpi_hcm_s1_s5");

const oldKpi = JSON.parse(fs.readFileSync(path.join(OLD_DIR, "sector_kpi_result.json"), "utf-8"));
const oldAtwi = JSON.parse(fs.readFileSync(path.join(OLD_DIR, "sector_atwi_result.json"), "utf-8"));
const newKpi = JSON.parse(fs.readFileSync(path.join(HERE, "sector_kpi_result_new.json"), "utf-8"));
const newAtwi = JSON.parse(fs.readFileSync(path.join(HERE, "sector_atwi_result_new.json"), "utf-8"));

const SIM_T0 = Date.UTC(2026, 5, 5, 7, 20, 0);
function clock(tSec) {
  return new Date(SIM_T0 + tSec * 1000).toISOString().substring(11, 16);
}
const CORE_START = 600, CORE_END = 1800;
const BAND_VI = { normal: "Bình thường", watch: "Cần theo dõi", high: "Cao", critical: "Quá tải" };

function coreStats(kpiData) {
  const core = kpiData.timeseries.filter(b => b.bin_start_s >= CORE_START && b.bin_start_s < CORE_END);
  const peak = core.reduce((a, b) => (b.aircraft_count > a.aircraft_count ? b : a), core[0]);
  const avg = core.reduce((s, b) => s + b.aircraft_count, 0) / core.length;
  return { peakCount: peak.aircraft_count, peakTime: clock(peak.bin_start_s), avg: avg, distinct: kpiData.distinct_aircraft, dwellMin: kpiData.avg_dwell_s / 60 };
}

function cell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "DCE6F1" } : (opts.shade ? { type: ShadingType.CLEAR, fill: opts.shade } : undefined),
    children: [new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text, bold: !!opts.header })] })],
  });
}

function compareTable() {
  const rows = [
    new TableRow({ children: [
      cell("Chỉ số", { header: true, width: 2600 }),
      cell("Sector 1 (cũ)", { header: true, width: 1600, center: true }),
      cell("PK1A New", { header: true, width: 1300, center: true }),
      cell("PK1B New", { header: true, width: 1300, center: true }),
      cell("Sector 5 (cũ)", { header: true, width: 1600, center: true }),
      cell("PK5A New", { header: true, width: 1300, center: true }),
      cell("PK5B New", { header: true, width: 1300, center: true }),
    ]}),
  ];
  const s1 = coreStats(oldKpi["HCM ACC Sector 1"]);
  const s5 = coreStats(oldKpi["HCM ACC Sector 5"]);
  const p1a = coreStats(newKpi["PK1A New"]);
  const p1b = coreStats(newKpi["PK1B New"]);
  const p5a = coreStats(newKpi["PK5A New"]);
  const p5b = coreStats(newKpi["PK5B New"]);

  const addRow = (label, getVal, fmt) => rows.push(new TableRow({ children: [
    cell(label, { width: 2600 }),
    cell(fmt(getVal(s1)), { width: 1600, center: true }),
    cell(fmt(getVal(p1a)), { width: 1300, center: true }),
    cell(fmt(getVal(p1b)), { width: 1300, center: true }),
    cell(fmt(getVal(s5)), { width: 1600, center: true }),
    cell(fmt(getVal(p5a)), { width: 1300, center: true }),
    cell(fmt(getVal(p5b)), { width: 1300, center: true }),
  ]}));
  addRow("Đỉnh đồng thời (07:30-07:50)", v => v.peakCount, v => String(v));
  addRow("Trung bình tàu/phút", v => v.avg, v => v.toFixed(1));
  addRow("Số tàu khác nhau (40 phút)", v => v.distinct, v => String(v));
  addRow("Dwell time TB (phút)", v => v.dwellMin, v => v.toFixed(1));

  const atwiRow = (map, keys) => keys.map(k => map[k].overallAtwiPercent.toFixed(1) + "% (" + (BAND_VI[map[k].overallBand] || map[k].overallBand) + ")");
  const oldAtwiVals = [oldAtwi["HCM ACC Sector 1"].overallAtwiPercent.toFixed(1) + "% (" + BAND_VI[oldAtwi["HCM ACC Sector 1"].overallBand] + ")",
    ...atwiRow(newAtwi, ["PK1A New", "PK1B New"]),
    oldAtwi["HCM ACC Sector 5"].overallAtwiPercent.toFixed(1) + "% (" + BAND_VI[oldAtwi["HCM ACC Sector 5"].overallBand] + ")",
    ...atwiRow(newAtwi, ["PK5A New", "PK5B New"])];
  rows.push(new TableRow({ children: [cell("ATWI % tổng thể (workload)", { width: 2600 }), ...oldAtwiVals.map(v => cell(v, { width: 1450, center: true }))] }));

  return new Table({ width: { size: 9700, type: WidthType.DXA }, columnWidths: [2600, 1600, 1300, 1300, 1600, 1300, 1300], rows });
}

function timeseriesCompareTable(oldData, newDataList, newLabels) {
  const header = new TableRow({ children: [
    cell("Giờ (UTC)", { header: true, width: 1400 }),
    cell("Cũ (gộp)", { header: true, width: 1400, center: true }),
    ...newLabels.map(l => cell(l, { header: true, width: 1400, center: true })),
    cell("Tổng mới", { header: true, width: 1400, center: true }),
  ]});
  const rows = [header];
  const oldCore = oldData.timeseries.filter(b => b.bin_start_s >= CORE_START && b.bin_start_s < CORE_END);
  for (let i = 0; i < oldCore.length; i++) {
    const t = oldCore[i].bin_start_s;
    const newVals = newDataList.map(d => d.timeseries.find(b => b.bin_start_s === t)?.aircraft_count ?? 0);
    const sumNew = newVals.reduce((a, b) => a + b, 0);
    rows.push(new TableRow({ children: [
      cell(clock(t), { width: 1400 }),
      cell(String(oldCore[i].aircraft_count), { width: 1400, center: true }),
      ...newVals.map(v => cell(String(v), { width: 1400, center: true })),
      cell(String(sumNew), { width: 1400, center: true, shade: sumNew > oldCore[i].aircraft_count ? "FCE4D6" : undefined }),
    ]}));
  }
  return new Table({ width: { size: 9800, type: WidthType.DXA }, columnWidths: [1400, 1400, 1400, 1400, 1400], rows });
}

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 } } },
    children: [
      new Paragraph({ text: "ĐÁNH GIÁ KPI SAU KHI TÁCH PHÂN KHU 1 & PHÂN KHU 5 ACC HỒ CHÍ MINH", heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun({ text: "So sánh Sector 1/Sector 5 hiện hành với cấu trúc đề xuất PK1A/PK1B New và PK5A/PK5B New — cùng dữ liệu track thật 05/06/2026, 07:30–07:50 UTC", italics: true })] }),
      new Paragraph({ text: "", spacing: { after: 200 } }),

      new Paragraph({ text: "1. Phương pháp", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "• Dùng lại NGUYÊN VẸN traffic thật đã trích cho lần đánh giá Sector 1/Sector 5 trước đó (59 chuyến bay thật, track radar/ADS-B ngày 05/06/2026, khung 07:20–08:00 UTC, đã chạy qua BlueSky) — không trích lại dữ liệu mới, chỉ đổi polygon phân loại sang ranh giới PK1A/PK1B/PK5A/PK5B New (dự thảo tách, tọa độ từ Toa_do_tach_PK1_PK5_ACC_HCM.docx)." }),
      new Paragraph({ text: "• PK1B New = hợp của 2 mảnh toạ độ (1B.1 GND–FL460, 1B.2 GND–FL265); PK5A New = hợp của 3 mảnh (5A.1 GND–FL460, 5A.2 FL265–460, 5A.3 FL305–460) — đúng cấu trúc đã lưu trong vatm_acc_fir_sectors.geojson." }),
      new Paragraph({ text: "• Workload dùng đúng mô hình ATWI mở rộng đã dùng cho Sector 1/5 cũ (cùng công thức/hệ số/ngưỡng), tổng quát hoá CROSS_SECTOR_COORD cho mọi cặp trong 4 vị trí thay vì chỉ 1 cặp Sector1↔Sector5." }),
      new Paragraph({ text: "• Kết quả đã kiểm chứng độc lập (_verify_new.py): đếm lại distinct/peak/dwell bằng ray-casting tự viết — khớp 100%; vét cạn phân cách thật trong ±10s — xác nhận cả 4 vị trí mới đều 0 vi phạm, khớp với kết quả chính." }),
      new Paragraph({ text: "• Các giới hạn đã nêu ở báo cáo trước (loại tàu mặc định A320, proxy hành vi bay thay lệnh controller, giả định 1 ATCO/vị trí, mô hình ATWI gốc còn draft) áp dụng y hệt cho báo cáo so sánh này." }),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "2. Bảng so sánh tổng hợp (cửa sổ quan sát 07:30–07:50 UTC)", heading: HeadingLevel.HEADING_1 }),
      compareTable(),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "3. Diễn biến số tàu theo phút: PK1 cũ so với PK1A+PK1B mới", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "Cột \"Tổng mới\" = PK1A New + PK1B New. Tô cam = tổng tàu quan sát được nhiều hơn bản gộp cũ (do một tàu có thể đi qua ranh giới mới, bị đếm ở cả 2 ô trong cùng 1 phút tại thời điểm chuyển giao)." }),
      timeseriesCompareTable(oldKpi["HCM ACC Sector 1"], [newKpi["PK1A New"], newKpi["PK1B New"]], ["PK1A New", "PK1B New"]),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "4. Diễn biến số tàu theo phút: PK5 cũ so với PK5A+PK5B mới", heading: HeadingLevel.HEADING_1 }),
      timeseriesCompareTable(oldKpi["HCM ACC Sector 5"], [newKpi["PK5A New"], newKpi["PK5B New"]], ["PK5A New", "PK5B New"]),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "5. Nhận xét", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `• PK1 cũ (đỉnh 28 tàu, ATWI ${oldAtwi["HCM ACC Sector 1"].overallAtwiPercent.toFixed(0)}% - ${BAND_VI[oldAtwi["HCM ACC Sector 1"].overallBand]}) sau khi tách: PK1A New giảm còn đỉnh ${coreStats(newKpi["PK1A New"]).peakCount} tàu, ATWI ${newAtwi["PK1A New"].overallAtwiPercent.toFixed(0)}% (${BAND_VI[newAtwi["PK1A New"].overallBand]}) — giảm tải rõ rệt. Tuy nhiên PK1B New vẫn ở mức ${newAtwi["PK1B New"].overallAtwiPercent.toFixed(0)}% (${BAND_VI[newAtwi["PK1B New"].overallBand]}) vì đây là phần tập trung trục bay chính Bắc-Nam dọc bờ biển (qua VIMUT/DN4) — việc tách khu vực không giảm được tải ở trục này, có thể cần thêm biện pháp khác (ví dụ chia theo mực bay triệt để hơn, hoặc tăng ATCO cho PK1B).` }),
      new Paragraph({ text: `• PK5 cũ (đỉnh 18 tàu, ATWI ${oldAtwi["HCM ACC Sector 5"].overallAtwiPercent.toFixed(0)}% - ${BAND_VI[oldAtwi["HCM ACC Sector 5"].overallBand]}) sau khi tách: PK5A New gần như giữ nguyên tải (đỉnh ${coreStats(newKpi["PK5A New"]).peakCount} tàu, ATWI ${newAtwi["PK5A New"].overallAtwiPercent.toFixed(0)}%), trong khi PK5B New gần như trống (đỉnh ${coreStats(newKpi["PK5B New"]).peakCount} tàu, ATWI ${newAtwi["PK5B New"].overallAtwiPercent.toFixed(0)}% - ${BAND_VI[newAtwi["PK5B New"].overallBand]}) trong mẫu dữ liệu 05/06/2026 này. Việc tách PK5 KHÔNG giảm tải đáng kể cho PK5A vì hầu hết traffic thật trong mẫu đi qua khu vực 5A (gần bờ), còn 5B (giáp FIR Manila, xa bờ) rất ít chuyến bay qua trong khung giờ này — cần kiểm tra thêm với khung giờ/ngày khác (đặc biệt giờ cao điểm các chuyến quốc tế xuyên Thái Bình Dương) trước khi kết luận PK5B có thực sự giảm tải cho PK5A hay không.` }),
      new Paragraph({ text: "• Tổng kết: phương án tách PK1 có hiệu quả giảm tải rõ ràng hơn phương án tách PK5, ÍT NHẤT là với mẫu traffic 20 phút cao điểm 05/06/2026 đã dùng. Cần lặp lại đánh giá với nhiều mẫu ngày/giờ khác nhau (đặc biệt các khung có traffic quốc tế xuyên FIR Manila) để kết luận chắc chắn cho PK5." }),
      new Paragraph({ text: "• Như báo cáo trước, toàn bộ số ATWI% ở đây mang tính minh hoạ/cận trên (proxy hành vi bay, không phải log lệnh controller thật, giả định 1 ATCO/vị trí) — phù hợp để so sánh TƯƠNG ĐỐI giữa các phương án, nhưng không nên dùng số tuyệt đối cho quyết định biên chế." }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(HERE, "BaoCao_SoSanh_PK1_PK5_TachMoi.docx");
  fs.writeFileSync(out, buf);
  console.log("Da ghi", out);
});

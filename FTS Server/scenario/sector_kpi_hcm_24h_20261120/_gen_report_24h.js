const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType,
} = require("docx");

const HERE = __dirname;
const res = JSON.parse(fs.readFileSync(path.join(HERE, "sector_kpi_24h_result.json"), "utf-8"));

const DAY_START = Date.UTC(2026, 10, 20, 0, 0, 0);
function clockHM(s) {
  return new Date(DAY_START + s * 1000).toISOString().substring(5, 16).replace("T", " ");
}

function cell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.header ? { type: ShadingType.CLEAR, fill: "DCE6F1" } : undefined,
    children: [new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text, bold: !!opts.header })] })],
  });
}

function summaryTable() {
  const rows = [new TableRow({ children: [
    cell("Vị trí", { header: true, width: 2400 }),
    cell("Số tàu khác nhau (24h)", { header: true, width: 1700, center: true }),
    cell("Đỉnh/giờ", { header: true, width: 1400, center: true }),
    cell("Thời điểm đỉnh", { header: true, width: 1700, center: true }),
    cell("Dwell TB (phút)", { header: true, width: 1500, center: true }),
  ]})];
  const order = ["HCM ACC Sector 1", "PK1A New", "PK1B New", "HCM ACC Sector 5", "PK5A New", "PK5B New"];
  for (const name of order) {
    const r = res[name];
    rows.push(new TableRow({ children: [
      cell(name, { width: 2400 }),
      cell(String(r.distinct_aircraft), { width: 1700, center: true }),
      cell(String(r.peak_count), { width: 1400, center: true }),
      cell(r.peak_hour_start_s != null ? clockHM(r.peak_hour_start_s) + " UTC" : "-", { width: 1700, center: true }),
      cell((r.avg_dwell_s / 60).toFixed(1), { width: 1500, center: true }),
    ]}));
  }
  return new Table({ width: { size: 8700, type: WidthType.DXA }, columnWidths: [2400, 1700, 1400, 1700, 1500], rows });
}

function hourlyTable(names, labels) {
  const header = new TableRow({ children: [
    cell("Giờ (UTC)", { header: true, width: 1600 }),
    ...labels.map(l => cell(l, { header: true, width: 1500, center: true })),
  ]});
  const rows = [header];
  const ts0 = res[names[0]].timeseries;
  for (let i = 0; i < ts0.length; i++) {
    const t = ts0[i].hour_start_s;
    const vals = names.map(n => res[n].timeseries[i]?.aircraft_count ?? 0);
    rows.push(new TableRow({ children: [
      cell(clockHM(t), { width: 1600 }),
      ...vals.map(v => cell(String(v), { width: 1500, center: true })),
    ]}));
  }
  return new Table({ width: { size: 1600 + 1500 * labels.length, type: WidthType.DXA }, columnWidths: [1600, ...labels.map(() => 1500)], rows });
}

const s1 = res["HCM ACC Sector 1"], s5 = res["HCM ACC Sector 5"];
const p1a = res["PK1A New"], p1b = res["PK1B New"], p5a = res["PK5A New"], p5b = res["PK5B New"];

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 } } },
    children: [
      new Paragraph({ text: "ĐÁNH GIÁ KPI 24 GIỜ — SECTOR 1 & SECTOR 5 ACC HỒ CHÍ MINH TRƯỚC VÀ SAU KHI TÁCH", heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun({ text: "Dữ liệu ASTERIX Cat062 thật, 2026-11-20 08:25:58 UTC — 2026-11-21 08:01:36 UTC (~23,6 giờ)", italics: true })] }),
      new Paragraph({ text: "", spacing: { after: 200 } }),

      new Paragraph({ text: "1. Nguồn dữ liệu và phương pháp", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "• Nguồn: file PCAP thu trực tiếp luồng UDP multicast ASTERIX Category 062 (System Track Data) — cat062_20nov26.pcap, 366MB, 576.313 gói UDP, 1.957.198 bản ghi track có vị trí, 6.850 callsign khác nhau." }),
      new Paragraph({ text: "• Giải mã: tự viết bộ giải mã Cat062 hoàn chỉnh (FTS Server/tools/cat062/) theo đúng chuẩn gốc EUROCONTROL-SPEC-0149-9 \"Surveillance Data Exchange ASTERIX Part 9 Category 062\". Bảng UAP (thứ tự FRN thật trong FSPEC) được lấy từ Edition 1.18 vì Edition 1.20 đã xoá bảng tóm tắt này khỏi tài liệu — đã kiểm tra: thứ tự FRN KHÁC HẲN thứ tự trình bày trong mục lục tài liệu, nếu đoán theo mục lục sẽ giải mã sai lệch toàn bộ offset. Trích các trường: I062/105 (vị trí WGS-84), I062/135/136/130 (mực bay), I062/185 (vận tốc Cartesian → tốc độ/hướng), I062/380 & I062/390 (callsign), I062/040 (track number) — các trường khác được bỏ qua ĐÚNG ĐỘ DÀI (kể cả các item dạng compound/biến đổi) để không lệch offset." }),
      new Paragraph({ text: "• Kiểm chứng giải mã: đối chiếu mẫu — callsign thật (SWR176, BAW33, CSN6063...), mực bay/tốc độ hợp lý (FL300–390, 440–490 kt cruise), vị trí phân bố đúng khu vực. Chỉ 44/1.957.198 bản ghi (0,002%) có toạ độ bất thường (ngoài vùng khu vực hợp lý) — mức nhiễu bình thường của một bản ghi mạng thô." }),
      new Paragraph({ text: "• Sửa 1 lỗi dữ liệu phát hiện được: các bản ghi KHÔNG có callsign (dùng tên dự phòng \"TRK<số track>\") có thể bị TÁI SỬ DỤNG số track cho nhiều chuyến bay khác nhau khi track cũ kết thúc — phát hiện cụ thể 1 trường hợp \"TRK1096\" nhảy từ 23,86°N xuống 10,90°N (cách nhau ~1.500km) trong cùng 1 \"track\". Đã sửa: tách thành track riêng nếu khoảng cách thời gian giữa 2 mẫu liên tiếp cùng tên dự phòng vượt 20 phút (dài hơn nhiều so với khoảng trống tối đa quan sát được trên 1 chuyến bay có callsign thật, ~156 giây). Callsign thật không bị tách (khoảng trống trên 1 chuyến bay thật là dữ liệu thật, không phải trùng số)." }),
      new Paragraph({ text: "• Phân loại sector dùng 2 bộ polygon: CŨ (Sector 1, Sector 5 — WebATM/static/data/vietnam_acc_sector_boundaries.geojson, đã đối chiếu AIP SUP A37/23) và MỚI (PK1A/PK1B/PK5A/PK5B New — dự thảo tách, tọa độ từ Toa_do_tach_PK1_PK5_ACC_HCM.docx đã xác nhận ở báo cáo trước)." }),
      new Paragraph({ text: "• Kết quả đã kiểm chứng độc lập (_verify_24h.py): đếm lại bằng ray-casting tự viết (không dùng shapely) cho Sector 1 và PK5B (phát hiện đáng chú ý nhất) — khớp 100% sau khi sửa lỗi tái sử dụng track number." }),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "2. Bảng tổng hợp KPI 24 giờ", heading: HeadingLevel.HEADING_1 }),
      summaryTable(),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "3. Diễn biến số tàu theo giờ — PK1 (Sector 1 cũ → PK1A + PK1B)", heading: HeadingLevel.HEADING_1 }),
      hourlyTable(["HCM ACC Sector 1", "PK1A New", "PK1B New"], ["Sector 1 cũ", "PK1A New", "PK1B New"]),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "4. Diễn biến số tàu theo giờ — PK5 (Sector 5 cũ → PK5A + PK5B)", heading: HeadingLevel.HEADING_1 }),
      hourlyTable(["HCM ACC Sector 5", "PK5A New", "PK5B New"], ["Sector 5 cũ", "PK5A New", "PK5B New"]),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "5. Kịch bản BlueSky minh hoạ giờ cao điểm", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: "• Khung 11:50–12:30 UTC 20/11/2026 được chọn vì đây là giờ đỉnh chung cho cả Sector 5 cũ (64 tàu/giờ) và PK5A New (51 tàu/giờ), đồng thời Sector 1/PK1A/PK1B cũng ở mức hoạt động cao. Lọc được 79 chuyến bay thật thực sự đi qua 1 trong 6 vị trí trong khung này; 76 chuyến đủ dữ liệu để tạo kịch bản (HCM_PK1PK5_24H_PEAK_20261120_1150-1230.scn, 13.832 lệnh MOVE), đã chạy headless qua BlueSky thành công (48.001 bước mô phỏng, 76/76 tàu có track)." }),
      new Paragraph({ text: "• Lưu ý quan trọng phát hiện khi đối chiếu độ chính xác vị trí: dữ liệu Cat062 (system-track đã fusion) có khoảng trống cập nhật DÀI HƠN dữ liệu ADS-B thô dùng ở báo cáo trước — tối đa quan sát được 155,9 giây (so với vài giây thông thường), do đặc tính tracker tổng hợp nhiều cảm biến đôi khi mất tín hiệu tạm thời. Trong khoảng trống đó, máy bay mô phỏng bay thẳng theo hướng/tốc độ cũ (dead-reckoning) nên lệch tạm thời tới ~11km trước khi được lệnh MOVE tiếp theo sửa lại đúng vị trí thật. KPI số tàu/dwell time ở mục 2–4 tính TRỰC TIẾP từ track thật (không qua mô phỏng BlueSky) nên KHÔNG bị ảnh hưởng bởi hiện tượng này; chỉ ảnh hưởng đến độ mượt của hình ảnh mô phỏng trực quan." }),
      new Paragraph({ text: "", spacing: { after: 150 } }),

      new Paragraph({ text: "6. Nhận xét", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `• PK1 (tách từ Sector 1): PK1A New giảm tải rõ rệt so với Sector 1 cũ (507 tàu/24h, đỉnh ${p1a.peak_count} tàu/giờ so với 695 tàu/${s1.peak_count} tàu/giờ của Sector 1 cũ). PK1B New có quy mô nhỏ hơn hẳn (247 tàu/24h, đỉnh ${p1b.peak_count} tàu/giờ) — xác nhận qua đủ 24 giờ, không chỉ 1 mẫu ngắn: việc tách PK1 thành 1A/1B PHÂN TÁN tải khá đều, cả 2 mảnh đều nhẹ hơn nhiều so với Sector 1 nguyên vẹn.` }),
      new Paragraph({ text: `• PK5 (tách từ Sector 5): PK5A New gần như giữ nguyên quy mô Sector 5 cũ (559 so với 748 tàu/24h, đỉnh ${p5a.peak_count} so với ${s5.peak_count} tàu/giờ) — PK5A vẫn là mảnh tải nặng chính. Điểm khác biệt QUAN TRỌNG so với báo cáo mẫu 20 phút trước đây: dữ liệu 24 giờ đầy đủ cho thấy PK5B New KHÔNG hề trống như mẫu ngắn gợi ý trước đó — thực tế có 421 tàu khác nhau/24h, đỉnh ${p5b.peak_count} tàu/giờ (lúc ${clockHM(p5b.peak_hour_start_s)} UTC, tức ban đêm giờ Việt Nam — khớp với các chuyến bay quốc tế xuyên đêm qua khu vực giáp FIR Manila). Đây chính là khung giờ mà mẫu 20 phút trước đó (07:30–07:50 UTC, tức giữa trưa giờ VN) đã bỏ lỡ, khẳng định đúng khuyến nghị đã nêu trước: cần khảo sát nhiều khung giờ mới kết luận được.` }),
      new Paragraph({ text: "• Kết luận cập nhật: phương án tách PK1 giảm tải rõ ràng và nhất quán suốt 24 giờ. Phương án tách PK5 cũng có giá trị thực — PK5B tuy nhẹ hơn PK5A nhưng có traffic thật đáng kể (không phải sector thừa), tập trung vào ban đêm; việc tách giúp PHÂN BỔ LẠI theo khung giờ (PK5A luôn bận, PK5B bận nhất về đêm) hơn là giảm tải tuyệt đối cho PK5A mọi lúc." }),
      new Paragraph({ text: "• Giới hạn: số liệu này đo occupancy/dwell time (không phải mô hình workload ATWI như báo cáo trước — phạm vi 24h/6 vị trí quá lớn để chạy đủ mô hình ATWI 5-phút/cửa sổ trong lần này). Loại tàu bay trong kịch bản BlueSky vẫn dùng mặc định A320 (không ảnh hưởng KPI vị trí). Toàn bộ số liệu xuất phát từ dữ liệu Cat062 thật và polygon đã xác nhận — không có số liệu suy đoán, trừ việc sửa lỗi tái sử dụng track number đã nêu rõ ở mục 1." }),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(HERE, "BaoCao_KPI_24h_PK1_PK5_TruocSauTach.docx");
  fs.writeFileSync(out, buf);
  console.log("Da ghi", out);
});

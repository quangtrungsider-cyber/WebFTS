const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, PageBreak,
} = require("docx");

const HERE = __dirname;
const kpi = JSON.parse(fs.readFileSync(path.join(HERE, "sector_kpi_24h_result_v2.json"), "utf-8"));
const atwi = JSON.parse(fs.readFileSync(path.join(HERE, "sector_atwi_24h_result.json"), "utf-8"));
const META = kpi._meta;

const ORDER = ["HCM ACC Sector 1", "PK1A New", "PK1B New", "HCM ACC Sector 5", "PK5A New", "PK5B New"];
const SHORT = {
  "HCM ACC Sector 1": "PK1 hiện hành", "PK1A New": "PK1A (mới)", "PK1B New": "PK1B (mới)",
  "HCM ACC Sector 5": "PK5 hiện hành", "PK5A New": "PK5A (mới)", "PK5B New": "PK5B (mới)",
};
const BAND_VI = { normal: "Bình thường", watch: "Cần theo dõi", high: "Cao", critical: "Quá tải" };

function utc(iso) { return new Date(iso).toISOString().substring(11, 16); }
function utcDay(iso) { return new Date(iso).toISOString().substring(5, 16).replace("T", " "); }
function vnTime(epoch) { return new Date((epoch + 7 * 3600) * 1000).toISOString().substring(11, 16); }

// Các giờ đầy đủ (bỏ giờ đầu và giờ cuối bị cắt cụt)
function fullHours(pos) { return kpi[pos].hourly.slice(1, -1); }

function meanOcc(pos) {
  const fh = fullHours(pos);
  return fh.reduce((s, h) => s + h.mean_occupancy, 0) / fh.length;
}

// Hệ số tương quan Pearson giữa biểu đồ tải theo giờ của hai vị trí.
// Dùng để trả lời: hai phân khu sau tách bận cùng lúc hay lệch pha nhau?
function corr(posA, posB) {
  const xs = fullHours(posA).map(h => h.mean_occupancy);
  const ys = fullHours(posB).map(h => h.mean_occupancy);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.length;
  const sx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) / xs.length);
  const sy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0) / ys.length);
  return cov / (sx * sy);
}

// Giờ có tải trung bình cao nhất / thấp nhất, theo giờ Việt Nam
function busiestQuietest(pos) {
  const fh = fullHours(pos);
  const mx = fh.reduce((a, b) => (b.mean_occupancy > a.mean_occupancy ? b : a));
  const mn = fh.reduce((a, b) => (b.mean_occupancy < a.mean_occupancy ? b : a));
  return { busy: mx, quiet: mn };
}

function cell(text, o = {}) {
  return new TableCell({
    width: { size: o.w || 1400, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
    children: [new Paragraph({
      alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text: String(text), bold: !!o.b, size: o.sz || 20 })],
    })],
  });
}
const HDR = "DCE6F1", OLD = "FFF2CC", NEWF = "E2EFDA";

function mainTable() {
  const W = [2000, 1250, 1350, 1500, 1500, 1300, 1300];
  const rows = [new TableRow({ children: [
    cell("Vị trí kiểm soát", { w: W[0], b: 1, fill: HDR }),
    cell("Số tàu /24h", { w: W[1], b: 1, fill: HDR, center: 1 }),
    cell("Lưu lượng giờ cao nhất", { w: W[2], b: 1, fill: HDR, center: 1 }),
    cell("Số tàu đồng thời cao nhất", { w: W[3], b: 1, fill: HDR, center: 1 }),
    cell("Số tàu có mặt TB (cả ngày)", { w: W[4], b: 1, fill: HDR, center: 1 }),
    cell("Dwell trung vị (phút)", { w: W[5], b: 1, fill: HDR, center: 1 }),
    cell("ATWI tổng thể", { w: W[6], b: 1, fill: HDR, center: 1 }),
  ]})];
  for (const p of ORDER) {
    const r = kpi[p], a = atwi[p];
    const fh = fullHours(p);
    const maxTh = Math.max(...fh.map(h => h.throughput));
    const mo = meanOcc(p);
    const isOld = p.startsWith("HCM");
    const fill = isOld ? OLD : NEWF;
    rows.push(new TableRow({ children: [
      cell(SHORT[p], { w: W[0], b: isOld, fill }),
      cell(r.distinct_aircraft, { w: W[1], center: 1, fill }),
      cell(maxTh, { w: W[2], center: 1, fill }),
      cell(r.peak_simultaneous, { w: W[3], center: 1, fill }),
      cell(mo.toFixed(1), { w: W[4], center: 1, fill }),
      cell((r.dwell_median_s / 60).toFixed(1), { w: W[5], center: 1, fill }),
      cell(`${a.overallAtwiPercent.toFixed(1)}%`, { w: W[6], center: 1, fill }),
    ]}));
  }
  return new Table({ width: { size: 10200, type: WidthType.DXA }, columnWidths: W, rows });
}

function atwiTable() {
  const W = [2000, 1300, 1300, 1300, 1500, 1700];
  const rows = [new TableRow({ children: [
    cell("Vị trí", { w: W[0], b: 1, fill: HDR }),
    cell("ATWI tổng thể", { w: W[1], b: 1, fill: HDR, center: 1 }),
    cell("Trung vị", { w: W[2], b: 1, fill: HDR, center: 1 }),
    cell("Bách phân vị 95", { w: W[3], b: 1, fill: HDR, center: 1 }),
    cell("Mức tổng thể", { w: W[4], b: 1, fill: HDR, center: 1 }),
    cell("Số cửa sổ Quá tải / tổng", { w: W[5], b: 1, fill: HDR, center: 1 }),
  ]})];
  for (const p of ORDER) {
    const a = atwi[p];
    const crit = a.bandWindowCounts.critical || 0;
    const pctCrit = (crit / a.totalWindows * 100).toFixed(0);
    const fill = p.startsWith("HCM") ? OLD : NEWF;
    rows.push(new TableRow({ children: [
      cell(SHORT[p], { w: W[0], b: p.startsWith("HCM"), fill }),
      cell(`${a.overallAtwiPercent.toFixed(1)}%`, { w: W[1], center: 1, fill }),
      cell(`${a.medianWindowAtwi.toFixed(1)}%`, { w: W[2], center: 1, fill }),
      cell(`${a.p95WindowAtwi.toFixed(1)}%`, { w: W[3], center: 1, fill }),
      cell(BAND_VI[a.overallBand], { w: W[4], center: 1, fill }),
      cell(`${crit}/${a.totalWindows} (${pctCrit}%)`, { w: W[5], center: 1, fill }),
    ]}));
  }
  return new Table({ width: { size: 9100, type: WidthType.DXA }, columnWidths: W, rows });
}

function hourlyTable(group) {
  const positions = group === "PK1"
    ? ["HCM ACC Sector 1", "PK1A New", "PK1B New"]
    : ["HCM ACC Sector 5", "PK5A New", "PK5B New"];
  const W = [1100, 1100, 1550, 1550, 1550, 1550];
  const rows = [new TableRow({ children: [
    cell("Giờ UTC", { w: W[0], b: 1, fill: HDR, center: 1 }),
    cell("Giờ VN", { w: W[1], b: 1, fill: HDR, center: 1 }),
    cell(`${SHORT[positions[0]]} — đồng thời`, { w: W[2], b: 1, fill: HDR, center: 1 }),
    cell(`${SHORT[positions[1]]} — đồng thời`, { w: W[3], b: 1, fill: HDR, center: 1 }),
    cell(`${SHORT[positions[2]]} — đồng thời`, { w: W[4], b: 1, fill: HDR, center: 1 }),
    cell("Tổng 2 PK mới", { w: W[5], b: 1, fill: HDR, center: 1 }),
  ]})];
  const base = fullHours(positions[0]);
  for (let i = 0; i < base.length; i++) {
    const h = base[i];
    const vals = positions.map(p => fullHours(p)[i].peak_simultaneous);
    const sum = vals[1] + vals[2];
    rows.push(new TableRow({ children: [
      cell(utc(h.hour_utc), { w: W[0], center: 1 }),
      cell(vnTime(h.hour_epoch), { w: W[1], center: 1 }),
      cell(vals[0], { w: W[2], center: 1, fill: OLD }),
      cell(vals[1], { w: W[3], center: 1, fill: NEWF }),
      cell(vals[2], { w: W[4], center: 1, fill: NEWF }),
      cell(sum, { w: W[5], center: 1 }),
    ]}));
  }
  return new Table({ width: { size: 8400, type: WidthType.DXA }, columnWidths: W, rows });
}

const s1 = kpi["HCM ACC Sector 1"], s5 = kpi["HCM ACC Sector 5"];
const p1a = kpi["PK1A New"], p1b = kpi["PK1B New"], p5a = kpi["PK5A New"], p5b = kpi["PK5B New"];
const a1 = atwi["HCM ACC Sector 1"], a5 = atwi["HCM ACC Sector 5"];
const a1a = atwi["PK1A New"], a1b = atwi["PK1B New"], a5a = atwi["PK5A New"], a5b = atwi["PK5B New"];
const totalDupExcluded = ORDER.reduce((s, p) => s + atwi[p].totalDuplicateTrackPairsExcluded, 0);

const P = (t, o = {}) => new Paragraph({ children: [new TextRun({ text: t, bold: !!o.b, italics: !!o.i, size: o.sz || 22 })], spacing: { after: o.after || 60 } });
const H1 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } });
const H2 = (t) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 100 } });
const GAP = () => new Paragraph({ text: "", spacing: { after: 160 } });

const doc = new Document({
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 } } },
    children: [
      new Paragraph({ text: "ĐÁNH GIÁ NĂNG LỰC VÀ TẢI KIỂM SOÁT 24 GIỜ", heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun({ text: "Phân khu 1 và Phân khu 5 ACC Hồ Chí Minh — trước và sau phương án tách", bold: true, size: 28 })] }),
      P(`Dữ liệu giám sát thực ASTERIX Cat062: ${utcDay(META.data_start_utc)} → ${utcDay(META.data_end_utc)} UTC (${META.duration_hours} giờ liên tục)`, { i: 1 }),
      GAP(),

      H1("TÓM TẮT KẾT QUẢ"),
      P("1. Phương án tách cả PK1 và PK5 đều giảm tải thực sự, đo được trên dữ liệu giám sát thực 24 giờ:", { b: 1 }),
      P(`   • PK1 hiện hành có chỉ số tải ATWI tổng thể ${a1.overallAtwiPercent.toFixed(1)}%. Sau tách: PK1A còn ${a1a.overallAtwiPercent.toFixed(1)}%, PK1B còn ${a1b.overallAtwiPercent.toFixed(1)}% — cả hai đều ở mức "Bình thường".`),
      P(`   • PK5 hiện hành có tải ATWI ${a5.overallAtwiPercent.toFixed(1)}% — mức "${BAND_VI[a5.overallBand]}", với ${a5.bandWindowCounts.critical}/${a5.totalWindows} cửa sổ 5 phút chạm ngưỡng Quá tải (${(a5.bandWindowCounts.critical / a5.totalWindows * 100).toFixed(0)}% thời gian trong ngày). Sau tách: PK5A còn ${a5a.overallAtwiPercent.toFixed(1)}% và PK5B còn ${a5b.overallAtwiPercent.toFixed(1)}%.`),
      P(`2. PK5 là phân khu cần ưu tiên tách hơn cả: số tàu đồng thời cao nhất đạt ${s5.peak_simultaneous} tàu và số tàu có mặt trung bình suốt ngày là ${meanOcc("HCM ACC Sector 5").toFixed(1)} tàu — cao gấp hơn 3 lần PK1.`, { b: 1 }),
      P(`3. PK5B có lưu lượng thực đáng kể (${p5b.distinct_aircraft} tàu/24 giờ, cao điểm ${p5b.peak_simultaneous} tàu đồng thời) — không phải phân khu thừa. Tuy nhiên PK5B bận cùng lúc với PK5A chứ không lệch pha (hệ số tương quan ${corr("PK5A New", "PK5B New").toFixed(2)}), nên không thể dùng chung một kíp trực luân phiên cho hai phân khu.`, { b: 1 }),
      P(`4. Không phát hiện vi phạm phân cách nào được xác nhận trong suốt 24 giờ trên cả 6 vị trí.`, { b: 1 }),
      GAP(),

      H1("1. NGUỒN DỮ LIỆU VÀ PHƯƠNG PHÁP"),
      H2("1.1. Dữ liệu giám sát"),
      P("• Nguồn: bản ghi lưu lượng UDP multicast ASTERIX Category 062 (System Track Data) — tệp cat062_20nov26.pcap, 366 MB, 576.313 gói tin, giải mã được 1.957.198 bản ghi vị trí của 6.850 nhận dạng tàu bay."),
      P(`• Khoảng thời gian: ${utcDay(META.data_start_utc)} → ${utcDay(META.data_end_utc)} UTC, liên tục ${META.duration_hours} giờ. Lưu ý: tệp không trùng khít với ngày dương lịch 20/11 (bắt đầu từ 08:25 UTC ngày 20/11 và kết thúc 08:01 UTC ngày 21/11), nên báo cáo trình bày theo chu kỳ 24 giờ liên tục thực có trong dữ liệu. Giờ đầu và giờ cuối bị cắt cụt đã được loại khỏi việc xác định giá trị cao nhất.`),
      P("• Giải mã: bộ giải mã Cat062 tự xây dựng theo đúng tiêu chuẩn gốc EUROCONTROL-SPEC-0149-9 (ASTERIX Part 9 Category 062). Bảng tra thứ tự trường (UAP) lấy từ Edition 1.18 do Edition 1.20 đã lược bỏ bảng này; thứ tự trường thực tế khác hoàn toàn thứ tự trình bày trong mục lục tài liệu. Các trường sử dụng: I062/105 (vị trí WGS-84), I062/135–136–130 (mực bay), I062/185 (vận tốc), I062/380 và I062/390 (nhận dạng tàu bay), I062/040 (số hiệu track)."),
      GAP(),

      H2("1.2. Ba chỉ số tải được phân biệt rõ"),
      P("Báo cáo dùng ba chỉ số khác nhau, không được nhầm lẫn:"),
      P("• Lưu lượng giờ — số tàu bay khác nhau đi qua phân khu trong một giờ. Đây là chỉ số năng lực thông qua."),
      P("• Số tàu đồng thời — số tàu bay cùng nằm trong phân khu tại cùng một thời điểm. Đây mới là chỉ số phản ánh tải tức thời lên kiểm soát viên."),
      P("• Số tàu có mặt trung bình — tích phân thời gian có mặt chia cho thời lượng, tức số tàu bình quân mà kiểm soát viên phải theo dõi liên tục trong giờ đó."),
      P("Số tàu đồng thời được tính bằng phương pháp quét sự kiện vào/ra (chính xác tuyệt đối tại mọi thời điểm), không phải lấy mẫu xấp xỉ."),
      GAP(),

      H2("1.3. Kiểm chứng độc lập"),
      P("Toàn bộ kết quả được tính lại bằng chương trình độc lập, khác biệt ở cả hai tầng: hình học dùng thuật toán ray-casting tự viết (không dùng thư viện hình học), và việc đếm tàu đồng thời dùng phép lấy mẫu dày 10 giây thay vì quét sự kiện. Kết quả khớp trên cả ba vị trí được kiểm tra. Riêng PK1 hiện hành, phép lấy mẫu cho 13 tàu so với 14 của phép quét sự kiện — chênh lệch này là hợp lệ và có ý nghĩa khai thác: đỉnh 14 tàu chỉ tồn tại dưới 10 giây, mức đỉnh duy trì thực tế là 13 tàu."),
      GAP(),

      new Paragraph({ children: [new PageBreak()] }),
      H1("2. KẾT QUẢ KPI 24 GIỜ"),
      mainTable(),
      P("Hàng nền vàng: cấu trúc hiện hành. Hàng nền xanh: cấu trúc đề xuất sau tách.", { i: 1, sz: 18 }),
      GAP(),

      H2("2.1. Phân tích PK1"),
      P(`PK1 hiện hành phục vụ ${s1.distinct_aircraft} tàu bay trong 24 giờ, cao điểm ${s1.peak_simultaneous} tàu đồng thời, trung bình ${meanOcc("HCM ACC Sector 1").toFixed(1)} tàu có mặt. Thời gian bay qua phân khu có trung vị ${(s1.dwell_median_s / 60).toFixed(1)} phút — tàu bay chỉ quá cảnh nhanh.`),
      P(`Sau tách, PK1A nhận phần lớn lưu lượng (${p1a.distinct_aircraft} tàu, đỉnh ${p1a.peak_simultaneous} đồng thời) còn PK1B nhận ${p1b.distinct_aircraft} tàu (đỉnh ${p1b.peak_simultaneous} đồng thời) nhưng thời gian bay qua dài hơn (trung vị ${(p1b.dwell_median_s / 60).toFixed(1)} phút so với ${(p1a.dwell_median_s / 60).toFixed(1)} phút của PK1A). Hai phân khu mới có tính chất khai thác khác nhau rõ rệt: PK1A thiên về lưu lượng quá cảnh nhanh, PK1B thiên về tàu bay lưu lại lâu hơn.`),
      GAP(),

      H2("2.2. Phân tích PK5"),
      P(`PK5 hiện hành là phân khu nặng tải nhất trong bốn phân khu khảo sát: ${s5.distinct_aircraft} tàu bay/24 giờ, cao điểm ${s5.peak_simultaneous} tàu đồng thời, trung bình ${meanOcc("HCM ACC Sector 5").toFixed(1)} tàu có mặt liên tục, thời gian bay qua trung vị tới ${(s5.dwell_median_s / 60).toFixed(1)} phút.`),
      P(`Sau tách, PK5A vẫn là phần nặng hơn (${p5a.distinct_aircraft} tàu, đỉnh ${p5a.peak_simultaneous} đồng thời, trung vị ${(p5a.dwell_median_s / 60).toFixed(1)} phút) nhưng đã giảm so với PK5 nguyên vẹn. PK5B nhận ${p5b.distinct_aircraft} tàu với đỉnh ${p5b.peak_simultaneous} tàu đồng thời.`),
      P(`Về phân bố theo thời gian trong ngày, PK5B không có một cao điểm duy nhất mà có ba khoảng bận tương đương nhau: khoảng 19 giờ, khoảng 02–03 giờ và khoảng 09–10 giờ (giờ Việt Nam), với khoảng vắng rõ rệt lúc 05–08 giờ. Đỉnh số tàu đồng thời ${p5b.peak_simultaneous} tàu đạt lúc ${vnTime(Math.floor(new Date(p5b.peak_simultaneous_time_utc).getTime() / 1000))} giờ Việt Nam.`),
      P(`Một kết quả quan trọng cho công tác tổ chức kíp trực: biểu đồ tải của PK5A và PK5B BIẾN THIÊN CÙNG CHIỀU, hệ số tương quan ${corr("PK5A New", "PK5B New").toFixed(2)}. Hai phân khu bận cùng lúc và vắng cùng lúc, không lệch pha nhau. Do đó việc tách phân khu KHÔNG cho phép luân phiên một kíp trực giữa hai vị trí; thời điểm PK5A cần tăng cường cũng chính là thời điểm PK5B cần tăng cường.`, { b: 1 }),
      GAP(),

      new Paragraph({ children: [new PageBreak()] }),
      H1("3. SỐ TÀU ĐỒNG THỜI THEO TỪNG GIỜ"),
      H2("3.1. PK1 hiện hành so với PK1A + PK1B"),
      hourlyTable("PK1"),
      GAP(),
      H2("3.2. PK5 hiện hành so với PK5A + PK5B"),
      hourlyTable("PK5"),
      P("Cột \"Tổng 2 PK mới\" thường lớn hơn cột phân khu hiện hành vì một tàu bay nằm vắt qua ranh giới mới sẽ được tính ở cả hai phân khu trong cùng một giờ. Điều này phản ánh đúng thực tế khai thác: mỗi phân khu đều phải theo dõi tàu bay đó trong phần không phận của mình.", { i: 1, sz: 18 }),
      GAP(),

      new Paragraph({ children: [new PageBreak()] }),
      H1("4. CHỈ SỐ TẢI CÔNG VIỆC ATWI 24 GIỜ"),
      P("Áp dụng nguyên vẹn công thức, hệ số và ngưỡng của mô hình ATWI sẵn có trong hệ thống, cửa sổ 5 phút (giữ nguyên như các lần đánh giá trước để so sánh được). Ngưỡng: dưới 60% Bình thường, 60–75% Cần theo dõi, 75–90% Cao, từ 90% trở lên Quá tải."),
      GAP(),
      atwiTable(),
      GAP(),
      P(`Phân bố theo cửa sổ cho thấy khác biệt rõ nhất: PK5 hiện hành ở mức Quá tải trong ${a5.bandWindowCounts.critical}/${a5.totalWindows} cửa sổ (${(a5.bandWindowCounts.critical / a5.totalWindows * 100).toFixed(0)}% thời lượng ngày), trong khi PK5A sau tách còn ${a5a.bandWindowCounts.critical}/${a5a.totalWindows} (${(a5a.bandWindowCounts.critical / a5a.totalWindows * 100).toFixed(0)}%) và PK5B chỉ ${a5b.bandWindowCounts.critical}/${a5b.totalWindows}. Phía PK1, phân khu hiện hành có ${a1.bandWindowCounts.critical} cửa sổ Quá tải, còn PK1A chỉ ${a1a.bandWindowCounts.critical} và PK1B không có cửa sổ nào chạm ngưỡng Quá tải.`),
      P(`Giá trị trung vị bổ sung thêm một góc nhìn quan trọng: tải điển hình của PK5 hiện hành là ${a5.medianWindowAtwi.toFixed(1)}% (sát ngưỡng Cao), tức không phải thỉnh thoảng mới bận mà bận gần như thường trực.`),
      GAP(),

      H1("5. KIỂM TRA PHÂN CÁCH"),
      P("Kết quả: không có vi phạm phân cách nào được xác nhận trên cả 6 vị trí trong suốt 24 giờ.", { b: 1 }),
      P(`Kết quả này chỉ có được sau khi xử lý một hiện tượng rất dễ gây kết luận sai. Nếu chỉ áp thuần tiêu chí hình học 5 NM ngang / 1000 ft dọc, hệ thống báo tới ${totalDupExcluded} cặp nghi vấn (riêng PK5B là ${a5b.totalDuplicateTrackPairsExcluded} cặp). Kiểm tra trực tiếp từng cặp cho thấy:`),
      P("• Đại đa số là hai track của cùng một tàu bay: hệ thống xử lý giám sát phát song song một track có nhận dạng và một track chỉ có số hiệu. Các cặp này cách nhau 0,1–4,6 NM nhưng chênh cao chỉ 0–50 ft. Hai tàu bay thật không thể cùng mực bay cách nhau vài hải lý, lặp lại hàng chục lần trong một ngày."),
      P("• Các cặp thực sự là hai tàu bay khác nhau (xác định qua hai địa chỉ Mode-S khác nhau) đều chênh cao 925–975 ft — chính là phân cách cao RVSM 1000 ft hợp lệ, chỉ hiển thị thiếu vài chục foot do độ phân giải mực bay 25 ft và dao động quanh mực bay được cấp."),
      P("Do đó tiêu chí xác nhận vi phạm được siết lại, chỉ tính khi đồng thời: (1) hai track có hai địa chỉ Mode-S khác nhau, chứng minh là hai tàu bay riêng biệt; (2) cách nhau ngang dưới 5 NM; (3) chênh cao dưới 900 ft, tức trừ 100 ft dự phòng cho sai số đo. Tiêu chí này cố ý thận trọng theo hướng thà bỏ sót còn hơn quy kết nhầm."),
      GAP(),

      new Paragraph({ children: [new PageBreak()] }),
      H1("6. KỊCH BẢN MÔ PHỎNG MINH HỌA"),
      P("Khung giờ 11:50–12:30 UTC ngày 20/11/2026 (18:50–19:30 giờ Việt Nam) được chọn vì trùng cao điểm của PK5 hiện hành và PK5A. Lọc được 79 chuyến bay thực đi qua ít nhất một trong sáu vị trí, trong đó 76 chuyến đủ dữ liệu dựng kịch bản (13.832 lệnh điều khiển vị trí), đã chạy thành công qua bộ mô phỏng ở chế độ không giao diện với đầy đủ 76/76 tàu bay."),
      P("Lưu ý kỹ thuật: dữ liệu Cat062 là dữ liệu track đã tổng hợp từ nhiều nguồn cảm biến nên có khoảng trống cập nhật dài hơn dữ liệu giám sát thô — đo được tối đa 155,9 giây. Trong khoảng trống đó tàu bay mô phỏng bay thẳng theo hướng và tốc độ cũ nên lệch tạm thời tới khoảng 11 km, rồi tự khớp lại khi có bản tin mới. Hiện tượng này chỉ ảnh hưởng độ mượt khi xem lại mô phỏng; toàn bộ chỉ số KPI trong báo cáo được tính trực tiếp từ dữ liệu giám sát thực, không đi qua bộ mô phỏng, nên không bị ảnh hưởng."),
      GAP(),

      H1("7. KẾT LUẬN VÀ KIẾN NGHỊ"),
      P("1. Phương án tách PK5 là cần thiết và có hiệu quả rõ rệt. PK5 hiện hành vận hành ở mức tải Cao gần như thường trực, chạm ngưỡng Quá tải gần một nửa thời lượng trong ngày. Sau tách, không phân khu nào còn ở mức Cao tổng thể.", { b: 1 }),
      P("2. Phương án tách PK1 cũng cho kết quả tốt và đồng đều. Cả PK1A và PK1B sau tách đều về mức Bình thường, trong đó PK1B không còn cửa sổ nào chạm ngưỡng Quá tải."),
      P("3. Kiến nghị bố trí kíp trực cho PK5A tương đương hoặc cao hơn PK5B. Chênh lệch tải giữa hai phân khu sau tách còn đáng kể, và PK5A vẫn còn tỷ lệ cửa sổ Quá tải không nhỏ — tách phân khu giúp giảm tải nhưng chưa đưa PK5A về mức thoải mái."),
      P(`4. Lưu ý khi xếp ca trực: PK5A và PK5B bận cùng lúc (hệ số tương quan ${corr("PK5A New", "PK5B New").toFixed(2)}), không lệch pha, nên phải bố trí nhân lực đồng thời cho cả hai vào các khung cao điểm chung là khoảng 19 giờ, 02–03 giờ và 09–10 giờ (giờ Việt Nam). Khung 05–08 giờ là khoảng vắng chung của cả hai, có thể cân nhắc giảm biên chế hoặc gộp tạm thời.`),
      P("5. Kiến nghị lặp lại đánh giá này với thêm vài ngày dữ liệu khác nhau (ngày thường, cuối tuần, cao điểm lễ) trước khi dùng làm căn cứ ra quyết định chính thức — báo cáo này dựa trên một chu kỳ 24 giờ duy nhất."),
      GAP(),

      H1("8. GIỚI HẠN CỦA BÁO CÁO"),
      P("• Mô hình ATWI đang ở trạng thái dự thảo, chưa được phê duyệt dùng cho chỉ số chính thức, và các giá trị thời gian thao tác cơ sở đều ở mức giả định chưa hiệu chỉnh từ số liệu vận hành thật. Các con số ATWI nên dùng để SO SÁNH TƯƠNG ĐỐI giữa phương án hiện hành và phương án tách — là mục đích chính của báo cáo này — hơn là đọc như giá trị tuyệt đối."),
      P("• Kịch bản này là tái hiện vị trí bay thực, không có nhật ký lệnh điều hành thật của kiểm soát viên. Các tác vụ liên lạc (đổi hướng, đổi mực bay, đổi tốc độ) phải suy ra từ chính biến động quỹ đạo thật, nên một phần có thể là diễn biến bay bình thường chứ không phải can thiệp của kiểm soát viên. Theo hướng đó, các giá trị ATWI nêu trên thiên về cận trên."),
      P("• Mô hình tính theo một kiểm soát viên đảm nhiệm toàn bộ tác vụ của phân khu. Thực tế mỗi phân khu đường dài thường có kíp hai người chia sẻ công việc, nên mức tải thực tế trên mỗi người sẽ thấp hơn con số nêu trên."),
      P("• Ranh giới PK1A/PK1B/PK5A/PK5B lấy theo bảng tọa độ dự thảo đã được xác nhận. Hai đoạn ranh giới bám theo đường biên giới quốc gia và đường ranh giới vùng thông báo bay được vẽ thẳng giữa hai điểm do nguồn không cung cấp tọa độ chi tiết của đường biên."),
      P("• Dữ liệu chỉ gồm một chu kỳ 24 giờ của một ngày. Kết luận về tính mùa vụ, ngày trong tuần hay dịp cao điểm cần thêm dữ liệu."),
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(HERE, "BaoCao_KPI_24h_PK1_PK5_TruocSauTach.docx");
  fs.writeFileSync(out, buf);
  console.log("Da ghi", out);
});

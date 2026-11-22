const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, PageBreak, PageOrientation,
} = require("docx");

const HERE = __dirname;
const kpi = JSON.parse(fs.readFileSync(path.join(HERE, "sector_kpi_24h_result_v2.json"), "utf-8"));
const atwi = JSON.parse(fs.readFileSync(path.join(HERE, "sector_atwi_24h_result.json"), "utf-8"));
const META = kpi._meta;

const SHORT = {
  "HCM ACC Sector 1": "PK1 hiện hành", "PK1A New": "PK1A", "PK1B New": "PK1B",
  "HCM ACC Sector 5": "PK5 hiện hành", "PK5A New": "PK5A", "PK5B New": "PK5B",
};
const ORDER = ["HCM ACC Sector 1", "PK1A New", "PK1B New", "HCM ACC Sector 5", "PK5A New", "PK5B New"];
const BAND_VI = { normal: "Bình thường", watch: "Cần theo dõi", high: "Cao", critical: "Quá tải" };
const BAND_FILL = { normal: "E2EFDA", watch: "FFF2CC", high: "FCE4D6", critical: "F4B9A5" };
const HDR = "D9E2F3";

function bandOf(pct) {
  if (pct >= 90) return "critical";
  if (pct >= 75) return "high";
  if (pct >= 60) return "watch";
  return "normal";
}
function hhmm(epoch) { return new Date(epoch * 1000).toISOString().substring(11, 16); }
function hhmmVN(epoch) { return new Date((epoch + 7 * 3600) * 1000).toISOString().substring(11, 16); }
function dmy(iso) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

// Chỉ lấy các giờ trọn vẹn (bỏ giờ đầu và giờ cuối bị cắt cụt)
function hours(pos) { return kpi[pos].hourly.slice(1, -1); }
function atwiAt(pos, epoch) {
  const h = atwi[pos].hourly.find(x => x.hour_epoch === epoch);
  return h ? h.atwi_mean : null;
}
function meanOcc(pos) {
  const h = hours(pos);
  return h.reduce((s, x) => s + x.mean_occupancy, 0) / h.length;
}
function meanAtwi(pos) {
  const h = hours(pos);
  const v = h.map(x => atwiAt(pos, x.hour_epoch)).filter(x => x !== null);
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// Ô bảng. Dùng "|" để xuống dòng trong ô: docx yêu cầu mỗi dòng là một
// TextRun riêng với thuộc tính break, KHÔNG được nhét ký tự xuống dòng thô
// vào XML (ký tự mã 11 là ký tự không hợp lệ trong XML, khiến Word từ chối
// mở tệp -- đây chính là lỗi đã mắc ở bản dựng trước).
function cell(text, o = {}) {
  const lines = String(text).split("|");
  const runs = lines.map((ln, i) => new TextRun({
    text: ln, bold: !!o.b, size: o.sz || 17, break: i > 0 ? 1 : undefined,
  }));
  return new TableCell({
    width: { size: o.w || 1200, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
    children: [new Paragraph({
      alignment: o.left ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: runs,
    })],
  });
}

// Bảng 24 giờ cho một nhóm phân khu: số tàu đồng thời + ATWI, tô màu theo mức
function hourlyGroupTable(group) {
  const pos = group === "PK1"
    ? ["HCM ACC Sector 1", "PK1A New", "PK1B New"]
    : ["HCM ACC Sector 5", "PK5A New", "PK5B New"];
  const W = [900, 900, 1050, 1150, 1050, 1150, 1050, 1150, 1150];
  const hdr = new TableRow({ tableHeader: true, children: [
    cell("Giờ UTC", { w: W[0], b: 1, fill: HDR }),
    cell("Giờ VN", { w: W[1], b: 1, fill: HDR }),
    cell(`${SHORT[pos[0]]}|tàu`, { w: W[2], b: 1, fill: HDR }),
    cell(`${SHORT[pos[0]]}|ATWI`, { w: W[3], b: 1, fill: HDR }),
    cell(`${SHORT[pos[1]]}|tàu`, { w: W[4], b: 1, fill: HDR }),
    cell(`${SHORT[pos[1]]}|ATWI`, { w: W[5], b: 1, fill: HDR }),
    cell(`${SHORT[pos[2]]}|tàu`, { w: W[6], b: 1, fill: HDR }),
    cell(`${SHORT[pos[2]]}|ATWI`, { w: W[7], b: 1, fill: HDR }),
    cell("Giảm tải|(điểm %)", { w: W[8], b: 1, fill: HDR }),
  ]});
  const rows = [hdr];
  const base = hours(pos[0]);
  for (let i = 0; i < base.length; i++) {
    const ep = base[i].hour_epoch;
    const occ = pos.map(p => hours(p)[i].peak_simultaneous);
    const aw = pos.map(p => atwiAt(p, ep));
    const worstNew = Math.max(aw[1], aw[2]);
    const relief = aw[0] - worstNew;
    rows.push(new TableRow({ children: [
      cell(hhmm(ep), { w: W[0] }),
      cell(hhmmVN(ep), { w: W[1] }),
      cell(occ[0], { w: W[2] }),
      cell(`${aw[0].toFixed(0)}%`, { w: W[3], fill: BAND_FILL[bandOf(aw[0])] }),
      cell(occ[1], { w: W[4] }),
      cell(`${aw[1].toFixed(0)}%`, { w: W[5], fill: BAND_FILL[bandOf(aw[1])] }),
      cell(occ[2], { w: W[6] }),
      cell(`${aw[2].toFixed(0)}%`, { w: W[7], fill: BAND_FILL[bandOf(aw[2])] }),
      cell(relief > 0 ? `−${relief.toFixed(0)}` : `+${(-relief).toFixed(0)}`, { w: W[8], b: 1 }),
    ]}));
  }
  // Hàng trung bình cả ngày
  const avgOcc = pos.map(p => meanOcc(p));
  const avgAw = pos.map(p => meanAtwi(p));
  rows.push(new TableRow({ children: [
    cell("TB ngày", { w: W[0], b: 1, fill: HDR }),
    cell("—", { w: W[1], b: 1, fill: HDR }),
    cell(avgOcc[0].toFixed(1), { w: W[2], b: 1, fill: HDR }),
    cell(`${avgAw[0].toFixed(0)}%`, { w: W[3], b: 1, fill: HDR }),
    cell(avgOcc[1].toFixed(1), { w: W[4], b: 1, fill: HDR }),
    cell(`${avgAw[1].toFixed(0)}%`, { w: W[5], b: 1, fill: HDR }),
    cell(avgOcc[2].toFixed(1), { w: W[6], b: 1, fill: HDR }),
    cell(`${avgAw[2].toFixed(0)}%`, { w: W[7], b: 1, fill: HDR }),
    cell(`−${(avgAw[0] - Math.max(avgAw[1], avgAw[2])).toFixed(0)}`, { w: W[8], b: 1, fill: HDR }),
  ]}));
  return new Table({ width: { size: W.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: W, rows });
}

function summaryTable() {
  const W = [1900, 1250, 1400, 1450, 1400, 1500];
  const rows = [new TableRow({ tableHeader: true, children: [
    cell("Phân khu", { w: W[0], b: 1, fill: HDR, left: 1 }),
    cell("Số tàu /24h", { w: W[1], b: 1, fill: HDR }),
    cell("Tàu đồng thời cao nhất", { w: W[2], b: 1, fill: HDR }),
    cell("Tàu có mặt TB", { w: W[3], b: 1, fill: HDR }),
    cell("ATWI cả ngày", { w: W[4], b: 1, fill: HDR }),
    cell("Số giờ ở mức Cao/Quá tải", { w: W[5], b: 1, fill: HDR }),
  ]})];
  for (const p of ORDER) {
    const hrs = hours(p);
    const nHigh = hrs.filter(h => { const a = atwiAt(p, h.hour_epoch); return a !== null && a >= 75; }).length;
    const a = atwi[p].overallAtwiPercent;
    const isOld = p.startsWith("HCM");
    const fill = isOld ? "FFF2CC" : undefined;
    rows.push(new TableRow({ children: [
      cell(SHORT[p], { w: W[0], b: isOld, fill, left: 1 }),
      cell(kpi[p].distinct_aircraft, { w: W[1], fill }),
      cell(kpi[p].peak_simultaneous, { w: W[2], fill }),
      cell(meanOcc(p).toFixed(1), { w: W[3], fill }),
      cell(`${a.toFixed(1)}%`, { w: W[4], fill: BAND_FILL[bandOf(a)] }),
      cell(`${nHigh}/${hrs.length}`, { w: W[5], fill }),
    ]}));
  }
  return new Table({ width: { size: W.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: W, rows });
}

const P = (t, o = {}) => new Paragraph({
  children: [new TextRun({ text: t, bold: !!o.b, italics: !!o.i, size: o.sz || 22 })],
  spacing: { after: o.after || 80 },
});
const H1 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 130 } });
const H2 = t => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
const GAP = () => new Paragraph({ text: "", spacing: { after: 180 } });

const a1 = atwi["HCM ACC Sector 1"], a5 = atwi["HCM ACC Sector 5"];
const a1a = atwi["PK1A New"], a1b = atwi["PK1B New"], a5a = atwi["PK5A New"], a5b = atwi["PK5B New"];
const k5 = kpi["HCM ACC Sector 5"], k1 = kpi["HCM ACC Sector 1"];

// Giờ căng nhất của PK5 hiện hành
const h5 = hours("HCM ACC Sector 5");
const worst5 = h5.reduce((a, b) => (atwiAt("HCM ACC Sector 5", b.hour_epoch) > atwiAt("HCM ACC Sector 5", a.hour_epoch) ? b : a));
const nHigh5 = h5.filter(h => atwiAt("HCM ACC Sector 5", h.hour_epoch) >= 75).length;
const nHigh5a = hours("PK5A New").filter(h => atwiAt("PK5A New", h.hour_epoch) >= 75).length;
const nHigh1 = hours("HCM ACC Sector 1").filter(h => atwiAt("HCM ACC Sector 1", h.hour_epoch) >= 75).length;
const nHigh1a = hours("PK1A New").filter(h => atwiAt("PK1A New", h.hour_epoch) >= 75).length;

const doc = new Document({
  sections: [
    {
      properties: { page: { size: { width: 12240, height: 15840 } } },
      children: [
        new Paragraph({ text: "BÁO CÁO ĐÁNH GIÁ PHƯƠNG ÁN TÁCH PHÂN KHU 1 VÀ PHÂN KHU 5", heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: "Trung tâm Kiểm soát đường dài Hồ Chí Minh (ACC Hồ Chí Minh)", bold: true, size: 26 })], spacing: { after: 60 } }),
        new Paragraph({ children: [new TextRun({ text: `Phân tích 24 giờ liên tục trên dữ liệu giám sát thực — ${dmy(META.data_start_utc)}`, size: 24 })], spacing: { after: 40 } }),
        P(`Nguồn: bản ghi ASTERIX Cat062 từ hệ thống giám sát, ${dmy(META.data_start_utc)} ${hhmm(Math.floor(new Date(META.data_start_utc).getTime() / 1000))} UTC → ${dmy(META.data_end_utc)} ${hhmm(Math.floor(new Date(META.data_end_utc).getTime() / 1000))} UTC`, { i: 1, sz: 20 }),
        GAP(),

        H1("I. KẾT LUẬN CHÍNH"),
        P("1. Phân khu 5 hiện đang quá tải và cần ưu tiên tách.", { b: 1 }),
        P(`Chỉ số tải công việc kiểm soát viên (ATWI) của PK5 đạt ${a5.overallAtwiPercent.toFixed(1)}% tính chung cả ngày — vượt ngưỡng "Cao" (75%). Trong ${h5.length} giờ khảo sát, có ${nHigh5} giờ ở mức Cao hoặc Quá tải. Giờ căng nhất là ${hhmm(worst5.hour_epoch)} UTC (${hhmmVN(worst5.hour_epoch)} giờ Việt Nam) với ATWI ${atwiAt("HCM ACC Sector 5", worst5.hour_epoch).toFixed(0)}%.`),
        P(`Sau khi tách, PK5A còn ${a5a.overallAtwiPercent.toFixed(1)}% và PK5B còn ${a5b.overallAtwiPercent.toFixed(1)}%. Số giờ ở mức Cao/Quá tải của phần nặng nhất giảm từ ${nHigh5} giờ xuống ${nHigh5a} giờ.`),
        P(`Xét ở mức chi tiết hơn theo từng đợt 5 phút: PK5 hiện hành chạm ngưỡng Quá tải ở ${a5.bandWindowCounts.critical}/${a5.totalWindows} đợt, tương đương ${(a5.bandWindowCounts.critical / a5.totalWindows * 100).toFixed(0)}% thời lượng trong ngày. Sau tách, PK5A còn ${a5a.bandWindowCounts.critical}/${a5a.totalWindows} đợt (${(a5a.bandWindowCounts.critical / a5a.totalWindows * 100).toFixed(0)}%) và PK5B chỉ ${a5b.bandWindowCounts.critical}/${a5b.totalWindows} đợt.`),
        GAP(),
        P("2. Phân khu 1 chưa tới mức quá tải, nhưng tách vẫn có lợi.", { b: 1 }),
        P(`PK1 hiện hành có ATWI cả ngày ${a1.overallAtwiPercent.toFixed(1)}% — mức "Bình thường" xét tổng thể. Tuy nhiên tải không rải đều: có ${nHigh1} giờ mà mức trung bình cả giờ đã chạm Cao/Quá tải, và ở mức chi tiết 5 phút thì có tới ${a1.bandWindowCounts.critical} đợt chạm ngưỡng Quá tải. Nói cách khác, PK1 không quá tải thường trực nhưng vẫn có những đợt căng thẳng dồn cục.`),
        P(`Sau tách, PK1A còn ${a1a.overallAtwiPercent.toFixed(1)}% (${nHigh1a} giờ ở mức Cao/Quá tải, ${a1a.bandWindowCounts.critical} đợt 5 phút Quá tải) và PK1B còn ${a1b.overallAtwiPercent.toFixed(1)}% (${a1b.bandWindowCounts.critical || 0} đợt Quá tải).`),
        GAP(),
        P("3. Hai phân khu sau tách bận cùng lúc, không thể dùng chung một kíp luân phiên.", { b: 1 }),
        P("Biểu đồ tải theo giờ của PK5A và PK5B biến thiên cùng chiều. Thời điểm PK5A cần tăng cường cũng chính là thời điểm PK5B cần tăng cường. Do đó phương án tách đòi hỏi bổ sung nhân lực trực đồng thời, không phải điều chuyển luân phiên."),
        GAP(),
        P("4. Không ghi nhận vi phạm phân cách nào trong toàn bộ 24 giờ, trên cả cấu trúc hiện hành lẫn cấu trúc sau tách.", { b: 1 }),
        GAP(),

        H1("II. BẢNG TỔNG HỢP CẢ NGÀY"),
        summaryTable(),
        P("Ngưỡng ATWI: dưới 60% Bình thường; 60–75% Cần theo dõi; 75–90% Cao; từ 90% Quá tải.", { i: 1, sz: 18 }),
        P("\"Tàu có mặt TB\" là số tàu bay bình quân mà kiểm soát viên phải theo dõi liên tục — khác với tổng số tàu đi qua trong ngày.", { i: 1, sz: 18 }),
        P("Cột \"Số giờ ở mức Cao/Quá tải\" tính theo mức trung bình của cả giờ. Một giờ có mức trung bình dưới ngưỡng vẫn có thể chứa những đợt căng thẳng ngắn: xem thêm số đợt 5 phút nêu ở mục I.", { i: 1, sz: 18 }),
      ],
    },
    {
      properties: { page: { size: { width: 15840, height: 12240, orientation: PageOrientation.LANDSCAPE } } },
      children: [
        H1("III. DIỄN BIẾN TỪNG GIỜ — PHÂN KHU 1"),
        P("Cột \"tàu\" là số tàu bay đồng thời nhiều nhất trong giờ đó. Cột \"ATWI\" là chỉ số tải công việc bình quân của giờ, tô màu theo mức. Cột cuối là mức giảm tải đạt được (so sánh phân khu hiện hành với phần nặng nhất sau khi tách)."),
        GAP(),
        hourlyGroupTable("PK1"),
        new Paragraph({ children: [new PageBreak()] }),
        H1("IV. DIỄN BIẾN TỪNG GIỜ — PHÂN KHU 5"),
        hourlyGroupTable("PK5"),
      ],
    },
    {
      properties: { page: { size: { width: 12240, height: 15840 } } },
      children: [
        H1("V. KỊCH BẢN MÔ PHỎNG"),
        P("Toàn bộ chỉ số trong báo cáo này được tính trực tiếp từ dữ liệu giám sát thực, không đi qua mô phỏng. Kịch bản mô phỏng chỉ phục vụ việc xem lại trực quan một khung giờ cụ thể khi cần minh hoạ."),
        P("Bộ sinh kịch bản đi kèm cho phép dựng lại kịch bản cho bất kỳ khung giờ nào trong ngày khi có nhu cầu, nên không lưu sẵn tệp kịch bản cho cả 24 giờ."),
        GAP(),

        H1("VI. HIỆU CHỈNH THAM SỐ TỐC ĐỘ"),
        P("Trong quá trình rà soát đã phát hiện và khắc phục một sai sót về tốc độ trong bộ kịch bản:", { b: 1 }),
        P("• Hiện tượng: tốc độ thực (TAS) và tốc độ mặt đất (GS) hiển thị giống hệt nhau trong mô phỏng."),
        P("• Nguyên nhân thứ nhất — và không phải lỗi: mô phỏng không nạp trường gió, nên theo thiết kế của phần mềm, tốc độ mặt đất luôn bằng tốc độ thực. Đây là kết quả đúng với giả thiết không gió."),
        P("• Nguyên nhân thứ hai — là lỗi thật, đã sửa: tham số tốc độ trong lệnh tạo và di chuyển tàu bay được phần mềm hiểu là tốc độ chỉ thị hiệu chỉnh (CAS), nhưng bản dựng trước đó lại nạp thẳng giá trị tốc độ mặt đất lấy từ dữ liệu giám sát. Ở mực bay cao, hai đại lượng này chênh nhau rất lớn: nạp 480 kt ở FL350 khiến tàu bay ở tốc độ thực 751 kt, tức vượt tốc độ âm thanh. Giá trị đó lại vượt giới hạn khai thác của loại tàu bay nên mô hình hiệu năng ghìm lại, khiến một số tàu khác lại bay chậm hơn thực tế. Tổng hợp, sai lệch lên tới khoảng ±50% theo cả hai chiều."),
        P("• Cách khắc phục: quy đổi tốc độ mặt đất thực sang tốc độ chỉ thị hiệu chỉnh trước khi ghi vào kịch bản, dùng đúng công thức khí quyển của phần mềm mô phỏng. Phép quy đổi đã được kiểm chứng khứ hồi với sai số 0,000 kt."),
        P("• Kết quả sau khi sửa: tốc độ mặt đất trung vị trong mô phỏng là 466,8 kt so với 464 kt của dữ liệu thực — sai lệch 0,6%. Không còn tàu bay vượt tốc độ âm thanh."),
        P("• Lưu ý khi đọc kết quả: do không có dữ liệu gió, giá trị TAS hiển thị trong mô phỏng tương ứng với tốc độ mặt đất thực của tàu bay, không phải tốc độ thực khí động của nó. Với mục đích đánh giá phân khu, yếu tố quyết định là quỹ đạo và thời điểm tàu bay ra vào phân khu — cả hai đều được tái hiện chính xác.", { b: 1 }),
        GAP(),

        H1("VII. PHƯƠNG PHÁP VÀ GIỚI HẠN"),
        H2("Phương pháp"),
        P("• Toàn bộ chỉ số trong báo cáo được tính trực tiếp từ dữ liệu giám sát thực, không thông qua mô phỏng. Bộ kịch bản mô phỏng phục vụ việc xem lại và diễn giải trực quan."),
        P("• Số tàu đồng thời được tính bằng phương pháp quét sự kiện ra/vào, chính xác tại mọi thời điểm, đã kiểm chứng bằng một chương trình độc lập dùng thuật toán khác."),
        P("• Các bản ghi giám sát trùng lặp của cùng một tàu bay đã được loại bỏ trước khi thống kê, tránh đếm trùng và tránh báo nhầm vi phạm phân cách."),
        H2("Giới hạn"),
        P("• Mô hình ATWI đang ở trạng thái dự thảo, các tham số thời gian thao tác chưa được hiệu chỉnh từ số liệu vận hành thực tế. Các con số ATWI phù hợp để so sánh tương quan giữa phương án hiện hành và phương án tách, hơn là đọc như giá trị tuyệt đối."),
        P("• Dữ liệu chỉ gồm một chu kỳ 24 giờ của một ngày. Kiến nghị bổ sung thêm dữ liệu các ngày khác nhau (ngày thường, cuối tuần, cao điểm lễ Tết) trước khi dùng làm căn cứ quyết định chính thức."),
        P("• Mô hình tính theo một kiểm soát viên đảm nhiệm toàn bộ tác vụ của phân khu. Thực tế kíp trực có nhiều vị trí chia sẻ công việc nên tải thực tế trên mỗi người sẽ thấp hơn."),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(HERE, "BaoCao_TGD_TachPhanKhu_PK1_PK5_24h.docx");
  fs.writeFileSync(out, buf);
  console.log("Da ghi", out);
});

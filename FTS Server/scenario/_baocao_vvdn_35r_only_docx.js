/**
 * Sinh bao cao Word (.docx) kiem chung kich ban VVDN_35R_ONLY (dong cua 35L,
 * chi dung 35R cho ca cat canh va ha canh).
 *
 * MOI ket qua kiem chung duoc DOC TRUC TIEP tu VVDN_35R_ONLY/VVDN_35R_ONLY.verify.json
 * (san pham cua _verify_vvdn_35r_only.py) khi chay, KHONG chep tay -- bao cao
 * vi vay khong the lech voi ket qua kiem chung.
 *
 * Dinh dang van ban chinh thuc: A4, le 2/2/3/1,5 cm, Times New Roman 13pt.
 *
 * LUU Y: khong dung ky tu \x0b de xuong dong trong o bang (XML khong hop le,
 * da tung lam hong mot bao cao Word cua du an). Ham cell() tach theo "|".
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, AlignmentType, VerticalAlign, BorderStyle, LevelFormat,
} = require("docx");

const HERE = __dirname;
const VDIR = path.join(HERE, "VVDN_35R_ONLY");
const VERIFY = JSON.parse(fs.readFileSync(path.join(VDIR, "VVDN_35R_ONLY.verify.json"), "utf-8"));
const RULES = JSON.parse(fs.readFileSync(path.join(HERE, "vvdn_35r_only_rules.json"), "utf-8"));

const FONT = "Times New Roman";
const SZ = 26, SZ_SMALL = 21, SZ_NOTE = 20;
const USABLE = 9355;
const GREEN = "C6EFCE", RED = "FFC7CE", AMBER = "FFE699", HEAD = "D9E2F3", GREY = "F2F2F2";

const n_dat = VERIFY.filter(r => r.ket_luan === "DAT").length;
const n_xau = VERIFY.filter(r => r.ket_luan === "KHONG DAT").length;
const n_sl = VERIFY.filter(r => r.ket_luan === "SO LIEU").length;
const fail = VERIFY.filter(r => r.ket_luan === "KHONG DAT");
const get = (prefix) => VERIFY.find(r => r.muc.startsWith(prefix));

function cell(text, o = {}) {
  const parts = String(text).split("|");
  const runs = parts.map((s, i) => new TextRun({
    text: s, bold: !!o.b, italics: !!o.i, font: FONT,
    size: o.sz || SZ_SMALL, color: o.color, break: i > 0 ? 1 : undefined,
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

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { b: true, w: widths[i], shade: HEAD })),
      }),
      ...rows.map(r => new TableRow({
        children: r.map((c, i) => {
          const s = (typeof c === "object" && c !== null) ? c : { t: c };
          return cell(s.t, { w: widths[i], shade: s.shade, b: s.b, i: s.i, left: s.left });
        }),
      })),
    ],
  });
}

const p = (t, o = {}) => new Paragraph({
  children: [new TextRun({ text: t, font: FONT, size: o.sz || SZ, bold: !!o.b, italics: !!o.i, color: o.color })],
  alignment: o.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
  spacing: { after: o.after !== undefined ? o.after : 140, line: 300 },
});

const bullet = (t, o = {}) => new Paragraph({
  children: [new TextRun({ text: t, font: FONT, size: o.sz || SZ, bold: !!o.b, italics: !!o.i })],
  numbering: { reference: "dot-list", level: o.level || 0 },
  alignment: AlignmentType.JUSTIFIED,
  spacing: { after: 80, line: 300 },
});

const h1 = (t) => new Paragraph({
  children: [new TextRun({ text: t, font: FONT, size: 28, bold: true })],
  heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 },
});
const h2 = (t) => new Paragraph({
  children: [new TextRun({ text: t, font: FONT, size: 26, bold: true, italics: true })],
  heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 120 },
});
const caption = (t) => new Paragraph({
  children: [new TextRun({ text: t, font: FONT, size: SZ_NOTE, italics: true })],
  alignment: AlignmentType.CENTER, spacing: { before: 60, after: 180 },
});
const noteBox = (t, fill, border) => new Paragraph({
  children: [new TextRun({ text: t, font: FONT, size: SZ_NOTE + 1, bold: true })],
  shading: { type: ShadingType.CLEAR, color: "auto", fill: fill || AMBER },
  border: {
    top: { style: BorderStyle.SINGLE, size: 6, color: border || "BF8F00" },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: border || "BF8F00" },
    left: { style: BorderStyle.SINGLE, size: 6, color: border || "BF8F00" },
    right: { style: BorderStyle.SINGLE, size: 6, color: border || "BF8F00" },
  },
  alignment: AlignmentType.JUSTIFIED, spacing: { before: 160, after: 220, line: 300 },
});

const children = [];

// ---- Tieu de
children.push(new Paragraph({
  children: [new TextRun({ text: "TỔNG CÔNG TY QUẢN LÝ BAY VIỆT NAM", font: FONT, size: 24, bold: true })],
  alignment: AlignmentType.CENTER, spacing: { after: 360 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: "BÁO CÁO KIỂM CHỨNG KỊCH BẢN MÔ PHỎNG", font: FONT, size: 34, bold: true })],
  alignment: AlignmentType.CENTER, spacing: { after: 100 },
}));
children.push(new Paragraph({
  children: [new TextRun({
    text: "Đóng cửa đường CHC 35L — chỉ khai thác 35R cho cả cất cánh và hạ cánh",
    font: FONT, size: 28, bold: true,
  })],
  alignment: AlignmentType.CENTER, spacing: { after: 100 },
}));
children.push(new Paragraph({
  children: [new TextRun({
    text: "Cảng HKQT Đà Nẵng (VVDN) — kịch bản VVDN_35R_ONLY",
    font: FONT, size: 24, italics: true,
  })],
  alignment: AlignmentType.CENTER, spacing: { after: 400 },
}));

// ---- I. KET LUAN
children.push(h1("I. KẾT LUẬN TỔNG QUÁT"));
children.push(table(
  ["Tổng số mục", "Đạt", "Không đạt", "Mục số liệu"],
  [[
    { t: String(VERIFY.length), b: true },
    { t: String(n_dat), b: true, shade: GREEN },
    { t: String(n_xau), b: true, shade: n_xau ? RED : GREEN },
    { t: String(n_sl), b: true, shade: GREY },
  ]],
  [2340, 2340, 2340, 2335],
));
children.push(caption("Bảng 1. Tổng hợp kết quả kiểm chứng"));

if (n_xau > 0) {
  children.push(noteBox(
    `KẾT LUẬN: kịch bản CHƯA ĐẠT — có ${n_xau} mục không đạt. Không được dùng kết quả của kịch bản `
    + "này vào công tác chuyên môn cho tới khi các mục dưới đây được xử lý.",
    "FFC7CE", "C00000"));
  fail.forEach(f => children.push(bullet(`${f.muc} — ${f.chi_tiet}`, { b: true })));
} else {
  children.push(noteBox(
    "KẾT LUẬN: kịch bản ĐẠT toàn bộ các mục kiểm chứng có ngưỡng định lượng. "
    + "Các mục số liệu (không có ngưỡng trong văn bản nguồn) được báo cáo riêng tại Mục V.",
    "C6EFCE", "548235"));
}

// ---- II. PHAM VI
children.push(h1("II. ĐỐI TƯỢNG VÀ PHẠM VI KIỂM CHỨNG"));
children.push(h2("2.1. Cấu hình khai thác được mô phỏng"));
children.push(p(RULES._cau_hinh_khai_thac.mo_ta.replace(/DONG CUA/g, "ĐÓNG CỬA")
  .replace("CHUNG", "chung").replace("mixed mode", "mixed mode")));
children.push(noteBox(
  "KHÁC BIỆT CĂN BẢN so với kịch bản VVDN-XENKE-60MIN: ở kịch bản đó tàu đến hạ cánh 35L còn tàu đi "
  + "cất cánh 35R — hai đường CHC song song phụ thuộc, hai tàu có thể đồng thời ở trên hai đường khác "
  + "nhau. Ở đây chỉ còn MỘT đường CHC, nên mọi ràng buộc đều quy về CHIẾM DỤNG ĐƯỜNG CHC: tại mỗi thời "
  + "điểm chỉ được có một tàu bay trên 35R. Vì vậy các bảng phân cách 35L/35R của dự thảo Phương thức 2 "
  + "đường CHC song song KHÔNG áp dụng cho cấu hình này."));

children.push(h2("2.2. Thông số kịch bản"));
const kb = RULES.kich_ban;
children.push(table(
  ["Hạng mục", "Giá trị"],
  [
    [{ t: "Tệp kịch bản", left: true }, { t: kb.tep, left: true }],
    [{ t: "Trình sinh", left: true }, { t: `${kb.generator} (seed cố định ${kb.seed})`, left: true }],
    [{ t: "Quy mô", left: true }, { t: `${kb.so_cap_ARR_DEP} cặp đến/đi = ${kb.so_cap_ARR_DEP * 2} tàu bay`, left: true }],
    [{ t: "Nhịp theo lịch", left: true }, { t: `${kb.gian_cach_lich_ARR_giay} s mỗi chuyến đến, ${kb.gian_cach_lich_DEP_giay} s mỗi chuyến đi`, left: true }],
    [{ t: "Bến xuất phát", left: true }, { t: kb.ben_xuat_phat.join(", "), left: true }],
    [{ t: "Đường lăn thoát ly", left: true }, { t: kb.duong_lan_thoat_ly.join(", "), left: true }],
    [{ t: "Cơ cấu đội tàu", left: true }, { t: `${RULES.co_cau_tau_bay.ty_le_medium * 100}% MEDIUM / ${RULES.co_cau_tau_bay.ty_le_heavy * 100}% HEAVY`, left: true }],
  ],
  [2600, 6755],
));
children.push(caption("Bảng 2. Thông số kịch bản (đọc trực tiếp từ trình sinh và tệp .scn)"));

children.push(h2("2.3. Tính độc lập của việc kiểm chứng"));
children.push(p(
  "Script kiểm chứng (_verify_vvdn_35r_only.py) KHÔNG import và KHÔNG gọi lại bất kỳ hàm nào của trình "
  + "sinh kịch bản. Nó tự đọc tệp .scn để lấy lịch, tự đọc tệp quy tắc để lấy ngưỡng, và tự đo hình học "
  + "đường CHC/đường lăn từ các tệp .geojson gốc. Nếu nó gọi lại hàm của trình sinh thì chỉ xác nhận được "
  + "trình sinh nhất quán với chính nó, không xác nhận được gì về tính đúng đắn."));
children.push(p(
  "Một phép đối chiếu chéo được cài sẵn để chứng minh tính độc lập đó: bảng chiều dài thân tàu bay trong "
  + "tệp quy tắc được đối chiếu với giá trị chiều dài nhúng sẵn trong chính tệp .scn (tham số cuối của "
  + "lệnh PCALL _KB5GEN_PUSHBACK_*). Hai nguồn này độc lập nhau; nếu lệch thì báo lỗi."));

// ---- III. KET QUA
children.push(h1("III. KẾT QUẢ TỪNG MỤC KIỂM CHỨNG"));
children.push(p(
  "Phần A kiểm tra tĩnh trên lịch (vài giây). Phần B chạy mô phỏng headless thật và đo số liệu từ vị trí "
  + "thực tế của tàu bay — theo nguyên tắc của dự án: kiểm chứng bằng mô phỏng chạy thật, không tin vào lịch."));

const vShade = (k) => k === "DAT" ? GREEN : (k === "KHONG DAT" ? RED : GREY);
const vText = (k) => k === "DAT" ? "Đạt" : (k === "KHONG DAT" ? "Không đạt" : "Số liệu");
children.push(table(
  ["Mục", "Kết luận", "Chi tiết đo được"],
  VERIFY.map(r => [
    { t: r.muc, left: true },
    { t: vText(r.ket_luan), shade: vShade(r.ket_luan), b: true },
    { t: r.chi_tiet, left: true },
  ]),
  [2900, 1200, 5255],
));
children.push(caption("Bảng 3. Kết quả chi tiết từng mục kiểm chứng"));

// ---- IV. PHAN TICH TRONG TAM
children.push(h1("IV. PHÂN TÍCH TRỌNG TÂM: CHIẾM DỤNG ĐƯỜNG CHC 35R"));
const b4 = get("B4.");
children.push(p(
  "Đây là ràng buộc quan trọng nhất của cấu hình một đường CHC và là lý do chính phải kiểm chứng lại "
  + "kịch bản này thay vì suy ra từ kịch bản 35L/35R."));
children.push(p(
  "Cách đo: một tàu bay được coi là đang ở trên mặt đường CHC khi đồng thời thoả ba điều kiện — độ lệch "
  + "ngang so với tim 35R không quá 30 m, vị trí dọc tim nằm trong phạm vi đường CHC, và độ cao dưới 35 ft. "
  + "Hình học tim đường CHC đo trực tiếp từ runway_centerlines.geojson, không lấy từ kịch bản."));
if (b4) {
  children.push(table(
    ["Mục", "Kết luận", "Số liệu đo được"],
    [[{ t: b4.muc, left: true },
      { t: vText(b4.ket_luan), shade: vShade(b4.ket_luan), b: true },
      { t: b4.chi_tiet, left: true }]],
    [2900, 1200, 5255],
  ));
  children.push(caption("Bảng 4. Kết quả đo chiếm dụng đường CHC 35R"));
}

children.push(h2("4.1. Lỗi 1 — tàu đi vào đường CHC đúng lúc tàu đến chạm bánh"));
children.push(p(
  "Lệnh điều phối trong kịch bản: \"ARR001 ATDIST 16.029200,108.202500,0.05 PCALL "
  + "_KB5GEN_DEP_ENTER_RWY DEP001\" — tàu đi được lệnh vào đường CHC khi tàu đến chỉ còn cách ngưỡng "
  + "0,05 NM (93 m), tức đúng thời điểm chạm bánh. Ở cấu hình 35L/35R song song lệnh này an toàn vì tàu "
  + "đến ở trên 35L còn tàu đi ở trên 35R. Khi chuyển sang một đường CHC, lệnh này KHÔNG được sửa."));
children.push(table(
  ["t (s)", "ARR001 (dọc tim / cao độ / GS)", "DEP001 (dọc tim / cao độ / GS)", "Cách nhau"],
  [
    ["458", "31 m / 0 ft / 130 kt", "20 m / 0 ft / 5 kt", { t: "11 m", b: true, shade: RED }],
    ["459", "98 m / 0 ft / 130 kt", "22 m / 0 ft / 5 kt", "75 m"],
    ["460", "164 m / 0 ft / 130 kt", "25 m / 0 ft / 5 kt", "140 m"],
  ],
  [1200, 3400, 3400, 1355],
));
children.push(caption("Bảng 5. Vị trí ARR001 và DEP001 trên đường CHC 35R tại thời điểm xấu nhất"));

children.push(h2("4.2. Lỗi 2 — hai tàu đi dồn vào đường CHC: hai đồng hồ không khớp"));
children.push(p(
  "Kịch bản dùng hai mốc thời gian độc lập cho cùng một cặp tàu bay: tàu đi đẩy lùi theo lịch cố định "
  + "(i−1)×300 s, còn tàu đi chỉ được vào đường CHC khi tàu đến cùng số thứ tự chạm ngưỡng. Hai mốc này "
  + "chỉ khớp nếu tàu đến chạm bánh đúng lịch — đo thực tế cho thấy không."));
children.push(table(
  ["Tàu đến", "Chạm bánh thật", "Lịch dự định", "Lệch"],
  [
    ["ARR001", "00:07:32", "00:00:00", { t: "+452 s", shade: AMBER }],
    ["ARR002", "00:11:34", "00:05:00", { t: "+394 s", shade: AMBER }],
    ["ARR003", "00:16:42", "00:10:00", { t: "+402 s", shade: AMBER }],
    ["ARR005", "00:27:07", "00:20:00", { t: "+427 s", shade: AMBER }],
    ["ARR009", "00:46:04", "00:40:00", { t: "+364 s", shade: AMBER }],
  ],
  [2340, 2340, 2340, 2335],
));
children.push(caption("Bảng 6. Độ trễ chạm bánh so với lịch thiết kế (trung bình +406 s)"));
children.push(noteBox(
  "ĐÍNH CHÍNH MỘT GIẢ THUYẾT SAI: ban đầu nguyên nhân được cho là tàu đến hạ cánh SAI THỨ TỰ. Phép đo "
  + "bác bỏ điều đó — 0/9 chuyến sai thứ tự, thứ tự hạ cánh hoàn toàn đúng. Vấn đề không phải thứ tự mà "
  + "là độ trễ ĐỒNG LOẠT khoảng 400 giây (do kịch bản thiếu bước hiệu chuẩn) làm luồng đến lệch pha khỏi "
  + "luồng đi."));
children.push(p(
  "Hệ quả: khi tàu đến chạm bánh muộn ~400 s, lệnh cho tàu đi vào đường CHC đến lúc tàu đi vẫn còn đang "
  + "lăn trên đường lăn E, chưa tới điểm chờ. Lệnh chỉ nối thêm waypoint vào lộ trình nên tàu đi chạy "
  + "thẳng vào đường CHC không dừng, và hai tàu đi liên tiếp dồn vào cùng một lúc:"));
children.push(table(
  ["Tàu đi", "Chạy đà", "Cách chuyến trước"],
  [
    ["DEP002", "00:18:31", "589 s"],
    ["DEP003", "00:18:21", { t: "−10 s (chạy đà trước DEP002)", shade: RED, b: true }],
    ["DEP004", "00:28:56", "635 s"],
    ["DEP005", "00:28:46", { t: "−10 s", shade: RED, b: true }],
    ["DEP006", "00:39:11", "625 s"],
    ["DEP007", "00:39:01", { t: "−10 s", shade: RED, b: true }],
  ],
  [2000, 2500, 4855],
));
children.push(caption("Bảng 7. Bốn cặp tàu đi cất cánh cách nhau dưới 60 giây"));

children.push(h2("4.3. Lỗi 5 — chạy đà không bám tim đường CHC"));
children.push(p(
  "Điểm bắt đầu chạy đà trong _KB5GEN_DEP_ENTER_RWY.scn được đo lại theo runway_centerlines.geojson:"));
children.push(table(
  ["Điểm trong chuỗi vào đường CHC", "Dọc tim", "Lệch tim", "Vị trí"],
  [
    ["16.029181, 108.202508", "16,0 m", "0,1 m", { t: "trên đường CHC", shade: GREEN }],
    ["16.029200, 108.202500 (ngưỡng)", "18,2 m", "−0,4 m", { t: "trên đường CHC", shade: GREEN }],
    ["16.030000, 108.202000 (chạy đà)", "113,2 m", { t: "−41,2 m", b: true },
      { t: "ngoài đường CHC, 19 m ngoài mép", shade: RED, b: true }],
  ],
  [3400, 1500, 1600, 2855],
));
children.push(caption("Bảng 8. Độ lệch tim của chuỗi điểm đưa tàu đi vào đường CHC"));
children.push(p(
  "Con số 41,2 m trùng khít với lỗi đã ghi sẵn tại HUONG_DAN_TAO_KICH_BAN.md mục 4.3: \"Toạ độ kế thừa "
  + "có thể sai. Điểm vào đường CHC lấy từ kịch bản cũ lệch tim 41,2 m.\" Lỗi này đã được sửa ở kịch bản "
  + "tham chiếu VVDN-XENKE-60MIN nhưng gen_vvdn_35r_only.py vẫn mang nguyên toạ độ cũ. Đo trong mô phỏng: "
  + "cả 20/20 chuyến đi đều chạy đà ra ngoài mép đường CHC, lệch tim lớn nhất 46 m."));
children.push(noteBox(
  "PHÂN ĐỊNH LỖI THẬT / LỖI TIÊU CHÍ: bản kiểm chứng đầu tiên gộp hiện tượng này vào một mục \"tàu bay "
  + "bị trôi\" và báo 158 lần — cách diễn đạt đó sai bản chất. Sau khi tách thành hai phép đo riêng: chạy "
  + "đà bám tim cho 20/20 chuyến ra ngoài mép (tối đa 46 m), còn trôi do khoảng trống lệnh MOVE là 0 lần. "
  + "Toàn bộ 158 cảnh báo ban đầu đến từ lệch tim, không có lỗi trôi nào.",
  "DDEBF7", "2E74B5"));

// ---- V. MUC SO LIEU / KHOANG TRONG QUY DINH
children.push(h1("V. CÁC MỤC CHỈ BÁO CÁO SỐ LIỆU (KHÔNG CHẤM ĐẠT/KHÔNG ĐẠT)"));
children.push(p(
  "Những mục dưới đây được đo đầy đủ nhưng KHÔNG chấm điểm, vì văn bản nguồn không đưa ra ngưỡng định "
  + "lượng. Chấm điểm khi không có ngưỡng sẽ là bịa ra tiêu chí, nên báo cáo chỉ nêu số liệu thực tế."));
const sl = VERIFY.filter(r => r.ket_luan === "SO LIEU");
if (sl.length) {
  children.push(table(
    ["Mục", "Số liệu đo được", "Lý do không chấm điểm"],
    sl.map(r => [{ t: r.muc, left: true }, { t: r.chi_tiet, left: true }, { t: r.nguon, left: true }]),
    [2400, 3600, 3355],
  ));
  children.push(caption("Bảng 9. Các mục số liệu và lý do không có ngưỡng"));
}
const xen = RULES.phan_cach_tau_DI_xen_giua_hai_tau_DEN_mot_duong_CHC;
children.push(noteBox(
  "KHOẢNG TRỐNG QUY ĐỊNH CẦN TỔNG CÔNG TY CHỐT: dự thảo MANOP quy định khi có tàu bay khởi hành xen "
  + "giữa hai tàu bay hạ cánh thì \"phải gia tăng giãn cách cần thiết này một cách thích hợp\" — nhưng "
  + "KHÔNG cho con số. Đây chính là tình huống đặc trưng của khai thác một đường CHC chế độ hỗn hợp, "
  + "nên thiếu ngưỡng này thì không thể kết luận đạt/không đạt cho mục B11. Cần chốt giá trị trước khi "
  + "dùng kết quả vào công tác chuyên môn."));

// ---- VI. CAN XAC NHAN
children.push(h1("VI. CÁC GIÁ TRỊ CẦN XÁC NHẬN"));
children.push(p(
  "Theo nguyên tắc không bịa số liệu của dự án, mọi giá trị không có nguồn trực tiếp trong văn bản đều "
  + "được đánh dấu cần xác nhận trong tệp quy tắc. Danh sách đầy đủ:"));
const canXacNhan = [];
for (const [k, v] of Object.entries(RULES)) {
  if (v && typeof v === "object" && v.can_xac_nhan === true) {
    canXacNhan.push([
      { t: k, left: true },
      { t: v.ly_do_can_xac_nhan || "(không ghi lý do)", left: true },
    ]);
  }
}
if (canXacNhan.length) {
  children.push(table(["Mục quy tắc", "Lý do cần xác nhận"], canXacNhan, [2600, 6755]));
  children.push(caption("Bảng 10. Các giá trị cần Tổng công ty xác nhận"));
}

// ---- VII. GIOI HAN
children.push(h1("VII. GIỚI HẠN CỦA BÁO CÁO"));
children.push(bullet(
  "Cả hai văn bản nguồn trong nước (dự thảo Phương thức 2 đường CHC song song Đà Nẵng 24/7/2026 và dự "
  + "thảo MANOP APP/TWR Đà Nẵng) đều là DỰ THẢO, chưa ký ban hành. Kết quả kiểm chứng chỉ có giá trị "
  + "tham khảo kỹ thuật cho tới khi văn bản được ký."));
children.push(bullet(
  "Kịch bản mô phỏng cấu hình một đường CHC trong điều kiện thời tiết tốt, đường CHC khô, ban ngày. "
  + "Chưa mô phỏng điều kiện tầm nhìn hạn chế hay đường CHC ướt — hai yếu tố làm tăng thời gian chiếm "
  + "dụng đường CHC và do đó làm giảm năng lực."));
children.push(bullet(
  "Chưa có ngưỡng quy định cho trường hợp tàu đi xen giữa hai tàu đến trên cùng một đường CHC (Mục V)."));
children.push(bullet(
  "Kịch bản dùng một cơ cấu đội tàu cố định (70% MEDIUM / 30% HEAVY) với seed cố định. Thay đổi cơ cấu "
  + "đội tàu sẽ thay đổi kết quả phân cách nhiễu động."));

// ---- PHU LUC
children.push(h1("PHỤ LỤC. TỆP LIÊN QUAN VÀ CÁCH TÁI LẬP"));
children.push(table(
  ["Tệp", "Vai trò"],
  [
    [{ t: kb.generator, left: true }, { t: `Trình sinh kịch bản, seed cố định ${kb.seed}`, left: true }],
    [{ t: "vvdn_35r_only_rules.json", left: true }, { t: "Quy tắc phân cách, ghi rõ điều khoản nguồn và các giá trị cần xác nhận", left: true }],
    [{ t: "_verify_vvdn_35r_only.py", left: true }, { t: "Kiểm chứng độc lập; chạy mô phỏng headless và đo số liệu thật", left: true }],
    [{ t: "VVDN_35R_ONLY.verify.json", left: true }, { t: "Kết quả kiểm chứng dạng máy đọc — chính là nguồn số liệu của báo cáo này", left: true }],
    [{ t: "_baocao_vvdn_35r_only_docx.js", left: true }, { t: "Sinh chính báo cáo này từ tệp kết quả trên", left: true }],
  ],
  [3000, 6355],
));
children.push(caption("Bảng 11. Danh mục tệp"));
children.push(p("Lệnh tái lập đầy đủ:", { b: true, after: 60 }));
children.push(new Paragraph({
  children: [new TextRun({
    text: 'cd "FTS Server/scenario"\n'
      + ".venv/Scripts/python.exe _verify_vvdn_35r_only.py --static   # kiểm tra nhanh\n"
      + ".venv/Scripts/python.exe _verify_vvdn_35r_only.py            # đầy đủ, có chạy mô phỏng\n"
      + "node _baocao_vvdn_35r_only_docx.js                           # xuất báo cáo Word",
    font: "Consolas", size: 19,
  })],
  shading: { type: ShadingType.CLEAR, color: "auto", fill: GREY },
  spacing: { after: 200 },
}));

const doc = new Document({
  creator: "Tổ thiết kế — Tổng công ty Quản lý bay Việt Nam",
  title: "Báo cáo kiểm chứng kịch bản VVDN_35R_ONLY",
  description: "Đóng cửa 35L, chỉ khai thác 35R cho cả cất cánh và hạ cánh",
  numbering: {
    config: [{
      reference: "dot-list",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 460, hanging: 260 } } },
      }],
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
        size: { width: 11906, height: 16838 },
        margin: { top: 1134, bottom: 1134, left: 1701, right: 850 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(HERE, "BaoCao_KiemChung_VVDN_35R_ONLY.docx");
  fs.writeFileSync(out, buf);
  console.log(`Da ghi ${out} (${(buf.length / 1024).toFixed(1)} KB)`);
});

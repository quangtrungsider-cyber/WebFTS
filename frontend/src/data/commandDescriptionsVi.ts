/**
 * Vietnamese usage guidance shown under each row in the Command Palette
 * (CommandListView). Keyed by canonical command name AND every known
 * alias/synonym, so a lookup by whichever name the live server cmddict
 * uses always finds the same description.
 *
 * Sourced from the vendored BlueSky code (`FTS Server/bluesky/stack/basecmds.py`,
 * `@stack.command` docstrings across autopilot.py/route.py/traffic/asas/*.py/
 * datalog.py/simstack.py/plugins/area.py) and `FTS Server/docs/BLUESKY-COMMAND-TABLE.TXT` —
 * same research as "VATM-Engine-Command-Reference-VI.docx". Commands with no
 * confirmed source (STACKAT, SIMPLUGIN) are intentionally omitted rather than
 * guessed.
 */

const ENTRIES: Array<[string[], string]> = [
    [['IC', 'LOAD', 'OPEN'], 'Nạp kịch bản (initial condition): reset mô phỏng và mở file .scn. Gọi "IC IC" để nạp lại kịch bản vừa chạy.'],
    [['SAVEIC', 'SAVE'], 'Lưu lại toàn bộ trạng thái hiện tại (tàu bay, lệnh...) thành một file kịch bản mới.'],
    [['SCENARIO', 'SCEN'], 'Đặt tên kịch bản cho lần chạy hiện tại.'],
    [['BATCH'], 'Chạy một file kịch bản ở chế độ batch (chạy nền, không cần giao diện).'],
    [['BENCHMARK'], 'Chạy đo hiệu năng (benchmark) mô phỏng.'],
    [['PCALL', 'CALL'], 'Chèn (import) nội dung một file kịch bản khác vào kịch bản đang chạy, có thể lệch thời gian tương đối/tuyệt đối và truyền tham số %0,%1,...'],
    [['CD', 'CHDIR'], 'Đổi sang thư mục kịch bản khác.'],
    [['IMPORT'], 'Nhập dữ liệu kịch bản từ định dạng của bên thứ ba (không phải .scn chuẩn).'],
    [['RESET'], 'Reset toàn bộ mô phỏng về trạng thái ban đầu.'],
    [['OP', 'RUN', 'START', 'CONTINUE'], 'Bắt đầu/tiếp tục chạy mô phỏng (sau khi HOLD).'],
    [['HOLD', 'PAUSE'], 'Tạm dừng (hold) mô phỏng.'],
    [['FF', 'FWD'], 'Chạy nhanh (fast-forward) mô phỏng về phía trước một khoảng thời gian.'],
    [['DT'], 'Đặt bước thời gian (time step) của mô phỏng.'],
    [['DTMULT', 'RTF'], 'Đặt hệ số nhân tốc độ cho mô phỏng fast-time.'],
    [['FIXDT'], 'Cố định bước thời gian (tương thích với định dạng TMX cũ).'],
    [['REALTIME', 'RT'], 'Bật/tắt chạy theo thời gian thực (cho phép bước thời gian thay đổi).'],
    [['DATE'], 'Đặt ngày mô phỏng.'],
    [['TIME'], 'Đặt đồng hồ giờ mô phỏng.'],
    [['SCHEDULE'], 'Lên lịch để một lệnh stack được thực thi vào một thời điểm mô phỏng cụ thể.'],
    [['DELAY'], 'Trì hoãn thực thi một lệnh stack thêm một khoảng thời gian kể từ hiện tại.'],
    [['SEED'], 'Đặt seed cho mọi hàm dùng số ngẫu nhiên (ví dụ MCRE, NOISE).'],
    [['ADDNODES'], 'Thêm (các) node/instance mô phỏng mới.'],

    [['CRE', 'CREATE'], 'Tạo một tàu bay mới.'],
    [['MCRE'], 'Tạo ngẫu nhiên nhiều (n) tàu bay trong khu vực đang xem.'],
    [['CRECMD'], 'Thêm một lệnh sẽ tự động được gán cho mỗi tàu bay ngay sau khi nó được tạo.'],
    [['CLRCRECMD'], 'Xoá danh sách lệnh CRECMD đã đăng ký cho việc tạo tàu bay.'],
    [['CRECONFS'], "Tạo một tàu bay ở trạng thái đang xung đột (conflict) với tàu bay 'targetid' đã có."],
    [['DEL', 'DELETE'], 'Xoá tàu bay, gió, hoặc vùng/hình đã định nghĩa.'],
    [['MOVE'], 'Di chuyển (đặt lại vị trí) một tàu bay đang có.'],
    [['RETYPE'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['RENAME'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['GROUP'], 'Gán tàu bay vào một nhóm (theo tên hoặc theo khu vực); không truyền gì sẽ liệt kê các nhóm hiện có.'],
    [['UNGROUP'], 'Gỡ tàu bay khỏi một nhóm.'],
    [['THR'], 'Đặt mức ga (throttle) hoặc trả lại chế độ tự động.'],
    [['ENG'], 'Đổi loại động cơ cho tàu bay (tuỳ mô hình hiệu suất đang chọn có hỗ trợ hay không).'],
    [['NOISE'], 'Bật/tắt nhiễu loạn (turbulence/noise) áp lên chuyển động tàu bay.'],
    [['TAXI'], 'Bật/tắt chế độ mặt đất/độ cao thấp; khi OFF, tàu bay dưới 1500 ft sẽ tự bị xoá.'],

    [['ALT'], 'Lệnh autopilot đặt độ cao mục tiêu (và tốc độ lên/xuống tuỳ chọn).'],
    [['VS'], 'Lệnh autopilot đặt tốc độ lên/xuống theo phương thẳng đứng.'],
    [['HDG', 'HEADING', 'TURN'], 'Lệnh autopilot đặt hướng bay (heading) mục tiêu.'],
    [['SPD', 'SPEED'], 'Lệnh autopilot đặt tốc độ (CAS hoặc Mach).'],
    [['CRUISESPD'], 'Đặt tốc độ hành trình (cruise) áp dụng sau khi tàu bay ra khỏi một cú rẽ.'],
    [['CASMACHTHR'], 'Đặt ngưỡng để phân biệt một giá trị tốc độ nên hiểu là CAS hay Mach (dùng cho CRE, ADDWPT, SPD).'],
    [['BANK', 'BANKLIM'], 'Đặt (hoặc hiển thị) giới hạn góc nghiêng cánh cho phép của tàu bay.'],
    [['DEST'], 'Đặt sân bay đích; tàu bay sẽ bay tới sân bay này.'],
    [['ORIG'], 'Đặt sân bay xuất phát của tàu bay.'],
    [['VNAV'], 'Bật/tắt chế độ VNAV (chế độ FMS theo chiều thẳng đứng) của autopilot.'],
    [['LNAV'], 'Bật/tắt chế độ LNAV (chế độ FMS theo chiều ngang/lộ trình) của autopilot.'],
    [['SWTOC'], 'Bật/tắt logic Top of Climb (leo lên sớm).'],
    [['SWTOD'], 'Bật/tắt logic Top of Descent (hạ xuống sớm).'],
    [['DIRECT', 'DIRECTTO', 'DIRTO', 'DCT'], 'Cho tàu bay bay thẳng (direct) tới một waypoint có sẵn trong lộ trình.'],
    [['ADDWPT', 'WPTYPE'], 'Thêm một waypoint vào lộ trình (FMS) của tàu bay.'],
    [['ADDWPTMODE'], 'Đổi kiểu (mode) áp dụng cho các lệnh ADDWPT tiếp theo: FLYBY/FLYOVER/FLYTURN/TURNSPD/TURNRAD/TURNHDG.'],
    [['ADDWAYPOINTS'], 'Thêm nhiều waypoint cùng lúc vào lộ trình của tàu bay.'],
    [['BEFORE'], 'Thêm waypoint vào lộ trình, chèn ngay TRƯỚC một waypoint đã có.'],
    [['AFTER'], 'Thêm waypoint vào lộ trình, chèn ngay SAU một waypoint đã có.'],
    [['AT'], 'Xem/sửa/xoá ràng buộc độ cao, tốc độ (hoặc lệnh) gắn tại một waypoint trong lộ trình.'],
    [['DELWPT', 'DELWP'], 'Xoá một waypoint khỏi lộ trình.'],
    [['DELRTE', 'DELROUTE'], 'Xoá toàn bộ lộ trình/đích/xuất phát của tàu bay.'],
    [['LISTRTE'], 'Hiện danh sách lộ trình theo từng trang (mỗi trang một số waypoint).'],
    [['DUMPRTE'], 'Ghi toàn bộ lộ trình ra file output/routelog.txt.'],
    [['RTA'], 'Đặt thời gian đến bắt buộc (Required Time of Arrival) tại một waypoint.'],
    [['ATALT'], 'Khi tàu bay đạt tới độ cao đã cho, tự thực thi lệnh cmd.'],
    [['ATDIST'], 'Khi tàu bay còn cách vị trí đã cho một khoảng [NM] xác định, tự thực thi lệnh cmd.'],
    [['ATSPD'], 'Khi tàu bay đạt tới tốc độ đã cho, tự thực thi lệnh cmd.'],
    [['DEFWPT'], 'Định nghĩa (hoặc xoá) một waypoint chỉ dùng riêng cho kịch bản/lần chạy hiện tại.'],
    [['AIRWAY', 'AIRWAYS'], 'Xem thông tin về một airway hoặc các kết nối của một waypoint.'],
    [['POS', 'AWY', 'AIRPORT', 'RUNWAYS'], 'Xem thông tin về tàu bay, sân bay hoặc waypoint (RUNWAYS trả về danh sách đường CHC của sân bay).'],
    [['DOC'], 'Hiện màn hình trợ giúp chi tiết cho một lệnh, hoặc trang tài liệu chính nếu không truyền gì.'],

    [['CDMETHOD', 'ASAS'], 'Chọn phương pháp phát hiện xung đột (Conflict Detection).'],
    [['ZONER', 'PZR', 'RPZ', 'PZRADIUS'], 'Đặt bán kính ngang của vùng bảo vệ (Protected Zone), toàn cục hoặc riêng cho (các) tàu bay chỉ định.'],
    [['ZONEDH', 'PZDH', 'DHPZ', 'PZHEIGHT'], 'Đặt nửa chiều cao theo phương thẳng đứng của vùng bảo vệ, toàn cục hoặc riêng cho (các) tàu bay chỉ định.'],
    [['DTLOOK'], 'Đặt thời gian nhìn trước (lookahead) để phát hiện xung đột.'],
    [['DTNOLOOK'], 'Đặt khoảng thời gian tạm ngưng phát hiện xung đột ngay sau khi vừa giải quyết một xung đột.'],
    [['RESO'], 'Chọn phương pháp giải quyết xung đột (Conflict Resolution).'],
    [['PRIORULES'], 'Định nghĩa quy tắc ưu tiên (quyền ưu tiên đường bay) khi giải quyết xung đột.'],
    [['NORESO'], 'Thêm/bỏ (các) tàu bay khỏi danh sách "không ai phải tránh".'],
    [['RESOOFF'], 'Thêm/bỏ (các) tàu bay khỏi danh sách "sẽ không tránh ai khác".'],
    [['RESOACCEPT'], 'Kiểm soát viên chấp nhận đề xuất giải pháp ASAS hiện tại cho (các) tàu bay — autopilot sẽ thực sự bay theo đề xuất đó.'],
    [['RESOREJECT'], 'Kiểm soát viên từ chối/rút lại đề xuất ASAS hiện tại cho (các) tàu bay — tàu bay trở lại bay theo lộ trình/autopilot gốc.'],
    [['RESOAUTO'], 'Bật/tắt tự động chấp nhận đề xuất ASAS theo quy tắc (dành cho chạy batch fast-time không có kiểm soát viên); mặc định OFF.'],
    [['RFACH', 'RESOFACH', 'HRFAC', 'HRESOFAC'], 'Đặt hệ số giải pháp theo chiều ngang (chỉ né theo một phần vector giải pháp).'],
    [['RFACV', 'RESOFACV'], 'Đặt hệ số giải pháp theo chiều thẳng đứng.'],
    [['RSZONER', 'RESOZONER'], 'Đặt hệ số giải pháp theo chiều ngang bằng giá trị bán kính tuyệt đối (NM), thay vì hệ số tương đối.'],
    [['RSZONEDH', 'RESOZONEDH'], 'Đặt hệ số giải pháp theo chiều thẳng đứng bằng giá trị độ cao tuyệt đối (ft), thay vì hệ số tương đối.'],
    [['RMETHH'], 'Đặt phương pháp giới hạn giải pháp theo chiều ngang (giới hạn dùng tốc độ và/hoặc hướng bay).'],
    [['RMETHV'], 'Đặt phương pháp giới hạn giải pháp theo chiều thẳng đứng.'],
    [['PREDASAS'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['BGPASAS'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['SWNLRPASAS'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],

    [['BOX'], 'Định nghĩa một vùng hình hộp chữ nhật.'],
    [['CIRCLE'], 'Định nghĩa một vùng hình tròn.'],
    [['POLY', 'POLYGON'], 'Định nghĩa một vùng hình đa giác.'],
    [['POLYALT'], 'Định nghĩa một vùng đa giác 3D, giữa hai mức độ cao.'],
    [['LINE'], 'Vẽ một đoạn thẳng trên màn hình radar.'],
    [['POLYLINE', 'LINES', 'POLYLINES'], 'Vẽ một đường nhiều đoạn thẳng trên màn hình radar.'],
    [['AREA'], 'Định nghĩa vùng xoá (deletion area): tàu bay ra khỏi vùng này sẽ bị tự xoá.'],
    [['EXP'], 'Định nghĩa vùng thực nghiệm (experiment area / vùng quan tâm).'],
    [['LEGEND'], 'Thêm chú giải (legend) cho biểu đồ vừa vẽ.'],
    [['PLOT'], 'Vẽ biểu đồ biến x theo biến y.'],
    [['CALC', 'DEBUG'], 'Máy tính biểu thức toán học đơn giản ngay trong dòng lệnh.'],
    [['DIST'], 'Tính khoảng cách và hướng (bearing) giữa hai vị trí.'],
    [['MAGVAR', 'MAGDEC', 'MAGDECL', 'VAR'], 'Hiện độ lệch từ (magnetic variation/declination) tại một vị trí.'],
    [['GETWIND'], 'Lấy giá trị gió tại một vị trí (và độ cao tuỳ chọn).'],
    [['WIND'], 'Định nghĩa một vector gió trong trường gió 2D/3D.'],
    [['WINDGRID'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['NEAR'], 'Đặt vị trí tham chiếu lat/lon trước khi thực thi một chuỗi lệnh.'],
    [['INSIDE'], 'Thực thi một chuỗi lệnh với vùng tham chiếu là hình hộp đã cho (hoặc theo tên vùng có sẵn).'],
    [['WITHAC', 'WITH'], 'Thực thi một chuỗi lệnh với tàu bay tham chiếu là acid đã cho.'],

    [['CRELOG'], 'Tạo một logger dữ liệu mới (định kỳ nếu có dt); sau khi tạo, lệnh cùng tên logger dùng để bật/tắt/thêm biến ghi log.'],
    [['CONFLOG'], 'Bật/tắt (hoặc thêm biến cho) logger ghi thống kê xung đột — được tạo sẵn bởi plugin AREA qua CRELOG.'],
    [['FLSTLOG'], 'Bật/tắt (hoặc thêm biến cho) logger ghi thống kê chuyến bay (flight statistics) — được tạo sẵn bởi plugin AREA qua CRELOG.'],
    [['TRAFLOGDT'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['TRAFRECDT'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],

    [['PERF'], 'Chọn (hoặc hiện) mô hình hiệu suất (performance) đang dùng.'],
    [['PERFSTATS', 'PERFINFO', 'PERFDATA'], 'Hiện các tham số hiệu suất bay hiện tại của một tàu bay.'],
    [['FILTCONF'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['FILTTAMB'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['FILTTRED'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['DFFLEVEL'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['FFLEVEL'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['HDGREF'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['MOVIE'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['NAVDB'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['GRAB'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],
    [['TREACT'], 'Chưa triển khai trong BlueSky (lệnh giữ chỗ tương thích TMX).'],

    [['HELP', '?'], 'Hiện trợ giúp chung, hoặc trợ giúp riêng cho một lệnh. Gọi "HELP >filename" để xuất toàn bộ bảng lệnh ra file.'],
    [['ECHO'], 'Hiện một dòng chữ trong cửa sổ lệnh/console cho người dùng đọc.'],
    [['INSEDIT'], 'Chèn sẵn một đoạn chữ vào dòng nhập lệnh.'],
    [['LSVAR'], 'Xem giá trị bất kỳ biến nào trong mô phỏng BlueSky đang chạy (công cụ debug).'],
    [['PLUGINS', 'PLUGIN', 'PLUG-IN', 'PLUG-INS'], 'Liệt kê, nạp hoặc gỡ một plugin.'],
    [['IMPLEMENTATION', 'IMPL', 'IMPLEMENT'], 'Chọn cách triển khai (implementation) thay thế cho một base class của BlueSky.'],
    [['MAKEDOC'], 'Tạo sẵn khung tài liệu markdown cho các lệnh stack chưa có trang tài liệu.'],
];

export const COMMAND_DESCRIPTIONS_VI: Record<string, string> = Object.freeze(
    ENTRIES.reduce<Record<string, string>>((acc, [names, desc]) => {
        for (const name of names) {
            acc[name.toUpperCase()] = desc;
        }
        return acc;
    }, {})
);

/** Vietnamese usage description for a command name, if known. Case-insensitive. */
export function getCommandDescriptionVi(name: string): string | undefined {
    return COMMAND_DESCRIPTIONS_VI[name.toUpperCase()];
}

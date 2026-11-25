# Hướng dẫn tạo kịch bản mô phỏng — WebFTS

Tài liệu này giúp **bất kỳ thành viên nào trên bất kỳ máy nào** tạo được kịch bản mô phỏng với chất lượng như nhau, và nhiều người làm song song không đụng nhau.

Nó cũng là tài liệu để **trợ lý AI đọc** (Claude Code, Cursor, Windsurf, Claude Desktop). Khi nhờ AI tạo kịch bản, hãy bảo nó đọc file này trước.

> **Cách nhờ AI nhanh nhất**
> ```
> Đọc FTS Server/scenario/HUONG_DAN_TAO_KICH_BAN.md rồi tạo cho tôi kịch bản: <mô tả>
> ```

---

## Phần 1 — Chuẩn bị máy (làm một lần)

### 1.1 Lấy mã nguồn

```bash
git clone https://github.com/quangtrungsider-cyber/WebFTS.git
cd WebFTS
```

Nếu gặp lỗi `Filename too long` trên Windows:
```bash
git config --global core.longpaths true
```

### 1.2 Dựng môi trường

Dự án cần **Python 3.13 trở lên**.

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
pip install python-docx          # để xuất báo cáo Word
```

### 1.3 Dữ liệu BADA — đã có sẵn khi clone

BADA (mô hình hiệu năng tàu bay của EUROCONTROL) **có bản quyền**. Kể từ 2026-11-11, dự án đưa dữ liệu này vào repo theo quyết định tường minh của chủ dự án (phạm vi chia sẻ giới hạn trong các thành viên được mời vào repo riêng tư) — bản clone về sẽ có sẵn đủ **264 bộ file `.APF`/`.OPF`/`.PTF`/`.PTD`** trong `FTS Server/bluesky/resources/performance/BADA/`.

> **Không chuyển tiếp dữ liệu này ra ngoài phạm vi repo** (không đăng công khai, không gửi cho người ngoài dự án). Đây vẫn là dữ liệu có bản quyền, chỉ được chia sẻ trong nhóm vì quyết định nội bộ — không phải license cho phép phân phối tự do.

Chỉ cần kiểm tra `FTS Server/settings.cfg` có dòng:
```
performance_model = 'bada'
```

`settings.cfg` **không có trong repo** — engine **tự sinh** ra nó lần chạy đầu, nhưng bản tự sinh mặc định `performance_model = 'openap'`. Phải sửa lại thành `'bada'`, nếu không thì dù có đủ dữ liệu BADA, engine vẫn không dùng tới.

Vì sao bắt buộc phải đúng mô hình này: đã đo được cùng một file `.scn` **giống nhau từng byte**, máy dùng `'bada'` cho **0 cặp cảnh báo xung đột**, máy lỡ dùng `'openap'` cho **4 cặp**. Sai mô hình hiệu năng thì khả năng leo khác, và **mọi kết quả đều lệch** — không đối chiếu được với ai.

### 1.4 Kiểm tra — bắt buộc

```bash
python "FTS Server/scenario/kiem_tra_moi_truong.py"
```

Script kiểm tra 12 mục và **nói rõ thiếu gì, sửa thế nào**. Phải đạt cả 12 mục mới bắt đầu làm. Hai mục quan trọng nhất:

- **Mục 9** — chạy thử mô phỏng headless. Không chạy được mô phỏng thì không kiểm chứng được kịch bản.
- **Mục 12** — dữ liệu BADA. Không có thì kết quả lệch so với các máy khác.

> Lần chạy đầu mất 1–2 phút để dựng bảng dữ liệu dẫn đường. Những lần sau nhanh.

### 1.5 Tự kiểm chứng: máy bạn có cho ra kết quả giống không?

Chạy lại kịch bản mẫu và so kết quả:

```bash
cd "FTS Server/scenario"
python _gen_vvdn_xenke_60min.py
python _verify_vvdn_xenke.py
```

Phải ra đúng:
- `VVDN-XENKE-60MIN.scn` — **370.190 byte**, 18 ARR + 18 DEP, 6.211 lệnh
- Kiểm chứng: **30 mục, 0 mục KHÔNG ĐẠT** (28 ĐẠT + 2 mục số liệu)
- B2: lệch chạm bánh lớn nhất **0,8 s** · B3: cặp hạ cánh gần nhất **7,44 NM** · B4: **0 cặp** xung đột · B8: **0 cặp** vi phạm khi lăn · B13: thoát ly 35L lâu nhất **94 s**

Lệch bất kỳ con số nào ⇒ môi trường chưa đúng. Thường là thiếu BADA (mục 1.3).

### 1.4 Lưu ý về trình Python

Chạy bằng Python **của môi trường ảo**, đừng dùng lệnh `py`. Trên máy dự án, `py` trỏ tới một bản Python đã bị xoá và làm ứng dụng không khởi động được.

```bash
.venv\Scripts\python.exe <đường dẫn script>        # Windows — luôn đúng
```

---

## Phần 2 — Quy trình tạo kịch bản

Chi tiết kỹ thuật và **toàn bộ bẫy của engine** nằm trong phần 4. Đây là khung tổng thể:

| Bước | Việc | Sản phẩm |
|---|---|---|
| 0 | Khảo sát dữ liệu nguồn — có gì, thiếu gì | Báo cáo cho người yêu cầu |
| 1 | Viết file quy tắc JSON, ghi rõ điều khoản nguồn | `<ten>_rules.json` |
| 2 | Viết generator, seed cố định | `_gen_<ten>.py` → `<TEN>.scn` + `<TEN>.plan.json` |
| 3 | Hiệu chuẩn bằng mô phỏng thật | `<TEN>.calib.json` |
| 4 | Viết script kiểm chứng **độc lập** | `_verify_<ten>.py` |
| 5 | Chạy, sửa đến khi mọi mục ĐẠT | — |
| 6 | Viết báo cáo | `BaoCao_*.md` + `.docx` |

### Năm nguyên tắc không được vi phạm

1. **Không bịa số liệu.** Thiếu tọa độ, cao độ, tốc độ hay quy định → **dừng và hỏi**. Nếu buộc phải suy diễn, đánh dấu `can_xac_nhan: true` kèm lý do trong file quy tắc.
2. **Kiểm chứng bằng mô phỏng chạy thật**, không tin vào lịch. Lịch đúng không có nghĩa tàu bay bay đúng — kịch bản VVDN xen kẽ đạt hết mọi phép kiểm tra trên lịch trong khi vẫn có hai tàu lăn **xuyên qua nhau cách 3 m**.
3. **Script kiểm chứng phải độc lập** với generator: tự đọc file quy tắc, tự tính lại. Nếu nó gọi lại hàm của generator thì nó chỉ xác nhận generator nhất quán với chính nó.
4. **Seed cố định** — cùng mã nguồn, cùng tham số thì mọi máy ra kết quả giống hệt.
5. **Backup trước khi ghi đè** file `.scn` đã có.

### Kịch bản mẫu đầy đủ

**VVDN cất cánh xen kẽ** là bản tham chiếu hoàn chỉnh nhất — có đủ cả 7 bước, 30 mục kiểm chứng. Từ 2026-11-04 kịch bản chạy MỘT pha suốt 60 phút, cất/hạ cánh xen kẽ, xếp sát phân cách tối thiểu theo dự thảo Phương thức 2 CHC song song Đà Nẵng (24.7.2026), dự thảo MANOP APP/TWR Đà Nẵng và ICAO Doc 4444 — **không** dùng `compliance_rulesets/VVDN.json` (xem bẫy ở mục 4.3):

| File | Vai trò |
|---|---|
| `vvdn_xenke_rules.json` | Cấu hình quy tắc phân cách, ghi điều khoản nguồn |
| `_gen_vvdn_xenke_60min.py` | Generator, seed cố định |
| `_calib_vvdn_xenke.py` | Hiệu chuẩn thời điểm tạo tàu |
| `_verify_vvdn_xenke.py` | Kiểm chứng độc lập (30 mục) |
| `_md2docx_baocao.py` | Xuất báo cáo Word |
| `BaoCao_KiemChung_VVDN_XenKe.md` | Báo cáo mẫu |

Chạy thử để xem toàn bộ quy trình:

```bash
cd "FTS Server/scenario"
python _gen_vvdn_xenke_60min.py        # sinh kịch bản
python _verify_vvdn_xenke.py --static  # kiểm tra nhanh trên lịch (vài giây)
python _verify_vvdn_xenke.py           # kiểm chứng đầy đủ, có chạy mô phỏng (~10 phút)
```

Kết quả phải là **30 mục, 0 mục KHÔNG ĐẠT**. Nếu máy bạn ra kết quả khác máy khác, môi trường có vấn đề — chạy lại `kiem_tra_moi_truong.py`.

---

## Phần 3 — Làm việc song song

### 3.1 Quy ước đặt tên

Mỗi kịch bản là **một bộ file dùng chung một tên gốc**, viết HOA, nối bằng gạch ngang:

```
<ICAO>-<NỘI-DUNG>-<ĐẶC-TRƯNG>
```

Ví dụ: `VVDN-XENKE-60MIN`, `VVNB-CAPACITY-3NM`, `VVPQ-VVDN-5ACFT`.

| Loại file | Quy ước |
|---|---|
| Kịch bản | `VVDN-XENKE-60MIN.scn` |
| Generator | `_gen_vvdn_xenke_60min.py` (chữ thường, tiền tố `_gen_`) |
| Kiểm chứng | `_verify_vvdn_xenke.py` |
| Quy tắc | `vvdn_xenke_rules.json` |
| Dữ liệu sinh ra | `VVDN-XENKE-60MIN.plan.json`, `.calib.json` |

**Tên gốc phải là duy nhất trong toàn dự án.** Kiểm tra trước khi đặt:

```bash
ls "FTS Server/scenario" | grep -i "<tên bạn định đặt>"
```

### 3.2 Nhánh git

Mỗi kịch bản làm trên **một nhánh riêng**, không làm thẳng trên `main`:

```bash
git checkout main
git pull                                   # lấy bản mới nhất trước khi tách nhánh
git checkout -b kich-ban/vvdn-xenke
# ... làm việc, commit ...
git push -u origin kich-ban/vvdn-xenke
```

Rồi mở Pull Request trên GitHub. Như vậy hai người cùng làm hai kịch bản sẽ không đụng nhau, vì mỗi bộ file có tên gốc riêng.

### 3.3 File nào **không** commit

Đã có trong `.gitignore`, nhưng cần biết để không thắc mắc:

| File | Vì sao |
|---|---|
| `*.track.json` | Quỹ đạo mô phỏng, 3 MB mỗi lần chạy, **tái tạo được** bằng script kiểm chứng |
| `*.docx` | Báo cáo nội bộ, giữ ngoài GitHub theo quyết định của dự án |
| `Backup/` | Bản lưu cục bộ trước khi ghi đè |
| `FTS Server/data/users.json` | **Dữ liệu tài khoản thật — tuyệt đối không commit** |
| `FTS Server/cache/` | Bảng dữ liệu dẫn đường, máy nào tự dựng của máy đó |

File `.calib.json` thì **nên commit** — nó là một phần của kết quả tái lập được.

### 3.4 Kiểm tra trước khi mở Pull Request

```bash
python "FTS Server/scenario/kiem_tra_moi_truong.py"   # môi trường còn tốt
python _gen_<ten>.py                                  # sinh lại từ đầu
python _verify_<ten>.py                               # mọi mục phải ĐẠT
git status                                            # không có file lạ
```

Trong mô tả Pull Request, ghi rõ:
- Kịch bản mô phỏng tình huống gì
- Kết quả kiểm chứng (số mục ĐẠT / tổng)
- Các mục **CẦN XÁC NHẬN** (nếu có quy tắc phải suy diễn)
- Giả định và đơn giản hoá có chủ đích

---

## Phần 4 — Bẫy của engine mô phỏng

Mỗi mục dưới đây là một lỗi **đã xảy ra thật và đã đo được**. Đọc trước khi viết dòng code đầu tiên — phần này tiết kiệm nhiều giờ chẩn đoán.

### 4.1 Lệnh và cấu hình

**`IC` tự thêm tiền tố.** `settings.cfg` đã có `scenario_path = 'scenario'`. Viết `IC scenario/X` → thành `scenario/scenario/X` → mô phỏng **treo ở thời điểm 0 vĩnh viễn, không báo lỗi gì ra ngoài**. Phải viết `IC X`.

**`DTMULT` đặt ở `00:00:00.000`.** Đặt chỗ khác sẽ ghi đè tốc độ mô phỏng người dùng chọn giữa chừng.

**Tàu bay bị xoá khi tới waypoint cuối.** Engine tự xoá tàu khi hết route. Mọi thiết kế nhiều pha chia bằng lệnh hẹn giờ đều vỡ vì lý do này. Cách xử lý: chuyển sang điều khiển bằng `MOVE` **trước khi** tàu tới waypoint cuối.

**`ATDIST` + `DELAY` ghép chuỗi.** Nhiều tàu cùng chờ điều kiện ghép sẽ biến mất sớm. Dùng lệnh hẹn **theo thời gian tuyệt đối**. Cũng không đăng ký `ATDIST` mới từ bên trong file đang được gọi bởi một điều kiện khác — điều kiện lồng hai tầng bị tính sai và kích hoạt ngay lập tức.

**Đừng viết `DEL` kèm tiền tố callsign.** Dòng `<acid> DEL <acid>` (ví dụ `VAG672 DEL VAG672`) bị stack bung thành lệnh `DEL` mang **cùng một tàu hai lần**, tức `idx = (0, 0)`. `np.delete` bỏ qua trùng lặp, nhưng `del list[i]` chạy lần thứ hai thì văng `IndexError` — và vì engine xoá các đối tượng con **trước** mảng của chính nó, ngoại lệ này làm lệnh xoá đứt gánh giữa chừng: `ap.bankdef` rỗng trong khi `traf.alt` và `ntraf` vẫn đếm là 1. Từ đó **mọi** bước cập nhật hiệu năng BADA đều chết (`perfbada.py` → `phases()` → `bank[gd2]`), mô phỏng không chạy tiếp được. Đã sửa ở `bluesky/core/trafficarrays.py` (chuẩn hoá chỉ số về tập duy nhất, có test hồi quy trong `bluesky/test/traffic/test_trafficarrays.py`), nhưng vẫn nên viết gọn `DEL <acid>` — tiền tố callsign không mang thêm ý nghĩa gì.

**`VNAV` không lấy được tốc độ sau `DELRTE`.** `DELRTE` + `ADDWPT` + `LNAV ON` + `VNAV ON` nạp đúng route nhưng tốc độ kẹt ở giá trị rỗng → tàu đứng yên vĩnh viễn. Ép `<acid> SPD <tốc độ mốc đầu>` ngay sau `VNAV ON`.

### 4.2 Điều khiển bằng `MOVE` (dùng cho pha lăn)

**Phát theo nhịp thời gian đều, không theo khoảng cách đều.** Phát mỗi 9 m nghe hợp lý, nhưng lúc tàu giảm tốc về 0 thì 9 m đó mất ~29 s. Trong khoảng trống ấy engine cho tàu **bay tự do** — đã đo 350–1138 kt, lệch 5,5 km. Phát đều **2 giây/lệnh**.

**Lệnh cuối chuỗi phải đặt 0 kt.** Lệnh áp chót đặt 5 kt rồi 3,5 s sau mới có lệnh kế → tàu vọt 674 m (hiển thị 1019 kt). Sau lệnh 0 kt, tàu **đứng yên tuyệt đối** — đã kiểm chứng.

**Đừng lăn chậm bất thường.** Trải 130 m ra suốt 240 s làm tốc độ lệnh tụt còn 1,7 kt; engine không giữ nổi tàu — đã đo tàu dao động qua lại 294 m mỗi giây. Lăn ở tốc độ thật rồi **ghim đứng yên** tại chỗ.

**`MOVE` vô hiệu hoá plugin tránh va chạm mặt đất.** `bluesky/plugins/surfacetaxi.py` **cố ý** không can thiệp vào tàu đang điều khiển bằng `MOVE` (dòng 201–212). Nếu cả hai tàu đều dùng `MOVE` thì **không ai nhường ai**. Phải tự giải xung đột trong khâu lập lịch, dùng đúng quy tắc ưu tiên của plugin: *tàu còn quãng đường tới đích ngắn hơn được đi trước*. Khoảng cách yêu cầu = **nửa chiều dài hai tàu + 20 m**.

**Thời điểm chuyển sang `MOVE` phải khớp vị trí thật.** Nếu chuỗi `MOVE` khởi động khi tàu chưa tới nơi, lệnh đầu tiên **kéo tàu đi** — đã đo 11.669 m trong 1 giây.

### 4.3 Dữ liệu và tọa độ

**Tọa độ kế thừa có thể sai.** Điểm vào đường CHC lấy từ kịch bản cũ lệch tim **41,2 m**. Luôn **đo lại** mọi tọa độ kế thừa bằng `runway_centerlines.geojson` / `taxiway_centerlines.geojson`.

**Chuỗi SID bắt đầu ngoài đường CHC.** Mọi SID của VVDN bắt đầu cách ngưỡng 5.343 m ở 1.500 ft — ngoài đường CHC (3.517 m) tới 1.826 m. VNAV trải đoạn leo đều và giữ tàu ở 0 ft suốt chặng: tàu **trượt trên mặt đất ở 180 kt ra ngoài sân bay 1.428 m** rồi mới leo. Chèn waypoint rời đất **trong phạm vi đường CHC** (cự ly chạy đà thật: MEDIUM ~2.000 m, HEAVY ~2.600 m, cao độ 35 ft).

**Bộ quy tắc số hoá có thể đọc sai văn bản gốc — luôn đối chiếu nguyên văn.** `compliance_rulesets/VVDN.json` lấy bảng *cất cánh 35R vs tàu đến 35L* (hàng = tàu cất cánh, cột = tàu hạ cánh: 5/5/6/7 NM) của dự thảo Phương thức 2 CHC song song mục 4.2.1 rồi hiểu nhầm thành ma trận *hạ cánh liên tiếp*. Nó còn đưa vào mức 8 NM tại điểm chờ E, trích từ một văn bản không có trong dự án. Dự thảo không có ma trận hạ cánh liên tiếp. Nguồn đúng là MANOP (mục Phân cách giám sát ATS, trùng ICAO Doc 4444 8.7.3.4): HEAVY sau HEAVY 4, MEDIUM sau HEAVY 5, các cặp còn lại 3 NM. MANOP còn có giãn cách hạ cánh liên tiếp "có thể là 8NM" (hướng dẫn của APP) — kịch bản VVDN xen kẽ **không áp dụng** theo chỉ định của người dùng (lưu ở `gian_cach_toi_thieu_MANOP_khong_ap_dung`). Trước khi dùng bất kỳ giá trị nào trong `compliance_rulesets/`, mở văn bản nguồn và đọc **tiêu đề hàng/cột** của bảng.

**Tàu đến VVDN phải cắt qua 35R.** G4/G6 nằm **giữa** hai CHC (35L/35R cách nhau 214 m). Vạch dừng chờ đo từ `taxiway_centerlines.geojson`: 35R ở −91 m (phía tây) và +94 m (phía đông); 35L ở −122 m. Tàu dài trên 32 m dừng giữa hai CHC luôn lấn vạch của một trong hai đường. Vì vậy MANOP quy định: khi có tàu dừng chờ giữa hai CHC trước 35R thì **không sử dụng 35L**. Điểm cuối cũ của chuỗi thoát ly G6 cách tim 35R chỉ 112 m, nên tàu dài đã lấn mũi qua vạch 35R. Phải tách tuyến lăn vào bến thành ba đoạn: tới vị trí dừng chờ, cắt qua (15 kt, ≤ 45 s), rồi về bến. Chỉ cắt qua sau khi tàu cất cánh đã qua điểm cắt.

**Đường lăn E song song 35R chỉ cách 148 m.** MANOP: khi tàu code D/E cất cánh 35R thì chỉ tàu code C trở xuống được ở trên E. Tàu đi lăn trên E khoảng 300 s, còn nhịp cất cánh khoảng 190 s, nên tàu HEAVY phải tới điểm chờ trước khi tàu HEAVY khác chạy đà. Tàu code F (B748) không được nêu trong MANOP. Cách hiểu chặt là không lên E khi có bất kỳ tàu nào cất cánh, buộc phải bỏ trống một khe cất cánh.

**Ước lượng thời gian bay sai hàng chục giây.** Đã đo: trung bình 52 s, lớn nhất 85 s. Nếu kịch bản cần tàu chạm bánh đúng mốc thì **bắt buộc hiệu chuẩn** (bước 3). Và bù vào *mốc đi qua điểm vào* chứ không bù vào thời điểm tạo tàu — chuyến đầu thường phải sinh ngay tại thời điểm 0 nên giá trị âm bị kẹp và hiệu chuẩn mất tác dụng.

### 4.4 Bẫy khi **đo đạc** — dễ báo động giả

Bốn lỗi dưới đây từng làm kịch bản **đúng** bị báo sai:

| Cách đo sai | Hậu quả | Cách đo đúng |
|---|---|---|
| Dùng tốc độ tức thời của engine để phát hiện tàu "trôi" | Tại bước có lệnh `MOVE`, quãng đường dịch tàu bị quy ra tốc độ của một bước 0,05 s → **1021 kt** dù dịch chuyển thật chỉ 6,2 m/s | Tính từ **dịch chuyển giữa hai mẫu ghi** |
| Coi tàu đã chạm bánh là "đang tiếp cận" | Báo sai **49 cặp** xung đột trên không | Chỉ xét tàu còn đang bay (cao độ > 10 ft) |
| Đo lệch tim đường lăn mà gồm cả pha chạy đà | Đường CHC cách mọi đường lăn hàng trăm mét → số vô nghĩa | Lọc theo **cửa sổ thời gian lăn thật**, hoặc tốc độ < 25 kt |
| Đo lệch tim đường CHC không giới hạn phạm vi | Sau khi rời đất tàu ra khỏi đường CHC → đo được **2.208 m** | Chỉ xét lúc còn lăn bánh (cao độ < 10 ft) |

Và một lỗi kinh điển: tàu **đã hạ cánh xong** bị báo "đứng yên quá 600 s". Luôn loại tàu đã hoàn tất nhiệm vụ khỏi phép kiểm tra.

> **Khi kiểm chứng báo lỗi, hãy nghi ngờ tiêu chí trước — nhưng phải *chứng minh* tiêu chí sai bằng số liệu, không mặc định vậy.** Trong kịch bản VVDN xen kẽ: 7 lỗi thật, 4 lỗi tiêu chí.

### 4.5 Môi trường

- **Không** chạy mô phỏng trong tiến trình Flask của ứng dụng web — chạy headless riêng.
- **Phải chạy bằng đúng `.venv` của dự án.** `scipy` là bắt buộc, không phải tuỳ chọn: `bluesky/traffic/traffic.py` nạp `windsim` → `windfield`, mà `windfield` `import scipy.interpolate` ngay ở cấp module — thiếu `scipy` thì **không `import` nổi engine**, lỗi báo ở tận `bs.init()` nên dễ tưởng là hỏng cấu hình. Python hệ thống thường không có `scipy`. Cài đủ bằng `uv pip install -r requirements-dev.txt` (đã khai báo `scipy`, `shapely`, `pytest`).
- Đường dẫn repo chứa dấu tiếng Việt. Khi gọi `subprocess`, truyền đường dẫn qua **biến môi trường** và đặt `PYTHONUTF8=1`; đừng nhúng vào `-c` (Windows mã hoá đối số theo cp1252 và làm vỡ chữ có dấu).
- `_gen_kb5_1hour.py` **không có** `if __name__ == "__main__"` — `import` thẳng nó sẽ sinh ra 61 file rác. Lấy dữ liệu từ nó bằng AST (xem `_gen_vvdn_xenke_60min.py`, hàm `load_source_data`).

---

## Phần 5 — Dữ liệu dùng được

| Cần gì | Lấy ở đâu | Độ phủ |
|---|---|---|
| SID/STAR/IAP (tên + hình học) | `WebATM/static/data/vatm_kmz/procedures_index.json` + `procedures_all_nominal_tracks.geojson` | **24 sân bay, 1.470 phương thức** |
| SID/STAR có **cao độ + tốc độ** | `WebATM/server/<icao>_procedures.py` | **7 sân bay**: VVNB, VVGB, VVPQ, VVDN, VVCM, VVDL, VVLT |
| Tim đường CHC, đường lăn, bãi đỗ | `FTS Server/data/aerodrome_layout/.../airports/<ICAO>/` | VVDN, VVNB, VVTS |
| Tốc độ tiếp cận theo loại tàu bay | `APPROACH_SPEEDS` trong `_gen_kb5_1hour.py` | 20 loại |
| Chiều dài thân tàu bay | `AIRCRAFT_LENGTH_M` cùng file | 20 loại |
| Quy tắc phân cách đã số hoá | `FTS Server/data/compliance_rulesets/`, các `*_rules.json` | — |

> **Dữ liệu KMZ không có cao độ và tốc độ** — chỉ hình học 2D. Cao độ/tốc độ nằm trong bảng mã hoá của AIP (docx/PDF). Vì vậy sân bay ngoài 7 cái trên **chưa sinh được kịch bản đầy đủ** nếu chưa số hoá dữ liệu đó.
>
> Muốn thêm sân bay: viết `WebATM/server/<icao>_procedures.py` rồi đăng ký vào `PROCEDURE_REGISTRY` trong `capacity_scenario_engine.py` — **không phải sửa engine** (xem chú thích đầu file đó).

---

## Phần 6 — Gặp vấn đề

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Mô phỏng chạy mãi không nhúc nhích | Lệnh `IC` có tiền tố `scenario/` thừa (mục 4.1) |
| Tàu bay biến mất giữa chừng | Tới waypoint cuối, hoặc dùng `ATDIST`+`DELAY` ghép chuỗi (4.1) |
| Tàu bay đứng yên vĩnh viễn | Thiếu lệnh `SPD` sau `VNAV ON` (4.1) |
| Tàu bay vọt đi hàng nghìn mét | Khoảng trống giữa hai lệnh `MOVE` (4.2) |
| Hai tàu lăn chồng lên nhau | Chưa giải xung đột khi lập lịch (4.2) |
| **Kết quả máy mình khác máy người khác** | **Hầu như luôn là `settings.cfg` sai `performance_model` (1.3)** — chạy `kiem_tra_moi_truong.py` mục 12 |
| Ứng dụng web không khởi động | Dùng nhầm `py` thay vì Python của môi trường ảo (1.5) |
| `git clone` báo `Filename too long` | Đặt repo ở đường dẫn ngắn (ví dụ `D:\FTS`) hoặc bật `core.longpaths` (1.1) |
| Clone xong thiếu hàng nghìn file | Cùng nguyên nhân trên — `git status` sẽ liệt kê file `D` (deleted) |

Nếu vẫn tắc: mở một mục trong Issues của repo, kèm **lệnh đã chạy**, **thông báo lỗi đầy đủ**, và kết quả `kiem_tra_moi_truong.py`.

# VATM Fast-Time Simulation Platform / WebFTS

VATM Fast-Time Simulation Platform, tên repository là **WebFTS**, là nền tảng mô phỏng không lưu thời gian nhanh trên nền web, phục vụ nghiên cứu, trực quan hóa và thử nghiệm các kịch bản quản lý bay trong vùng trời Việt Nam.

Dự án được phát triển dựa trên nền tảng WebATM/Vatm-Engine và đã được tùy biến để phù hợp với dữ liệu khai thác bay, vùng trời và phương thức bay tại Việt Nam.

---

## Tổng quan hệ thống

WebFTS cung cấp giao diện bản đồ tương tác để hiển thị và điều khiển mô phỏng không lưu, bao gồm:

- Hiển thị tàu bay theo thời gian mô phỏng.
- Theo dõi thông tin chuyến bay, hướng bay, tốc độ, độ cao và trạng thái.
- Kết nối với VATM/Vatm-Engine simulation server.
- Hiển thị các vùng trời phục vụ điều hành bay.
- Hiển thị dữ liệu FIR, ACC, TMA.
- Hiển thị các phương thức bay SID, STAR, IAP.
- Hiển thị Holding, đường bay, điểm trọng yếu.
- Theo dõi cảnh báo xung đột giữa các tàu bay.
- Cho phép bật/tắt từng lớp dữ liệu bản đồ theo nhu cầu khai thác.

---

## Các chức năng chính

### 1. Mô phỏng không lưu thời gian nhanh

Hệ thống cho phép chạy mô phỏng với tốc độ nhanh hơn thời gian thực nhằm phục vụ:

- Phân tích năng lực vùng trời.
- Kiểm thử phương án điều hành bay.
- Đánh giá xung đột tiềm ẩn.
- Mô phỏng lưu lượng bay theo kịch bản.
- Hỗ trợ nghiên cứu, huấn luyện và đánh giá khai thác.

---

### 2. Hiển thị bản đồ hàng không Việt Nam

Các lớp dữ liệu hàng không có thể được bật/tắt trên giao diện:

- Đường bay.
- Điểm trọng yếu.
- Hành lang bay.
- FIR / ACC / TMA.
- Khu vực hạn chế, khu vực nguy hiểm, khu vực cấm.
- Holding.
- SID / STAR / IAP theo sân bay.

---

### 3. Quản lý dữ liệu theo sân bay

Hệ thống định hướng tổ chức dữ liệu theo từng sân bay, ví dụ:

- TSN / Tân Sơn Nhất.
- NBA / Nội Bài.
- DAD / Đà Nẵng.

Mỗi sân bay có thể quản lý riêng:

- Holding.
- SID.
- STAR.
- IAP.
- Các điểm liên quan.
- Đường bay liên quan.
- Khu vực vùng trời liên quan.

---

### 4. Theo dõi tàu bay và xung đột

Giao diện mô phỏng hỗ trợ:

- Hiển thị danh sách tàu bay đang hoạt động.
- Hiển thị thông tin chi tiết tàu bay.
- Theo dõi số lượng tàu bay.
- Theo dõi số lượng xung đột.
- Hiển thị cảnh báo conflict theo callsign.
- Ghi nhận thông tin mô phỏng trong khu vực Echo Messages.

---

### 5. Điều khiển mô phỏng

Người dùng có thể:

- Tạo tàu bay.
- Vẽ shape trên bản đồ.
- Vẽ route.
- Phóng to / thu nhỏ bản đồ.
- Reset góc nhìn.
- Chuyển chế độ fullscreen map.
- Bật/tắt các lớp hiển thị dữ liệu hàng không.

---

## Công nghệ sử dụng

Dự án sử dụng các công nghệ chính:

- Python cho phần server và kết nối mô phỏng.
- TypeScript / JavaScript cho phần giao diện web.
- MapLibre GL cho bản đồ tương tác.
- Vatm-Engine/VATM simulation server cho lõi mô phỏng.
- HTML, CSS, frontend assets cho giao diện người dùng.

---

## Yêu cầu môi trường

Khuyến nghị cài đặt:

- Python 3.13 hoặc mới hơn.
- Node.js 22 hoặc mới hơn.
- npm.
- Git.
- Vatm-Engine hoặc VATM simulation server.
- Trình duyệt web hiện đại như Chrome, Edge hoặc Firefox.

---

## Cài đặt và chạy dự án

### 1. Clone repository

```bash
git clone https://github.com/quangtrungsider-cyber/WebFTS.git
cd WebFTS
```

---

### 2. Cài đặt thư viện Python

```bash
pip install -r requirements.txt
```

---

### 3. Build frontend

```bash
script/build_frontend.sh
```

Trên Windows, nếu dùng Git Bash:

```bash
bash script/build_frontend.sh
```

---

### 4. Chạy hệ thống

```bash
script/run_webatm.sh
```

Trên Windows, nếu dùng Git Bash:

```bash
bash script/run_webatm.sh
```

---

### 5. Mở giao diện web

Sau khi chạy thành công, mở trình duyệt và truy cập:

```text
http://localhost:8082
```

---

## Cấu hình kết nối mô phỏng

Một số biến môi trường thường dùng:

| Biến môi trường | Ý nghĩa | Giá trị mặc định |
|---|---|---|
| WEB_HOST | Địa chỉ chạy web server | localhost |
| WEB_PORT | Cổng chạy web server | 8082 |
| BLUESKY_SERVER_HOST | Địa chỉ simulation server | localhost |

Hệ thống kết nối với simulation server thông qua các cổng mặc định của Vatm-Engine/VATM.

---

## Cấu trúc dữ liệu hàng không

Dữ liệu hàng không nên được tổ chức theo logic:

```text
data/
├── airspace/
│   ├── FIR/
│   ├── ACC/
│   └── TMA/
├── airports/
│   ├── TSN/
│   │   ├── holding/
│   │   ├── SID/
│   │   ├── STAR/
│   │   └── IAP/
│   ├── NBA/
│   │   ├── holding/
│   │   ├── SID/
│   │   ├── STAR/
│   │   └── IAP/
│   └── DAD/
│       ├── holding/
│       ├── SID/
│       ├── STAR/
│       └── IAP/
├── routes/
├── waypoints/
└── restricted_areas/
```

Mục tiêu là cho phép người dùng lựa chọn từng vùng trời, từng sân bay và từng phương thức bay riêng biệt thay vì hiển thị toàn bộ dữ liệu cùng lúc.

---

## Định hướng phát triển

Các hạng mục tiếp tục phát triển:

- Bố cục lại menu dữ liệu hàng không.
- Cho phép chọn riêng từng FIR, ACC, TMA.
- Cho phép chọn riêng từng Holding.
- Cho phép chọn riêng từng SID, STAR, IAP theo từng sân bay.
- Chuẩn hóa dữ liệu vùng trời Việt Nam.
- Chuẩn hóa dữ liệu phương thức bay theo sân bay.
- Tối ưu hiển thị bản đồ và lớp dữ liệu.
- Bổ sung công cụ nhập dữ liệu từ Google Earth/KML/KMZ.
- Bổ sung chức năng phân tích conflict.
- Bổ sung chức năng xuất báo cáo kết quả mô phỏng.

---

## Ghi chú bản quyền

Dự án WebFTS được phát triển, tùy biến và mở rộng phục vụ mục đích nghiên cứu, mô phỏng và phân tích không lưu.

Nền tảng có tham khảo và kế thừa một số thành phần từ WebATM/Vatm-Engine. Cần tuân thủ giấy phép của các thành phần mã nguồn mở được sử dụng trong dự án.

---

## Repository

```text
https://github.com/quangtrungsider-cyber/WebFTS
```

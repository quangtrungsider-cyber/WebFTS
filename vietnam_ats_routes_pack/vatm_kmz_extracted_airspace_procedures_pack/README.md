# VATM KMZ Airspace & Procedure Extraction Pack

Nguồn dữ liệu: `2026.04.20 DỮ LIỆU VÙNG TRỜI, PHƯƠNG THỨC BAY.kmz`.

Gói này đã bóc tách dữ liệu Google Earth/KMZ thành GeoJSON/CSV để WebATM/FTS/AI có thể đọc được.

## Nguyên tắc xử lý SID/STAR

Theo yêu cầu: **các phương thức SID và STAR của tất cả sân bay đã loại bỏ vùng bảo vệ, chỉ giữ lại nominal track**.

Cụ thể:

- Các đối tượng nằm trong folder `Protection Areas` hoặc geometry dạng `Polygon` thuộc nhóm `PHƯƠNG THỨC BAY (SID, STAR, IAP)` được đưa vào thư mục `removed_not_for_map/` để kiểm toán, **không dùng làm layer hiển thị chính**.
- Các layer SID/STAR dùng cho bản đồ chỉ chứa `LineString` và `is_nominal_track = true`.
- IAP nominal track cũng được tách riêng để anh có thể bật/tắt nếu cần.

## Cấu trúc file

```text
geojson/
  ats_routes.geojson
  ats_route_corridors.geojson
  significant_points.geojson
  navaids.geojson
  airspace_fir_acc_tma_ctr.geojson
  airspace_prd_areas.geojson
  holdings_nominal_tracks.geojson
  procedures_sid_nominal_tracks.geojson
  procedures_star_nominal_tracks.geojson
  procedures_iap_nominal_tracks.geojson
  procedures_all_nominal_tracks.geojson
  other_features.geojson

removed_not_for_map/
  procedures_protection_areas_removed_not_for_map.geojson

csv/
  feature_index.csv
  procedures_nominal_index.csv
  procedures_removed_protection_index.csv
  extraction_summary.csv

webatm/
  VietnamKmlAirspaceProcedureControls.ts
```

## Thống kê nhanh

- Tổng placemark trong KML: 55,270
- Tổng geometry feature xuất ra: 55,276
- Vùng bảo vệ procedure đã loại khỏi layer chính: 24,525
- SID nominal track: 826
- STAR nominal track: 1,800
- IAP nominal track: 4,244

## Import vào WebATM

Copy toàn bộ GeoJSON:

```bash
cd "/d/Coding/Dự án FTS/WebATM"
mkdir -p WebATM/static/data/vatm_kmz
cp "/d/Coding/Dự án FTS/vatm_kmz_extracted_airspace_procedures_pack/geojson/"*.geojson WebATM/static/data/vatm_kmz/
```

Copy file điều khiển layer:

```bash
cp "/d/Coding/Dự án FTS/vatm_kmz_extracted_airspace_procedures_pack/webatm/VietnamKmlAirspaceProcedureControls.ts" frontend/src/ui/map/
```

Trong `frontend/src/ui/map/MapDisplay.ts`, thêm:

```ts
import { installVietnamKmlAirspaceProcedureControls } from "./VietnamKmlAirspaceProcedureControls";
```

Sau khi map được khởi tạo hoặc trong `map.on("load", ...)`, gọi:

```ts
installVietnamKmlAirspaceProcedureControls(this.map);
```

Build lại:

```bash
cd frontend
npm run build
cd ..
python WebATM.py
```

## Ghi chú

Dữ liệu này dùng cho **FTS / Decision-support / Non-operational**. Không dùng trực tiếp cho điều hành bay thật hoặc phê duyệt phương thức nếu chưa rà soát/chứng thực với nguồn AIM/AIP/AIXM chính thức.

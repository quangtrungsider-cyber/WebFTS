# VATM Airspace / Procedure Extracted Pack

Nguồn: `2026.04.20 DỮ LIỆU VÙNG TRỜI, PHƯƠNG THỨC BAY.kmz` xuất từ Google Earth.

Gói này đã bóc tách KMZ thành GeoJSON/CSV theo logic phục vụ WebATM/FTS/AI.

## Nhóm dữ liệu chính

| Nhóm | File | Số feature |
|---|---:|---:|
| PROCEDURE | xem thư mục `geojson/` | 53879 |
| HOLDING | xem thư mục `geojson/` | 707 |
| ATS_ROUTE | xem thư mục `geojson/` | 288 |
| SIGNIFICANT_POINT | xem thư mục `geojson/` | 185 |
| PRD_AIRSPACE | xem thư mục `geojson/` | 74 |
| ROUTE_CORRIDOR | xem thư mục `geojson/` | 73 |
| TMA_CTR | xem thư mục `geojson/` | 40 |
| ACC_FIR_SECTOR | xem thư mục `geojson/` | 24 |

## Cấu trúc thư mục

```text
geojson/
  vatm_ats_routes.geojson
  vatm_significant_points.geojson
  vatm_route_corridors.geojson
  vatm_tma_ctr.geojson
  vatm_acc_fir_sectors.geojson
  vatm_prd_airspace.geojson
  vatm_holding_areas.geojson
  procedures_by_airport/
    vatm_procedures_VVTS.geojson
    vatm_procedures_VVNB.geojson
    ...
csv/
  vatm_airspace_master_index.csv
  vatm_procedures_index.csv
  vatm_extraction_summary.csv
source/
  source_doc.kml
VietnamKmlAirspaceControls.ts
```

## Cách đưa vào WebATM

Copy thư mục `geojson` vào:

```bash
WebATM/static/data/vatm_kmz/
```

Copy `VietnamKmlAirspaceControls.ts` vào:

```bash
frontend/src/ui/map/
```

Trong `MapDisplay.ts`, thêm:

```ts
import {{ installVietnamKmlAirspaceControls }} from "./VietnamKmlAirspaceControls";
```

Sau khi tạo map hoặc trong `map.on("load", ...)`, gọi:

```ts
installVietnamKmlAirspaceControls(this.map);
```

## Ghi chú

- Dữ liệu giữ nguyên hình học từ KML/KMZ Google Earth, không dùng ảnh chụp màn hình.
- Thuộc tính được chuẩn hóa thêm: `category`, `airport_icao`, `procedure_type`, `navigation_type`, `runway`, `folder_path`.
- Dữ liệu dùng cho `Decision-support / Non-operational`, không dùng cho điều hành bay trực tiếp.
- Với SID/STAR/IAP, nên bật từng sân bay thay vì load toàn bộ để tránh nặng bản đồ.

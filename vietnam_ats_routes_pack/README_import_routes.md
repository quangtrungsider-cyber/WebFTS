# Vietnam ATS Routes Pack for WebATM / VATM FTS

This pack was auto-extracted from the uploaded AIP Viet Nam route PDFs:

- `VV-ENR-3.1-en.pdf`: ENR 3.1 Lower ATS Routes
- `VV-ENR-3.3-en.pdf`: ENR 3.3 Area Navigation (RNAV) Routes

## Output files

- `vietnam_ats_routes.geojson` - LineString route layer for MapLibre/WebATM.
- `vietnam_ats_waypoints.geojson` - Point layer for route waypoints/navaids.
- `vietnam_ats_route_points.csv` - Flat route-point table.
- `vietnam_ats_routes_summary.csv` - Route-level summary.
- `VietnamAtsRoutesLayer.ts` - MapLibre layer helper for WebATM.

## Extraction summary

- Routes extracted: 69
- Route points extracted: 339
- Unique waypoint/name-coordinate pairs: 202

## How to install into WebATM

Copy the GeoJSON files:

```bash
mkdir -p WebATM/static/data
cp vietnam_ats_routes.geojson WebATM/static/data/
cp vietnam_ats_waypoints.geojson WebATM/static/data/
```

Copy `VietnamAtsRoutesLayer.ts` into your frontend map folder, for example:

```bash
cp VietnamAtsRoutesLayer.ts frontend/src/ui/map/
```

Then import and call it after your MapLibre map has loaded:

```ts
import { addVietnamAtsRoutesLayer } from "./VietnamAtsRoutesLayer";

this.map.on("load", () => {
  addVietnamAtsRoutesLayer(this.map);
});
```

Then rebuild:

```bash
cd frontend
npm run build
cd ..
python WebATM.py
```

## Important notice

This is an automated extraction for visualization/prototype use. Review route sequences and coordinates against the official AIP before using in any official, safety, regulatory, or operational workflow.

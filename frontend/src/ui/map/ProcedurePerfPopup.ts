/**
 * Click a SID/STAR/IAP track on the map to see the altitude and speed the AIP
 * publishes for that leg.
 *
 * The values come from properties added to the procedure features by
 * `FTS Server/tools/airways/add_perf_from_aip.py` (end_fix, alt_m, alt_ft,
 * alt_type, speed_kmh, speed_kt, speed_type, start_*, perf_src). A leg without
 * those properties simply has nothing published / loaded yet, and the popup
 * says so instead of showing a made-up value.
 *
 * VATM FTS / Decision-support / Non-operational. Not for operational use.
 */
import maplibregl from "maplibre-gl";
import type { MapMouseEvent } from "maplibre-gl";

const PROC_LINE_LAYER = /^vatm-kmz-proc-[a-z0-9]+-line$/;
const installed = new WeakSet<maplibregl.Map>();
const HIT_PX = 6;
const MAX_ROWS = 4;

type Props = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const fmt = (n: number): string => n.toLocaleString("vi-VN");

const TYPE_LABEL: Record<string, string> = {
  AT: "tại",
  AT_OR_ABOVE: "tại hoặc trên",
  AT_OR_BELOW: "tại hoặc dưới",
};

/** "tại hoặc trên 1.850 m (6.070 ft)" -- null when the AIP published no value. */
function describe(
  props: Props,
  metricKey: string,
  imperialKey: string,
  typeKey: string,
  metricUnit: string,
  imperialUnit: string,
): string | null {
  const metric = num(props[metricKey]);
  if (metric === null) return null;
  const imperial = num(props[imperialKey]);
  const kind = TYPE_LABEL[str(props[typeKey])] ?? "";
  const val = `${fmt(metric)} ${metricUnit}` + (imperial !== null ? ` (${fmt(imperial)} ${imperialUnit})` : "");
  return kind ? `${kind} ${val}` : val;
}

function hasPerf(p: Props): boolean {
  return ["alt_m", "speed_kmh", "start_alt_m", "start_speed_kmh"].some((k) => num(p[k]) !== null);
}

function row(label: string, value: string): HTMLElement {
  const r = document.createElement("div");
  r.style.cssText = "display:flex;gap:8px;margin:2px 0;";
  const l = document.createElement("span");
  l.style.cssText = "min-width:112px;color:#555;";
  l.textContent = label;
  const v = document.createElement("span");
  v.style.cssText = "font-weight:600;";
  v.textContent = value;
  r.append(l, v);
  return r;
}

function buildSection(p: Props): HTMLElement {
  const box = document.createElement("div");
  box.style.cssText = "padding:6px 0;border-top:1px solid #ddd;";
  const head = document.createElement("div");
  head.style.cssText = "font-weight:700;font-size:13px;";
  head.textContent = `${str(p.procedure_name) || "?"}  ·  ${str(p.procedure_type)}`;
  box.appendChild(head);
  const leg = document.createElement("div");
  leg.style.cssText = "color:#555;margin-bottom:3px;";
  leg.textContent = `Chặng: ${str(p.name) || "-"}`;
  box.appendChild(leg);

  const startAlt = describe(p, "start_alt_m", "start_alt_ft", "start_alt_type", "m", "ft");
  const startSpd = describe(p, "start_speed_kmh", "start_speed_kt", "start_speed_type", "km/h", "kt");
  const endAlt = describe(p, "alt_m", "alt_ft", "alt_type", "m", "ft");
  const endSpd = describe(p, "speed_kmh", "speed_kt", "speed_type", "km/h", "kt");
  const startFix = str(p.start_fix);
  const endFix = str(p.end_fix);

  if (startAlt) box.appendChild(row(`Độ cao đầu chặng (${startFix})`, startAlt));
  if (startSpd) box.appendChild(row(`Tốc độ đầu chặng (${startFix})`, startSpd));
  if (endAlt) box.appendChild(row(`Độ cao qua ${endFix}`, endAlt));
  if (endSpd) box.appendChild(row(`Tốc độ qua ${endFix}`, endSpd));
  if (!hasPerf(p)) {
    const none = document.createElement("div");
    none.style.cssText = "color:#8a5a00;";
    none.textContent = "Chưa có độ cao/tốc độ cho chặng này (AIP không ghi hoặc chưa được nạp).";
    box.appendChild(none);
  }
  const src = str(p.perf_src);
  if (src) {
    const s = document.createElement("div");
    s.style.cssText = "color:#777;font-size:11px;margin-top:3px;";
    s.textContent = `Nguồn: ${src}`;
    box.appendChild(s);
  }
  return box;
}

function procLayerIds(map: maplibregl.Map): string[] {
  const layers = map.getStyle()?.layers ?? [];
  return layers.filter((l) => PROC_LINE_LAYER.test(l.id)).map((l) => l.id);
}

function hit(map: maplibregl.Map, e: MapMouseEvent): Props[] {
  const layers = procLayerIds(map);
  if (layers.length === 0) return [];
  const box: [maplibregl.PointLike, maplibregl.PointLike] = [
    [e.point.x - HIT_PX, e.point.y - HIT_PX],
    [e.point.x + HIT_PX, e.point.y + HIT_PX],
  ];
  const seen = new Set<string>();
  const out: Props[] = [];
  for (const f of map.queryRenderedFeatures(box, { layers })) {
    const p = (f.properties ?? {}) as Props;
    // The same leg can come back in several tiles / duplicate variants.
    const key = [p.procedure_type, p.procedure_name, p.name, p.alt_m, p.speed_kmh, p.start_alt_m].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  // Legs that carry data first, so a click never hides the useful one behind a bare duplicate.
  return out.sort((a, b) => Number(hasPerf(b)) - Number(hasPerf(a)));
}

export function installProcedurePerfPopup(map: maplibregl.Map): void {
  if (installed.has(map)) return;
  installed.add(map);
  let popup: maplibregl.Popup | null = null;

  map.on("click", (e: MapMouseEvent) => {
    const props = hit(map, e);
    if (props.length === 0) return;
    popup?.remove();
    const root = document.createElement("div");
    root.style.cssText = "font-size:12px;line-height:1.35;color:#111;max-width:320px;";
    props.slice(0, MAX_ROWS).forEach((p) => root.appendChild(buildSection(p)));
    if (props.length > MAX_ROWS) {
      const more = document.createElement("div");
      more.style.cssText = "color:#777;font-size:11px;padding-top:4px;";
      more.textContent = `… và ${props.length - MAX_ROWS} chặng khác tại điểm này (phóng to để chọn rõ hơn).`;
      root.appendChild(more);
    }
    popup = new maplibregl.Popup({ closeButton: true, maxWidth: "340px" }).setLngLat(e.lngLat).setDOMContent(root).addTo(map);
  });

  // Pointer cursor over a procedure track -- only toggled when nothing else changed it.
  map.on("mousemove", (e: MapMouseEvent) => {
    const canvas = map.getCanvas();
    const over = hit(map, e).length > 0;
    if (over && canvas.style.cursor === "") canvas.style.cursor = "pointer";
    else if (!over && canvas.style.cursor === "pointer") canvas.style.cursor = "";
  });
}

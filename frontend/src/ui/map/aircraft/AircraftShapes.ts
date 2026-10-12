/**
 * Aircraft Shape Definitions
 *
 * This file contains different aircraft shape drawing functions for the map display.
 * Each shape is designed to point upward and will be rotated by MapLibre based on aircraft heading.
 */

import { AircraftShapeDrawer } from './AircraftRenderer';

/**
 * Chevron shape (default)
 * Classic air traffic control chevron with tail notch
 */
// export const drawChevronShape: AircraftShapeDrawer = (ctx, size) => {
//     ctx.beginPath();
//     ctx.moveTo(size / 2, 8);           // Top point
//     ctx.lineTo(size / 2 - 8, size - 8); // Bottom left
//     ctx.lineTo(size / 2, size - 12);    // Bottom center notch
//     ctx.lineTo(size / 2 + 8, size - 8); // Bottom right
//     ctx.closePath();
// };

/**
 * Simple arrow shape
 * Clean arrow with defined tail - proportional to canvas size
 */
export const drawChevronShape: AircraftShapeDrawer = (ctx, size) => {
    const c = size / 2;
    const margin = size * 0.15;        // 15% margin from edges
    const width = size * 0.3;          // 30% width on each side
    const notch = size * 0.12;         // 12% tail notch depth

    ctx.beginPath();
    ctx.moveTo(c, margin);                  // Top point
    ctx.lineTo(c - width, size - margin);   // Bottom left
    ctx.lineTo(c, size - margin - notch);   // Bottom center (tail notch)
    ctx.lineTo(c + width, size - margin);   // Bottom right
    ctx.closePath();
};

/**
 * Simple triangle shape
 * Basic triangle pointing upward - proportional to canvas size
 */
export const drawTriangleShape: AircraftShapeDrawer = (ctx, size) => {
    const c = size / 2;
    const margin = size * 0.15;        // 15% margin from edges
    const width = size * 0.3;          // 30% width on each side

    ctx.beginPath();
    ctx.moveTo(c, margin);                  // Top point
    ctx.lineTo(c - width, size - margin);   // Bottom left
    ctx.lineTo(c + width, size - margin);   // Bottom right
    ctx.closePath();
};

/**
 * Aircraft silhouette with wings
 * Simple but recognizable airplane shape with fuselage, wings, and tail
 */
export const drawAircraftShape: AircraftShapeDrawer = (ctx, size) => {
    const c = size / 2;

    // Define proportions
    const noseY = size * 0.1;           // Nose position
    const wingY = size * 0.42;          // Wing position
    const tailY = size * 0.85;          // Tail position
    const wingSpan = size * 0.4;        // Wing span (half width)
    const fuselageWidth = size * 0.06;  // Fuselage width (half)
    const tailSpan = size * 0.22;       // Tail span (half width)
    const tailWidth = size * 0.05;      // Tail thickness

    ctx.beginPath();

    // Start at nose tip
    ctx.moveTo(c, noseY);

    // Right side of fuselage to wing leading edge
    ctx.lineTo(c + fuselageWidth, wingY - size * 0.02);

    // Right wing - swept back leading edge
    ctx.lineTo(c + wingSpan, wingY + size * 0.08);
    // Wing trailing edge
    ctx.lineTo(c + wingSpan * 0.85, wingY + size * 0.12);

    // Back to right fuselage
    ctx.lineTo(c + fuselageWidth, wingY + size * 0.06);

    // Right fuselage to tail
    ctx.lineTo(c + fuselageWidth * 0.8, tailY - size * 0.08);

    // Right horizontal stabilizer
    ctx.lineTo(c + tailSpan, tailY);
    ctx.lineTo(c + tailSpan * 0.8, tailY + tailWidth);
    ctx.lineTo(c + fuselageWidth * 0.5, tailY - size * 0.02);

    // Tail tip
    ctx.lineTo(c, tailY);

    // Mirror for left side
    // Left horizontal stabilizer
    ctx.lineTo(c - fuselageWidth * 0.5, tailY - size * 0.02);
    ctx.lineTo(c - tailSpan * 0.8, tailY + tailWidth);
    ctx.lineTo(c - tailSpan, tailY);

    // Left fuselage from tail
    ctx.lineTo(c - fuselageWidth * 0.8, tailY - size * 0.08);
    ctx.lineTo(c - fuselageWidth, wingY + size * 0.06);

    // Left wing trailing edge
    ctx.lineTo(c - wingSpan * 0.85, wingY + size * 0.12);
    // Left wing leading edge
    ctx.lineTo(c - wingSpan, wingY + size * 0.08);

    // Back to left fuselage
    ctx.lineTo(c - fuselageWidth, wingY - size * 0.02);

    // Complete the shape back to nose
    ctx.closePath();
    ctx.fill();
};


/**
 * Drone shape with rotors
 * Quadcopter with central body, four rotors in X configuration, and directional indicator
 */
export const drawDroneShape: AircraftShapeDrawer = (ctx, size) => {
    const c = size / 2;
    const armLength = size * 0.32;
    const armWidth = size * 0.04;
    const bodySize = size * 0.15;
    const rotorRadius = size * 0.08;
    const angle = Math.PI / 4; // 45 degrees for X configuration

    // Proportional stroke width (thinner border)
    const strokeWidth = Math.max(1, size / 48);

    // Calculate rotor positions (diagonal X pattern)
    const rotorPositions = [
        [c - armLength * Math.cos(angle), c - armLength * Math.sin(angle)], // Front left
        [c + armLength * Math.cos(angle), c - armLength * Math.sin(angle)], // Front right
        [c + armLength * Math.cos(angle), c + armLength * Math.sin(angle)], // Back right
        [c - armLength * Math.cos(angle), c + armLength * Math.sin(angle)]  // Back left
    ];

    // Draw arms with white stroke (diagonal lines)
    ctx.lineWidth = armWidth;
    ctx.lineCap = 'round';

    // White border for arms (thinner)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = armWidth + strokeWidth;
    for (const [x, y] of rotorPositions) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    // Colored arms
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = armWidth;
    for (const [x, y] of rotorPositions) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    // Draw rotors (4 circles at arm ends) with white stroke
    for (const [x, y] of rotorPositions) {
        // White border (thinner)
        ctx.beginPath();
        ctx.arc(x, y, rotorRadius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
        ctx.fill();
    }

    // Draw central body with white stroke (thinner)
    ctx.beginPath();
    ctx.arc(c, c, bodySize, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    ctx.fill();

    // Draw directional indicator (small arrow pointing up/forward)
    const arrowSize = size * 0.12;
    const arrowY = c - bodySize - size * 0.15; // Above the body (further away)
    ctx.beginPath();
    ctx.moveTo(c, arrowY - arrowSize);           // Arrow tip (top)
    ctx.lineTo(c - arrowSize * 0.5, arrowY);     // Left base
    ctx.lineTo(c, arrowY - arrowSize * 0.4);     // Center notch
    ctx.lineTo(c + arrowSize * 0.5, arrowY);     // Right base
    ctx.closePath();

    // White border for arrow (thinner)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
    ctx.fill();
};

/**
 * Adjust a hex color's lightness by a percentage (-100..100).
 * Used to derive highlight/shadow shades from the aircraft's current
 * semantic color (normal/selected/conflict) for the pseudo-3D shape below.
 */
function shadeHexColor(hex: string, percent: number): string {
    const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!match) return hex; // not a plain hex color (e.g. already a gradient) -- leave as-is
    const num = parseInt(match[1], 16);
    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const r = clamp(((num >> 16) & 0xff) + Math.round(255 * (percent / 100)));
    const g = clamp(((num >> 8) & 0xff) + Math.round(255 * (percent / 100)));
    const b = clamp((num & 0xff) + Math.round(255 * (percent / 100)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Trace the aircraft silhouette used by drawAircraft3DShape into ctx's
 * current path (nose at top, tail at bottom, same proportions the other
 * "aircraft" shape uses). Shared by the drop-shadow pass and the main body
 * fill so both stay pixel-identical.
 */
function traceAircraft3DOutline(ctx: CanvasRenderingContext2D, size: number): void {
    const c = size / 2;
    const noseY = size * 0.08;
    const wingY = size * 0.44;
    const tailY = size * 0.88;
    const wingSpan = size * 0.42;
    const fuselageWidth = size * 0.09;
    const tailSpan = size * 0.2;

    ctx.beginPath();
    ctx.moveTo(c, noseY);
    ctx.lineTo(c + fuselageWidth, wingY - size * 0.03);
    ctx.lineTo(c + wingSpan, wingY + size * 0.1);
    ctx.lineTo(c + wingSpan * 0.8, wingY + size * 0.16);
    ctx.lineTo(c + fuselageWidth * 0.9, wingY + size * 0.08);
    ctx.lineTo(c + fuselageWidth * 0.6, tailY - size * 0.05);
    ctx.lineTo(c + tailSpan, tailY);
    ctx.lineTo(c + tailSpan * 0.75, tailY + size * 0.05);
    ctx.lineTo(c, tailY - size * 0.03);
    ctx.lineTo(c - tailSpan * 0.75, tailY + size * 0.05);
    ctx.lineTo(c - tailSpan, tailY);
    ctx.lineTo(c - fuselageWidth * 0.6, tailY - size * 0.05);
    ctx.lineTo(c - fuselageWidth * 0.9, wingY + size * 0.08);
    ctx.lineTo(c - wingSpan * 0.8, wingY + size * 0.16);
    ctx.lineTo(c - wingSpan, wingY + size * 0.1);
    ctx.lineTo(c - fuselageWidth, wingY - size * 0.03);
    ctx.closePath();
}

/**
 * "3D look" aircraft silhouette -- a cheap, purely 2D canvas shape (baked
 * once into a bitmap sprite, same as the other shapes here), instead of the
 * much heavier Three.js/.glb "Show 3D aircraft" overlay (which re-renders a
 * real 3D model every frame per aircraft and can heat up the CPU/GPU on
 * larger scenarios). No WebGL, no per-frame cost beyond the normal 2D icon.
 *
 * What actually sells "3D" in a small flat top-down icon is contrast, not a
 * subtle tint: (1) a clearly offset, dark drop shadow so the icon reads as
 * floating above the map rather than painted on it, (2) a glossy radial
 * "sheen" spot near the nose/cockpit -- the single strongest cheap cue for
 * "rounded solid object" -- fading to a darker shade at the wingtips/tail,
 * (3) wings rendered as a distinctly darker flat panel so they don't blend
 * into the fuselage tone, and (4) a thin dark centerline crease down the
 * fuselage, actually stroked (an earlier version left this un-stroked, so
 * it never rendered).
 */
export const drawAircraft3DShape: AircraftShapeDrawer = (ctx, size) => {
    const c = size / 2;
    const noseY = size * 0.08;
    const wingY = size * 0.44;
    const tailY = size * 0.88;
    const wingSpan = size * 0.42;
    const fuselageWidth = size * 0.09;

    const baseColor = ctx.fillStyle as string;

    // 1) Drop shadow: a clearly-offset, blurred dark silhouette so the icon
    // reads as sitting above the map instead of flat-printed on it.
    ctx.save();
    ctx.filter = `blur(${Math.max(1, size * 0.05)}px)`;
    ctx.translate(size * 0.1, size * 0.13);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    traceAircraft3DOutline(ctx, size);
    ctx.fill();
    ctx.restore();

    // 2) Main body base tone, slightly darkened -- the radial sheen (below)
    // does the highlighting, so the base itself leans toward the shadow end.
    ctx.fillStyle = shadeHexColor(baseColor, -15);
    traceAircraft3DOutline(ctx, size);
    ctx.fill();

    // 3) Wings as a distinctly darker flat panel on top of the body fill --
    // separates "rounded fuselage" from "flat wing" instead of one uniform
    // tone across both.
    ctx.fillStyle = shadeHexColor(baseColor, -30);
    ctx.beginPath();
    ctx.moveTo(c + fuselageWidth * 0.6, wingY - size * 0.02);
    ctx.lineTo(c + wingSpan, wingY + size * 0.1);
    ctx.lineTo(c + wingSpan * 0.8, wingY + size * 0.16);
    ctx.lineTo(c + fuselageWidth * 0.5, wingY + size * 0.09);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c - fuselageWidth * 0.6, wingY - size * 0.02);
    ctx.lineTo(c - wingSpan, wingY + size * 0.1);
    ctx.lineTo(c - wingSpan * 0.8, wingY + size * 0.16);
    ctx.lineTo(c - fuselageWidth * 0.5, wingY + size * 0.09);
    ctx.closePath();
    ctx.fill();

    // 4) Glossy radial highlight centered just behind the nose, clipped to
    // the fuselage/cockpit area -- the main "this is a lit, rounded object"
    // cue. Clipping to the outline keeps it from washing out over the wings.
    ctx.save();
    traceAircraft3DOutline(ctx, size);
    ctx.clip();
    const sheenY = noseY + size * 0.16;
    const sheen = ctx.createRadialGradient(c, sheenY, 0, c, sheenY, size * 0.34);
    sheen.addColorStop(0, shadeHexColor(baseColor, 70));
    sheen.addColorStop(0.35, shadeHexColor(baseColor, 25));
    sheen.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // 5) Thin dark centerline crease down the fuselage -- reinforces the
    // "rounded cylinder" read. Actually stroked (unlike an earlier version
    // of this shape, which built the line into the fill path and never
    // called stroke(), so it silently never appeared).
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c, noseY + size * 0.1);
    ctx.lineTo(c, tailY - size * 0.12);
    ctx.strokeStyle = shadeHexColor(baseColor, -45);
    ctx.lineWidth = Math.max(0.6, size * 0.012);
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.restore();

    // Leave the full outline as the current path so the caller's shared
    // fill()/stroke() (white border) still lands in the right place.
    ctx.fillStyle = shadeHexColor(baseColor, -15);
    traceAircraft3DOutline(ctx, size);
};

/**
 * Available aircraft shapes with display names
 */
export const AIRCRAFT_SHAPES = {
    chevron: { name: 'Chevron', drawer: drawChevronShape },
    triangle: { name: 'Triangle', drawer: drawTriangleShape },
    aircraft: { name: 'Aircraft', drawer: drawAircraftShape },
    drone: { name: 'Drone', drawer: drawDroneShape },
    aircraft3d: { name: 'Aircraft (3D look)', drawer: drawAircraft3DShape }
} as const;

export type AircraftShapeType = keyof typeof AIRCRAFT_SHAPES;

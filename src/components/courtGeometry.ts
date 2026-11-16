// Court geometry for CBBD shot locations on an NCAA men's half court.
//
// CBBD location format (tenths of a foot on a FULL 94 x 50 ft court):
//   x: 0-940 along the length (baseline to baseline)
//   y: 0-500 across the width (sideline to sideline)
//   Hoops sit at x = 52.5 and x = 887.5, both at y = 250.
// Shots at the far basket are rotated 180 degrees onto the near half, which is
// what CBBD's own shot chart tutorial does (x -> 94 - x, y -> 50 - y).
//
// Everything below is in feet unless the name ends in Px. The SVG uses 10 px per ft.

export const PX_PER_FT = 10;
export const COURT_W_FT = 50;
export const FULL_COURT_FT = 94;
export const HALF_COURT_FT = 47;
export const SVG_W = COURT_W_FT * PX_PER_FT; // 500
export const SVG_H = HALF_COURT_FT * PX_PER_FT; // 470

// NCAA men's court dimensions
export const HOOP_FROM_BASELINE = 5.25; // rim center to baseline
export const HOOP_X_FT = COURT_W_FT / 2; // rim center to either sideline
export const BACKBOARD_FROM_BASELINE = 4;
export const BACKBOARD_W = 6;
export const RIM_RADIUS = 0.75; // 18 in diameter
export const LANE_HALF_W = 6; // 12 ft wide lane
export const FT_LINE = 19; // free throw line, from baseline
export const FT_CIRCLE_R = 6;
export const RA_RADIUS = 4; // restricted area arc

export const THREE_RADIUS = 22 + 1.75 / 12; // 22 ft 1 3/4 in, rim center to arc
export const THREE_CORNER_FROM_HOOP = 21 + 8 / 12; // 21 ft 8 in, rim center to corner line
export const CORNER_OFFSET = HOOP_X_FT - THREE_CORNER_FROM_HOOP; // ~3.33 ft from sideline
// Distance from baseline where the straight corner section meets the arc (~9.83 ft)
export const CORNER_TOP_FT = HOOP_FROM_BASELINE + Math.sqrt(THREE_RADIUS ** 2 - THREE_CORNER_FROM_HOOP ** 2);

// Zone dividers: the lane lines extended to the arc
export const LANE_LEFT_FT = HOOP_X_FT - LANE_HALF_W; // 19
export const LANE_RIGHT_FT = HOOP_X_FT + LANE_HALF_W; // 31

// Pixel versions
const n = (v: number) => +v.toFixed(2);
const R = THREE_RADIUS * PX_PER_FT;
export const HOOP_PX = { x: HOOP_X_FT * PX_PER_FT, y: SVG_H - HOOP_FROM_BASELINE * PX_PER_FT };
const cornerL = CORNER_OFFSET * PX_PER_FT;
const cornerR = SVG_W - cornerL;
const cornerY = SVG_H - CORNER_TOP_FT * PX_PER_FT;
const laneL = LANE_LEFT_FT * PX_PER_FT;
const laneR = LANE_RIGHT_FT * PX_PER_FT;
const ftY = SVG_H - FT_LINE * PX_PER_FT;
// y where the 3-point arc crosses the (extended) lane lines
const arcAtLaneY = HOOP_PX.y - Math.sqrt(R ** 2 - (HOOP_PX.x - laneL) ** 2);

/** CBBD (x, y) in tenths of a foot -> half-court feet plus SVG pixels. */
export function getNormalizedCoords(x: number, y: number) {
  let lengthFt = x / 10;
  let widthFt = y / 10;

  // Far-half shots: rotate 180 degrees onto the near half
  if (lengthFt > HALF_COURT_FT) {
    lengthFt = FULL_COURT_FT - lengthFt;
    widthFt = COURT_W_FT - widthFt;
  }

  const cx = widthFt * PX_PER_FT;
  const cy = SVG_H - lengthFt * PX_PER_FT; // baseline at bottom
  return { cx, cy, widthFt, lengthFt };
}

export type ZoneName =
  | 'Restricted Area'
  | 'Paint'
  | 'Left Corner 3'
  | 'Right Corner 3'
  | 'Left Wing 3'
  | 'Right Wing 3'
  | 'Top of Key 3'
  | 'Left Mid-Range'
  | 'Right Mid-Range'
  | 'Top of Key';

/** Zone for a shot, using the same lines that are drawn on the court. */
export function getShotZone(widthFt: number, lengthFt: number): ZoneName {
  const dist = Math.hypot(lengthFt - HOOP_FROM_BASELINE, widthFt - HOOP_X_FT);

  if (dist < RA_RADIUS) return 'Restricted Area';

  if (lengthFt < FT_LINE && widthFt >= LANE_LEFT_FT && widthFt <= LANE_RIGHT_FT) return 'Paint';

  // Corner 3s: beyond the straight corner line, below where it meets the arc
  if (lengthFt <= CORNER_TOP_FT && widthFt <= CORNER_OFFSET) return 'Left Corner 3';
  if (lengthFt <= CORNER_TOP_FT && widthFt >= COURT_W_FT - CORNER_OFFSET) return 'Right Corner 3';

  // Arc 3s
  if (dist >= THREE_RADIUS) {
    if (widthFt < LANE_LEFT_FT) return 'Left Wing 3';
    if (widthFt > LANE_RIGHT_FT) return 'Right Wing 3';
    return 'Top of Key 3';
  }

  // Inside the arc
  if (widthFt < LANE_LEFT_FT) return 'Left Mid-Range';
  if (widthFt > LANE_RIGHT_FT) return 'Right Mid-Range';
  return 'Top of Key'; // between the free throw line and the arc
}

// ---- Drawn court lines -------------------------------------------------------

export const THREE_PT_PATH = `M ${n(cornerL)} ${SVG_H} V ${n(cornerY)} A ${n(R)} ${n(R)} 0 0 1 ${n(cornerR)} ${n(cornerY)} V ${SVG_H}`;

// ---- Heatmap zones (shapes follow the drawn lines) ---------------------------

export interface ZoneShape {
  name: ZoneName;
  d: string;
  label: { x: number; y: number; small?: boolean };
}

const arc = (rx: number, sweep: 0 | 1, x: number, y: number) => `A ${n(rx)} ${n(rx)} 0 0 ${sweep} ${n(x)} ${n(y)}`;

// Restricted Area is a circle; it is drawn last, on top of the Paint.
export const RESTRICTED_AREA = { cx: HOOP_PX.x, cy: HOOP_PX.y, r: RA_RADIUS * PX_PER_FT };

export const ZONES: ZoneShape[] = [
  {
    name: 'Top of Key 3',
    d: `M ${laneL} 0 H ${laneR} V ${n(arcAtLaneY)} ${arc(R, 0, laneL, arcAtLaneY)} Z`,
    label: { x: 250, y: 100 },
  },
  {
    name: 'Left Wing 3',
    d: `M 0 0 H ${laneL} V ${n(arcAtLaneY)} ${arc(R, 0, cornerL, cornerY)} H 0 Z`,
    label: { x: 95, y: 150 },
  },
  {
    name: 'Right Wing 3',
    d: `M ${SVG_W} 0 H ${laneR} V ${n(arcAtLaneY)} ${arc(R, 1, cornerR, cornerY)} H ${SVG_W} Z`,
    label: { x: 405, y: 150 },
  },
  {
    name: 'Left Corner 3',
    d: `M 0 ${n(cornerY)} H ${n(cornerL)} V ${SVG_H} H 0 Z`,
    label: { x: n(cornerL / 2), y: 420, small: true },
  },
  {
    name: 'Right Corner 3',
    d: `M ${n(cornerR)} ${n(cornerY)} H ${SVG_W} V ${SVG_H} H ${n(cornerR)} Z`,
    label: { x: n((cornerR + SVG_W) / 2), y: 420, small: true },
  },
  {
    name: 'Left Mid-Range',
    d: `M ${n(cornerL)} ${SVG_H} V ${n(cornerY)} ${arc(R, 1, laneL, arcAtLaneY)} V ${SVG_H} Z`,
    label: { x: 110, y: 360 },
  },
  {
    name: 'Right Mid-Range',
    d: `M ${n(cornerR)} ${SVG_H} V ${n(cornerY)} ${arc(R, 0, laneR, arcAtLaneY)} V ${SVG_H} Z`,
    label: { x: 390, y: 360 },
  },
  {
    name: 'Top of Key',
    d: `M ${laneL} ${ftY} V ${n(arcAtLaneY)} ${arc(R, 1, laneR, arcAtLaneY)} V ${ftY} Z`,
    label: { x: 250, y: 240 },
  },
  {
    name: 'Paint',
    d: `M ${laneL} ${ftY} H ${laneR} V ${SVG_H} H ${laneL} Z`,
    label: { x: 250, y: 330 },
  },
];
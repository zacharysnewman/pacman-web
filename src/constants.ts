export const gridW = 28;
export const gridH = 36;
export const unit = 20;

// Warp tunnel
export const TUNNEL_ROW = 17;
export const TUNNEL_SLOW_COL_MAX = 5;   // cols 0–5 (left side)
export const TUNNEL_SLOW_COL_MIN = 22;  // cols 22–27 (right side)

// T-junctions where ghosts cannot turn upward in scatter/chase mode
export const RED_ZONE_TILES = [
    { x: 12, y: 13 },
    { x: 15, y: 13 },
    { x: 12, y: 25 },
    { x: 15, y: 25 },
] as const;
export const RED_ZONE = new Set(RED_ZONE_TILES.map(t => `${t.x},${t.y}`));

export const gridW = 28;
export const gridH = 36;
export const unit = 20;

// T-junctions where ghosts cannot turn upward in scatter/chase mode
export const RED_ZONE_TILES = [
    { x: 12, y: 13 },
    { x: 15, y: 13 },
    { x: 12, y: 25 },
    { x: 15, y: 25 },
] as const;
export const RED_ZONE = new Set(RED_ZONE_TILES.map(t => `${t.x},${t.y}`));

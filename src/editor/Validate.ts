import { gridW, gridH } from '../constants';
import type { LevelData } from '../types';
import { TILE_WALL, TILE_DOT, TILE_POWER } from '../tiles';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    dotCount: number;
}

function isWalkable(level: LevelData, x: number, y: number): boolean {
    const tx = Math.round(x);
    const ty = Math.round(y);
    return tx >= 0 && tx < gridW && ty >= 0 && ty < gridH && level.tiles[ty][tx] > TILE_WALL;
}

export function validateLevel(level: LevelData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Grid dimensions
    if (level.tiles.length !== gridH) {
        errors.push(`Grid must have ${gridH} rows (has ${level.tiles.length})`);
    }
    for (let y = 0; y < Math.min(level.tiles.length, gridH); y++) {
        if (level.tiles[y].length !== gridW) {
            errors.push(`Row ${y} must have ${gridW} columns (has ${level.tiles[y].length})`);
            break;
        }
    }
    if (errors.length > 0) return { valid: false, errors, warnings, dotCount: 0 };

    // 2. Count collectibles
    let dotCount = 0;
    for (const row of level.tiles) {
        for (const t of row) {
            if (t === TILE_DOT || t === TILE_POWER) dotCount++;
        }
    }
    if (dotCount === 0) errors.push('Level must contain at least one dot or power pellet');

    // 3. Player spawn must be on a walkable tile
    const ps = level.playerStart;
    if (!isWalkable(level, ps.x, ps.y)) {
        errors.push(`Player spawn (${Math.round(ps.x)}, ${Math.round(ps.y)}) is on a wall`);
    }

    // 4. All enemy spawns must be on walkable tiles
    const enemyEntries: Array<{ name: string; pos: { x: number; y: number } }> = [
        { name: 'Red enemy',     pos: level.enemyStarts.redEnemy     },
        { name: 'Cyan enemy',    pos: level.enemyStarts.cyanEnemy    },
        { name: 'Pink enemy',    pos: level.enemyStarts.hotpinkEnemy },
        { name: 'Orange enemy',  pos: level.enemyStarts.orangeEnemy  },
    ];
    for (const { name, pos } of enemyEntries) {
        if (!isWalkable(level, pos.x, pos.y)) {
            errors.push(`${name} spawn (${Math.round(pos.x)}, ${Math.round(pos.y)}) is on a wall`);
        }
    }

    // 5. Fruit spawn must be on a walkable tile
    const fs = level.fruitSpawn;
    if (!isWalkable(level, fs.x, fs.y)) {
        warnings.push(`Fruit spawn (${Math.round(fs.x)}, ${Math.round(fs.y)}) is on a wall`);
    }

    // 6. Tunnel row in bounds
    if (level.tunnelRow < 0 || level.tunnelRow >= gridH) {
        errors.push(`Tunnel row ${level.tunnelRow} is out of bounds`);
    }

    // 7. BFS reachability from player start (respect tunnel wrapping)
    const startX = Math.round(ps.x);
    const startY = Math.round(ps.y);
    const reachable = new Set<string>();
    const queue: Array<{ x: number; y: number }> = [];

    if (startX >= 0 && startX < gridW && startY >= 0 && startY < gridH &&
        level.tiles[startY][startX] > TILE_WALL) {
        queue.push({ x: startX, y: startY });
    }

    while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        const key = `${x},${y}`;
        if (reachable.has(key)) continue;
        if (x < 0 || x >= gridW || y < 0 || y >= gridH) continue;
        if (level.tiles[y][x] === TILE_WALL) continue;
        reachable.add(key);

        // Tunnel wrapping on tunnel row
        if (y === level.tunnelRow) {
            if (x === 0)          queue.push({ x: gridW - 1, y });
            if (x === gridW - 1)  queue.push({ x: 0, y });
        }
        queue.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 });
    }

    // Check all dots are reachable
    let unreachableDot = false;
    for (let y = 0; y < gridH && !unreachableDot; y++) {
        for (let x = 0; x < gridW && !unreachableDot; x++) {
            const t = level.tiles[y][x];
            if ((t === TILE_DOT || t === TILE_POWER) && !reachable.has(`${x},${y}`)) {
                errors.push('Some dots are unreachable from the player spawn position');
                unreachableDot = true;
            }
        }
    }

    // 8. Level name should not be empty
    if (!level.name || level.name.trim() === '') {
        warnings.push('Level has no name');
    }

    return { valid: errors.length === 0, errors, warnings, dotCount };
}

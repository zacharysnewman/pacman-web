import type { LevelData, TileValue } from '../types';

export type EditorTool =
    | 'paint'
    | 'erase'
    | 'fill'
    | 'player_spawn'
    | 'enemy_blinky'
    | 'enemy_inky'
    | 'enemy_pinky'
    | 'enemy_clyde'
    | 'fruit_spawn'
    | 'tunnel_config'
    | 'red_zone';

export interface EditorState {
    level: LevelData;
    selectedTool: EditorTool;
    selectedTileValue: TileValue;
    hoveredCell: { x: number; y: number } | null;
    undoStack: LevelData[];
    redoStack: LevelData[];
    isDirty: boolean;
    showGrid: boolean;
}

export function deepCopyLevel(level: LevelData): LevelData {
    return {
        ...level,
        tiles: level.tiles.map(row => [...row] as TileValue[]),
        playerStart:    { ...level.playerStart },
        enemyStarts: {
            blinky: { ...level.enemyStarts.blinky },
            inky:   { ...level.enemyStarts.inky },
            pinky:  { ...level.enemyStarts.pinky },
            clyde:  { ...level.enemyStarts.clyde },
        },
        fruitSpawn:     { ...level.fruitSpawn },
        enemyHouseDoor: { ...level.enemyHouseDoor },
        redZoneTiles:   level.redZoneTiles.map(t => ({ ...t })),
        scatterTargets: {
            blinky: { ...level.scatterTargets.blinky },
            inky:   { ...level.scatterTargets.inky },
            pinky:  { ...level.scatterTargets.pinky },
            clyde:  { ...level.scatterTargets.clyde },
        },
    };
}

export function createEditorState(level: LevelData): EditorState {
    return {
        level: deepCopyLevel(level),
        selectedTool: 'paint',
        selectedTileValue: 5 as TileValue, // TILE_EMPTY
        hoveredCell: null,
        undoStack: [],
        redoStack: [],
        isDirty: false,
        showGrid: true,
    };
}

export function pushUndo(state: EditorState): void {
    state.undoStack.push(deepCopyLevel(state.level));
    state.redoStack = [];
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.isDirty = true;
}

export function undo(state: EditorState): void {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(deepCopyLevel(state.level));
    state.level = state.undoStack.pop()!;
}

export function redo(state: EditorState): void {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(deepCopyLevel(state.level));
    state.level = state.redoStack.pop()!;
}

import { unit, gridW, gridH } from '../constants';
import { gameState } from '../game-state';
import { Levels } from '../static/Levels';
import { Draw } from '../static/Draw';
import { startTestGame } from '../Game';
import type { LevelData, TileValue } from '../types';
import { TILE_EMPTY, TILE_WALL, TILE_GHOST_DOOR, TILE_DOT, TILE_POWER } from '../tiles';
import { validateLevel } from './Validate';
import { saveLevel, listLevels, deleteLevel, formatDate } from './LevelLibrary';
import {
    createEditorState,
    pushUndo,
    undo,
    redo,
    deepCopyLevel,
    type EditorState,
    type EditorTool,
} from './EditorState';

// ── Autosave ──────────────────────────────────────────────────────────────────

const AUTOSAVE_KEY = 'editor_autosave';
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(level: LevelData): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(level));
        } catch {
            // ignore quota errors
        }
    }, 500);
}

function loadAutosave(): LevelData | null {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as LevelData;
    } catch {
        return null;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tileFromCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = gameState.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const tx = Math.floor((clientX - rect.left) * scaleX / unit);
    const ty = Math.floor((clientY - rect.top)  * scaleY / unit);
    if (tx < 0 || tx >= gridW || ty < 0 || ty >= gridH) return null;
    return { x: tx, y: ty };
}

function syncToRenderer(state: EditorState): void {
    gameState.currentLevel = state.level;
    Levels.levelDynamic = state.level.tiles.map(row => [...row] as TileValue[]);
}

// ── Flood Fill (BFS) ──────────────────────────────────────────────────────────

function floodFill(state: EditorState, startX: number, startY: number): void {
    const targetValue = state.level.tiles[startY][startX];
    const fillValue: TileValue = state.selectedTool === 'erase'
        ? TILE_EMPTY as TileValue
        : state.selectedTileValue;
    if (targetValue === fillValue) return;

    const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        if (x < 0 || x >= gridW || y < 0 || y >= gridH) continue;
        if (state.level.tiles[y][x] !== targetValue) continue;
        visited.add(key);
        state.level.tiles[y][x] = fillValue;
        Levels.levelDynamic[y][x] = fillValue;
        queue.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 });
    }
}

// ── Tool Application ──────────────────────────────────────────────────────────

let isPainting = false;
let redZoneDragMode: 'add' | 'remove' | null = null;
const redZoneDragSeen = new Set<string>();

function applyToolDown(state: EditorState, cell: { x: number; y: number }): void {
    const { x, y } = cell;
    switch (state.selectedTool) {
        case 'paint': {
            state.level.tiles[y][x] = state.selectedTileValue;
            Levels.levelDynamic[y][x] = state.selectedTileValue;
            break;
        }
        case 'erase': {
            state.level.tiles[y][x] = TILE_EMPTY as TileValue;
            Levels.levelDynamic[y][x] = TILE_EMPTY as TileValue;
            break;
        }
        case 'fill': {
            floodFill(state, x, y);
            break;
        }
        case 'player_spawn':
            state.level.playerStart = { x, y };
            break;
        case 'enemy_red':
            state.level.enemyStarts.redEnemy = { x, y };
            break;
        case 'enemy_cyan':
            state.level.enemyStarts.cyanEnemy = { x, y };
            break;
        case 'enemy_hotpink':
            state.level.enemyStarts.hotpinkEnemy = { x, y };
            break;
        case 'enemy_orange':
            state.level.enemyStarts.orangeEnemy = { x, y };
            break;
        case 'fruit_spawn':
            state.level.fruitSpawn = { x, y };
            break;
        case 'enemy_house_door':
            state.level.enemyHouseDoor = { x, y };
            break;
        case 'tunnel_config':
            state.level.tunnelRow = y;
            break;
        case 'red_zone': {
            const key = `${x},${y}`;
            const idx = state.level.redZoneTiles.findIndex(t => t.x === x && t.y === y);
            if (idx >= 0) {
                redZoneDragMode = 'remove';
                state.level.redZoneTiles.splice(idx, 1);
            } else {
                redZoneDragMode = 'add';
                state.level.redZoneTiles.push({ x, y });
            }
            redZoneDragSeen.add(key);
            break;
        }
        case 'scatter_red':
            state.level.scatterTargets.redEnemy = { x, y };
            break;
        case 'scatter_cyan':
            state.level.scatterTargets.cyanEnemy = { x, y };
            break;
        case 'scatter_hotpink':
            state.level.scatterTargets.hotpinkEnemy = { x, y };
            break;
        case 'scatter_orange':
            state.level.scatterTargets.orangeEnemy = { x, y };
            break;
    }
}

function applyToolDrag(state: EditorState, cell: { x: number; y: number }): void {
    const { x, y } = cell;
    switch (state.selectedTool) {
        case 'paint': {
            state.level.tiles[y][x] = state.selectedTileValue;
            Levels.levelDynamic[y][x] = state.selectedTileValue;
            break;
        }
        case 'erase': {
            state.level.tiles[y][x] = TILE_EMPTY as TileValue;
            Levels.levelDynamic[y][x] = TILE_EMPTY as TileValue;
            break;
        }
        case 'player_spawn':       state.level.playerStart = { x, y }; break;
        case 'enemy_red':          state.level.enemyStarts.redEnemy = { x, y }; break;
        case 'enemy_cyan':         state.level.enemyStarts.cyanEnemy = { x, y }; break;
        case 'enemy_hotpink':      state.level.enemyStarts.hotpinkEnemy = { x, y }; break;
        case 'enemy_orange':       state.level.enemyStarts.orangeEnemy = { x, y }; break;
        case 'fruit_spawn':        state.level.fruitSpawn = { x, y }; break;
        case 'enemy_house_door':   state.level.enemyHouseDoor = { x, y }; break;
        case 'tunnel_config':      state.level.tunnelRow = y; break;
        case 'scatter_red':        state.level.scatterTargets.redEnemy = { x, y }; break;
        case 'scatter_cyan':       state.level.scatterTargets.cyanEnemy = { x, y }; break;
        case 'scatter_hotpink':    state.level.scatterTargets.hotpinkEnemy = { x, y }; break;
        case 'scatter_orange':     state.level.scatterTargets.orangeEnemy = { x, y }; break;
        case 'red_zone': {
            const key = `${x},${y}`;
            if (redZoneDragSeen.has(key)) break;
            redZoneDragSeen.add(key);
            const idx = state.level.redZoneTiles.findIndex(t => t.x === x && t.y === y);
            if (redZoneDragMode === 'add' && idx < 0) {
                state.level.redZoneTiles.push({ x, y });
            } else if (redZoneDragMode === 'remove' && idx >= 0) {
                state.level.redZoneTiles.splice(idx, 1);
            }
            break;
        }
    }
}

// ── Overlay Rendering ─────────────────────────────────────────────────────────

function drawSpawnMarker(
    ctx: CanvasRenderingContext2D,
    pos: { x: number; y: number },
    color: string,
    label: string,
): void {
    const px = (pos.x + 0.5) * unit;
    const py = (pos.y + 0.5) * unit;
    const r  = unit * 0.38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color + '55';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(unit * 0.38)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, py);
    ctx.restore();
}

function drawCrossMarker(
    ctx: CanvasRenderingContext2D,
    pos: { x: number; y: number },
    color: string,
): void {
    const px = (pos.x + 0.5) * unit;
    const py = (pos.y + 0.5) * unit;
    const r = unit * 0.35;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
    ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
    ctx.stroke();
    ctx.restore();
}

function drawEditorOverlay(state: EditorState, ctx: CanvasRenderingContext2D): void {
    const lv = state.level;

    // Tunnel row highlight
    ctx.save();
    ctx.fillStyle = 'rgba(0,200,255,0.12)';
    ctx.fillRect(0, lv.tunnelRow * unit, gridW * unit, unit);
    ctx.restore();

    // Red zone tile markers
    ctx.save();
    ctx.fillStyle = 'rgba(255,0,0,0.28)';
    for (const t of lv.redZoneTiles) {
        ctx.fillRect(t.x * unit, t.y * unit, unit, unit);
    }
    ctx.restore();

    // Enemy house door highlight
    ctx.save();
    ctx.strokeStyle = 'rgba(255,180,255,0.9)';
    ctx.lineWidth = 2;
    const d = lv.enemyHouseDoor;
    ctx.strokeRect(d.x * unit + 1, d.y * unit + 1, unit - 2, unit - 2);
    ctx.restore();

    // Scatter targets
    drawCrossMarker(ctx, lv.scatterTargets.redEnemy,     '#FF3333');
    drawCrossMarker(ctx, lv.scatterTargets.cyanEnemy,    '#00FFFF');
    drawCrossMarker(ctx, lv.scatterTargets.hotpinkEnemy, '#FFB8FF');
    drawCrossMarker(ctx, lv.scatterTargets.orangeEnemy,  '#FFB852');

    // Spawn markers
    drawSpawnMarker(ctx, lv.playerStart,                 'yellow',   'P');
    drawSpawnMarker(ctx, lv.enemyStarts.redEnemy,        '#FF3333',  'R');
    drawSpawnMarker(ctx, lv.enemyStarts.cyanEnemy,       '#00FFFF',  'C');
    drawSpawnMarker(ctx, lv.enemyStarts.hotpinkEnemy,    '#FFB8FF',  'H');
    drawSpawnMarker(ctx, lv.enemyStarts.orangeEnemy,     '#FFB852',  'O');
    drawSpawnMarker(ctx, lv.fruitSpawn,                  '#FF6600',  'F');

    // Grid lines
    if (state.showGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= gridW; x++) {
            ctx.beginPath();
            ctx.moveTo(x * unit, 0);
            ctx.lineTo(x * unit, gridH * unit);
            ctx.stroke();
        }
        for (let y = 0; y <= gridH; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * unit);
            ctx.lineTo(gridW * unit, y * unit);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Hover cell highlight
    if (state.hoveredCell) {
        const { x, y } = state.hoveredCell;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x * unit, y * unit, unit, unit);
        ctx.restore();
    }
}

// ── rAF Loop ──────────────────────────────────────────────────────────────────

let infoEl: HTMLElement | null = null;

function editorLoop(state: EditorState): void {
    Draw.level();
    drawEditorOverlay(state, gameState.ctx);

    if (infoEl) {
        const h = state.hoveredCell;
        infoEl.textContent = h ? `(${h.x}, ${h.y})` : '';
    }

    requestAnimationFrame(() => editorLoop(state));
}

// ── Save / Load ───────────────────────────────────────────────────────────────

function exportLevelJSON(level: LevelData): void {
    const name = level.name.trim() || 'level';
    const json = JSON.stringify(level, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9_\-]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importLevelJSON(onLoad: (level: LevelData) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result as string) as LevelData;
                onLoad(data);
            } catch {
                alert('Invalid level JSON file.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ── Library Modal ─────────────────────────────────────────────────────────────

function openLibraryModal(
    state: EditorState,
    nameInput: HTMLInputElement,
    onLoaded: (id: string) => void,
): void {
    document.getElementById('ed-library-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ed-library-modal';
    overlay.innerHTML = `
    <style>
    #ed-library-modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.85);
        z-index: 200; display: flex; align-items: center; justify-content: center;
        font-family: monospace;
    }
    #ed-lib-box {
        background: #111; border: 2px solid #666; border-radius: 10px;
        padding: 20px 24px; min-width: 340px; max-width: 480px;
        max-height: 80vh; display: flex; flex-direction: column; gap: 12px;
        color: #eee;
    }
    #ed-lib-box h3 { color: #ff0; margin: 0; font-size: 18px; }
    #ed-lib-list { overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .ed-lib-entry {
        background: #1a1a1a; border: 1px solid #333; border-radius: 6px;
        padding: 8px 10px; display: flex; flex-direction: column; gap: 5px;
    }
    .ed-lib-entry-name { font-size: 15px; color: #ff0; font-weight: bold; }
    .ed-lib-entry-meta { font-size: 11px; color: #666; }
    .ed-lib-entry-actions { display: flex; gap: 6px; }
    .ed-lib-entry-actions button {
        flex: 1; background: #222; color: #eee; border: 1px solid #444;
        border-radius: 4px; padding: 5px 4px; cursor: pointer;
        font-family: monospace; font-size: 12px;
    }
    .ed-lib-btn-load  { color: #88ff88 !important; border-color: #44aa44 !important; }
    .ed-lib-btn-test  { color: #88aaff !important; border-color: #4466aa !important; }
    .ed-lib-btn-del   { color: #ff6666 !important; border-color: #aa3333 !important; }
    #ed-lib-empty { color: #555; font-size: 13px; text-align: center; padding: 20px 0; }
    #ed-lib-close {
        background: #222; color: #eee; border: 1px solid #555;
        border-radius: 4px; padding: 8px; cursor: pointer;
        font-family: monospace; font-size: 14px; align-self: flex-end;
    }
    </style>
    <div id="ed-lib-box">
        <h3>📂 My Maps</h3>
        <div id="ed-lib-list"></div>
        <button id="ed-lib-close">✕ Close</button>
    </div>`;
    document.body.appendChild(overlay);

    // Prevent canvas events
    overlay.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    overlay.addEventListener('touchend',   e => e.stopPropagation(), { passive: true });
    overlay.addEventListener('click',      e => e.stopPropagation());
    overlay.addEventListener('mousedown',  e => e.stopPropagation());

    function closeModal(): void { overlay.remove(); }
    document.getElementById('ed-lib-close')!.onclick = closeModal;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    function refreshList(): void {
        const listEl = document.getElementById('ed-lib-list')!;
        const entries = listLevels();
        if (entries.length === 0) {
            listEl.innerHTML = '<div id="ed-lib-empty">No saved maps yet.<br>Use "Save to Library" to add one.</div>';
            return;
        }
        listEl.innerHTML = '';
        for (const entry of [...entries].reverse()) {
            const dotCount = entry.level.tiles.flat()
                .filter(t => t === 3 || t === 4).length;
            const div = document.createElement('div');
            div.className = 'ed-lib-entry';
            div.innerHTML = `
                <div class="ed-lib-entry-name">${entry.level.name || '(Untitled)'}</div>
                <div class="ed-lib-entry-meta">${formatDate(entry.savedAt)} · ${dotCount} dots</div>
                <div class="ed-lib-entry-actions">
                    <button class="ed-lib-btn-load">📂 Load</button>
                    <button class="ed-lib-btn-test">▶ Test</button>
                    <button class="ed-lib-btn-del">🗑 Delete</button>
                </div>`;
            const btns = div.querySelectorAll('button');
            const loadBtn = btns[0] as HTMLButtonElement;
            const testBtn = btns[1] as HTMLButtonElement;
            const delBtn  = btns[2] as HTMLButtonElement;

            loadBtn.addEventListener('click', () => {
                pushUndo(state);
                const loaded = deepCopyLevel(entry.level);
                Object.assign(state.level, loaded);
                state.libraryId = entry.id;
                nameInput.value = state.level.name;
                syncToRenderer(state);
                scheduleAutosave(state.level);
                onLoaded(entry.id);
                closeModal();
            });

            testBtn.addEventListener('click', () => {
                const result = validateLevel(entry.level);
                if (!result.valid) {
                    alert('Level has errors:\n' + result.errors.map(e => `• ${e}`).join('\n'));
                    return;
                }
                closeModal();
                // Remove panel while testing
                const panel = document.getElementById('editor-panel');
                panel?.remove();
                startTestGame(deepCopyLevel(entry.level), () => {
                    if (panel) {
                        document.body.appendChild(panel);
                        buildPanel(state, panel);
                        syncToRenderer(state);
                    }
                    requestAnimationFrame(() => editorLoop(state));
                });
            });

            delBtn.addEventListener('click', () => {
                if (!confirm(`Delete "${entry.level.name || 'Untitled'}"?`)) return;
                deleteLevel(entry.id);
                if (state.libraryId === entry.id) state.libraryId = null;
                refreshList();
            });

            listEl.appendChild(div);
        }
    }
    refreshList();
}

// ── Panel UI ──────────────────────────────────────────────────────────────────

const PALETTE: Array<{ value: TileValue; label: string; bg: string }> = [
    { value: TILE_WALL       as TileValue, label: 'Wall',  bg: '#1a1ab0' },
    { value: TILE_GHOST_DOOR as TileValue, label: 'Door',  bg: '#3a1a2a' },
    { value: TILE_DOT        as TileValue, label: 'Dot',   bg: '#111' },
    { value: TILE_POWER      as TileValue, label: 'Power', bg: '#1a1a00' },
    { value: TILE_EMPTY      as TileValue, label: 'Empty', bg: '#0a0a1a' },
];

const SPAWN_BTNS: Array<{ tool: EditorTool; label: string; color: string }> = [
    { tool: 'player_spawn',     label: 'P Player', color: 'yellow'    },
    { tool: 'enemy_red',        label: 'R Red',    color: '#FF3333'   },
    { tool: 'enemy_cyan',       label: 'C Cyan',   color: '#00FFFF'   },
    { tool: 'enemy_hotpink',    label: 'H Pink',   color: '#FFB8FF'   },
    { tool: 'enemy_orange',     label: 'O Orange', color: '#FFB852'   },
    { tool: 'fruit_spawn',      label: 'F Fruit',  color: '#FF6600'   },
    { tool: 'enemy_house_door', label: '🚪 Door',  color: 'lightpink' },
];

const SCATTER_BTNS: Array<{ tool: EditorTool; label: string; color: string }> = [
    { tool: 'scatter_red',     label: '✕ Red',    color: '#FF3333' },
    { tool: 'scatter_cyan',    label: '✕ Cyan',   color: '#00FFFF' },
    { tool: 'scatter_hotpink', label: '✕ Pink',   color: '#FFB8FF' },
    { tool: 'scatter_orange',  label: '✕ Orange', color: '#FFB852' },
];

const SPECIAL_BTNS: Array<{ tool: EditorTool; label: string }> = [
    { tool: 'tunnel_config', label: '~ Tunnel Row' },
    { tool: 'red_zone',      label: '⊕ Red Zone'   },
];

function buildPanel(state: EditorState, panelEl?: HTMLElement): HTMLElement {
    const panel = panelEl ?? document.createElement('div');
    panel.id = 'editor-panel';
    panel.innerHTML = `
        <style>
        #editor-panel {
            position: fixed; top: 12px; right: 12px;
            background: rgba(0,0,0,0.92); color: #eee;
            padding: 14px 16px 18px; border: 2px solid #666;
            border-radius: 8px; z-index: 100;
            font-family: monospace; font-size: 18px;
            display: flex; flex-direction: column; gap: 10px;
            width: 170px; max-height: calc(100vh - 24px); overflow-y: auto;
            touch-action: none;
        }
        #editor-panel h3 { font-size: 20px; color: #ff0; margin: 0; }
        #editor-panel .ed-section { display: flex; flex-direction: column; gap: 5px; }
        #editor-panel .ed-label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        #editor-panel button {
            background: #222; color: #eee; border: 1px solid #555;
            border-radius: 4px; padding: 7px 6px; cursor: pointer;
            font-family: monospace; font-size: 14px; text-align: left;
            touch-action: manipulation; white-space: nowrap; overflow: hidden;
        }
        #editor-panel button:active, #editor-panel button.active {
            background: #333; border-color: #ff0; color: #ff0;
        }
        #editor-panel .ed-swatch {
            display: flex; align-items: center; gap: 6px;
            padding: 5px; border: 2px solid transparent;
            border-radius: 4px; cursor: pointer; touch-action: manipulation;
        }
        #editor-panel .ed-swatch.active { border-color: #ff0; }
        #editor-panel .ed-swatch-box {
            width: 18px; height: 18px; border-radius: 2px; border: 1px solid #555; flex-shrink: 0;
        }
        #editor-panel .ed-row { display: flex; gap: 5px; }
        #editor-panel .ed-row button { flex: 1; text-align: center; }
        #editor-panel label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 15px; }
        #editor-panel label input[type=checkbox] { width: 16px; height: 16px; cursor: pointer; accent-color: #ff0; }
        #editor-panel input[type=text] {
            background: #111; color: #ff0; border: 1px solid #555;
            border-radius: 4px; padding: 5px 6px; font-family: monospace;
            font-size: 14px; width: 100%; box-sizing: border-box;
        }
        #editor-panel .ed-divider { border: none; border-top: 1px solid #333; margin: 2px 0; }
        #ed-info { font-size: 13px; color: #888; min-height: 1em; }
        #ed-validate-result { font-size: 12px; max-height: 120px; overflow-y: auto; }
        #ed-validate-result .ed-error   { color: #ff6666; }
        #ed-validate-result .ed-warning { color: #ffcc44; }
        #ed-validate-result .ed-ok      { color: #66ff88; }
        #ed-test-btn {
            background: #004400; color: #88ff88; border-color: #44aa44;
            font-weight: bold;
        }
        #ed-test-btn:hover { background: #005500; }
        </style>
        <h3>✏ EDITOR</h3>

        <div class="ed-section">
            <div class="ed-label">Name</div>
            <input type="text" id="ed-name" maxlength="32" placeholder="Level name…">
        </div>

        <div class="ed-section">
            <div class="ed-label">Tile</div>
            <div id="ed-palette"></div>
        </div>

        <div class="ed-section">
            <div class="ed-label">Tool</div>
            <button id="ed-tool-paint">✏ Paint</button>
            <button id="ed-tool-erase">◻ Erase</button>
            <button id="ed-tool-fill">⬛ Fill</button>
        </div>

        <div class="ed-section">
            <div class="ed-label">Spawns</div>
            <div id="ed-spawns"></div>
        </div>

        <div class="ed-section">
            <div class="ed-label">Scatter Targets</div>
            <div id="ed-scatter"></div>
        </div>

        <div class="ed-section">
            <div class="ed-label">Special</div>
            <div id="ed-special"></div>
        </div>

        <div class="ed-section">
            <label><input type="checkbox" id="ed-grid" checked> Grid</label>
        </div>

        <div class="ed-section">
            <div class="ed-row">
                <button id="ed-undo">↩ Undo</button>
                <button id="ed-redo">↪ Redo</button>
            </div>
        </div>

        <hr class="ed-divider">

        <div class="ed-section">
            <button id="ed-validate">✔ Validate</button>
            <div id="ed-validate-result"></div>
        </div>

        <div class="ed-section">
            <button id="ed-test-btn">▶ Test Level</button>
        </div>

        <hr class="ed-divider">

        <div class="ed-section">
            <div class="ed-label">Library</div>
            <button id="ed-save-lib">💾 Save to Library</button>
            <button id="ed-open-lib">📂 My Maps</button>
        </div>

        <hr class="ed-divider">

        <div class="ed-section">
            <div class="ed-label">File</div>
            <div class="ed-row">
                <button id="ed-export">⬇ Export</button>
                <button id="ed-import">⬆ Import</button>
            </div>
            <button id="ed-reset">↺ Reset</button>
        </div>

        <div id="ed-info"></div>
    `;
    if (!panelEl) document.body.appendChild(panel);

    // Stop all input events from bubbling to canvas handlers
    panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener('touchend',   (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener('click',      (e) => e.stopPropagation());
    panel.addEventListener('mousedown',  (e) => e.stopPropagation());
    panel.addEventListener('mouseup',    (e) => e.stopPropagation());

    infoEl = document.getElementById('ed-info');

    // Shared tool-refresh — highlights the active tool across all sections
    const allToolBtnIds: Partial<Record<EditorTool, string>> = {};

    function refreshAllTools(): void {
        for (const [tool, id] of Object.entries(allToolBtnIds)) {
            document.getElementById(id!)?.classList.toggle('active', state.selectedTool === tool);
        }
        // Palette active state
        document.querySelectorAll<HTMLElement>('#ed-palette .ed-swatch').forEach((el) => {
            const val = Number(el.dataset.tileValue) as TileValue;
            el.classList.toggle('active', state.selectedTool === 'paint' && state.selectedTileValue === val);
        });
    }

    // Level name input
    const nameInput = document.getElementById('ed-name') as HTMLInputElement;
    nameInput.value = state.level.name;
    nameInput.oninput = () => {
        state.level.name = nameInput.value;
        scheduleAutosave(state.level);
    };

    // Palette
    const paletteEl = document.getElementById('ed-palette')!;
    for (const entry of PALETTE) {
        const swatch = document.createElement('div');
        swatch.className = 'ed-swatch';
        swatch.dataset.tileValue = String(entry.value);
        swatch.innerHTML = `<div class="ed-swatch-box" style="background:${entry.bg}"></div><span>${entry.label}</span>`;
        const select = (): void => {
            state.selectedTileValue = entry.value;
            state.selectedTool = 'paint';
            refreshAllTools();
        };
        swatch.addEventListener('click', select);
        swatch.addEventListener('touchend', (e) => { e.preventDefault(); select(); });
        paletteEl.appendChild(swatch);
    }

    // Paint / Erase / Fill
    const paintBtnId = 'ed-tool-paint';
    const eraseBtnId = 'ed-tool-erase';
    const fillBtnId  = 'ed-tool-fill';
    allToolBtnIds['paint'] = paintBtnId;
    allToolBtnIds['erase'] = eraseBtnId;
    allToolBtnIds['fill']  = fillBtnId;

    const paintBtn = document.getElementById(paintBtnId) as HTMLButtonElement;
    const eraseBtn = document.getElementById(eraseBtnId) as HTMLButtonElement;
    const fillBtn  = document.getElementById(fillBtnId)  as HTMLButtonElement;
    paintBtn.onclick = () => { state.selectedTool = 'paint'; refreshAllTools(); };
    eraseBtn.onclick = () => { state.selectedTool = 'erase'; refreshAllTools(); };
    fillBtn.onclick  = () => { state.selectedTool = 'fill';  refreshAllTools(); };

    // Spawn buttons
    const spawnsEl = document.getElementById('ed-spawns')!;
    for (const entry of SPAWN_BTNS) {
        const btn = document.createElement('button');
        btn.id = `ed-tool-${entry.tool}`;
        btn.style.color = entry.color;
        btn.textContent = entry.label;
        allToolBtnIds[entry.tool] = btn.id;
        btn.onclick = () => { state.selectedTool = entry.tool; refreshAllTools(); };
        spawnsEl.appendChild(btn);
    }

    // Scatter target buttons
    const scatterEl = document.getElementById('ed-scatter')!;
    for (const entry of SCATTER_BTNS) {
        const btn = document.createElement('button');
        btn.id = `ed-tool-${entry.tool}`;
        btn.style.color = entry.color;
        btn.textContent = entry.label;
        allToolBtnIds[entry.tool] = btn.id;
        btn.onclick = () => { state.selectedTool = entry.tool; refreshAllTools(); };
        scatterEl.appendChild(btn);
    }

    // Special buttons
    const specialEl = document.getElementById('ed-special')!;
    for (const entry of SPECIAL_BTNS) {
        const btn = document.createElement('button');
        btn.id = `ed-tool-${entry.tool}`;
        btn.textContent = entry.label;
        allToolBtnIds[entry.tool] = btn.id;
        btn.onclick = () => { state.selectedTool = entry.tool; refreshAllTools(); };
        specialEl.appendChild(btn);
    }

    // Grid toggle
    const gridCheck = document.getElementById('ed-grid') as HTMLInputElement;
    gridCheck.onchange = () => { state.showGrid = gridCheck.checked; };

    // Undo / Redo
    const undoBtn = document.getElementById('ed-undo') as HTMLButtonElement;
    const redoBtn = document.getElementById('ed-redo') as HTMLButtonElement;
    undoBtn.onclick = () => { undo(state); syncToRenderer(state); };
    redoBtn.onclick = () => { redo(state); syncToRenderer(state); };

    // Validate
    const validateBtn    = document.getElementById('ed-validate') as HTMLButtonElement;
    const validateResult = document.getElementById('ed-validate-result')!;
    validateBtn.onclick = () => {
        const result = validateLevel(state.level);
        let html = '';
        if (result.valid) {
            html += `<div class="ed-ok">✔ Valid! ${result.dotCount} dots</div>`;
        }
        for (const e of result.errors)   html += `<div class="ed-error">✘ ${e}</div>`;
        for (const w of result.warnings) html += `<div class="ed-warning">⚠ ${w}</div>`;
        validateResult.innerHTML = html;
    };

    // Test Level
    const testBtn = document.getElementById('ed-test-btn') as HTMLButtonElement;
    testBtn.onclick = () => {
        const result = validateLevel(state.level);
        if (!result.valid) {
            let msg = 'Level has errors:\n';
            for (const e of result.errors) msg += `• ${e}\n`;
            alert(msg);
            return;
        }
        // Persist to autosave so editor state survives the test session
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.level));
        // Remove the editor panel while testing; it will be rebuilt on return
        panel.remove();
        startTestGame(deepCopyLevel(state.level), () => {
            // Rebuild editor UI after returning from test
            document.body.appendChild(panel);
            buildPanel(state, panel);
            syncToRenderer(state);
            // Restart the rAF loop
            requestAnimationFrame(() => editorLoop(state));
        });
    };

    // Export
    const exportBtn = document.getElementById('ed-export') as HTMLButtonElement;
    exportBtn.onclick = () => exportLevelJSON(state.level);

    // Import
    const importBtn = document.getElementById('ed-import') as HTMLButtonElement;
    importBtn.onclick = () => {
        importLevelJSON((imported) => {
            pushUndo(state);
            Object.assign(state.level, imported);
            syncToRenderer(state);
            nameInput.value = state.level.name;
            scheduleAutosave(state.level);
        });
    };

    // Reset to default level
    const resetBtn = document.getElementById('ed-reset') as HTMLButtonElement;
    resetBtn.onclick = () => {
        if (!confirm('Reset to the default level? Unsaved changes will be lost.')) return;
        pushUndo(state);
        const fresh = deepCopyLevel(Levels.level1Data);
        Object.assign(state.level, fresh);
        nameInput.value = state.level.name;
        state.libraryId = null;
        syncToRenderer(state);
        localStorage.removeItem(AUTOSAVE_KEY);
    };

    // Library — Save to Library
    const saveLibBtn = document.getElementById('ed-save-lib') as HTMLButtonElement;
    const openLibBtn = document.getElementById('ed-open-lib') as HTMLButtonElement;

    function refreshLibCount(): void {
        openLibBtn.textContent = `📂 My Maps (${listLevels().length})`;
    }
    refreshLibCount();

    saveLibBtn.onclick = () => {
        const trimmed = nameInput.value.trim();
        if (!trimmed) {
            alert('Give the level a name before saving to the library.');
            nameInput.focus();
            return;
        }
        state.level.name = trimmed;
        state.libraryId = saveLevel(state.level, state.libraryId ?? undefined);
        scheduleAutosave(state.level);
        refreshLibCount();
        saveLibBtn.textContent = '💾 Saved!';
        setTimeout(() => { saveLibBtn.textContent = '💾 Save to Library'; }, 1200);
    };

    // Library — Browse / My Maps
    openLibBtn.onclick = () => {
        openLibraryModal(state, nameInput, (id) => {
            state.libraryId = id;
            refreshLibCount();
        });
    };

    // Initial state
    refreshAllTools();

    return panel;
}

// ── Canvas Event Handling ─────────────────────────────────────────────────────

function attachCanvasEvents(state: EditorState): void {
    const canvas = gameState.canvas;

    function onDown(clientX: number, clientY: number): void {
        const cell = tileFromCanvas(clientX, clientY);
        if (!cell) return;
        isPainting = true;
        redZoneDragMode = null;
        redZoneDragSeen.clear();
        pushUndo(state);
        applyToolDown(state, cell);
        scheduleAutosave(state.level);
    }

    function onMove(clientX: number, clientY: number): void {
        const cell = tileFromCanvas(clientX, clientY);
        state.hoveredCell = cell;
        if (isPainting && cell) {
            applyToolDrag(state, cell);
            scheduleAutosave(state.level);
        }
    }

    function onUp(): void { isPainting = false; }

    // Mouse
    canvas.addEventListener('mousedown',  (e) => onDown(e.clientX, e.clientY));
    canvas.addEventListener('mousemove',  (e) => onMove(e.clientX, e.clientY));
    canvas.addEventListener('mouseup',    () => onUp());
    canvas.addEventListener('mouseleave', () => { onUp(); state.hoveredCell = null; });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        onDown(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        onUp();
    }, { passive: false });
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────

function attachKeyboardShortcuts(state: EditorState): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo(state);
                syncToRenderer(state);
            } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                e.preventDefault();
                redo(state);
                syncToRenderer(state);
            }
        }
    });
}

// ── Entry Point ───────────────────────────────────────────────────────────────

export function startEditorMode(): void {
    const saved = loadAutosave();
    const initialLevel = saved ?? Levels.level1Data;
    const state = createEditorState(initialLevel);

    // Wire level into the renderer
    gameState.currentLevel = state.level;
    Levels.levelSetup   = state.level.tiles;
    Levels.levelDynamic = state.level.tiles.map(row => [...row] as TileValue[]);

    buildPanel(state);
    attachCanvasEvents(state);
    attachKeyboardShortcuts(state);

    requestAnimationFrame(() => editorLoop(state));
}

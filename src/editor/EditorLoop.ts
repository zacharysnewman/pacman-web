import { unit, gridW, gridH } from '../constants';
import { gameState } from '../game-state';
import { Levels } from '../static/Levels';
import { Draw } from '../static/Draw';
import type { TileValue } from '../types';
import { TILE_EMPTY, TILE_WALL, TILE_GHOST_DOOR, TILE_DOT, TILE_POWER } from '../tiles';
import {
    createEditorState,
    pushUndo,
    undo,
    redo,
    deepCopyLevel,
    type EditorState,
} from './EditorState';

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

// ── Paint Logic ───────────────────────────────────────────────────────────────

let isPainting = false;

function paintCell(state: EditorState, cell: { x: number; y: number }): void {
    const { x, y } = cell;
    const newTile: TileValue = state.selectedTool === 'erase'
        ? TILE_EMPTY as TileValue
        : state.selectedTileValue;
    state.level.tiles[y][x] = newTile;
    Levels.levelDynamic[y][x] = newTile;
}

// ── Overlay Rendering ─────────────────────────────────────────────────────────

function drawEditorOverlay(state: EditorState, ctx: CanvasRenderingContext2D): void {
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

// ── Panel UI ──────────────────────────────────────────────────────────────────

const PALETTE: Array<{ value: TileValue; label: string; bg: string; color: string }> = [
    { value: TILE_WALL       as TileValue, label: 'Wall',   bg: '#1a1ab0', color: '#fff' },
    { value: TILE_GHOST_DOOR as TileValue, label: 'Door',   bg: '#222',    color: 'lightpink' },
    { value: TILE_DOT        as TileValue, label: 'Dot',    bg: '#111',    color: '#fff' },
    { value: TILE_POWER      as TileValue, label: 'Power',  bg: '#111',    color: '#ff0' },
    { value: TILE_EMPTY      as TileValue, label: 'Empty',  bg: '#0a0a1a', color: '#555' },
];

function buildPanel(state: EditorState): void {
    const panel = document.createElement('div');
    panel.id = 'editor-panel';
    panel.innerHTML = `
        <style>
        #editor-panel {
            position: fixed; top: 12px; right: 12px;
            background: rgba(0,0,0,0.92); color: #eee;
            padding: 14px 16px 18px; border: 2px solid #666;
            border-radius: 8px; z-index: 100;
            font-family: monospace; font-size: 18px;
            display: flex; flex-direction: column; gap: 12px;
            min-width: 140px; max-width: 160px;
            touch-action: none;
        }
        #editor-panel h3 { font-size: 20px; color: #ff0; margin: 0; }
        #editor-panel .ed-section { display: flex; flex-direction: column; gap: 6px; }
        #editor-panel .ed-label { font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        #editor-panel button {
            background: #222; color: #eee; border: 1px solid #555;
            border-radius: 4px; padding: 8px 6px; cursor: pointer;
            font-family: monospace; font-size: 16px; text-align: left;
            touch-action: manipulation;
        }
        #editor-panel button:active, #editor-panel button.active { background: #444; border-color: #ff0; color: #ff0; }
        #editor-panel .ed-swatch {
            display: flex; align-items: center; gap: 8px;
            padding: 6px; border: 2px solid transparent;
            border-radius: 4px; cursor: pointer; touch-action: manipulation;
        }
        #editor-panel .ed-swatch.active { border-color: #ff0; }
        #editor-panel .ed-swatch-box {
            width: 20px; height: 20px; border-radius: 2px; border: 1px solid #555; flex-shrink: 0;
        }
        #editor-panel .ed-row { display: flex; gap: 6px; }
        #editor-panel .ed-row button { flex: 1; text-align: center; }
        #editor-panel label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 16px; }
        #editor-panel label input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; accent-color: #ff0; }
        #ed-info { font-size: 14px; color: #888; min-height: 1em; }
        </style>
        <h3>✏ EDITOR</h3>

        <div class="ed-section">
            <div class="ed-label">Tile</div>
            <div id="ed-palette"></div>
        </div>

        <div class="ed-section">
            <div class="ed-label">Tool</div>
            <button id="ed-tool-paint">✏ Paint</button>
            <button id="ed-tool-erase">◻ Erase</button>
        </div>

        <div class="ed-section">
            <label><input type="checkbox" id="ed-grid" checked> Grid</label>
        </div>

        <div class="ed-section">
            <div class="ed-row">
                <button id="ed-undo">↩</button>
                <button id="ed-redo">↪</button>
            </div>
        </div>

        <div id="ed-info"></div>
    `;
    document.body.appendChild(panel);

    // Stop all input events from bubbling to canvas handlers
    panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener('touchend',   (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener('click',      (e) => e.stopPropagation());
    panel.addEventListener('mousedown',  (e) => e.stopPropagation());
    panel.addEventListener('mouseup',    (e) => e.stopPropagation());

    infoEl = document.getElementById('ed-info');

    // Palette
    const paletteEl = document.getElementById('ed-palette')!;
    function refreshPalette(): void {
        paletteEl.innerHTML = '';
        for (const entry of PALETTE) {
            const swatch = document.createElement('div');
            swatch.className = 'ed-swatch' + (state.selectedTileValue === entry.value ? ' active' : '');
            swatch.innerHTML = `<div class="ed-swatch-box" style="background:${entry.bg};color:${entry.color}"></div><span>${entry.label}</span>`;
            swatch.addEventListener('click', () => {
                state.selectedTileValue = entry.value;
                state.selectedTool = 'paint';
                refreshPalette();
                refreshTools();
            });
            swatch.addEventListener('touchend', (e) => {
                e.preventDefault();
                state.selectedTileValue = entry.value;
                state.selectedTool = 'paint';
                refreshPalette();
                refreshTools();
            });
            paletteEl.appendChild(swatch);
        }
    }
    refreshPalette();

    // Tools
    const paintBtn = document.getElementById('ed-tool-paint') as HTMLButtonElement;
    const eraseBtn = document.getElementById('ed-tool-erase') as HTMLButtonElement;

    function refreshTools(): void {
        paintBtn.classList.toggle('active', state.selectedTool === 'paint');
        eraseBtn.classList.toggle('active', state.selectedTool === 'erase');
    }
    refreshTools();

    paintBtn.onclick = () => { state.selectedTool = 'paint'; refreshTools(); };
    eraseBtn.onclick = () => { state.selectedTool = 'erase'; refreshTools(); };

    // Grid toggle
    const gridCheck = document.getElementById('ed-grid') as HTMLInputElement;
    gridCheck.onchange = () => { state.showGrid = gridCheck.checked; };

    // Undo / Redo
    const undoBtn = document.getElementById('ed-undo') as HTMLButtonElement;
    const redoBtn = document.getElementById('ed-redo') as HTMLButtonElement;
    undoBtn.onclick = () => { undo(state); syncToRenderer(state); };
    redoBtn.onclick = () => { redo(state); syncToRenderer(state); };
}

// ── Canvas Event Handling ─────────────────────────────────────────────────────

function attachCanvasEvents(state: EditorState): void {
    const canvas = gameState.canvas;

    // Mouse
    canvas.addEventListener('mousedown', (e) => {
        const cell = tileFromCanvas(e.clientX, e.clientY);
        if (!cell) return;
        isPainting = true;
        pushUndo(state);
        paintCell(state, cell);
    });

    canvas.addEventListener('mousemove', (e) => {
        const cell = tileFromCanvas(e.clientX, e.clientY);
        state.hoveredCell = cell;
        if (isPainting && cell) paintCell(state, cell);
    });

    canvas.addEventListener('mouseup',    () => { isPainting = false; });
    canvas.addEventListener('mouseleave', () => { isPainting = false; state.hoveredCell = null; });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const cell = tileFromCanvas(t.clientX, t.clientY);
        if (!cell) return;
        isPainting = true;
        pushUndo(state);
        paintCell(state, cell);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        const cell = tileFromCanvas(t.clientX, t.clientY);
        state.hoveredCell = cell;
        if (isPainting && cell) paintCell(state, cell);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        isPainting = false;
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
    const state = createEditorState(Levels.level1Data);

    // Wire level into the renderer
    gameState.currentLevel = state.level;
    Levels.levelSetup   = state.level.tiles;
    Levels.levelDynamic = state.level.tiles.map(row => [...row] as TileValue[]);

    buildPanel(state);
    attachCanvasEvents(state);
    attachKeyboardShortcuts(state);

    requestAnimationFrame(() => editorLoop(state));
}

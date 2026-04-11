# MAP-EDITOR.md — Level Editor

## Overview

A browser-based tile editor overlaid on the game canvas, accessible via `?editor=true`. Supports designing, saving, loading, and play-testing custom dot-maze levels. All changes are auto-saved and levels can be stored in a persistent in-browser library.

---

## Accessing the Editor

```
http://localhost:PORT/?editor=true
```

On load the editor restores the last auto-saved session. If no autosave exists it starts from the built-in Classic level.

---

## Features

### Tile Painting
| Tool | How to use |
|---|---|
| **Paint** | Click/drag the canvas to place the selected tile type |
| **Erase** | Click/drag to set tiles to Empty |
| **Flood Fill** | Click any tile to BFS-fill all contiguous matching tiles |

Tile types in the palette:

| Swatch | Value | Meaning |
|---|---|---|
| Wall | `0` | Solid — players and enemies cannot pass |
| Door | `2` | Enemy house gate — only enemies in entering/exiting mode pass |
| Dot  | `3` | Small pellet — collectible, counts toward level clear |
| Power | `4` | Power pellet — triggers frightened mode |
| Empty | `5` | Open corridor — passable, no collectible |

### Spawn / Config Tools
| Button | Effect |
|---|---|
| **P Player** | Click canvas to move player spawn |
| **R Red** | Move Red enemy spawn |
| **C Cyan** | Move Cyan enemy spawn |
| **H Pink** | Move Hotpink enemy spawn |
| **O Orange** | Move Orange enemy spawn |
| **F Fruit** | Move fruit spawn |
| **🚪 Door** | Place the enemy house gate tile |
| **~ Tunnel Row** | Click any tile — its row becomes the warp tunnel row |
| **⊕ Red Zone** | Click/drag to toggle red-zone tiles (junctions where enemies can't turn upward) |

### Scatter Targets
Four cross-marker tools (one per enemy color) let you click anywhere on the canvas to set that enemy's scatter-mode corner target. Targets are shown as colored ✕ markers in the overlay.

### Grid & Undo
- **Grid toggle** — show/hide the tile grid overlay
- **Undo / Redo** — snapshot-based (up to 50 steps); keyboard: `Ctrl+Z` / `Ctrl+Y` or `Ctrl+Shift+Z`

---

## Validation

Click **✔ Validate** to run all checks. Results appear inline in the panel.

| # | Rule |
|---|---|
| 1 | Grid must be exactly 36 rows × 28 columns |
| 2 | At least one dot or power pellet must exist |
| 3 | Player spawn must be on a walkable tile (value > 0) |
| 4 | All enemy spawns must be on walkable tiles |
| 5 | Fruit spawn should be on a walkable tile (warning only) |
| 6 | Tunnel row must be in bounds |
| 7 | BFS reachability — all dots must be reachable from player spawn (respects tunnel wrapping) |
| 8 | Level name should not be empty (warning only) |

---

## Play-Testing

**▶ Test Level** validates first, then launches a live game session with the current editor level (1-player keyboard/gamepad). Press **Escape** at any time to return to the editor. Game-over also returns to the editor automatically.

---

## Level Library (Multi-Map)

All maps are stored persistently in `localStorage` under the key `editor_library`.

| Button | Effect |
|---|---|
| **💾 Save to Library** | Saves/updates the current level. Re-saving overwrites the same entry (by ID). Requires a non-empty level name. |
| **📂 My Maps (n)** | Opens the library browser modal showing all saved levels. |

### Library Modal

Each entry shows:
- **Level name** and last-saved timestamp
- **Dot count**
- **📂 Load** — loads the level into the editor (pushes undo)
- **▶ Test** — validates and launches a test game directly from the library
- **🗑 Delete** — removes the entry (with confirmation)

---

## Save / Load Files

| Button | Effect |
|---|---|
| **⬇ Export** | Downloads the current level as a `.json` file |
| **⬆ Import** | Opens a file picker to load a `.json` level file into the editor |
| **↺ Reset** | Resets to the built-in Classic level (with confirmation) |

### JSON Format

```json
{
  "version": 1,
  "name": "My Level",
  "tiles": [[0, 0, ...], ...],
  "playerStart": { "x": 13.5, "y": 26 },
  "enemyStarts": {
    "redEnemy":     { "x": 13.5, "y": 14 },
    "cyanEnemy":    { "x": 12,   "y": 17 },
    "hotpinkEnemy": { "x": 13.5, "y": 17 },
    "orangeEnemy":  { "x": 15,   "y": 17 }
  },
  "fruitSpawn":       { "x": 13, "y": 20 },
  "tunnelRow":        17,
  "tunnelSlowColMax": 5,
  "tunnelSlowColMin": 22,
  "redZoneTiles": [
    { "x": 12, "y": 14 }, { "x": 15, "y": 14 },
    { "x": 12, "y": 26 }, { "x": 15, "y": 26 }
  ],
  "enemyHouseDoor": { "x": 14, "y": 15 },
  "scatterTargets": {
    "redEnemy":     { "x": 26, "y": 0  },
    "cyanEnemy":    { "x": 27, "y": 34 },
    "hotpinkEnemy": { "x": 2,  "y": 0  },
    "orangeEnemy":  { "x": 0,  "y": 34 }
  }
}
```

---

## Auto-Save

The editor auto-saves to `localStorage` key `editor_autosave` within 500 ms of any change (debounced). This is separate from the library — it is a single scratch-pad slot that restores the last working state on page reload.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Escape` (during test) | Return to editor |

---

## Architecture

### Files

| File | Purpose |
|---|---|
| `src/editor/EditorState.ts` | State interface, undo/redo, deep-copy helpers |
| `src/editor/EditorLoop.ts` | rAF loop, canvas input, tool dispatch, panel UI, library modal |
| `src/editor/Validate.ts` | BFS reachability and all validation rules |
| `src/editor/LevelLibrary.ts` | localStorage multi-map library (CRUD) |

### Data Flow

```
?editor=true
    ↓
startEditorMode()          ← loads autosave or level1Data
    ↓
editorLoop() [rAF]
    → Draw.level()          ← reads Levels.levelDynamic each frame
    → drawEditorOverlay()   ← grid, spawn markers, tunnel highlight, scatter targets
    ↓
User edits → applyToolDown/Drag → Levels.levelDynamic updated live
    ↓
Save to Library → LevelLibrary.saveLevel()    (localStorage array)
Browse My Maps  → openLibraryModal()          (load / test / delete each entry)
Export          → JSON file download
Import          → JSON file picker → pushUndo → Object.assign(state.level, …)
    ↓
▶ Test Level → validateLevel → startTestGame(level, onReturn)
    → Game runs with custom level (1-player, full game loop)
    → ESC or game-over → onReturn() → editor panel rebuilt, rAF restarted
```

### LevelData Interface (`src/types.ts`)

```typescript
interface LevelData {
    version: number;
    name: string;
    tiles: TileValue[][];           // 36 rows × 28 cols; TileValue = 0|2|3|4|5
    playerStart: { x: number; y: number };
    enemyStarts: {
        redEnemy:     { x: number; y: number };
        cyanEnemy:    { x: number; y: number };
        hotpinkEnemy: { x: number; y: number };
        orangeEnemy:  { x: number; y: number };
    };
    fruitSpawn:       { x: number; y: number };
    tunnelRow:        number;
    tunnelSlowColMax: number;
    tunnelSlowColMin: number;
    redZoneTiles:     { x: number; y: number }[];
    enemyHouseDoor:   { x: number; y: number };
    scatterTargets: {
        redEnemy:     { x: number; y: number };
        cyanEnemy:    { x: number; y: number };
        hotpinkEnemy: { x: number; y: number };
        orangeEnemy:  { x: number; y: number };
    };
}
```

---

## Implementation Status

| Feature | Status |
|---|---|
| Tile paint / erase / flood fill | ✅ Complete |
| Undo / redo (50 steps) | ✅ Complete |
| Grid overlay + hover highlight | ✅ Complete |
| Spawn placement (Player, 4 enemies, Fruit) | ✅ Complete |
| Enemy house door placement | ✅ Complete |
| Tunnel row configuration | ✅ Complete |
| Red zone tile toggle | ✅ Complete |
| Scatter target placement (per enemy) | ✅ Complete |
| Level name input | ✅ Complete |
| Validation (BFS + all rules) | ✅ Complete |
| Play-test with ESC-to-return | ✅ Complete |
| Auto-save (debounced 500 ms) | ✅ Complete |
| Auto-restore on page reload | ✅ Complete |
| JSON export (file download) | ✅ Complete |
| JSON import (file picker) | ✅ Complete |
| Reset to built-in level | ✅ Complete |
| Multi-map library (localStorage) | ✅ Complete |
| Library modal (Load / Test / Delete) | ✅ Complete |
| Touch / mobile input | ✅ Complete |
| Keyboard shortcuts (Ctrl+Z/Y) | ✅ Complete |

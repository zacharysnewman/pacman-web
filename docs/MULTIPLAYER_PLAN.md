# Multiplayer Implementation Plan

## Design Decisions (Resolved)

| Question | Decision |
|---|---|
| Ghost multi-target strategy | Each ghost targets the **nearest active player** |
| Energizer scope | Any player eats a power pellet → **all ghosts frightened** |
| Ghost eaten chain | **Shared** across all players (escalates globally) |
| Max player count | **Up to 4 players** |
| Lives pool size | **Same as single-player (3 lives)** — shared across all players |
| Lives pool behavior | Death plays animation, player sits out rest of level (no mid-level respawn); shared pool decrements by 1 per death (min 0); at 0, dead players are not revived at level start |
| Game over condition | Only when **all players are simultaneously inactive** (no active player remains) |
| Level clear | If **any player** clears the level, **all players who have lives remaining** are revived for the next level |
| Extra life at 10k | **One life added to the shared pool** (not per player); triggers once per game regardless of which player crosses 10k |
| Elroy trigger | **No change** — based on total dots remaining in the shared maze; works identically with multiple players |
| Inky's targeting (Blinky reference) | **Option A** — Inky finds his nearest Pacman and uses that actor for both the intermediate point and the Blinky vector; pincer behaviour is preserved against whoever Inky is closest to |
| Score | **Shared combined score** — all players contribute to one score; not tracked per-player |
| High score entries | **Single entry** — one combined score, one set of initials |
| Input assignment | **Keyboard and touch are hardcoded to P1.** Controllers are assigned by connection order: gamepad[0] → P1, gamepad[1] → P2, gamepad[2] → P3, gamepad[3] → P4. P1 therefore accepts keyboard, touch, and gamepad[0] simultaneously. P2–P4 require a connected controller. |
| Mid-level player death | Players **do not respawn mid-level**. Death animation plays, then the player sits out for the remainder of the level. Ghosts and other players keep moving — no global freeze on individual death. |
| "READY!" screen | Only shown at **game start and level clear** — not after individual player deaths |
| Simultaneous death animations | Both animations **play concurrently** — no queuing |
| Fruit collection | **First-come-first-served** — fruit disappears on first contact; no shared award |

## Open Design Questions

All design questions resolved. No open items.

---

## Phase 1 — Input Abstraction

**Goal:** Replace the global `Input` static class with instantiable, player-owned input handlers that support keyboard and gamepad.

### `src/static/Input.ts` → `src/input/PlayerInput.ts`
- Define `PlayerInput` interface:
  ```ts
  interface PlayerInput {
    leftPressed: boolean
    rightPressed: boolean
    upPressed: boolean
    downPressed: boolean
    bufferedDir: Direction | null
    bufferedDirFramesLeft: number
    update(actor: IGameObject): void
    destroy(): void  // remove event listeners
  }
  ```

### `src/input/KeyboardPlayerInput.ts` *(new)*
- Implements `PlayerInput`
- Constructor accepts a fixed arrow-key mapping (always arrows — keyboard is P1 only)
- Registers its own `keydown`/`keyup` listeners on construction; `destroy()` removes them
- Moves walkability check (`tileValue > 2`) inside `update(actor)` rather than coupling to `gameState`
- Preserves 8-frame buffer behavior

### `src/input/TouchPlayerInput.ts` *(new)*
- Implements `PlayerInput` — wraps the existing swipe detection from `setupTouchControls()`
- Touch is P1 only; swipe fires into P1's buffer
- `destroy()` removes touch listeners

### `src/input/GamepadPlayerInput.ts` *(new)*
- Implements `PlayerInput`
- Constructor accepts a gamepad index (0–3)
- Each frame polls `navigator.getGamepads()[index]`
- Maps standard gamepad D-pad (buttons 12–15) and left analog stick (axes 0/1, deadzone 0.3) to direction flags
- Mirrors 8-frame buffer behavior of keyboard input
- Static helpers:
  - `GamepadPlayerInput.connectedIndices(): number[]` — returns indices of currently connected gamepads
  - Listens to `gamepadconnected` / `gamepaddisconnected` window events; exposes a callback for the player select UI to react

### `src/input/CompositePlayerInput.ts` *(new)*
- Implements `PlayerInput` — wraps multiple `PlayerInput` instances and merges their state
- Used for P1, which simultaneously accepts keyboard, touch, and gamepad[0]
- `update(actor)` calls each sub-input's `update`, then ORs all pressed flags and uses the most recent buffered direction

### `src/Game.ts`
- Remove global `Input` import and `keydown`/`keyup` registration on window
- P1 gets `new CompositePlayerInput([keyboard, touch, gamepad0])`
- P2–P4 each get `new GamepadPlayerInput(1/2/3)`; only created if that gamepad index is connected
- Game loop: `for (const p of gameState.players) p.input.update(p.actor)` replaces `Input.update()`
- `destroy()` called on each input instance when returning to menu

---

## Phase 2 — Player State Extraction

**Goal:** Everything that currently describes "one Pac-Man" becomes a `PlayerState` — grouping actor, input, stats, and death state together.

### `src/types.ts`
Add:
```ts
export interface PlayerState {
  id: number               // 1–4
  actor: IGameObject
  input: PlayerInput
  stats: PlayerStats       // see Phase 3
  frozen: boolean          // replaces gameState.pacmanFrozen (per-player ghost-eat freeze)
  dying: boolean           // replaces gameState.pacmanDying
  deathProgress: number    // replaces gameState.pacmanDeathProgress
  active: boolean          // false once eliminated (shared pool depleted on their death)
}
```

### `src/game-state.ts`
- Add `players: PlayerState[]`
- Add `sharedLives: number` — the global life pool, starts at 3 regardless of player count
- Remove: `pacman`, `pacmanFrozen`, `pacmanDying`, `pacmanDeathProgress`
- Keep all ghost state, maze state, scatter/chase, frightened, elroy, and fruit as **shared**
- `frozen` flag remains global (level clear, ready screen)

---

## Phase 3 — Shared Score & Stats Cleanup

**Goal:** Score is a single shared value (not per-player). Move `lives` out of `Stats` and into `gameState`.

### `src/static/Stats.ts`
- Remove `lives` static property — replaced by `gameState.sharedLives`
- Keep `currentScore` as-is (already a single value — no change needed for multiplayer)
- Keep `extraLifeAwarded` — rename to `extraLifeAwardedThisGame` for clarity; still fires once per game when shared score crosses 10,000, adding 1 to `gameState.sharedLives`
- All other static methods unchanged: `highScore`, `loadHighScores()`, `saveScore()`, `qualifiesForTopTen()`, `loadBestScore()`

### `src/game-state.ts`
- Add `sharedLives: number` (already noted in Phase 2)
- No `currentScore` move needed — `Stats.currentScore` works fine as-is

### `src/static/Draw.ts` — `Draw.hud()`
- Score display unchanged from single-player layout: `SCORE` top-left, `HIGH SCORE` center
- **Shared lives pool** bottom-left (same Pacman icons, now representing the pool not individual lives)
- Inactive (dead) players rendered with a distinct visual on their Pacman actor (see Phase 7)

---

## Phase 4 — Parameterize `Move.pacman()`

**Goal:** Movement logic operates on a `PlayerState` rather than the global `gameState.pacman`.

### `src/static/Move.ts`
- `Move.pacman()` → `Move.pacman(player: PlayerState)`
- Replace `gameState.pacman` → `player.actor`
- Replace `gameState.pacmanFrozen` → `player.frozen`
- `gameState.frozen` check remains (global freeze still applies to all players)
- Ghost move functions unchanged — they already accept `IGameObject` via closure

### `src/Game.ts` — game loop
```ts
// Before
Move.pacman()

// After
for (const p of gameState.players) {
  if (p.active && !p.dying) Move.pacman(p)
}
```

---

## Phase 5 — Parameterize Tile Callbacks & Collision

**Goal:** Dot eating, collision, and death all operate on a specific player.

### `src/Game.ts` — `pacmanOnTileChanged`
Convert from free function to factory:
```ts
function makePacmanOnTileChanged(player: PlayerState) {
  return (x: number, y: number) => {
    // dot eating: player.stats.addToScore(10), player.actor.moveSpeed = 0
    // energizer: activateFrightened() is global — all ghosts turn blue regardless of which player ate it
    // dot counters: incrementDotCounters() still shared (fruit/house release is global)
    // level clear check: countRemainingDots() still shared maze
  }
}
```

### `src/Game.ts` — `checkCollisions()`
```ts
function checkCollisions(): void {
  for (const player of gameState.players) {
    if (!player.active || player.dying || player.frozen) continue
    const px = player.actor.roundedX()
    const py = player.actor.roundedY()
    for (const ghost of gameState.ghosts) {
      if (ghost.roundedX() !== px || ghost.roundedY() !== py) continue
      if (ghost.ghostMode === 'frightened') {
        eatGhost(ghost, player)  // score attributed to the player who ate it
      } else if (ghost.ghostMode !== 'eyes' && ghost.ghostMode !== 'house' && ghost.ghostMode !== 'exiting') {
        loseLife(player)
        return
      }
    }
  }
}
```

### `src/Game.ts` — `eatGhost(ghost, player)`
- `ghostEatenChain` stays on `gameState` — **shared**, escalates across all players globally
- `Stats.addToScore(score)` — goes to the shared score (no per-player attribution needed)
- `player.frozen = true` for 0.5s — only freezes that player; other players and ghosts keep moving

### `src/Game.ts` — `loseLife(player)`
- `gameState.sharedLives = Math.max(0, gameState.sharedLives - 1)`
- Sets `player.dying = true`, `player.deathProgress = 0`
- **No global `gameState.frozen`** — other players and all ghosts continue unaffected
- After death animation completes: `player.dying = false`, `player.active = false` — player sits out for the rest of the level
- **No READY! sequence, no position reset** at this point — that only happens at level start/clear
- Game over check after death anim: `if (gameState.players.every(p => !p.active)) triggerGameOver()`

### `src/Game.ts` — `levelClear()`
- Players revived at level start: `p.active = true`, `p.dying = false` for all players where `gameState.sharedLives > 0`
- Players who ran the pool to 0 (dead with 0 lives) stay `active = false` — they are fully eliminated
- Shared lives pool **not reset** on level clear — it carries over; it only starts at 3 at game start
- All active player positions reset to start tile
- READY! sequence plays as normal

### `src/Game.ts` — `checkFruitCollision()`
- Loop over all active players; first player to collide eats the fruit (removed on first hit)

---

## Phase 6 — Ghost AI Multi-Target

**Goal:** Ghost targeting picks the nearest active player rather than a hardcoded single Pacman.

### `src/static/AI.ts` — `ghostTileCenter(ghost)`
Add helper:
```ts
static nearestPlayer(ghost: IGameObject): IGameObject | null {
  let nearest: IGameObject | null = null
  let minDist = Infinity
  for (const player of gameState.players) {
    if (!player.active || player.dying) continue
    const d = getDistance(ghost.roundedX(), ghost.roundedY(), player.actor.roundedX(), player.actor.roundedY())
    if (d < minDist) { minDist = d; nearest = player.actor }
  }
  return nearest
}
```

All chase-mode targeting resolves the Pacman reference through `nearestPlayer()`:
- **Blinky:** `target = nearestPlayer(blinky).tile`
- **Pinky:** `tilesAheadOf(nearestPlayer(pinky), 4)`
- **Inky:** finds `nearestPlayer(inky)`, uses that actor for **both** the intermediate point (2 ahead) and the Blinky-vector calculation — pincer behaviour preserved against whoever Inky is closest to
- **Clyde:** proximity logic against `nearestPlayer(clyde)`
- Elroy scatter override: `nearestPlayer(blinky).tile`

### `src/static/AI.ts` — `tilesAheadOfPacman(n)` → `tilesAheadOf(actor, n)`
- Accept any `IGameObject` instead of always reading `gameState.pacman`
- Same upward overflow bug preserved

---

## Phase 7 — Rendering Updates

**Goal:** Canvas correctly renders up to 4 Pacmen and a multi-player HUD.

### `src/static/Draw.ts` — `Draw.pacman(obj, player)`
- Draw function closes over player: `(obj) => Draw.pacman(obj, player)`
- Player colors (subject to Design Question 1):
  - P1: `yellow`
  - P2: `#00e676` (green)
  - P3: `#ff6ec7` (magenta)
  - P4: `white`
- Death anim reads `player.deathProgress` instead of `gameState.pacmanDeathProgress`
- Each player's death anim plays independently

### `src/static/Draw.ts` — `Draw.ghost(obj)`
- Remove the `gameState.pacmanDying` visibility check entirely — ghosts are **always visible** during individual player deaths since the game keeps running
- Ghosts are only hidden if a global freeze is active (level clear flash, game over)

### `src/static/Draw.ts` — `Draw.hud(players, sharedLives)`
- Single shared lives row bottom-left (Pacman icons representing pool)
- Score layout adapts to player count (see Phase 3)
- Eliminated players: score shown dimmed, no icon in lives row

### `src/Game.ts` — game loop death progress
```ts
for (const p of gameState.players) {
  if (p.dying) {
    p.deathProgress = Math.min(p.deathProgress + Time.deltaTime / DEATH_ANIM_DURATION, 1.0)
  }
}
```

### `src/Game.ts` — `gameState.gameObjects`
- Contains all 4 ghost actors + all active player actors
- Order: player actors first (drawn under ghosts), then ghosts

---

## Phase 8 — Player Selection Menu

**Goal:** Screen between the start screen and gameplay showing player slots and connected controllers.

### Input assignment (fixed, not user-configurable)
- **P1** always exists: keyboard (arrows) + touch swipes + gamepad[0] if connected
- **P2** exists if gamepad[1] is connected
- **P3** exists if gamepad[2] is connected
- **P4** exists if gamepad[3] is connected
- Player count is derived from connected controllers; no manual join needed

### `src/Game.ts` — new `playerSelectLoop()` state
New game phase after tapping start:

**Layout (up to 4 slot cards, grayed out if no controller for that slot):**
```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│    P1    │ │    P2    │ │    P3    │ │    P4    │
│    ●     │ │    ●     │ │    —     │ │    —     │
│KEYS+PAD 1│ │  PAD 2   │ │ NO PAD   │ │ NO PAD   │
│  READY   │ │  READY   │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
              PRESS START / TAP TO PLAY
```

- P1 slot always active; shows `KEYBOARD` if no gamepad[0], `KEYS + PAD 1` if gamepad[0] connected
- P2–P4 slots show `PAD N` if connected, greyed-out `NO PAD` if not
- Controllers can be plugged in/out on this screen; slots update live via `gamepadconnected` / `gamepaddisconnected`
- Minimum 1 player (P1 always present); tap/press start with however many controllers are connected

### `src/static/Draw.ts` — `Draw.playerSelectScreen(slots)`
- New static method rendering slot cards
- Slot data type:
  ```ts
  interface PlayerSlot { id: number; active: boolean; inputLabel: string; color: string }
  ```

---

## Phase 9 — Game Over / End Screen

**Goal:** End state shows the shared final score, prompts for one set of initials if it qualifies.

### `src/Game.ts` — game over trigger
- Each frame after a death completes: `if (gameState.players.every(p => !p.active)) triggerGameOver()`
- Game continues as long as at least one player is active

### `src/static/Draw.ts` — `Draw.gameOverScreen()`
- Same layout as single-player: dark overlay, red `GAME OVER`, shared final score
- No per-player breakdown needed (score is shared)

### `src/Game.ts` — initials entry
- Unchanged from single-player: one prompt, one set of initials, `Stats.saveScore(initials, Stats.currentScore)`
- After entry (or skip if score doesn't qualify): return to menu

---

## Phase 10 — Sound Adjustments

**Goal:** Sound events fire correctly for multi-player scenarios.

### `src/static/Sound.ts`
- `Sound.death()` — Web Audio is polyphonic; overlapping death sounds play naturally; no change
- `Sound.dot()` — fires for any player eating; stateless; no change
- `Sound.ghostEaten()` — fires on any player eating a ghost; no change

### `src/Game.ts` — `updateAmbientSiren()`
- Stop siren only on global `gameState.frozen` or `gameState.gameOver`
- Individual player deaths no longer trigger `gameState.frozen`, so siren keeps playing through them — no change needed
- Individual `player.frozen` (ghost-eat pause for that player) does not stop the siren
- Siren state priority unchanged: `eyes` > `blue` > `normal`

### `src/Game.ts` — `Sound.death()`
- With multiple players potentially dying close together, death sounds may overlap — Web Audio handles this naturally; no change needed

---

## Phase 11 — Actor Construction & `GameObject` Cleanup

**Goal:** Clean, scalable factory for creating player actors.

### `src/Game.ts` — player factory
```ts
function createPlayer(id: number, startTile: {x: number, y: number}, input: PlayerInput, color: string): PlayerState {
  const stats = new PlayerStats()
  // playerState ref needed in closures below
  let playerState: PlayerState
  const actor = new GameObject(
    color,
    startTile.x, startTile.y,
    0.667,
    () => Move.pacman(playerState),
    (obj) => Draw.pacman(obj, playerState),
    (x, y) => makePacmanOnTileChanged(playerState)(x, y),
    (_x, _y) => {},
  )
  playerState = { id, actor, input, stats, frozen: false, dying: false, deathProgress: 0, active: true }
  return playerState
}
```

Starting positions for multi-player — all players currently share `(13.5, 26)`. Options:
- All stack on same tile (they pass through each other)
- Spread horizontally along row 26 (needs safe-tile verification)
- Stagger slightly and snap to nearest safe tile at game start

### `src/Game.ts` — `initializeLevel()` and `start()`
- `start()` reads confirmed player slots from player select screen
- `gameState.players = slots.map(s => createPlayer(s.id, START.pacman, s.input, s.color))`
- `gameState.sharedLives = 3`
- `gameState.gameObjects = [...gameState.players.map(p => p.actor), ...gameState.ghosts]`

### `src/object/GameObject.ts`
- No structural changes required

---

## Phase 12 — Menu Flow Wiring

**Goal:** Complete flow from start screen → player select → gameplay → game over → start screen.

### Flow
```
startScreenLoop()
  └─ tap/click
       └─ playerSelectLoop()
            └─ start pressed (≥1 player joined)
                 └─ start(confirmedSlots)
                      └─ update() [game loop]
                           └─ all players dead
                                └─ gameOverSequence()
                                     └─ initials entry (per qualifying player, sequential)
                                          └─ returningToMenu = true
                                               └─ startScreenLoop()
```

### `src/Game.ts`
- `gameStarted` flag set after player select, not immediately on tap
- `returningToMenu` unchanged — resets to start screen
- `start(slots)` constructs players from confirmed slots, initializes level, starts update loop
- Touch controls: `setupTouchControls()` wires swipe for players using touch input only

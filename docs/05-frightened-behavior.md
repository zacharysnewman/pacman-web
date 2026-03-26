# Chapter 5 — Frightened Behavior

> Source: *The Pac-Man Dossier* by Jamey Pittman (pacman.holenet.info)

---

## Triggering Frightened Mode

Whenever Pac-Man eats one of the four **energizer dots** located near the corners of the board, all ghosts:

1. Immediately **reverse direction**
2. Enter frightened mode (on earlier levels)

---

## Behavior While Frightened

- Ghosts turn **dark blue** and move more slowly than normal
- They **wander aimlessly** — no target tile is used
- They **flash white** briefly as a warning before returning to their previous mode
- The **red-zone upward-turn restrictions** (near the ghost house) are **ignored** — ghosts may turn upward in those zones while frightened
- The scatter/chase timer is **paused** for the duration; it resumes when frightened ends
- Ghosts return to whichever mode (chase or scatter) they were in before being frightened

---

## Pseudo-Random Navigation (PRNG)

Frightened ghosts use a **pseudo-random number generator** to pick a direction at each intersection:

1. The PRNG generates a pseudo-random memory address and reads the last few bits
2. Those bits are translated into a direction to try first
3. If that direction is blocked by a wall or is the reverse of travel, the code tries the **next direction clockwise**
4. This repeats until an acceptable direction is found

The PRNG is **reset with the same initial seed** at the start of each new level and whenever a life is lost. This means frightened ghosts always choose the same paths when executing patterns — their wandering is deterministic per-level.

---

## Frightened Duration & Flash Count by Level

| Level | Frightened Time (s) | Flash Count |
|---|---|---|
| 1 | 6 | 5 |
| 2 | 5 | 5 |
| 3 | 4 | 5 |
| 4 | 3 | 5 |
| 5 | 2 | 5 |
| 6 | 5 | 5 |
| 7 | 2 | 5 |
| 8 | 2 | 5 |
| 9 | 1 | 3 |
| 10 | 5 | 5 |
| 11 | 2 | 5 |
| 12 | 1 | 3 |
| 13 | 1 | 3 |
| 14 | 3 | 5 |
| 15 | 1 | 3 |
| 16 | 1 | 3 |
| 17 | 0 | 0 |
| 18 | 1 | 3 |
| 19+ | 0 | 0 |

- **Flash interval:** 14 game cycles before the end of frightened time
- When frightened time is **0**: ghosts still reverse direction but do **not** turn blue and cannot be eaten
- Flash count **0** at level 17 means no warning flash before returning to normal

---

## Eating a Frightened Ghost

- Pac-Man captures a ghost by **occupying the same tile**
- The ghost's **eyes** immediately return to the ghost house (at high speed)
- The ghost is **revived** and exits to chase again
- Score is awarded: 200 → 400 → 800 → 1,600 (chain resets with each new energizer)
- A brief **score display** appears at the capture location for ~1 second
- **All actors** (Pac-Man and all non-eyes ghosts) are **frozen** for the duration of the score display
- The frightened countdown **pauses** during this freeze so ghost-eating time is not consumed

---

## Implementation Status

| Feature | Status | Notes |
|---|---|---|
| Energizer collection | ✅ Implemented | Tile set to 5, 50 pts added, brief freeze applied |
| Ghost frightened mode activation | ❌ Not implemented | Eating energizer does not change ghost state |
| Ghost blue visual | ❌ Not implemented | No frightened color/appearance |
| Ghost flash warning | ❌ Not implemented | |
| Frightened speed reduction | ❌ Not implemented | All ghosts use constant `moveSpeed = 1.0` |
| PRNG random wandering | ❌ Not implemented | |
| Ghost eating (collision) | ❌ Not implemented | No Pac-Man/ghost collision detection |
| Ghost eyes returning home | ❌ Not implemented | |
| Score chain (200/400/800/1600) | ❌ Not implemented | |
| Pac-Man freeze on ghost eat | ❌ Not implemented | |
| Scatter/chase timer pause | ❌ Not implemented | Timer not running at all yet |
| Red-zone ignored in frightened | ❌ Not implemented | Red zones not implemented at all |
| Per-level duration table | ❌ Not implemented | Duration is not level-dependent |
| PRNG seed reset on new level/life | ❌ Not implemented | |

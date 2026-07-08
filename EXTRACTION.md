# Extraction guide: game-core → roguelite-core

This turns the `packages/game-core` engine from the digilike monorepo into a
standalone, MIT-licensed npm package with no game content. The digilike repo can
stay public and simply depend on the published package (or keep a local copy).

## What moves and what doesn't

| Comes into the engine package        | Stays in digilike (content / IP)        |
| ------------------------------------ | --------------------------------------- |
| All of `packages/game-core/src/**`   | `packages/data/**` (creatures, sprites) |
| The data *contract* (interfaces)     | The actual creature/item/boss data      |
| The simulation harness               | Sprite assets, official descriptions    |

The engine never contained creature names, art, or descriptions — only the
mechanics and type shapes. That's why it's cleanly yours to license.

## Step 1 — Bring in the code

Copy `packages/game-core/src/**` and `scripts/simulate.ts` into the new repo,
then drop in the `contract.ts` from this kit as `src/contract.ts`.

## Step 2 — Cut the `@digilike/data` dependency

Every engine file imports type shapes from `@digilike/data`. Repoint those to the
local contract instead:

```
from "@digilike/data"   →   from "../contract"   (adjust ../ depth per file)
```

The runtime loaders (`loadDigimonDb`, `loadItemDb`, `loadBossDb`) belong to the
*data* layer, not the engine. Remove those imports; in tests, build data from
fixtures instead (see Step 4).

## Step 3 — Apply the rename map

These are pure identifier renames (mechanical, safe to do with search/replace,
verified by the type checker afterward):

| Old (digilike)     | New (generic)     |
| ------------------ | ----------------- |
| `GameDigimon`      | `Species`         |
| `DigimonInstance`  | `Unit`            |
| `digimonId` (Boss) | `speciesId`       |
| `spriteDigimonId`  | `spriteSpeciesId` |
| `loadDigimonDb`    | *(remove — data layer)* |

Rename local variables named `digimon` to `species`/`unit` as appropriate for
readability, and strip comments referencing the original game or its data API.
None of these renames change behavior.

## Step 4 — Fix the data-dependent tests

Two test files load the real dataset via `@digilike/data`:
`src/sim/simulateRun.test.ts` and `src/run/reducers.test.ts`. In the standalone
package there's no dataset, so rewrite them to build a small synthetic roster
using the existing `src/testing/fixtures.ts` helper (`makeSpecies` / `makeTestData`).
The pure-math tests (rng, damage, effectiveness, status, traits, map) already use
fixtures and port unchanged.

## Step 5 — Verify

```bash
npm install
npm run build   # tsc must pass with zero @digilike/data references
npm test        # all suites green
npm run sim     # sanity-check the balance simulation still runs
```

Confirm nothing leaked:

```bash
grep -rin "digimon\|digilike\|digi-api" src/   # should return nothing
```

## Step 6 — Publish (optional but recommended)

- Push to `github.com/tiagomaciels/roguelite-core` with the LICENSE, README and
  CONTRIBUTING from this kit.
- Add topics on GitHub: `roguelike`, `game-engine`, `typescript`, `auto-battler`.
- Optionally `npm publish` (the name `roguelite-core` may need a scope like
  `@tiagomaciels/roguelite-core` if taken).
- In digilike, replace the local engine with the dependency and add a line to its
  README noting the engine now lives in an MIT-licensed package.

# roguelite-core

A **deterministic, content-agnostic auto-battler roguelike engine** in pure TypeScript.

`roguelite-core` implements the mechanics of a node-map roguelike auto-battler —
seeded procedural maps, turn-based auto-resolved battles, a type/element
effectiveness system, recruitment and trades, branching evolutions, team synergy
traits, status conditions, and permadeath — with **zero rendering and zero game
content baked in**. You bring your own creatures, items and bosses; the engine
runs the rules.

## Why it's useful

- **Deterministic & reproducible.** Every run is driven by a seeded PRNG
  (`mulberry32`). The same seed + the same inputs always produce the same run,
  which makes balancing, testing, and shareable seeds trivial.
- **Isomorphic.** Pure TypeScript, no browser or Node APIs. Runs in the browser,
  in a Worker, on a server, or in a headless simulation.
- **Content-agnostic.** The engine defines a small data *contract* (see
  [`src/contract.ts`](src/contract.ts)); your project supplies the data. Ship any
  theme — no assets or trademarks required.
- **Testable & balanceable.** Includes a batch run simulator so you can measure
  win-rate across thousands of seeds and tune your content.

## Install

```bash
npm install roguelite-core
```

## Quick start

```ts
import { buildGameData, simulateBattle, mulberry32 } from "roguelite-core";
import type { Species, Item, Boss } from "roguelite-core";

// Provide your own content (names/art are entirely yours):
const species: Species[] = [/* ... */];
const items: Item[] = [/* ... */];
const bosses: Boss[] = [/* ... */];

const data = buildGameData(species, items, bosses);
const rng = mulberry32(12345); // seed → reproducible run
// drive the run with the exported reducers...
```

## Design notes

The engine is split into focused modules: RNG, battle math (damage,
effectiveness, status, traits, move selection), procedural map generation, run
reducers (the state machine for a full run), and a simulation harness. State
transitions are pure functions over an immutable content snapshot, following a
reducer pattern — see the architecture decision records in `docs/`.

## Origin

`roguelite-core` was extracted from the engine layer of a personal game project
so the reusable mechanics could stand on their own as an open dependency. The
original game's content and art are **not** part of this package.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © 2026 Tiago Maciel

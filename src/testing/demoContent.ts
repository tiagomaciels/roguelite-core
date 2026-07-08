import type { Boss, Item, Species } from "../contract";

/**
 * A small, fully synthetic content set — enough for the engine to run complete
 * games in tests and the balance simulator. Contains NO real game content; it
 * exists only so the content-agnostic engine can be exercised end to end.
 *
 * Layout: four evolution lines, each spanning child → adult → perfect → ultimate,
 * so every map stage has options and evolutions are always available.
 */

const ATTRIBUTES = ["vaccine", "data", "virus", "free"] as const;
const ELEMENTS = ["fire", "water", "nature", "electric"] as const;
const STAGES = ["child", "adult", "perfect", "ultimate"] as const;

const STAGE_BASE: Record<(typeof STAGES)[number], number> = {
  child: 45,
  adult: 60,
  perfect: 78,
  ultimate: 95,
};

/**
 * Builds 4 lines × 4 stages = 16 species with ids 1..16.
 * Line L (0..3) occupies ids L*4 + (1..4); each stage evolves into the next.
 */
export function makeDemoSpecies(): Species[] {
  const species: Species[] = [];
  for (let line = 0; line < 4; line++) {
    for (let s = 0; s < STAGES.length; s++) {
      const id = line * 4 + s + 1;
      const stage = STAGES[s];
      const base = STAGE_BASE[stage];
      species.push({
        id,
        name: `Line${line + 1}-${stage}`,
        stage,
        attribute: ATTRIBUTES[line],
        element: ELEMENTS[line],
        baseStats: {
          hp: base + 5,
          atk: base,
          def: base - 5,
          special: base - 8,
          speed: base - 3,
        },
        moves: [
          { name: "Strike", tier: 1, power: 40 },
          { name: "Blast", tier: 2, power: 75 },
          { name: "Nova", tier: 3, power: 110 },
        ],
        // Not the last stage → evolves into the next stage of the same line.
        evolvesTo: s < STAGES.length - 1 ? [line * 4 + s + 2] : [],
        sprite: `demo/${id}.png`,
        description: "",
      });
    }
  }
  return species;
}

export function makeDemoItems(): Item[] {
  return [
    {
      id: "power-band",
      name: "Power Band",
      description: "+10% damage.",
      effect: { kind: "damage-boost", percent: 10 },
    },
    {
      id: "guard-charm",
      name: "Guard Charm",
      description: "+15% defense.",
      effect: { kind: "stat-boost", stat: "def", percent: 15 },
    },
    {
      id: "medkit",
      name: "Medkit",
      description: "Heals 8% HP per turn.",
      effect: { kind: "heal-per-turn", percent: 8 },
    },
  ];
}

/** One boss per map (1..4), each escalating in stage and level. */
export function makeDemoBosses(): Boss[] {
  return [
    {
      id: "boss-1",
      name: "Line1-adult",
      title: "Warden of the First Gate",
      mapIndex: 1,
      spriteSpeciesId: 2,
      team: [
        { speciesId: 2, level: 8 },
        { speciesId: 6, level: 8 },
      ],
    },
    {
      id: "boss-2",
      name: "Line2-perfect",
      title: "Keeper of the Second Gate",
      mapIndex: 2,
      spriteSpeciesId: 7,
      team: [
        { speciesId: 7, level: 18 },
        { speciesId: 3, level: 18 },
        { speciesId: 11, level: 18 },
      ],
    },
    {
      id: "boss-3",
      name: "Line3-perfect",
      title: "Sentinel of the Third Gate",
      mapIndex: 3,
      spriteSpeciesId: 11,
      team: [
        { speciesId: 11, level: 30 },
        { speciesId: 15, level: 30 },
        { speciesId: 7, level: 30 },
      ],
    },
    {
      id: "boss-4",
      name: "Line4-ultimate",
      title: "The Final Gate",
      mapIndex: 4,
      spriteSpeciesId: 16,
      team: [
        { speciesId: 4, level: 42 },
        { speciesId: 8, level: 42 },
        { speciesId: 12, level: 42 },
        { speciesId: 16, level: 42 },
      ],
    },
  ];
}

/** Convenience ids of the child-stage species (one per line) — usable as starters. */
export const DEMO_STARTER_IDS = [1, 5, 9, 13];

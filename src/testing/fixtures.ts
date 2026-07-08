import type { Species } from "../contract";
import { buildGameData } from "../types";
import type { GameData } from "../types";

/** Fixtures sintéticas para testes unitários com números controlados. */

export function makeSpecies(overrides: Partial<Species> & { id: number }): Species {
  return {
    name: `Testmon${overrides.id}`,
    stage: "child",
    attribute: "data",
    element: "fire",
    baseStats: { hp: 50, atk: 50, def: 50, special: 40, speed: 50 },
    moves: [
      { name: "Hit", tier: 1, power: 40 },
      { name: "Smash", tier: 2, power: 75 },
      { name: "Burst", tier: 3, power: 110 },
    ],
    evolvesTo: [],
    sprite: "sprites/test.png",
    description: "",
    ...overrides,
  };
}

export function makeTestData(species: Species[]): GameData {
  return buildGameData(species, [], []);
}

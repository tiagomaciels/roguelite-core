import { describe, expect, it } from "vitest";
import { makeSpecies } from "../testing/fixtures";
import { computeDamage } from "./damage";

/** RNG fixo: primeiro valor decide crítico, segundo a variância. */
const fixedRng = (values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const attacker = makeSpecies({ id: 1 }); // data/fire, atk 50, special 40
const defender = makeSpecies({ id: 2 }); // data/fire, def 50
const move = { name: "Smash", tier: 2 as const, power: 75 };

describe("computeDamage (fórmula do pokelike, floor por etapa)", () => {
  it("valor conhecido, sem crítico, variância média", () => {
    // L10: atk 15 vs def 15 → base = floor(6×75×1/50)+2 = 11
    // mult = 1 (atributo) × 1 (fire vs fire) × 1.5 (STAB) → floor(11×1.5) = 16
    // variância rng 0.5 → ×0.925 → floor(14.8) = 14
    const out = computeDamage(
      {
        attacker,
        attackerLevel: 10,
        attackerItem: null,
        defender,
        defenderLevel: 10,
        defenderItem: null,
        move,
      },
      fixedRng([0.5, 0.5]),
    );
    expect(out.damage).toBe(14);
    expect(out.crit).toBe(false);
    expect(out.multiplier).toBeCloseTo(1.5);
    expect(out.recoil).toBe(0);
  });

  it("crítico multiplica por 1.5 (rng abaixo de 6.25%)", () => {
    const noCrit = computeDamage(
      {
        attacker,
        attackerLevel: 10,
        attackerItem: null,
        defender,
        defenderLevel: 10,
        defenderItem: null,
        move,
      },
      fixedRng([0.9, 1 - 1e-9]),
    );
    const crit = computeDamage(
      {
        attacker,
        attackerLevel: 10,
        attackerItem: null,
        defender,
        defenderLevel: 10,
        defenderItem: null,
        move,
      },
      fixedRng([0.01, 1 - 1e-9]),
    );
    expect(crit.crit).toBe(true);
    // O crítico aplica antes da variância (floor por etapa):
    // noCrit: floor(16 × ~1.0) = 15; crit: floor(floor(16×1.5) × ~1.0) = 23.
    expect(noCrit.damage).toBe(15);
    expect(crit.damage).toBe(23);
  });

  it("usa o melhor lado ofensivo (special quando maior que atk)", () => {
    const mago = makeSpecies({
      id: 3,
      baseStats: { hp: 50, atk: 20, def: 50, special: 80, speed: 50 },
    });
    // special L10 = floor(800/50)+5 = 21 vs special defensivo do alvo 13
    const out = computeDamage(
      {
        attacker: mago,
        attackerLevel: 10,
        attackerItem: null,
        defender,
        defenderLevel: 10,
        defenderItem: null,
        move,
      },
      fixedRng([0.5, 1 - 1e-9]),
    );
    // base = floor(6×75×(21/13)/50)+2 = floor(14.53)+2 = 16 → STAB ×1.5 = 24
    // → variância ~1.0 com floor final = 23
    expect(out.damage).toBe(23);
  });

  it("damage-boost aplica bônus e recuo", () => {
    const powerChip = {
      id: "power-chip",
      name: "Power Chip",
      description: "",
      effect: { kind: "damage-boost", percent: 30, recoilPercent: 10 },
    } as const;
    const out = computeDamage(
      {
        attacker,
        attackerLevel: 10,
        attackerItem: powerChip,
        defender,
        defenderLevel: 10,
        defenderItem: null,
        move,
      },
      fixedRng([0.5, 0.5]),
    );
    expect(out.damage).toBe(Math.floor(14 * 1.3)); // 18
    expect(out.recoil).toBe(Math.max(1, Math.floor(out.damage * 0.1)));
  });

  it("dano mínimo é 1", () => {
    const fraco = makeSpecies({
      id: 4,
      baseStats: { hp: 50, atk: 20, def: 20, special: 20, speed: 20 },
    });
    const tanque = makeSpecies({
      id: 5,
      baseStats: { hp: 50, atk: 20, def: 140, special: 140, speed: 20 },
    });
    const out = computeDamage(
      {
        attacker: fraco,
        attackerLevel: 2,
        attackerItem: null,
        defender: tanque,
        defenderLevel: 60,
        defenderItem: null,
        move: { name: "Tap", tier: 1, power: 40 },
      },
      fixedRng([0.5, 0]),
    );
    expect(out.damage).toBeGreaterThanOrEqual(1);
  });
});

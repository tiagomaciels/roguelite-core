import type { Attribute } from "../contract";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng/mulberry32";
import { makeInstance } from "../run/encounters";
import { makeSpecies, makeTestData } from "../testing/fixtures";
import { computeDamage } from "./damage";
import { simulateBattle } from "./simulateBattle";
import {
  computeTeamTraits,
  traitMultiplierFor,
  TRAIT_TIER1_COUNT,
  TRAIT_TIER2_COUNT,
} from "./traits";

function attrs(spec: Partial<Record<Attribute, number>>): Attribute[] {
  const out: Attribute[] = [];
  for (const [a, n] of Object.entries(spec)) {
    for (let i = 0; i < (n ?? 0); i++) out.push(a as Attribute);
  }
  return out;
}

describe("computeTeamTraits", () => {
  it("abaixo do limiar não gera trait", () => {
    expect(computeTeamTraits(attrs({ vaccine: TRAIT_TIER1_COUNT - 1 }))).toEqual([]);
    expect(computeTeamTraits([])).toEqual([]);
  });

  it(`${TRAIT_TIER1_COUNT} do mesmo atributo → tier 1`, () => {
    const [t] = computeTeamTraits(attrs({ virus: TRAIT_TIER1_COUNT }));
    expect(t.tier).toBe(1);
    expect(t.attribute).toBe("virus");
    expect(t.stat).toBe("atk");
    expect(t.bonusPercent).toBeGreaterThan(0);
  });

  it(`${TRAIT_TIER2_COUNT} do mesmo atributo → tier 2 (bônus maior que o tier 1)`, () => {
    const [t1] = computeTeamTraits(attrs({ vaccine: TRAIT_TIER1_COUNT }));
    const [t2] = computeTeamTraits(attrs({ vaccine: TRAIT_TIER2_COUNT }));
    expect(t2.tier).toBe(2);
    expect(t2.stat).toBe("def");
    expect(t2.bonusPercent).toBeGreaterThan(t1.bonusPercent);
  });

  it("cada atributo reforça seu stat temático", () => {
    const map = (a: Attribute) => computeTeamTraits(attrs({ [a]: TRAIT_TIER1_COUNT }))[0].stat;
    expect(map("vaccine")).toBe("def");
    expect(map("virus")).toBe("atk");
    expect(map("data")).toBe("special");
    expect(map("free")).toBe("speed");
  });

  it("dois atributos podem ter sinergia ao mesmo tempo", () => {
    const traits = computeTeamTraits(attrs({ vaccine: 3, virus: 3 }));
    expect(traits.map((t) => t.attribute).sort()).toEqual(["vaccine", "virus"]);
  });
});

describe("traitMultiplierFor", () => {
  it("aplica o bônus só ao atributo com trait ativo", () => {
    const traits = computeTeamTraits(attrs({ virus: TRAIT_TIER1_COUNT }));
    expect(traitMultiplierFor("virus", traits).atk).toBeGreaterThan(1);
    expect(traitMultiplierFor("vaccine", traits)).toEqual({});
  });
});

describe("integração com o dano", () => {
  const attacker = makeSpecies({
    id: 1,
    attribute: "virus",
    element: "neutral",
    baseStats: { hp: 50, atk: 80, def: 50, special: 30, speed: 50 },
  });
  const defender = makeSpecies({
    id: 2,
    attribute: "data",
    element: "neutral",
    baseStats: { hp: 50, atk: 50, def: 50, special: 50, speed: 50 },
  });
  const move = { name: "Hit", tier: 1 as const, power: 40 };

  it("o multiplicador de trait aumenta o dano (mesma seed de rng)", () => {
    const args = {
      attacker,
      attackerLevel: 20,
      attackerItem: null,
      defender,
      defenderLevel: 20,
      defenderItem: null,
      move,
    };
    const base = computeDamage(args, mulberry32(1));
    const buffed = computeDamage({ ...args, attackerTraitMult: { atk: 1.2 } }, mulberry32(1));
    expect(buffed.damage).toBeGreaterThan(base.damage);
  });
});

describe("determinismo com sinergia", () => {
  const virus = makeSpecies({ id: 10, attribute: "virus", element: "fire" });
  const data = makeTestData([virus]);

  it("time mono-atributo (sinergia ativa) é determinístico", () => {
    const team = () =>
      Array.from({ length: TRAIT_TIER2_COUNT }, (_, i) => makeInstance(virus, 12, `p${i}`));
    const foes = () => [makeInstance(virus, 12, "e0")];
    const a = simulateBattle(team(), foes(), data, 777).events;
    const b = simulateBattle(team(), foes(), data, 777).events;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

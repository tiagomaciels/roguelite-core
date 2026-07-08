import { describe, expect, it } from "vitest";
import { makeInstance } from "../run/encounters";
import { makeSpecies, makeTestData } from "../testing/fixtures";
import type { BattleEvent } from "../types";
import { simulateBattle } from "./simulateBattle";
import { POISON_DAMAGE_FRAC, statusForElement } from "./status";

// Espécies tanky e de mesmo nível: as batalhas duram vários rounds, dando
// tempo para o status ser infligido e o veneno tiquetaquear.
const nature = makeSpecies({ id: 1, element: "nature", baseStats: bulk() });
const ice = makeSpecies({ id: 2, element: "ice", baseStats: bulk() });
const neutral = makeSpecies({ id: 3, element: "neutral", baseStats: bulk() });

function bulk() {
  return { hp: 90, atk: 50, def: 55, special: 45, speed: 50 };
}

const data = makeTestData([nature, ice, neutral]);

/** Roda batalhas espelhadas numa faixa de seeds e junta todos os eventos. */
function eventsAcrossSeeds(
  attacker: typeof nature,
  defender: typeof neutral,
  count = 200,
): BattleEvent[] {
  const all: BattleEvent[] = [];
  for (let s = 0; s < count; s++) {
    const r = simulateBattle(
      [makeInstance(attacker, 20, "p0")],
      [makeInstance(defender, 20, "e0")],
      data,
      s,
    );
    all.push(...r.events);
  }
  return all;
}

describe("statusForElement", () => {
  it("gelo congela, natureza envenena, demais não infligem", () => {
    expect(statusForElement("ice")?.status).toBe("freeze");
    expect(statusForElement("nature")?.status).toBe("poison");
    expect(statusForElement("fire")).toBeNull();
    expect(statusForElement("neutral")).toBeNull();
  });
});

describe("poison (golpes de natureza)", () => {
  const events = eventsAcrossSeeds(nature, neutral);

  it("inflige veneno e causa dano de fim de round", () => {
    expect(events.some((e) => e.type === "status" && e.status === "poison")).toBe(true);
    expect(events.some((e) => e.type === "poison-damage")).toBe(true);
  });

  it("dano de veneno = floor(maxHp × fração), ≥ 1", () => {
    const maxHp = simulateBattle(
      [makeInstance(nature, 20, "p0")],
      [makeInstance(neutral, 20, "e0")],
      data,
      0,
    ).events.find((e) => e.type === "start");
    const enemyMax = maxHp?.type === "start" ? maxHp.enemy.maxHp : 0;
    const expected = Math.max(1, Math.floor(enemyMax * POISON_DAMAGE_FRAC));
    for (const e of events) {
      if (e.type === "poison-damage") {
        expect(e.amount).toBe(expected);
        expect(e.amount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("todo dano de veneno é precedido por um status de veneno no mesmo uid", () => {
    for (let s = 0; s < 200; s++) {
      const evs = simulateBattle(
        [makeInstance(nature, 20, "p0")],
        [makeInstance(neutral, 20, "e0")],
        data,
        s,
      ).events;
      const poisonedUids = new Set<string>();
      for (const e of evs) {
        if (e.type === "status" && e.status === "poison") poisonedUids.add(e.uid);
        if (e.type === "poison-damage") expect(poisonedUids.has(e.uid)).toBe(true);
      }
    }
  });
});

describe("freeze (golpes de gelo)", () => {
  const events = eventsAcrossSeeds(ice, neutral);

  it("inflige congelamento e gera pulo de turno ou descongelamento", () => {
    expect(events.some((e) => e.type === "status" && e.status === "freeze")).toBe(true);
    expect(events.some((e) => e.type === "frozen-skip" || e.type === "thaw")).toBe(true);
  });

  it("pulo por congelamento só ocorre depois de um status de congelamento", () => {
    for (let s = 0; s < 200; s++) {
      const evs = simulateBattle(
        [makeInstance(ice, 20, "p0")],
        [makeInstance(neutral, 20, "e0")],
        data,
        s,
      ).events;
      const frozenUids = new Set<string>();
      for (const e of evs) {
        if (e.type === "status" && e.status === "freeze") frozenUids.add(e.uid);
        if (e.type === "frozen-skip") expect(frozenUids.has(e.uid)).toBe(true);
      }
    }
  });
});

describe("stat stages (crítico baixa a defesa atingida)", () => {
  it("todo crítico com defensor vivo é seguido de queda de estágio defensivo", () => {
    let seenCrit = false;
    for (let s = 0; s < 300; s++) {
      const evs = simulateBattle(
        [makeInstance(neutral, 20, "p0")],
        [makeInstance(neutral, 20, "e0")],
        data,
        s,
      ).events;
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        if (e.type === "attack" && e.crit && e.defenderHpAfter > 0) {
          seenCrit = true;
          const defenderSide = e.side === "player" ? "enemy" : "player";
          const next = evs[i + 1];
          expect(next?.type).toBe("stat-stage");
          if (next?.type === "stat-stage") {
            expect(next.side).toBe(defenderSide);
            expect(next.delta).toBe(-1);
            expect(["def", "special"]).toContain(next.stat);
          }
        }
      }
    }
    expect(seenCrit).toBe(true); // a faixa de seeds cobre ao menos um crítico
  });
});

describe("determinismo com status", () => {
  it("mesmo seed produz o mesmo log mesmo com poison/freeze", () => {
    const run = () =>
      simulateBattle([makeInstance(nature, 20, "p0")], [makeInstance(ice, 20, "e0")], data, 4242)
        .events;
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

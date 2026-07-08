import { describe, expect, it } from "vitest";
import { makeSpecies } from "../testing/fixtures";
import {
  effectiveMaxHp,
  effectiveStat,
  MAX_STAT_STAGE,
  maxHpAt,
  naturalStageForLevel,
  stageMultiplier,
  staleStageMultiplier,
  statAt,
} from "./stats";

describe("fórmulas base (pokelike/docs/06)", () => {
  it("HP = floor(base×nível/50) + nível + 10", () => {
    expect(maxHpAt(50, 5)).toBe(20); // floor(5) + 5 + 10
    expect(maxHpAt(55, 13)).toBe(37); // floor(14.3) + 13 + 10
  });

  it("stat = floor(base×nível/50) + 5", () => {
    expect(statAt(50, 10)).toBe(15);
    expect(statAt(45, 7)).toBe(11); // floor(6.3) + 5
  });
});

describe("stageMultiplier (estágios de stat em batalha)", () => {
  it("estágio 0 é neutro (×1)", () => {
    expect(stageMultiplier(0)).toBe(1);
  });

  it("estágios positivos seguem (2+s)/2", () => {
    expect(stageMultiplier(1)).toBeCloseTo(1.5);
    expect(stageMultiplier(2)).toBeCloseTo(2);
    expect(stageMultiplier(6)).toBeCloseTo(4);
  });

  it("estágios negativos seguem 2/(2−s)", () => {
    expect(stageMultiplier(-1)).toBeCloseTo(2 / 3);
    expect(stageMultiplier(-2)).toBeCloseTo(0.5);
    expect(stageMultiplier(-6)).toBeCloseTo(0.25);
  });

  it("satura nos limites [−6, +6]", () => {
    expect(stageMultiplier(-99)).toBe(stageMultiplier(-MAX_STAT_STAGE));
    expect(stageMultiplier(99)).toBe(stageMultiplier(MAX_STAT_STAGE));
  });
});

describe("estágio natural e bônus de atraso", () => {
  it("estágio natural por nível: <15 child, <30 adult, <45 perfect", () => {
    expect(naturalStageForLevel(14)).toBe("child");
    expect(naturalStageForLevel(15)).toBe("adult");
    expect(naturalStageForLevel(30)).toBe("perfect");
    expect(naturalStageForLevel(45)).toBe("ultimate");
  });

  it("+15% por estágio de atraso; sem bônus quando em dia", () => {
    expect(staleStageMultiplier("child", 10)).toBe(1);
    expect(staleStageMultiplier("child", 20)).toBeCloseTo(1.15); // child em níveis de adult
    expect(staleStageMultiplier("child", 45)).toBeCloseTo(1.45); // 3 estágios atrás
    expect(staleStageMultiplier("ultimate", 50)).toBe(1);
  });
});

describe("effectiveStat com itens", () => {
  const species = makeSpecies({ id: 1 });

  it("stat-boost aplica percentual e penalidade", () => {
    const item = {
      id: "attack-plugin",
      name: "Attack Plugin",
      description: "",
      effect: {
        kind: "stat-boost",
        stat: "atk",
        percent: 40,
        penaltyStat: "def",
        penaltyPercent: 20,
      },
    } as const;
    expect(effectiveStat(species, 10, "atk", item)).toBe(Math.floor(15 * 1.4)); // 21
    expect(effectiveStat(species, 10, "def", item)).toBe(Math.floor(15 * 0.8)); // 12
    expect(effectiveStat(species, 10, "speed", item)).toBe(15); // não afetado
  });

  it("onlyNonFinalStage não aplica em quem não evolui mais", () => {
    const guardChip = {
      id: "guard-chip",
      name: "Guard Chip",
      description: "",
      effect: { kind: "stat-boost", stat: "def", percent: 50, onlyNonFinalStage: true },
    } as const;
    const nonFinal = makeSpecies({ id: 2, evolvesTo: [3] });
    const final = makeSpecies({ id: 3 });
    expect(effectiveStat(nonFinal, 10, "def", guardChip)).toBe(Math.floor(15 * 1.5));
    expect(effectiveStat(final, 10, "def", guardChip)).toBe(15);
  });

  it("hp-ram aumenta o HP máximo", () => {
    const hpRam = {
      id: "hp-ram",
      name: "HP RAM",
      description: "",
      effect: { kind: "stat-boost", stat: "hp", percent: 25 },
    } as const;
    expect(effectiveMaxHp(species, 10, hpRam)).toBe(Math.floor(maxHpAt(50, 10) * 1.25));
  });
});

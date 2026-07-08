import { describe, expect, it } from "vitest";
import { buildGameData } from "../types";
import type { GameData } from "../types";
import {
  makeDemoBosses,
  makeDemoItems,
  makeDemoSpecies,
  DEMO_STARTER_IDS,
} from "../testing/demoContent";
import { runMassSimulation, simulateRun } from "./simulateRun";

/**
 * These tests prove *engine* properties: determinism, termination, and state
 * invariants. Concrete balance (win-rate targets) is a property of game
 * *content*, not of the engine, so it lives with the content, not here.
 */

const data: GameData = buildGameData(makeDemoSpecies(), makeDemoItems(), makeDemoBosses());
const starterIds = DEMO_STARTER_IDS;

describe("simulateRun", () => {
  it("is deterministic: same seed produces the same outcome", () => {
    const a = simulateRun(data, starterIds[0], 12345);
    const b = simulateRun(data, starterIds[0], 12345);
    expect(a).toEqual(b);
  });

  it("every run terminates without hanging, within valid bounds", () => {
    for (let s = 0; s < 40; s++) {
      const outcome = simulateRun(data, starterIds[s % starterIds.length], 1000 + s);
      expect(outcome.mapReached).toBeGreaterThanOrEqual(1);
      expect(outcome.mapReached).toBeLessThanOrEqual(4);
      expect(outcome.finalTeamSize).toBeGreaterThanOrEqual(1);
      expect(outcome.finalTeamSize).toBeLessThanOrEqual(6);
    }
  });
});

describe("runMassSimulation", () => {
  it("aggregates a batch of runs and reports a coherent win-rate", () => {
    const report = runMassSimulation(data, starterIds, 100, 20260611);
    expect(report.runs).toBe(100);
    expect(report.winrate).toBeGreaterThanOrEqual(0);
    expect(report.winrate).toBeLessThanOrEqual(1);
    expect(report.avgMapReached).toBeGreaterThanOrEqual(1);
    expect(report.avgMapReached).toBeLessThanOrEqual(4);
  });

  it("is deterministic across identical batches", () => {
    const a = runMassSimulation(data, starterIds, 50, 42);
    const b = runMassSimulation(data, starterIds, 50, 42);
    expect(a).toEqual(b);
  });
});

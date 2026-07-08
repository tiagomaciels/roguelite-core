import { buildGameData, runMassSimulation } from "../src/index";
import {
  makeDemoBosses,
  makeDemoItems,
  makeDemoSpecies,
  DEMO_STARTER_IDS,
} from "../src/testing/demoContent";

/**
 * Balance CLI: plays N runs with the greedy policy and prints a report.
 *   npm run sim -- [runs] [seed]
 *
 * This ships with the synthetic demo roster so the engine can be exercised out
 * of the box. Point it at your own content to balance a real game.
 */
const runs = Number(process.argv[2] ?? 1000);
const baseSeed = Number(process.argv[3] ?? 20260611);

const data = buildGameData(makeDemoSpecies(), makeDemoItems(), makeDemoBosses());

console.time("simulation");
const report = runMassSimulation(data, DEMO_STARTER_IDS, runs, baseSeed);
console.timeEnd("simulation");

console.log(`\nruns: ${report.runs}`);
console.log(`winrate: ${(report.winrate * 100).toFixed(1)}%`);
console.log(`avg map reached: ${report.avgMapReached.toFixed(2)} / 4`);
console.log(`avg battles won: ${report.avgBattlesWon.toFixed(1)}`);
console.log(`avg evolutions: ${report.avgDigivolutions.toFixed(1)}`);
console.log(
  `losses by map: ${Object.entries(report.lossesByMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([map, n]) => `map ${map}: ${n}`)
    .join(" · ")}`,
);

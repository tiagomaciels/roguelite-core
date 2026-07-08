import { deriveSeed } from "../rng/hash";
import { mulberry32 } from "../rng/mulberry32";
import { effectiveMaxHp } from "../stats/stats";
import type { GameData, MapNode, RunState } from "../types";
import {
  acceptRareRecruit,
  digivolve,
  dismissEncounter,
  enterNode,
  equip,
  MAX_TEAM_SIZE,
  pickItem,
  recruit,
  startRun,
  trade,
} from "../run/reducers";

/**
 * Joga uma run inteira com uma política gulosa simples — a ferramenta
 * permanente de balanceamento (critério de aceite 5 do PRD: winrate 20–50%).
 * É TS puro: o relatório agregado/CLI fica fora do motor.
 */

export interface RunOutcome {
  victory: boolean;
  mapReached: number;
  battlesWon: number;
  finalTeamSize: number;
  finalLevels: number[];
  digivolutions: number;
}

function teamHpRatio(state: RunState, data: GameData): number {
  let hp = 0;
  let max = 0;
  for (const d of state.team) {
    const species = data.species.get(d.speciesId);
    if (!species) continue;
    const item = d.itemId !== null ? (data.items.get(d.itemId) ?? null) : null;
    hp += d.currentHp;
    max += effectiveMaxHp(species, d.level, item);
  }
  return max === 0 ? 0 : hp / max;
}

/** Política gulosa de escolha de nó: curar se machucado, recrutar se time pequeno. */
function chooseNode(state: RunState, data: GameData, accessible: MapNode[]): MapNode {
  const hpRatio = teamHpRatio(state, data);
  const prefer = (type: MapNode["type"]): MapNode | undefined =>
    accessible.find((n) => n.type === type);

  if (hpRatio < 0.6) {
    const heal = prefer("heal");
    if (heal) return heal;
  }
  if (state.team.length < 5) {
    const recruitNode = prefer("recruit");
    if (recruitNode) return recruitNode;
    const rare = prefer("rare");
    if (rare) return rare;
  }
  return (
    prefer("battle") ??
    prefer("rival") ??
    prefer("recruit") ??
    prefer("rare") ??
    prefer("trade") ??
    prefer("item") ??
    accessible[0]
  );
}

export function simulateRun(data: GameData, starterSpeciesId: number, seed: number): RunOutcome {
  let state = startRun(data, starterSpeciesId, seed);
  const policyRng = mulberry32(deriveSeed(seed, "policy"));
  let digivolutions = 0;
  let guard = 0;

  while (state.phase !== "victory" && state.phase !== "game-over" && guard++ < 500) {
    switch (state.phase) {
      case "map": {
        const current = state.map.nodes.find((n) => n.id === state.currentNodeId);
        const accessible = (current?.next ?? [])
          .map((id) => state.map.nodes.find((n) => n.id === id))
          .filter((n): n is MapNode => n !== undefined);
        if (accessible.length === 0) throw new Error("Sem nós acessíveis — mapa quebrado.");
        state = enterNode(state, data, chooseNode(state, data, accessible).id);
        break;
      }
      case "encounter": {
        const encounter = state.encounter;
        if (encounter?.kind === "recruit") {
          // Recruta a opção de maior nível se houver vaga.
          if (state.team.length < MAX_TEAM_SIZE) {
            const best = encounter.options.reduce(
              (bestIdx, o, i) => (o.level > encounter.options[bestIdx].level ? i : bestIdx),
              0,
            );
            state = recruit(state, data, best);
          } else {
            state = recruit(state, data, null);
          }
        } else if (encounter?.kind === "rare") {
          state =
            state.team.length < MAX_TEAM_SIZE
              ? acceptRareRecruit(state, data, true)
              : acceptRareRecruit(state, data, false);
        } else if (encounter?.kind === "trade") {
          const lowest = state.team.reduce(
            (lowest, d) => (d.level < lowest.level ? d : lowest),
            state.team[0],
          );
          state =
            lowest.level + 1 < encounter.offer.level
              ? trade(state, data, lowest.uid)
              : trade(state, data, null);
        } else if (encounter?.kind === "item") {
          state = pickItem(state, data, Math.floor(policyRng() * encounter.options.length));
          // Equipa itens soltos no primeiro membro sem item.
          const free = state.team.find((d) => d.itemId === null);
          const itemId = state.inventory[0];
          if (free && itemId !== undefined) state = equip(state, free.uid, itemId);
        } else {
          state = dismissEncounter(state, data);
        }
        break;
      }
      case "digivolve": {
        // Sempre aceita a primeira opção (linha canônica vem primeiro no snapshot).
        state = digivolve(state, data, state.digivolveQueue[0].options[0]);
        digivolutions++;
        break;
      }
      default:
        throw new Error(`Fase inesperada: ${state.phase}`);
    }
  }

  return {
    victory: state.phase === "victory",
    mapReached: state.mapIndex,
    battlesWon: state.battlesWon,
    finalTeamSize: state.team.length,
    finalLevels: state.team.map((d) => d.level),
    digivolutions,
  };
}

export interface SimReport {
  runs: number;
  winrate: number;
  avgMapReached: number;
  avgBattlesWon: number;
  avgDigivolutions: number;
  lossesByMap: Record<number, number>;
}

export function runMassSimulation(
  data: GameData,
  starterSpeciesIds: number[],
  runs: number,
  baseSeed = 1,
): SimReport {
  let wins = 0;
  let mapSum = 0;
  let battleSum = 0;
  let digivolveSum = 0;
  const lossesByMap: Record<number, number> = {};

  for (let i = 0; i < runs; i++) {
    const starter = starterSpeciesIds[i % starterSpeciesIds.length];
    const outcome = simulateRun(data, starter, deriveSeed(baseSeed, `run${i}`));
    if (outcome.victory) wins++;
    else lossesByMap[outcome.mapReached] = (lossesByMap[outcome.mapReached] ?? 0) + 1;
    mapSum += outcome.mapReached;
    battleSum += outcome.battlesWon;
    digivolveSum += outcome.digivolutions;
  }

  return {
    runs,
    winrate: wins / runs,
    avgMapReached: mapSum / runs,
    avgBattlesWon: battleSum / runs,
    avgDigivolutions: digivolveSum / runs,
    lossesByMap,
  };
}

import type { Species } from "../contract";
import { simulateBattle } from "../battle/simulateBattle";
import { generateMap } from "../map/generateMap";
import { deriveSeed } from "../rng/hash";
import { mulberry32 } from "../rng/mulberry32";
import { DIGIVOLVE_LEVEL, effectiveMaxHp, MAX_LEVEL } from "../stats/stats";
import type {
  BattleResult,
  Unit,
  DigivolvePrompt,
  Encounter,
  GameData,
  MapNode,
  RunMode,
  RunState,
} from "../types";
import {
  generateBossTeam,
  generateItemOptions,
  generateRareRecruitOption,
  generateRecruitOptions,
  generateRivalTeam,
  generateTradeOffer,
  generateWildTeam,
  makeInstance,
  TOTAL_MAPS,
} from "./encounters";

/**
 * Reducers puros do estado da run: (state, ação, data) → novo state.
 * Nenhum reducer toca em I/O — save/load e renderização são problema do app.
 * Toda aleatoriedade deriva de (state.seed + contexto), nunca de Math.random.
 */

export const MAX_TEAM_SIZE = 6;
/**
 * XP de jornada (+1 em nós não-combate) + batalha (+2) + boss (+3): amarra a
 * progressão ao avanço no mapa em vez do sorteio de tipos de nó — a simulação
 * mostrou que caminhos com 1 batalha chegavam ao boss 4+ níveis abaixo da curva.
 */
const XP_PER_WIN = 2;
const XP_PER_RIVAL_WIN = 3;
const XP_PER_BOSS_WIN = 3;
const XP_PER_TRAVEL = 1;
/**
 * Regeneração pós-vitória (30% do HP máximo, vivos): sem ela, o atrito entre
 * batalhas (cura só em ~10% dos nós) mata a run por exaustão — validado pela
 * simulação em massa. Faz o papel da economia de poções/centros do Pokelike.
 */
const POST_BATTLE_REGEN = 0.3;

export function startRun(
  data: GameData,
  starterSpeciesId: number,
  seed: number,
  mode: RunMode = "normal",
): RunState {
  const species = data.species.get(starterSpeciesId);
  if (!species) throw new Error(`Starter desconhecido: ${starterSpeciesId}`);
  const map = generateMap(seed, 1);
  const starter = makeInstance(species, 5, "d0");
  return {
    mode,
    seed,
    mapIndex: 1,
    map,
    currentNodeId: map.startNodeId,
    visitedNodeIds: [map.startNodeId],
    team: [starter],
    inventory: [],
    phase: "map",
    encounter: null,
    digivolveQueue: [],
    recruitedMapIndexes: [],
    nextUid: 1,
    battlesWon: 0,
  };
}

function getNode(state: RunState, nodeId: string): MapNode {
  const node = state.map.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`Nó desconhecido: ${nodeId}`);
  return node;
}

function aliveTeam(team: Unit[]): Unit[] {
  return team.filter((d) => d.currentHp > 0);
}

function runMode(state: RunState): RunMode {
  return state.mode ?? "normal";
}

function hasNuzlockeRecruitAvailable(state: RunState): boolean {
  return runMode(state) !== "nuzlocke" || !state.recruitedMapIndexes.includes(state.mapIndex);
}

function markNuzlockeRecruitUsed(state: RunState): RunState {
  if (runMode(state) !== "nuzlocke") return state;
  if (state.recruitedMapIndexes.includes(state.mapIndex)) return state;
  return { ...state, recruitedMapIndexes: [...state.recruitedMapIndexes, state.mapIndex] };
}

/** Membros 5+ níveis atrás do carry ganham XP em dobro (anti "espiral do desmaio"). */
const CATCH_UP_GAP = 5;

/**
 * Aplica `gained` níveis à equipe (HP máximo cresce, dano sofrido em pontos se
 * mantém; `regenPct` cura adicional; desmaiados continuam em 0) e enfileira
 * digievoluções de quem cruzou o nível de corte do estágio.
 */
function levelUpTeam(
  team: Unit[],
  data: GameData,
  digivolveQueue: DigivolvePrompt[],
  gained: number,
  regenPct: number,
  includeFainted: boolean,
  extraFor?: (d: Unit) => number,
): Unit[] {
  const peak = Math.max(...team.map((d) => d.level));
  return team.map((d) => {
    const fainted = d.currentHp <= 0;
    if (fainted && !includeFainted) return d;
    const species = mustSpecies(data, d.speciesId);
    const item = d.itemId !== null ? (data.items.get(d.itemId) ?? null) : null;
    const catchUp = d.level <= peak - CATCH_UP_GAP ? 2 : 1;
    const total = (gained + (extraFor?.(d) ?? 0)) * catchUp;
    const newLevel = Math.min(MAX_LEVEL, d.level + total);
    const oldMax = effectiveMaxHp(species, d.level, item);
    const newMax = effectiveMaxHp(species, newLevel, item);
    const regen = Math.floor(newMax * regenPct);
    const currentHp = fainted ? 0 : Math.min(newMax, d.currentHp + (newMax - oldMax) + regen);
    const threshold = species.stage !== "ultimate" ? DIGIVOLVE_LEVEL[species.stage] : null;
    if (
      threshold !== null &&
      newLevel >= threshold &&
      species.evolvesTo.length > 0 &&
      !digivolveQueue.some((p) => p.uid === d.uid)
    ) {
      digivolveQueue.push({ uid: d.uid, options: species.evolvesTo });
    }
    return { ...d, level: newLevel, currentHp };
  });
}

/** Entra num nó acessível e resolve o encontro dele. */
export function enterNode(state: RunState, data: GameData, nodeId: string): RunState {
  if (state.phase !== "map") throw new Error(`enterNode em fase inválida: ${state.phase}`);
  const current = getNode(state, state.currentNodeId);
  if (!current.next.includes(nodeId)) throw new Error(`Nó inacessível: ${nodeId}`);
  const node = getNode(state, nodeId);

  const base: RunState = {
    ...state,
    currentNodeId: nodeId,
    visitedNodeIds: [...state.visitedNodeIds, nodeId],
    phase: "encounter",
  };

  const teamLevel = Math.max(...state.team.map((d) => d.level));

  switch (node.type) {
    case "battle": {
      const enemies = generateWildTeam(
        data,
        state.seed,
        nodeId,
        state.mapIndex,
        node.layer,
        teamLevel,
      );
      return applyBattle(base, data, enemies, "battle", nodeId);
    }
    case "rival": {
      const enemies = generateRivalTeam(data, state.seed, nodeId, state.mapIndex, teamLevel);
      return applyBattle(base, data, enemies, "rival", nodeId);
    }
    case "boss": {
      const enemies = generateBossTeam(data, state.mapIndex);
      return applyBattle(base, data, enemies, "boss", nodeId);
    }
    case "recruit": {
      const options = generateRecruitOptions(data, state.seed, nodeId, state.mapIndex, teamLevel);
      const queue = [...state.digivolveQueue];
      const team = levelUpTeam(state.team, data, queue, XP_PER_TRAVEL, 0, true);
      return { ...base, team, digivolveQueue: queue, encounter: { kind: "recruit", options } };
    }
    case "item": {
      const options = generateItemOptions(data, state.seed, nodeId);
      const queue = [...state.digivolveQueue];
      const team = levelUpTeam(state.team, data, queue, XP_PER_TRAVEL, 0, true);
      return { ...base, team, digivolveQueue: queue, encounter: { kind: "item", options } };
    }
    case "trade": {
      const offer = generateTradeOffer(
        data,
        state.seed,
        nodeId,
        state.mapIndex,
        teamLevel,
        state.team.map((d) => d.speciesId),
      );
      const queue = [...state.digivolveQueue];
      const team = levelUpTeam(state.team, data, queue, XP_PER_TRAVEL, 0, true);
      return { ...base, team, digivolveQueue: queue, encounter: { kind: "trade", offer } };
    }
    case "rare": {
      const option = generateRareRecruitOption(
        data,
        state.seed,
        nodeId,
        state.mapIndex,
        teamLevel,
        state.team.map((d) => d.speciesId),
      );
      const queue = [...state.digivolveQueue];
      const team = levelUpTeam(state.team, data, queue, XP_PER_TRAVEL, 0, true);
      return { ...base, team, digivolveQueue: queue, encounter: { kind: "rare", option } };
    }
    case "heal": {
      const queue = [...state.digivolveQueue];
      const leveled = levelUpTeam(state.team, data, queue, XP_PER_TRAVEL, 0, true);
      const team = leveled.map((d) => {
        const species = mustSpecies(data, d.speciesId);
        const item = d.itemId !== null ? (data.items.get(d.itemId) ?? null) : null;
        return { ...d, currentHp: effectiveMaxHp(species, d.level, item) };
      });
      return { ...base, team, digivolveQueue: queue, encounter: { kind: "heal" } };
    }
    case "start":
      throw new Error("Nó inicial não pode ser re-visitado.");
  }
}

function mustSpecies(data: GameData, id: number): Species {
  const species = data.species.get(id);
  if (!species) throw new Error(`Espécie desconhecida: ${id}`);
  return species;
}

/** Roda a batalha, aplica HP/XP/quedas e enfileira digievoluções. */
function applyBattle(
  state: RunState,
  data: GameData,
  enemies: Unit[],
  kind: "battle" | "boss" | "rival",
  nodeId: string,
): RunState {
  const seed = deriveSeed(state.seed, `${nodeId}:battle`);
  const result = simulateBattle(state.team, enemies, data, seed);
  const victory = result.winner === "player";

  let team = state.team.map((d) => ({
    ...d,
    currentHp: result.playerHpAfter[d.uid] ?? d.currentHp,
  }));
  let levelsGained = 0;
  const digivolveQueue: DigivolvePrompt[] = [...state.digivolveQueue];

  if (victory) {
    levelsGained =
      kind === "boss" ? XP_PER_BOSS_WIN : kind === "rival" ? XP_PER_RIVAL_WIN : XP_PER_WIN;
    const xpRng = mulberry32(deriveSeed(state.seed, `${nodeId}:xp`));
    team = levelUpTeam(team, data, digivolveQueue, levelsGained, POST_BATTLE_REGEN, false, (d) => {
      const item = d.itemId !== null ? (data.items.get(d.itemId) ?? null) : null;
      return item?.effect.kind === "xp-bonus" && xpRng() < item.effect.extraLevelChance ? 1 : 0;
    });
  }

  const encounter: Encounter =
    kind === "boss"
      ? {
          kind: "boss",
          bossId: data.bosses.find((b) => b.mapIndex === state.mapIndex)?.id ?? "?",
          result,
          levelsGained,
        }
      : { kind, result, levelsGained };

  return {
    ...state,
    team,
    encounter,
    digivolveQueue,
    battlesWon: state.battlesWon + (victory ? 1 : 0),
  };
}

/** Recruta a opção escolhida (ou pula com choiceIndex = null). */
export function recruit(state: RunState, data: GameData, choiceIndex: number | null): RunState {
  if (state.encounter?.kind !== "recruit") throw new Error("Sem recrutamento pendente.");
  if (choiceIndex === null) return dismissEncounter(state, data);
  if (!hasNuzlockeRecruitAvailable(state)) {
    throw new Error("Recrutamento do mapa já usado no Nuzlocke.");
  }
  if (state.team.length >= MAX_TEAM_SIZE) throw new Error("Equipe cheia.");
  const option = state.encounter.options[choiceIndex];
  if (!option) throw new Error(`Opção inválida: ${choiceIndex}`);
  const species = mustSpecies(data, option.speciesId);
  const recruitInstance = makeInstance(species, option.level, `d${state.nextUid}`);
  return dismissEncounter(
    markNuzlockeRecruitUsed({
      ...state,
      team: [...state.team, recruitInstance],
      nextUid: state.nextUid + 1,
    }),
    data,
  );
}

/** Aceita o encontro raro (ou recusa com accept = false). */
export function acceptRareRecruit(state: RunState, data: GameData, accept: boolean): RunState {
  if (state.encounter?.kind !== "rare") throw new Error("Sem encontro raro pendente.");
  if (!accept) return dismissEncounter(state, data);
  if (!hasNuzlockeRecruitAvailable(state)) {
    throw new Error("Recrutamento do mapa já usado no Nuzlocke.");
  }
  if (state.team.length >= MAX_TEAM_SIZE) throw new Error("Equipe cheia.");
  const option = state.encounter.option;
  const species = mustSpecies(data, option.speciesId);
  const recruitInstance = makeInstance(species, option.level, `d${state.nextUid}`);
  return dismissEncounter(
    markNuzlockeRecruitUsed({
      ...state,
      team: [...state.team, recruitInstance],
      nextUid: state.nextUid + 1,
    }),
    data,
  );
}

/** Troca um membro atual pela oferta do nó (ou recusa com uid = null). */
export function trade(state: RunState, data: GameData, uid: string | null): RunState {
  if (state.encounter?.kind !== "trade") throw new Error("Sem troca pendente.");
  if (uid === null) return dismissEncounter(state, data);
  const index = state.team.findIndex((d) => d.uid === uid);
  if (index === -1) throw new Error(`Membro desconhecido: ${uid}`);
  const offer = state.encounter.offer;
  const species = mustSpecies(data, offer.speciesId);
  const incoming = makeInstance(species, offer.level, `d${state.nextUid}`);
  const tradedOut = state.team[index];
  const team = [...state.team];
  team[index] = incoming;
  const inventory =
    tradedOut.itemId === null ? state.inventory : [...state.inventory, tradedOut.itemId];
  return dismissEncounter({ ...state, team, inventory, nextUid: state.nextUid + 1 }, data);
}

/** Pega o item escolhido (ou pula com choiceIndex = null). */
export function pickItem(state: RunState, data: GameData, choiceIndex: number | null): RunState {
  if (state.encounter?.kind !== "item") throw new Error("Sem escolha de item pendente.");
  if (choiceIndex === null) return dismissEncounter(state, data);
  const itemId = state.encounter.options[choiceIndex];
  if (itemId === undefined) throw new Error(`Opção inválida: ${choiceIndex}`);
  return dismissEncounter({ ...state, inventory: [...state.inventory, itemId] }, data);
}

/**
 * Fecha o encontro atual e decide a próxima fase:
 * digievoluções pendentes → "digivolve"; boss vencido → próximo mapa ou vitória;
 * equipe toda desmaiada → game-over; senão → "map".
 */
export function dismissEncounter(state: RunState, data: GameData): RunState {
  const encounter = state.encounter;
  if (!encounter) throw new Error("Nenhum encontro para fechar.");

  // Derrota em batalha (ou time zerado): fim de jogo.
  const lostBattle =
    (encounter.kind === "battle" || encounter.kind === "boss" || encounter.kind === "rival") &&
    encounter.result.winner === "enemy";
  if (lostBattle || aliveTeam(state.team).length === 0) {
    return { ...state, encounter: null, digivolveQueue: [], phase: "game-over" };
  }

  state = applyNuzlockePermadeath(state);
  if (aliveTeam(state.team).length === 0) {
    return { ...state, encounter: null, digivolveQueue: [], phase: "game-over" };
  }

  // Boss vencido: avança de mapa (com full heal) ou vence a run.
  if (encounter.kind === "boss") {
    const afterDigivolve: RunState = { ...state, encounter: null };
    if (state.mapIndex >= TOTAL_MAPS) {
      return { ...afterDigivolve, digivolveQueue: [], phase: "victory" };
    }
    const mapIndex = state.mapIndex + 1;
    const map = generateMap(state.seed, mapIndex);
    const team = state.team.map((d) => {
      const species = mustSpecies(data, d.speciesId);
      const item = d.itemId !== null ? (data.items.get(d.itemId) ?? null) : null;
      return { ...d, currentHp: effectiveMaxHp(species, d.level, item) };
    });
    const next: RunState = {
      ...afterDigivolve,
      mapIndex,
      map,
      team,
      currentNodeId: map.startNodeId,
      visitedNodeIds: [...state.visitedNodeIds, map.startNodeId],
    };
    return next.digivolveQueue.length > 0
      ? { ...next, phase: "digivolve" }
      : { ...next, phase: "map" };
  }

  if (state.digivolveQueue.length > 0) {
    return { ...state, encounter: null, phase: "digivolve" };
  }
  return { ...state, encounter: null, phase: "map" };
}

function applyNuzlockePermadeath(state: RunState): RunState {
  const encounter = state.encounter;
  if (
    runMode(state) !== "nuzlocke" ||
    encounter === null ||
    (encounter.kind !== "battle" && encounter.kind !== "boss" && encounter.kind !== "rival") ||
    encounter.result.winner !== "player"
  ) {
    return state;
  }
  const dead = new Set(
    Object.entries(encounter.result.playerHpAfter)
      .filter(([, hp]) => hp <= 0)
      .map(([uid]) => uid),
  );
  if (dead.size === 0) return state;
  return {
    ...state,
    team: state.team.filter((d) => !dead.has(d.uid)),
    digivolveQueue: state.digivolveQueue.filter((prompt) => !dead.has(prompt.uid)),
  };
}

/**
 * Resolve o primeiro prompt de digievolução: targetSpeciesId escolhido ou
 * null para recusar (o bônus de estágio atrasado compensa — ver stats).
 * Evolving fully heals the unit (milestone reward).
 */
export function digivolve(
  state: RunState,
  data: GameData,
  targetSpeciesId: number | null,
): RunState {
  if (state.phase !== "digivolve" || state.digivolveQueue.length === 0) {
    throw new Error("Nenhuma digievolução pendente.");
  }
  const [prompt, ...rest] = state.digivolveQueue;
  let team = state.team;

  if (targetSpeciesId !== null) {
    if (!prompt.options.includes(targetSpeciesId)) {
      throw new Error(`Digievolução inválida: ${targetSpeciesId}`);
    }
    team = state.team.map((d) => {
      if (d.uid !== prompt.uid) return d;
      const species = mustSpecies(data, targetSpeciesId);
      const item = d.itemId !== null ? (data.items.get(d.itemId) ?? null) : null;
      return {
        ...d,
        speciesId: targetSpeciesId,
        currentHp: effectiveMaxHp(species, d.level, item),
      };
    });
  }

  const phase = rest.length > 0 ? "digivolve" : "map";
  return { ...state, team, digivolveQueue: rest, phase };
}

/** Equipa um item do inventário (devolve o anterior, se houver). */
export function equip(state: RunState, uid: string, itemId: string | null): RunState {
  const member = state.team.find((d) => d.uid === uid);
  if (!member) throw new Error(`Membro desconhecido: ${uid}`);
  if (itemId !== null && !state.inventory.includes(itemId)) {
    throw new Error(`Item fora do inventário: ${itemId}`);
  }
  const inventory = [...state.inventory];
  if (itemId !== null) inventory.splice(inventory.indexOf(itemId), 1);
  if (member.itemId !== null) inventory.push(member.itemId);
  const team = state.team.map((d) => (d.uid === uid ? { ...d, itemId } : d));
  return { ...state, team, inventory };
}

/** Reordena a equipe (ordem = ordem de envio na batalha). */
export function reorderTeam(state: RunState, fromIndex: number, toIndex: number): RunState {
  if (
    fromIndex < 0 ||
    fromIndex >= state.team.length ||
    toIndex < 0 ||
    toIndex >= state.team.length
  ) {
    throw new Error("Índice de reordenação inválido.");
  }
  const team = [...state.team];
  const [moved] = team.splice(fromIndex, 1);
  team.splice(toIndex, 0, moved);
  return { ...state, team };
}

export type { BattleResult };

export const ENGINE_VERSION = "0.2.0";

export { mulberry32, type Rng } from "./rng/mulberry32";
export { deriveSeed, fnv1a } from "./rng/hash";

export {
  DIGIVOLVE_LEVEL,
  effectiveMaxHp,
  effectiveStat,
  MAX_LEVEL,
  MAX_STAT_STAGE,
  maxHpAt,
  naturalStageForLevel,
  staleStageMultiplier,
  stageMultiplier,
  statAt,
} from "./stats/stats";

export {
  attributeMultiplier,
  elementMultiplier,
  STAB_MULTIPLIER,
  totalMultiplier,
} from "./battle/effectiveness";
export { BASE_CRIT_CHANCE, computeDamage, CRIT_MULTIPLIER } from "./battle/damage";
export { bestMove, MOVE_UNLOCK_LEVEL } from "./battle/moveSelect";
export {
  FREEZE_CHANCE,
  POISON_CHANCE,
  POISON_DAMAGE_FRAC,
  statusForElement,
  THAW_CHANCE,
} from "./battle/status";
export {
  computeTeamTraits,
  traitMultiplierFor,
  TRAIT_TIER1_COUNT,
  TRAIT_TIER2_COUNT,
} from "./battle/traits";
export {
  HARD_STOP_ROUNDS,
  MAX_ROUNDS,
  OVERTIME_MULTIPLIER,
  simulateBattle,
} from "./battle/simulateBattle";

export { generateMap, TOTAL_LAYERS } from "./map/generateMap";

export {
  generateBossTeam,
  generateItemOptions,
  generateRareRecruitOption,
  generateRecruitOptions,
  generateRivalTeam,
  generateTradeOffer,
  generateWildTeam,
  makeInstance,
  recruitLevel,
  TOTAL_MAPS,
  wildLevel,
} from "./run/encounters";
export {
  acceptRareRecruit,
  digivolve,
  dismissEncounter,
  enterNode,
  equip,
  MAX_TEAM_SIZE,
  pickItem,
  recruit,
  reorderTeam,
  startRun,
  trade,
} from "./run/reducers";

export { runMassSimulation, simulateRun } from "./sim/simulateRun";
export type { RunOutcome, SimReport } from "./sim/simulateRun";

export { buildGameData } from "./types";
export type {
  BattleEvent,
  BattleResult,
  CombatantSnapshot,
  Unit,
  DigivolvePrompt,
  Encounter,
  GameData,
  GameMap,
  MapNode,
  NodeType,
  RecruitOption,
  RunMode,
  RunPhase,
  RunState,
  Side,
  StatMultipliers,
  StatStages,
  StatusKind,
  TeamTrait,
  TradeOffer,
} from "./types";

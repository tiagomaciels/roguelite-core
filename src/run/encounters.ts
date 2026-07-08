import type { Species, Stage } from "../contract";
import { deriveSeed } from "../rng/hash";
import { mulberry32 } from "../rng/mulberry32";
import { effectiveMaxHp, MAX_LEVEL } from "../stats/stats";
import type { Unit, GameData, RecruitOption, TradeOffer } from "../types";

/**
 * Geração seedada de encontros (inimigos selvagens, recrutas, itens).
 * Tudo deriva de (runSeed, nodeId) — re-entrar no mesmo nó gera o mesmo encontro.
 */

export const TOTAL_MAPS = 4;

/**
 * Estágios dos selvagens/recrutas por mapa (progressão de dificuldade).
 * O array funciona como pesos: mapa 4 tem 25% de Ultimate — no mesmo nível,
 * um Ultimate é muito mais forte que um Perfect (base de estágio), então
 * encontros comuns com eles precisam ser raros.
 */
const MAP_STAGES: Record<number, Stage[]> = {
  1: ["child"],
  2: ["adult"],
  3: ["perfect"],
  4: ["perfect", "perfect", "perfect", "ultimate"],
};

const RARE_STAGE_BY_MAP: Record<number, Stage> = {
  1: "adult",
  2: "perfect",
  3: "ultimate",
  4: "ultimate",
};

/**
 * Selvagens escalam pelo nível do MEMBRO MAIS FORTE (−2 ±1), não pela posição
 * no mapa nem pela média: independe do caminho (escalar por camada punia quem
 * recrutava) e evita a "espiral da média" (recrutas baixando a média e fazendo
 * o próximo recruta vir ainda mais fraco). A dificuldade entre mapas vem do
 * ESTÁGIO dos selvagens (adult > child no mesmo nível) e dos bosses fixos.
 */
export function wildLevel(teamPeakLevel: number, rng: () => number): number {
  return Math.max(2, Math.min(MAX_LEVEL, teamPeakLevel - 3 + Math.floor(rng() * 3) - 1));
}

/** Recrutas chegam NO nível do carry (como as capturas do Pokelike — membros novos prontos para lutar). */
export function recruitLevel(teamPeakLevel: number): number {
  return Math.max(2, Math.min(MAX_LEVEL, teamPeakLevel));
}

function speciesPool(data: GameData, mapIndex: number, rng: () => number): Species[] {
  const stages = MAP_STAGES[mapIndex];
  const stage = stages[Math.floor(rng() * stages.length)];
  return stagePool(data, stage);
}

function stagePool(data: GameData, stage: Stage): Species[] {
  return [...data.species.values()].filter((s) => s.stage === stage);
}

function withoutSpecies(pool: Species[], excludedSpeciesIds: readonly number[]): Species[] {
  const excluded = new Set(excludedSpeciesIds);
  const filtered = pool.filter((s) => !excluded.has(s.id));
  return filtered.length > 0 ? filtered : pool;
}

function pick<T>(pool: T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

export function makeInstance(species: Species, level: number, uid: string): Unit {
  return {
    uid,
    speciesId: species.id,
    level,
    currentHp: effectiveMaxHp(species, level, null),
    itemId: null,
  };
}

/** Wild team for a battle node: 1–3 units (deeper = more enemies). */
export function generateWildTeam(
  data: GameData,
  runSeed: number,
  nodeId: string,
  mapIndex: number,
  layer: number,
  teamLevel: number,
): Unit[] {
  const rng = mulberry32(deriveSeed(runSeed, `${nodeId}:wild`));
  // Grupos crescem com o mapa: mapa 1 é quase sempre 1v1 (equipe ainda pequena).
  let count = 1;
  if (mapIndex === 1) {
    if (layer >= 5 && rng() < 0.3) count++;
  } else if (mapIndex <= 3) {
    if (layer >= 4 && rng() < 0.5) count++;
  } else {
    if (layer >= 4 && rng() < 0.5) count++;
    if (rng() < 0.25) count++;
  }
  return Array.from({ length: count }, (_, i) => {
    const species = pick(speciesPool(data, mapIndex, rng), rng);
    return makeInstance(species, wildLevel(teamLevel, rng), `wild-${nodeId}-${i}`);
  });
}

/** 3 opções de recrutamento, sem espécie repetida. */
export function generateRecruitOptions(
  data: GameData,
  runSeed: number,
  nodeId: string,
  mapIndex: number,
  teamLevel: number,
): RecruitOption[] {
  const rng = mulberry32(deriveSeed(runSeed, `${nodeId}:recruit`));
  const options: RecruitOption[] = [];
  const used = new Set<number>();
  while (options.length < 3) {
    const species = pick(speciesPool(data, mapIndex, rng), rng);
    if (used.has(species.id)) continue;
    used.add(species.id);
    options.push({ speciesId: species.id, level: recruitLevel(teamLevel) });
  }
  return options;
}

/** Oferta de troca: uma unidade do estágio do mapa, alguns níveis acima do carry. */
export function generateTradeOffer(
  data: GameData,
  runSeed: number,
  nodeId: string,
  mapIndex: number,
  teamLevel: number,
  currentSpeciesIds: readonly number[],
): TradeOffer {
  const rng = mulberry32(deriveSeed(runSeed, `${nodeId}:trade`));
  const species = pick(withoutSpecies(speciesPool(data, mapIndex, rng), currentSpeciesIds), rng);
  return { speciesId: species.id, level: Math.max(2, Math.min(MAX_LEVEL, teamLevel + 2)) };
}

/** Encontro raro: estágio acima da curva do mapa, mas só uma opção. */
export function generateRareRecruitOption(
  data: GameData,
  runSeed: number,
  nodeId: string,
  mapIndex: number,
  teamLevel: number,
  currentSpeciesIds: readonly number[],
): RecruitOption {
  const rng = mulberry32(deriveSeed(runSeed, `${nodeId}:rare`));
  const stage = RARE_STAGE_BY_MAP[mapIndex];
  const species = pick(withoutSpecies(stagePool(data, stage), currentSpeciesIds), rng);
  return { speciesId: species.id, level: Math.max(2, Math.min(MAX_LEVEL, teamLevel + 1)) };
}

/** Rival recorrente: equipe maior e no nível do carry, entre selvagens e boss. */
export function generateRivalTeam(
  data: GameData,
  runSeed: number,
  nodeId: string,
  mapIndex: number,
  teamLevel: number,
): Unit[] {
  const rng = mulberry32(deriveSeed(runSeed, `${nodeId}:rival`));
  const count = Math.min(4, Math.max(2, mapIndex));
  return Array.from({ length: count }, (_, i) => {
    const species = pick(speciesPool(data, mapIndex, rng), rng);
    const level = Math.max(2, Math.min(MAX_LEVEL, teamLevel - 1 + Math.floor(rng() * 3)));
    return makeInstance(species, level, `rival-${nodeId}-${i}`);
  });
}

/** 3 opções de item, sem repetição. */
export function generateItemOptions(data: GameData, runSeed: number, nodeId: string): string[] {
  const rng = mulberry32(deriveSeed(runSeed, `${nodeId}:item`));
  const all = [...data.items.keys()];
  const options: string[] = [];
  while (options.length < Math.min(3, all.length)) {
    const id = pick(all, rng);
    if (!options.includes(id)) options.push(id);
  }
  return options;
}

/** Equipe de boss a partir da curadoria (níveis fixos, HP cheio). */
export function generateBossTeam(data: GameData, mapIndex: number): Unit[] {
  const boss = data.bosses.find((b) => b.mapIndex === mapIndex);
  if (!boss) throw new Error(`Boss do mapa ${mapIndex} não encontrado.`);
  return boss.team.map((m, i) => {
    const species = data.species.get(m.speciesId);
    if (!species) throw new Error(`Espécie do boss desconhecida: ${m.speciesId}`);
    return makeInstance(species, m.level, `boss-${boss.id}-${i}`);
  });
}

import type { BaseStats, Species, Item, Stage } from "../contract";

/** Fórmulas herdadas do Pokelike (pokelike/docs/06), com floor por etapa. */

export const MAX_LEVEL = 60;

/** Limite de estágios de stat em batalha (sistema clássico de Pokémon). */
export const MAX_STAT_STAGE = 6;

/**
 * Multiplicador por estágio de stat (battle-scoped): +1 = ×1.5, +2 = ×2,
 * -1 = ×0.667, -2 = ×0.5… Aplicado na camada de batalha, nunca em
 * `effectiveStat` (que a UI usa fora de combate). Estágio 0 ⇒ ×1 (no-op).
 */
export function stageMultiplier(stage: number): number {
  const s = Math.max(-MAX_STAT_STAGE, Math.min(MAX_STAT_STAGE, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

export function maxHpAt(baseHp: number, level: number): number {
  return Math.floor((baseHp * level) / 50) + level + 10;
}

export function statAt(base: number, level: number): number {
  return Math.floor((base * level) / 50) + 5;
}

/** Nível em que cada estágio pode digievoluir para o seguinte (PRD §4.2). */
export const DIGIVOLVE_LEVEL: Record<Exclude<Stage, "ultimate">, number> = {
  child: 15,
  adult: 30,
  perfect: 45,
};

const STAGE_ORDER: Stage[] = ["child", "adult", "perfect", "ultimate"];

/** Estágio "natural" para um nível (usado no bônus de estágio atrasado). */
export function naturalStageForLevel(level: number): Stage {
  if (level < DIGIVOLVE_LEVEL.child) return "child";
  if (level < DIGIVOLVE_LEVEL.adult) return "adult";
  if (level < DIGIVOLVE_LEVEL.perfect) return "perfect";
  return "ultimate";
}

/**
 * Bônus de estágio atrasado (análogo ao Eviolite): quem luta num estágio
 * abaixo do natural para seu nível ganha +15% de DEF/Special por estágio de
 * atraso — não evoluir (ou não poder evoluir) não é estritamente pior.
 */
export function staleStageMultiplier(stage: Stage, level: number): number {
  const behind = STAGE_ORDER.indexOf(naturalStageForLevel(level)) - STAGE_ORDER.indexOf(stage);
  return behind > 0 ? 1 + 0.15 * behind : 1;
}

export type StatKey = keyof BaseStats;

/**
 * Stat efetivo em batalha: fórmula por nível × modificadores do item equipado
 * × bônus de estágio atrasado (apenas defesas).
 */
export function effectiveStat(
  species: Species,
  level: number,
  stat: Exclude<StatKey, "hp">,
  item: Item | null,
): number {
  let value = statAt(species.baseStats[stat], level);

  if (item?.effect.kind === "stat-boost") {
    const e = item.effect;
    const isFinal = species.evolvesTo.length === 0;
    if (e.stat === stat && !(e.onlyNonFinalStage && isFinal)) {
      value *= 1 + e.percent / 100;
    }
    if (e.penaltyStat === stat && e.penaltyPercent !== undefined) {
      value *= 1 - e.penaltyPercent / 100;
    }
  }

  if (stat === "def" || stat === "special") {
    value *= staleStageMultiplier(species.stage, level);
  }

  return Math.max(1, Math.floor(value));
}

/** HP máximo efetivo (item HP RAM aplica aqui). */
export function effectiveMaxHp(species: Species, level: number, item: Item | null): number {
  let value = maxHpAt(species.baseStats.hp, level);
  if (item?.effect.kind === "stat-boost" && item.effect.stat === "hp") {
    value *= 1 + item.effect.percent / 100;
  }
  return Math.max(1, Math.floor(value));
}

import type { Species, Item, Move } from "../contract";
import type { Rng } from "../rng/mulberry32";
import { effectiveStat, stageMultiplier } from "../stats/stats";
import type { StatMultipliers, StatStages } from "../types";
import { totalMultiplier } from "./effectiveness";

export const BASE_CRIT_CHANCE = 0.0625;
export const CRIT_MULTIPLIER = 1.5;

export interface DamageInput {
  attacker: Species;
  attackerLevel: number;
  attackerItem: Item | null;
  defender: Species;
  defenderLevel: number;
  defenderItem: Item | null;
  move: Move;
  /** Estágios de stat em batalha (battle-scoped); ausente = sem modificação. */
  attackerStages?: StatStages;
  defenderStages?: StatStages;
  /** Multiplicadores fixos de sinergia de equipe (ADR 0002); ausente = ×1. */
  attackerTraitMult?: StatMultipliers;
  defenderTraitMult?: StatMultipliers;
}

export interface DamageOutput {
  damage: number;
  crit: boolean;
  /** Multiplicador de efetividade (triângulo × elemento × STAB) — para o log. */
  multiplier: number;
  /** Recuo a aplicar no atacante (Power Chip), já calculado. */
  recoil: number;
  /** Stat defensivo que sofreu o golpe (para o crítico baixar o estágio dele). */
  defenseStat: "def" | "special";
}

/**
 * Fórmula do Pokelike (pokelike/docs/06) com floor por etapa:
 *   base = floor((2×nível/5 + 2) × poder × ATQ / DEF / 50) + 2
 * O atacante usa seu melhor lado ofensivo: ATK (vs DEF) ou Special (vs Special)
 * — modelo Gen-1 do Pokelite, em que Special serve para ataque e defesa.
 */
export function computeDamage(input: DamageInput, rng: Rng): DamageOutput {
  const { attacker, attackerLevel, attackerItem, defender, defenderLevel, defenderItem, move } =
    input;

  const { attackerStages, defenderStages, attackerTraitMult, defenderTraitMult } = input;
  const atk =
    effectiveStat(attacker, attackerLevel, "atk", attackerItem) *
    stageMultiplier(attackerStages?.atk ?? 0) *
    (attackerTraitMult?.atk ?? 1);
  const special =
    effectiveStat(attacker, attackerLevel, "special", attackerItem) *
    stageMultiplier(attackerStages?.special ?? 0) *
    (attackerTraitMult?.special ?? 1);
  const physical = atk >= special;
  const offense = physical ? atk : special;
  const defenseStat = physical ? "def" : "special";
  const defense =
    effectiveStat(defender, defenderLevel, defenseStat, defenderItem) *
    stageMultiplier(defenderStages?.[defenseStat] ?? 0) *
    (defenderTraitMult?.[defenseStat] ?? 1);

  let damage =
    Math.floor((((2 * attackerLevel) / 5 + 2) * move.power * (offense / defense)) / 50) + 2;

  const multiplier = totalMultiplier(
    attacker.attribute,
    attacker.element,
    attacker.element, // moves inherit the unit's element
    defender.attribute,
    defender.element,
  );
  damage = Math.floor(damage * multiplier);

  let critChance = BASE_CRIT_CHANCE;
  if (attackerItem?.effect.kind === "crit-boost") critChance = attackerItem.effect.critChance;
  const crit = rng() < critChance;
  if (crit) damage = Math.floor(damage * CRIT_MULTIPLIER);

  // Variância 0.85–1.0 (último estágio, como no Pokelike).
  damage = Math.floor(damage * (0.85 + rng() * 0.15));

  let recoil = 0;
  if (attackerItem?.effect.kind === "damage-boost") {
    const e = attackerItem.effect;
    damage = Math.floor(damage * (1 + e.percent / 100));
    if (e.recoilPercent !== undefined) {
      recoil = Math.max(1, Math.floor(damage * (e.recoilPercent / 100)));
    }
  }

  return { damage: Math.max(1, damage), crit, multiplier, recoil, defenseStat };
}

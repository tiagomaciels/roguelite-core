import type { Attribute, BaseStats } from "../contract";
import type { StatMultipliers, TeamTrait } from "../types";

/**
 * Traits de sinergia por atributo (ADR 0002): N membros do mesmo atributo na
 * equipe reforçam um stat temático de todos os membros desse atributo, durante
 * a batalha. Sem dado novo — usa o atributo (triângulo de combate) que já existe.
 */

/** Limiar de membros do mesmo atributo para cada tier. */
export const TRAIT_TIER1_COUNT = 3;
export const TRAIT_TIER2_COUNT = 5;

/** Stat reforçado e percentuais por tier, por atributo. */
const TRAIT_BY_ATTRIBUTE: Record<
  Attribute,
  { stat: keyof BaseStats; tier1: number; tier2: number }
> = {
  vaccine: { stat: "def", tier1: 10, tier2: 20 },
  virus: { stat: "atk", tier1: 10, tier2: 20 },
  data: { stat: "special", tier1: 10, tier2: 20 },
  free: { stat: "speed", tier1: 10, tier2: 20 },
};

/** Sinergias ativas de uma equipe, a partir dos atributos dos seus membros. */
export function computeTeamTraits(attributes: Attribute[]): TeamTrait[] {
  const counts = new Map<Attribute, number>();
  for (const a of attributes) counts.set(a, (counts.get(a) ?? 0) + 1);

  const traits: TeamTrait[] = [];
  for (const [attribute, count] of counts) {
    const def = TRAIT_BY_ATTRIBUTE[attribute];
    if (count >= TRAIT_TIER2_COUNT) {
      traits.push({ attribute, count, tier: 2, stat: def.stat, bonusPercent: def.tier2 });
    } else if (count >= TRAIT_TIER1_COUNT) {
      traits.push({ attribute, count, tier: 1, stat: def.stat, bonusPercent: def.tier1 });
    }
  }
  return traits;
}

/**
 * Multiplicador de stat (≥ 1) que um combatente recebe das sinergias do seu
 * time — só se o atributo dele tiver um trait ativo (1 = sem bônus).
 */
export function traitMultiplierFor(attribute: Attribute, traits: TeamTrait[]): StatMultipliers {
  const trait = traits.find((t) => t.attribute === attribute);
  if (!trait) return {};
  return { [trait.stat]: 1 + trait.bonusPercent / 100 };
}

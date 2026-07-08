import type { Attribute, Element } from "../contract";

/**
 * Efetividade em duas camadas (PRD §4.1):
 *   1. Triângulo de atributos (forte, fixo): vaccine > virus > data > vaccine (×2 / ×0.5)
 *   2. Elementos (suave): ×1.5 se o elemento do golpe vence o do defensor,
 *      ×0.75 se o defensor vence o atacante.
 */

const ATTRIBUTE_BEATS: Partial<Record<Attribute, Attribute>> = {
  vaccine: "virus",
  virus: "data",
  data: "vaccine",
};

/**
 * ×1.5/×0.67 (e não ×2/×0.5 como em Pokémon): aqui TODO matchup passa pelo
 * triângulo — com 3 atributos, ~2/3 das batalhas têm alguém em vantagem.
 * Em Pokémon o super-efetivo é exceção; com ×2 universal, batalhas de nível
 * igual viravam loteria de matchup (validado pela simulação em massa).
 */
export function attributeMultiplier(attacker: Attribute, defender: Attribute): number {
  if (ATTRIBUTE_BEATS[attacker] === defender) return 1.5;
  if (ATTRIBUTE_BEATS[defender] === attacker) return 0.67;
  return 1;
}

/** Quem vence quem na camada de elementos (PRD §4.1). */
const ELEMENT_BEATS: Record<Element, readonly Element[]> = {
  fire: ["nature", "ice"],
  nature: ["earth"],
  earth: ["electric"],
  electric: ["water"],
  water: ["fire"],
  wind: ["earth"],
  ice: ["nature", "wind"],
  light: ["dark"],
  dark: ["light"],
  neutral: [],
};

/**
 * Camada suave de propósito (×1.25/×0.8): combinada com o triângulo (×2/×0.5)
 * o spread fica ×0.4–×2.5 — próximo do ×0.5–×2 comprovado do Pokelike.
 * (×1.5/×0.75 tornava batalhas de nível igual uma loteria de matchup.)
 */
export function elementMultiplier(moveElement: Element, defenderElement: Element): number {
  if (ELEMENT_BEATS[moveElement].includes(defenderElement)) return 1.25;
  if (ELEMENT_BEATS[defenderElement].includes(moveElement)) return 0.8;
  return 1;
}

export const STAB_MULTIPLIER = 1.5;

/** Multiplicador total de um golpe (sem crítico/variância — esses são do damage). */
export function totalMultiplier(
  attackerAttribute: Attribute,
  attackerElement: Element,
  moveElement: Element,
  defenderAttribute: Attribute,
  defenderElement: Element,
): number {
  const stab = moveElement === attackerElement ? STAB_MULTIPLIER : 1;
  return (
    attributeMultiplier(attackerAttribute, defenderAttribute) *
    elementMultiplier(moveElement, defenderElement) *
    stab
  );
}

import type { Element } from "../contract";
import type { StatusKind } from "../types";

/**
 * Constantes de status conditions (ADR 0001). Calibradas pela simulação em
 * massa para manter o winrate em 20–50% com curva crescente por mapa.
 * O status vem do ELEMENTO do golpe (sem dado novo por golpe): gelo congela,
 * natureza envenena.
 */

/** Chance de envenenar no acerto de um golpe de natureza. */
export const POISON_CHANCE = 0.25;
/** Chance de congelar no acerto de um golpe de gelo. */
export const FREEZE_CHANCE = 0.2;
/** Chance, a cada turno congelado, de descongelar (e então agir). */
export const THAW_CHANCE = 0.4;
/** Dano de veneno por round, como fração do HP máximo. */
export const POISON_DAMAGE_FRAC = 1 / 16;

/** Status que um golpe deste elemento pode infligir, com a chance — ou null. */
export function statusForElement(element: Element): { status: StatusKind; chance: number } | null {
  if (element === "ice") return { status: "freeze", chance: FREEZE_CHANCE };
  if (element === "nature") return { status: "poison", chance: POISON_CHANCE };
  return null;
}

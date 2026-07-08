import type { Species, Move } from "../contract";

/**
 * Golpes destravam por nível (dá significado aos 3 tiers do snapshot):
 *   tier 1 desde o início, tier 2 no nível 10, tier 3 no nível 24.
 * Calibrado para o jogador alcançar cada tier ANTES do boss correspondente
 * (boss 1 ~nv 12 usa tier 2; boss 2+ usam tier 3).
 * A IA sempre usa o melhor golpe destravado (modelo do Pokelike).
 */
export const MOVE_UNLOCK_LEVEL: Record<1 | 2 | 3, number> = { 1: 1, 2: 10, 3: 24 };

export function bestMove(species: Species, level: number): Move {
  const unlocked = species.moves.filter((m) => level >= MOVE_UNLOCK_LEVEL[m.tier]);
  const pool = unlocked.length > 0 ? unlocked : [species.moves[0]];
  return pool.reduce((best, m) => (m.power > best.power ? m : best));
}

export type Rng = () => number;

/**
 * PRNG Mulberry32 — mesma implementação usada pelo Pokelike/Pokelite
 * (ver pokelike/docs/06-mecanicas-batalha.md). Toda aleatoriedade do jogo
 * passa por aqui: mesmo seed ⇒ mesma sequência, em qualquer plataforma.
 */
export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

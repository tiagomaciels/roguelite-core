/** Hash FNV-1a de 32 bits — usado para derivar seeds determinísticos. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deriva um seed filho a partir do seed da run + um rótulo de contexto
 * (ex.: `deriveSeed(runSeed, "map2:n3-1:battle")`). Cada contexto tem seu
 * próprio stream de aleatoriedade — re-executar a mesma batalha nunca é
 * afetado pelo que aconteceu antes dela.
 */
export function deriveSeed(baseSeed: number, label: string): number {
  return fnv1a(`${baseSeed >>> 0}:${label}`);
}

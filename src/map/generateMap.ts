import { deriveSeed } from "../rng/hash";
import { mulberry32 } from "../rng/mulberry32";
import type { GameMap, MapNode, NodeType } from "../types";

/**
 * Mapa procedural estilo Slay the Spire (modelo do pokelike/map.js):
 *   L1 start(1) → L2..L6 conteúdo (3-4 nós) → L7 cura(1) → L8 boss(1).
 * A cura na camada 7 é um gargalo proposital: todo caminho passa por ela
 * antes do boss (garantia de full-heal pré-boss do Pokelike).
 */

export const TOTAL_LAYERS = 8;
const CONTENT_LAYER_SIZES: readonly [number, number] = [3, 4]; // min/max por camada 2..6

/** Pesos de tipo por camada de conteúdo (camada 2 favorece recrutamento cedo). */
const TYPE_WEIGHTS: Record<number, [NodeType, number][]> = {
  2: [
    ["battle", 40],
    ["recruit", 45],
    ["item", 10],
    ["trade", 5],
  ],
  3: [
    ["battle", 42],
    ["recruit", 23],
    ["item", 18],
    ["heal", 5],
    ["trade", 7],
    ["rare", 5],
  ],
  4: [
    ["battle", 42],
    ["recruit", 23],
    ["item", 17],
    ["heal", 5],
    ["trade", 7],
    ["rival", 6],
    ["rare", 5],
  ],
  5: [
    ["battle", 45],
    ["recruit", 18],
    ["item", 17],
    ["heal", 5],
    ["trade", 7],
    ["rival", 8],
    ["rare", 5],
  ],
  6: [
    ["battle", 50],
    ["recruit", 13],
    ["item", 17],
    ["heal", 5],
    ["trade", 6],
    ["rival", 9],
    ["rare", 5],
  ],
};

function pickWeighted(weights: [NodeType, number][], roll: number): NodeType {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let cursor = roll * total;
  for (const [type, w] of weights) {
    cursor -= w;
    if (cursor < 0) return type;
  }
  return weights[weights.length - 1][0];
}

export function generateMap(runSeed: number, mapIndex: number): GameMap {
  const rng = mulberry32(deriveSeed(runSeed, `map${mapIndex}`));
  const nodes: MapNode[] = [];
  const layers: MapNode[][] = [];

  for (let layer = 1; layer <= TOTAL_LAYERS; layer++) {
    let size: number;
    if (layer === 1 || layer === TOTAL_LAYERS - 1 || layer === TOTAL_LAYERS) {
      size = 1;
    } else {
      const [min, max] = CONTENT_LAYER_SIZES;
      size = min + Math.floor(rng() * (max - min + 1));
    }

    const layerNodes: MapNode[] = [];
    for (let index = 0; index < size; index++) {
      let type: NodeType;
      if (layer === 1) type = "start";
      else if (layer === TOTAL_LAYERS - 1) type = "heal";
      else if (layer === TOTAL_LAYERS) type = "boss";
      else type = pickWeighted(TYPE_WEIGHTS[layer], rng());
      layerNodes.push({ id: `m${mapIndex}-l${layer}-${index}`, type, layer, index, next: [] });
    }

    // Garantia de recrutamento: camada 2 em todo mapa; camadas 2-4 no mapa 1
    // (o jogador começa só com o starter — sem equipe não há jogo; mesma
    // lógica das capturas garantidas do mapa 1 do Pokelike).
    const guaranteeRecruit = layer === 2 || (mapIndex === 1 && layer >= 3 && layer <= 4);
    if (
      guaranteeRecruit &&
      layerNodes.length > 1 &&
      !layerNodes.some((n) => n.type === "recruit")
    ) {
      layerNodes[Math.floor(rng() * layerNodes.length)].type = "recruit";
    }

    layers.push(layerNodes);
    nodes.push(...layerNodes);
  }

  // Arestas: cada nó conecta a 1-2 nós "próximos" da camada seguinte
  // (proporcionalidade por índice mantém o desenho sem cruzamentos feios),
  // e toda entrada da camada seguinte recebe ao menos uma aresta.
  for (let l = 0; l < layers.length - 1; l++) {
    const from = layers[l];
    const to = layers[l + 1];
    // O início conecta a TODA a camada 2: garante que o recrutamento garantido
    // dela esteja sempre acessível (equipe de 2 antes da primeira batalha dura).
    if (l === 0) {
      from[0].next.push(...to.map((n) => n.id));
      continue;
    }
    for (const node of from) {
      const ratio = from.length === 1 ? 0.5 : node.index / (from.length - 1);
      const target = Math.min(to.length - 1, Math.round(ratio * (to.length - 1)));
      node.next.push(to[target].id);
      // 45% de chance de uma segunda aresta para um vizinho do alvo.
      if (to.length > 1 && rng() < 0.45) {
        const neighbor =
          target === 0
            ? 1
            : target === to.length - 1
              ? target - 1
              : target + (rng() < 0.5 ? -1 : 1);
        const id = to[neighbor].id;
        if (!node.next.includes(id)) node.next.push(id);
      }
    }
    // Nós da camada seguinte sem entrada: liga ao nó de índice proporcional.
    for (const target of to) {
      const hasIncoming = from.some((n) => n.next.includes(target.id));
      if (!hasIncoming) {
        const ratio = to.length === 1 ? 0.5 : target.index / (to.length - 1);
        const source = from[Math.min(from.length - 1, Math.round(ratio * (from.length - 1)))];
        source.next.push(target.id);
      }
    }
  }

  return {
    nodes,
    startNodeId: layers[0][0].id,
    bossNodeId: layers[TOTAL_LAYERS - 1][0].id,
  };
}

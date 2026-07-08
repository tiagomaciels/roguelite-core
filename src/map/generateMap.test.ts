import { describe, expect, it } from "vitest";
import type { GameMap } from "../types";
import { generateMap, TOTAL_LAYERS } from "./generateMap";

/** BFS a partir do início, seguindo as arestas next. */
function reachableFrom(map: GameMap, startId: string): Set<string> {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const node = byId.get(queue.shift()!)!;
    for (const next of node.next) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("generateMap (propriedades sobre 200 seeds)", () => {
  const maps: GameMap[] = [];
  for (let seed = 1; seed <= 50; seed++) {
    for (let mapIndex = 1; mapIndex <= 4; mapIndex++) {
      maps.push(generateMap(seed, mapIndex));
    }
  }

  it("é determinístico", () => {
    expect(JSON.stringify(generateMap(7, 2))).toBe(JSON.stringify(generateMap(7, 2)));
  });

  it("estrutura: start único (camada 1), heal única (7), boss único (8)", () => {
    for (const map of maps) {
      const byLayer = (l: number) => map.nodes.filter((n) => n.layer === l);
      expect(byLayer(1)).toHaveLength(1);
      expect(byLayer(1)[0].type).toBe("start");
      expect(byLayer(TOTAL_LAYERS - 1)).toHaveLength(1);
      expect(byLayer(TOTAL_LAYERS - 1)[0].type).toBe("heal");
      expect(byLayer(TOTAL_LAYERS)).toHaveLength(1);
      expect(byLayer(TOTAL_LAYERS)[0].type).toBe("boss");
      expect(map.bossNodeId).toBe(byLayer(TOTAL_LAYERS)[0].id);
    }
  });

  it("todo nó é alcançável a partir do início", () => {
    for (const map of maps) {
      const reachable = reachableFrom(map, map.startNodeId);
      expect(reachable.size).toBe(map.nodes.length);
    }
  });

  it("todo nó (exceto boss) tem pelo menos uma saída para a camada seguinte", () => {
    for (const map of maps) {
      const byId = new Map(map.nodes.map((n) => [n.id, n]));
      for (const node of map.nodes) {
        if (node.type === "boss") continue;
        expect(node.next.length, `${node.id} sem saída`).toBeGreaterThan(0);
        for (const nextId of node.next) {
          expect(byId.get(nextId)!.layer).toBe(node.layer + 1);
        }
      }
    }
  });

  it("garantias de recrutamento: camada 2 sempre; camadas 2-4 no mapa 1", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const map1 = generateMap(seed, 1);
      for (const layer of [2, 3, 4]) {
        expect(
          map1.nodes.some((n) => n.layer === layer && n.type === "recruit"),
          `mapa 1 seed ${seed} camada ${layer} sem recruit`,
        ).toBe(true);
      }
      const map3 = generateMap(seed, 3);
      expect(map3.nodes.some((n) => n.layer === 2 && n.type === "recruit")).toBe(true);
    }
  });

  it("inclui nós especiais como conteúdo opcional", () => {
    const types = new Set(maps.flatMap((map) => map.nodes.map((n) => n.type)));
    expect(types.has("trade")).toBe(true);
    expect(types.has("rival")).toBe(true);
    expect(types.has("rare")).toBe(true);
  });

  it("o início conecta a toda a camada 2", () => {
    for (const map of maps) {
      const start = map.nodes.find((n) => n.id === map.startNodeId)!;
      const layer2 = map.nodes.filter((n) => n.layer === 2);
      expect(new Set(start.next)).toEqual(new Set(layer2.map((n) => n.id)));
    }
  });

  it("tamanho total: ~16-22 nós", () => {
    for (const map of maps) {
      expect(map.nodes.length).toBeGreaterThanOrEqual(14);
      expect(map.nodes.length).toBeLessThanOrEqual(24);
    }
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { makeDemoBosses, makeDemoItems, makeDemoSpecies } from "../testing/demoContent";
import type { GameData, RunState } from "../types";
import { buildGameData } from "../types";
import {
  acceptRareRecruit,
  digivolve,
  dismissEncounter,
  enterNode,
  equip,
  pickItem,
  recruit,
  reorderTeam,
  startRun,
  trade,
} from "./reducers";

/** Integration tests for the reducers, using synthetic demo content. */
let data: GameData;
let starterId: number;

beforeAll(() => {
  data = buildGameData(makeDemoSpecies(), makeDemoItems(), makeDemoBosses());
  starterId = 1; // a child-stage species that has an evolution
});

describe("startRun", () => {
  it("começa no mapa 1 com o starter no nível 5 e HP cheio", () => {
    const state = startRun(data, starterId, 42);
    expect(state.mode).toBe("normal");
    expect(state.mapIndex).toBe(1);
    expect(state.phase).toBe("map");
    expect(state.team).toHaveLength(1);
    expect(state.team[0].speciesId).toBe(starterId);
    expect(state.team[0].level).toBe(5);
    expect(state.currentNodeId).toBe(state.map.startNodeId);
  });

  it("pode começar em modo Nuzlocke", () => {
    const state = startRun(data, starterId, 42, "nuzlocke");
    expect(state.mode).toBe("nuzlocke");
    expect(state.recruitedMapIndexes).toEqual([]);
  });

  it("é determinístico para o mesmo seed", () => {
    expect(JSON.stringify(startRun(data, starterId, 42))).toBe(
      JSON.stringify(startRun(data, starterId, 42)),
    );
  });
});

function enterFirst(state: RunState, type: string): RunState {
  const current = state.map.nodes.find((n) => n.id === state.currentNodeId)!;
  const target = current.next
    .map((id) => state.map.nodes.find((n) => n.id === id)!)
    .find((n) => n.type === type);
  if (!target) throw new Error(`Sem nó ${type} acessível para o teste.`);
  return enterNode(state, data, target.id);
}

describe("enterNode", () => {
  it("rejeita nós inacessíveis", () => {
    const state = startRun(data, starterId, 42);
    expect(() => enterNode(state, data, state.map.bossNodeId)).toThrow(/inacessível/);
  });

  it("nó de recrutamento oferece 3 opções e XP de jornada (+1)", () => {
    const state = enterFirst(startRun(data, starterId, 42), "recruit");
    expect(state.phase).toBe("encounter");
    expect(state.encounter?.kind).toBe("recruit");
    if (state.encounter?.kind === "recruit") {
      expect(state.encounter.options).toHaveLength(3);
    }
    expect(state.team[0].level).toBe(6); // 5 + XP de jornada
  });

  it("re-entrar no mesmo nó gera o mesmo encontro (determinismo por nó)", () => {
    const a = enterFirst(startRun(data, starterId, 42), "recruit");
    const b = enterFirst(startRun(data, starterId, 42), "recruit");
    expect(JSON.stringify(a.encounter)).toBe(JSON.stringify(b.encounter));
  });

  it("nó de rival resolve uma batalha com recompensa de rival", () => {
    const base = startRun(data, starterId, 42);
    const rivalNode = { id: "test-rival", type: "rival" as const, layer: 2, index: 0, next: [] };
    const state: RunState = {
      ...base,
      map: {
        ...base.map,
        nodes: base.map.nodes
          .map((n) => (n.id === base.currentNodeId ? { ...n, next: [rivalNode.id] } : n))
          .concat(rivalNode),
      },
    };
    const after = enterNode(state, data, rivalNode.id);
    expect(after.encounter?.kind).toBe("rival");
    if (after.encounter?.kind === "rival") {
      expect([0, 3]).toContain(after.encounter.levelsGained);
    }
  });
});

describe("recruit / rare / trade / pickItem / equip / reorderTeam", () => {
  it("recrutar adiciona o escolhido e fecha o encontro", () => {
    let state = enterFirst(startRun(data, starterId, 42), "recruit");
    const options = state.encounter?.kind === "recruit" ? state.encounter.options : [];
    state = recruit(state, data, 1);
    expect(state.team).toHaveLength(2);
    expect(state.team[1].speciesId).toBe(options[1].speciesId);
    expect(state.phase).toBe("map");
  });

  it("pular recrutamento mantém a equipe", () => {
    let state = enterFirst(startRun(data, starterId, 42), "recruit");
    state = recruit(state, data, null);
    expect(state.team).toHaveLength(1);
    expect(state.phase).toBe("map");
  });

  it("encontro raro adiciona uma opção única e respeita equipe cheia", () => {
    const base = startRun(data, starterId, 42);
    const target = [...data.species.values()].find((s) => s.id !== starterId)!;
    const state: RunState = {
      ...base,
      phase: "encounter",
      encounter: { kind: "rare", option: { speciesId: target.id, level: 8 } },
    };
    const after = acceptRareRecruit(state, data, true);
    expect(after.team).toHaveLength(2);
    expect(after.team[1].speciesId).toBe(target.id);
    expect(after.phase).toBe("map");

    const full: RunState = {
      ...state,
      team: Array.from({ length: 6 }, (_, i) => ({ ...base.team[0], uid: `d${i}` })),
    };
    expect(() => acceptRareRecruit(full, data, true)).toThrow(/Equipe cheia/);
  });

  it("troca substitui o membro escolhido e devolve item equipado", () => {
    const base = startRun(data, starterId, 42);
    const target = [...data.species.values()].find((s) => s.id !== starterId)!;
    const state: RunState = {
      ...base,
      phase: "encounter",
      team: [{ ...base.team[0], itemId: "power-chip" }],
      encounter: { kind: "trade", offer: { speciesId: target.id, level: 9 } },
    };
    const after = trade(state, data, "d0");
    expect(after.team).toHaveLength(1);
    expect(after.team[0].speciesId).toBe(target.id);
    expect(after.team[0].level).toBe(9);
    expect(after.inventory).toContain("power-chip");
    expect(after.phase).toBe("map");
  });

  it("Nuzlocke limita recrutamento aceito a um por mapa", () => {
    const base = startRun(data, starterId, 42, "nuzlocke");
    const targets = [...data.species.values()].filter((s) => s.id !== starterId);
    const first: RunState = {
      ...base,
      phase: "encounter",
      encounter: {
        kind: "recruit",
        options: [
          { speciesId: targets[0].id, level: 5 },
          { speciesId: targets[1].id, level: 5 },
          { speciesId: targets[2].id, level: 5 },
        ],
      },
    };
    const after = recruit(first, data, 0);
    expect(after.recruitedMapIndexes).toEqual([1]);
    expect(after.team).toHaveLength(2);

    const second: RunState = {
      ...after,
      phase: "encounter",
      encounter: {
        kind: "rare",
        option: { speciesId: targets[1].id, level: 6 },
      },
    };
    expect(() => acceptRareRecruit(second, data, true)).toThrow(/já usado/);
    expect(acceptRareRecruit(second, data, false).phase).toBe("map");
  });

  it("equip move item do inventário e devolve o anterior", () => {
    let state = startRun(data, starterId, 42);
    state = { ...state, inventory: ["power-chip", "hp-ram"] };
    state = equip(state, "d0", "power-chip");
    expect(state.team[0].itemId).toBe("power-chip");
    expect(state.inventory).toEqual(["hp-ram"]);
    state = equip(state, "d0", "hp-ram");
    expect(state.team[0].itemId).toBe("hp-ram");
    expect(state.inventory).toEqual(["power-chip"]);
    expect(() => equip(state, "d0", "inexistente")).toThrow(/fora do inventário/);
  });

  it("reorderTeam reordena e valida índices", () => {
    let state = startRun(data, starterId, 42);
    state = { ...state, team: [state.team[0], { ...state.team[0], uid: "d1" }] };
    state = reorderTeam(state, 1, 0);
    expect(state.team[0].uid).toBe("d1");
    expect(() => reorderTeam(state, 0, 5)).toThrow(/inválido/);
  });
});

describe("digivolve", () => {
  it("transforma a espécie, cura por completo e consome a fila", () => {
    const base = startRun(data, starterId, 42);
    const starter = data.species.get(starterId)!;
    const target = starter.evolvesTo[0];
    const state: RunState = {
      ...base,
      phase: "digivolve",
      team: [{ ...base.team[0], level: 15, currentHp: 3 }],
      digivolveQueue: [{ uid: "d0", options: starter.evolvesTo }],
    };
    const after = digivolve(state, data, target);
    expect(after.team[0].speciesId).toBe(target);
    expect(after.team[0].currentHp).toBeGreaterThan(3); // full heal da nova forma
    expect(after.digivolveQueue).toHaveLength(0);
    expect(after.phase).toBe("map");
  });

  it("recusar mantém a espécie e segue o jogo", () => {
    const base = startRun(data, starterId, 42);
    const starter = data.species.get(starterId)!;
    const state: RunState = {
      ...base,
      phase: "digivolve",
      digivolveQueue: [{ uid: "d0", options: starter.evolvesTo }],
    };
    const after = digivolve(state, data, null);
    expect(after.team[0].speciesId).toBe(starterId);
    expect(after.phase).toBe("map");
  });

  it("rejeita alvo fora das opções", () => {
    const base = startRun(data, starterId, 42);
    const state: RunState = {
      ...base,
      phase: "digivolve",
      digivolveQueue: [{ uid: "d0", options: [999999] }],
    };
    expect(() => digivolve(state, data, 123)).toThrow(/inválida/);
  });
});

describe("fluxo de derrota", () => {
  it("perder uma batalha leva a game-over", () => {
    // Time anêmico forçado contra o que vier: entra em batalhas até perder.
    let state = startRun(data, starterId, 7);
    state = { ...state, team: [{ ...state.team[0], level: 2, currentHp: 1 }] };
    // Anda pelo mapa escolhendo sempre battle quando possível.
    let guard = 0;
    while (state.phase !== "game-over" && guard++ < 20) {
      if (state.phase === "map") {
        const current = state.map.nodes.find((n) => n.id === state.currentNodeId)!;
        const next = current.next.map((id) => state.map.nodes.find((n) => n.id === id)!);
        const battle = next.find((n) => n.type === "battle") ?? next[0];
        state = enterNode(state, data, battle.id);
      } else if (state.phase === "encounter") {
        const e = state.encounter!;
        if (e.kind === "recruit") state = recruit(state, data, null);
        else if (e.kind === "item") state = pickItem(state, data, null);
        else state = dismissEncounter(state, data);
      } else if (state.phase === "digivolve") {
        state = digivolve(state, data, null);
      }
    }
    expect(state.phase).toBe("game-over");
  });

  it("Nuzlocke remove permanentemente membros que desmaiaram em vitória", () => {
    const base = startRun(data, starterId, 42, "nuzlocke");
    const partner = { ...base.team[0], uid: "d1", currentHp: 10 };
    const state: RunState = {
      ...base,
      phase: "encounter",
      team: [{ ...base.team[0], currentHp: 0 }, partner],
      encounter: {
        kind: "battle",
        levelsGained: 2,
        result: {
          winner: "player",
          events: [],
          rounds: 1,
          playerHpAfter: { d0: 0, d1: 10 },
        },
      },
    };
    const after = dismissEncounter(state, data);
    expect(after.phase).toBe("map");
    expect(after.team.map((d) => d.uid)).toEqual(["d1"]);
  });
});

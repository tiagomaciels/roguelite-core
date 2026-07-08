import { describe, expect, it } from "vitest";
import { makeInstance } from "../run/encounters";
import { makeSpecies, makeTestData } from "../testing/fixtures";
import { simulateBattle } from "./simulateBattle";

const strong = makeSpecies({ id: 1, attribute: "vaccine", element: "fire" });
const weak = makeSpecies({ id: 2, attribute: "data", element: "nature" });
const data = makeTestData([strong, weak]);

describe("simulateBattle", () => {
  it("é determinística: mesmo seed produz o mesmo log de eventos", () => {
    const team = () => [makeInstance(strong, 10, "p0"), makeInstance(weak, 9, "p1")];
    const foes = () => [makeInstance(weak, 9, "e0"), makeInstance(strong, 10, "e1")];
    const a = simulateBattle(team(), foes(), data, 12345);
    const b = simulateBattle(team(), foes(), data, 12345);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.winner).toBe(b.winner);
  });

  it("seeds diferentes podem divergir, mas sempre terminam com um vencedor", () => {
    for (let s = 0; s < 20; s++) {
      const r = simulateBattle(
        [makeInstance(strong, 10, "p0")],
        [makeInstance(strong, 10, "e0")],
        data,
        s,
      );
      expect(["player", "enemy"]).toContain(r.winner);
      const end = r.events[r.events.length - 1];
      expect(end.type).toBe("end");
    }
  });

  it("vantagem esmagadora de nível vence sempre", () => {
    for (let s = 0; s < 10; s++) {
      const r = simulateBattle(
        [makeInstance(strong, 30, "p0")],
        [makeInstance(weak, 5, "e0")],
        data,
        s,
      );
      expect(r.winner).toBe("player");
    }
  });

  it("troca automática: o reserva entra quando o ativo desmaia", () => {
    const r = simulateBattle(
      [makeInstance(weak, 5, "p0"), makeInstance(strong, 30, "p1")],
      [makeInstance(strong, 15, "e0")],
      data,
      7,
    );
    expect(r.winner).toBe("player");
    expect(r.events.some((e) => e.type === "faint" && e.side === "player" && e.uid === "p0")).toBe(
      true,
    );
    expect(
      r.events.some(
        (e) => e.type === "switch-in" && e.side === "player" && e.combatant.uid === "p1",
      ),
    ).toBe(true);
  });

  it("reporta o HP final de todos os membros do jogador", () => {
    const r = simulateBattle(
      [makeInstance(strong, 12, "p0"), makeInstance(weak, 12, "p1")],
      [makeInstance(weak, 8, "e0")],
      data,
      3,
    );
    expect(Object.keys(r.playerHpAfter).sort()).toEqual(["p0", "p1"]);
    for (const hp of Object.values(r.playerHpAfter)) {
      expect(hp).toBeGreaterThanOrEqual(0);
    }
  });

  it("HP atual da instância é respeitado (não começa cheio)", () => {
    const hurt = makeInstance(strong, 10, "p0");
    hurt.currentHp = 1;
    const r = simulateBattle([hurt], [makeInstance(strong, 10, "e0")], data, 1);
    const start = r.events[0];
    expect(start.type === "start" && start.player.hp).toBe(1);
  });
});

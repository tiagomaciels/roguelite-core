import type { Species, Item } from "../contract";
import { mulberry32 } from "../rng/mulberry32";
import { effectiveMaxHp, effectiveStat, MAX_STAT_STAGE, stageMultiplier } from "../stats/stats";
import type {
  BattleEvent,
  BattleResult,
  CombatantSnapshot,
  Unit,
  GameData,
  Side,
  StatStages,
} from "../types";
import { computeDamage } from "./damage";
import { bestMove } from "./moveSelect";
import { POISON_DAMAGE_FRAC, statusForElement, THAW_CHANCE } from "./status";
import { computeTeamTraits, traitMultiplierFor } from "./traits";
import type { StatMultipliers } from "../types";

export const MAX_ROUNDS = 300;
export const HARD_STOP_ROUNDS = 400;
export const OVERTIME_MULTIPLIER = 3;

/** Estado interno de um combatente durante a simulação. */
interface Combatant {
  instance: Unit;
  species: Species;
  item: Item | null;
  hp: number;
  maxHp: number;
  /** Status conditions (battle-scoped — ver ADR 0001). */
  poisoned: boolean;
  frozen: boolean;
  stages: StatStages;
  /** Multiplicador fixo de sinergia de equipe (ADR 0002), definido no início. */
  traitMult: StatMultipliers;
}

function toCombatant(instance: Unit, data: GameData): Combatant {
  const species = data.species.get(instance.speciesId);
  if (!species) throw new Error(`Espécie desconhecida: ${instance.speciesId}`);
  const item = instance.itemId !== null ? (data.items.get(instance.itemId) ?? null) : null;
  const maxHp = effectiveMaxHp(species, instance.level, item);
  return {
    instance,
    species,
    item,
    hp: Math.min(instance.currentHp, maxHp),
    maxHp,
    poisoned: false,
    frozen: false,
    stages: {},
    traitMult: {},
  };
}

function snapshot(c: Combatant): CombatantSnapshot {
  return {
    uid: c.instance.uid,
    speciesId: c.species.id,
    name: c.species.name,
    level: c.instance.level,
    hp: c.hp,
    maxHp: c.maxHp,
  };
}

/**
 * Auto-batalha 1v1 com troca automática: o membro vivo seguinte entra quando o
 * ativo desmaia. Determinística: mesmo (equipes, seed) ⇒ mesmo log de eventos.
 * A UI nunca simula — apenas renderiza `events` passo a passo.
 */
export function simulateBattle(
  playerTeam: Unit[],
  enemyTeam: Unit[],
  data: GameData,
  seed: number,
): BattleResult {
  const rng = mulberry32(seed);
  const events: BattleEvent[] = [];

  const sides: Record<Side, Combatant[]> = {
    player: playerTeam.map((i) => toCombatant(i, data)),
    enemy: enemyTeam.map((i) => toCombatant(i, data)),
  };

  // Sinergias de equipe (ADR 0002): fixas pela composição, valem a batalha toda.
  for (const side of ["player", "enemy"] as const) {
    const traits = computeTeamTraits(sides[side].map((c) => c.species.attribute));
    for (const c of sides[side]) c.traitMult = traitMultiplierFor(c.species.attribute, traits);
  }

  const active: Record<Side, number> = { player: -1, enemy: -1 };

  /** Próximo membro vivo (HP > 0); -1 se a equipe inteira caiu. */
  const nextAlive = (side: Side): number => sides[side].findIndex((c) => c.hp > 0);

  active.player = nextAlive("player");
  active.enemy = nextAlive("enemy");
  if (active.player === -1 || active.enemy === -1) {
    const winner: Side = active.player === -1 ? "enemy" : "player";
    events.push({ type: "end", winner, rounds: 0 });
    return finish(winner, 0);
  }

  events.push({
    type: "start",
    player: snapshot(sides.player[active.player]),
    enemy: snapshot(sides.enemy[active.enemy]),
  });

  let rounds = 0;
  let overtime = false;
  let winner: Side | null = null;

  while (winner === null && rounds < HARD_STOP_ROUNDS) {
    rounds++;
    if (!overtime && rounds > MAX_ROUNDS) {
      overtime = true;
      events.push({ type: "overtime" });
    }

    // Ordem do round por Speed efetiva (empate decidido pelo RNG).
    const order = resolveOrder(sides, active, rng);

    for (const attackerSide of order) {
      const defenderSide: Side = attackerSide === "player" ? "enemy" : "player";
      const attacker = sides[attackerSide][active[attackerSide]];
      const defender = sides[defenderSide][active[defenderSide]];
      if (attacker.hp <= 0) continue; // caiu por recuo no mesmo round

      // Congelado: tenta descongelar; se falhar, pula a ação.
      if (attacker.frozen) {
        if (rng() < THAW_CHANCE) {
          attacker.frozen = false;
          events.push({ type: "thaw", side: attackerSide, uid: attacker.instance.uid });
        } else {
          events.push({ type: "frozen-skip", side: attackerSide, uid: attacker.instance.uid });
          continue;
        }
      }

      const move = bestMove(attacker.species, attacker.instance.level);
      const result = computeDamage(
        {
          attacker: attacker.species,
          attackerLevel: attacker.instance.level,
          attackerItem: attacker.item,
          defender: defender.species,
          defenderLevel: defender.instance.level,
          defenderItem: defender.item,
          move,
          attackerStages: attacker.stages,
          defenderStages: defender.stages,
          attackerTraitMult: attacker.traitMult,
          defenderTraitMult: defender.traitMult,
        },
        rng,
      );
      const damage = overtime ? result.damage * OVERTIME_MULTIPLIER : result.damage;

      defender.hp = Math.max(0, defender.hp - damage);
      events.push({
        type: "attack",
        side: attackerSide,
        attackerUid: attacker.instance.uid,
        moveName: move.name,
        damage,
        multiplier: result.multiplier,
        crit: result.crit,
        defenderHpAfter: defender.hp,
      });

      // Efeitos sobre o defensor vivo: crítico quebra a guarda (−1 estágio na
      // defesa atingida) e o elemento do golpe pode infligir status.
      if (defender.hp > 0) {
        if (result.crit) {
          lowerStage(defender, result.defenseStat, events, defenderSide);
        }
        if (!defender.poisoned && !defender.frozen) {
          const inflict = statusForElement(attacker.species.element);
          if (inflict && rng() < inflict.chance) {
            if (inflict.status === "poison") defender.poisoned = true;
            else defender.frozen = true;
            events.push({
              type: "status",
              side: defenderSide,
              uid: defender.instance.uid,
              status: inflict.status,
            });
          }
        }
      }

      if (result.recoil > 0) {
        attacker.hp = Math.max(0, attacker.hp - result.recoil);
        events.push({
          type: "recoil",
          side: attackerSide,
          uid: attacker.instance.uid,
          amount: result.recoil,
          hpAfter: attacker.hp,
        });
      }

      // Quedas (defensor pelo golpe, atacante por recuo).
      for (const side of [defenderSide, attackerSide] as const) {
        const c = sides[side][active[side]];
        if (c.hp === 0) {
          events.push({ type: "faint", side, uid: c.instance.uid });
          const next = nextAlive(side);
          if (next === -1) {
            winner = side === "player" ? "enemy" : "player";
            break;
          }
          active[side] = next;
          events.push({ type: "switch-in", side, combatant: snapshot(sides[side][next]) });
        }
      }
      if (winner !== null) break;
    }

    if (winner !== null) break;

    // Fim de round nos ativos vivos: cura de item (Recovery Floppy), depois veneno.
    for (const side of ["player", "enemy"] as const) {
      const c = sides[side][active[side]];
      if (c.hp > 0 && c.hp < c.maxHp && c.item?.effect.kind === "heal-per-turn") {
        const amount = Math.min(
          c.maxHp - c.hp,
          Math.max(1, Math.floor(c.maxHp * (c.item.effect.percent / 100))),
        );
        c.hp += amount;
        events.push({ type: "item-heal", side, uid: c.instance.uid, amount, hpAfter: c.hp });
      }
      if (c.hp > 0 && c.poisoned) {
        const amount = Math.max(1, Math.floor(c.maxHp * POISON_DAMAGE_FRAC));
        c.hp = Math.max(0, c.hp - amount);
        events.push({ type: "poison-damage", side, uid: c.instance.uid, amount, hpAfter: c.hp });
      }
    }

    // Quedas por veneno: troca o ativo ou encerra a batalha.
    for (const side of ["player", "enemy"] as const) {
      const c = sides[side][active[side]];
      if (c.hp === 0) {
        events.push({ type: "faint", side, uid: c.instance.uid });
        const next = nextAlive(side);
        if (next === -1) {
          winner = side === "player" ? "enemy" : "player";
          break;
        }
        active[side] = next;
        events.push({ type: "switch-in", side, combatant: snapshot(sides[side][next]) });
      }
    }
    if (winner !== null) break;
  }

  // Hard stop: vence quem tem mais HP% somado (anti-loop infinito).
  if (winner === null) {
    const hpShare = (side: Side): number => sides[side].reduce((sum, c) => sum + c.hp / c.maxHp, 0);
    winner = hpShare("player") >= hpShare("enemy") ? "player" : "enemy";
  }

  events.push({ type: "end", winner, rounds });
  return finish(winner, rounds);

  function finish(finalWinner: Side, finalRounds: number): BattleResult {
    const playerHpAfter: Record<string, number> = {};
    for (const c of sides.player) playerHpAfter[c.instance.uid] = c.hp;
    return { winner: finalWinner, events, rounds: finalRounds, playerHpAfter };
  }
}

/** Baixa em 1 o estágio de um stat (piso em −MAX_STAT_STAGE) e emite o evento. */
function lowerStage(
  c: Combatant,
  stat: "def" | "special",
  events: BattleEvent[],
  side: Side,
): void {
  const current = c.stages[stat] ?? 0;
  if (current <= -MAX_STAT_STAGE) return;
  const stage = current - 1;
  c.stages[stat] = stage;
  events.push({ type: "stat-stage", side, uid: c.instance.uid, stat, delta: -1, stage });
}

function resolveOrder(
  sides: Record<Side, Combatant[]>,
  active: Record<Side, number>,
  rng: () => number,
): [Side, Side] {
  const speed = (side: Side): number => {
    const c = sides[side][active[side]];
    return (
      effectiveStat(c.species, c.instance.level, "speed", c.item) *
      stageMultiplier(c.stages.speed ?? 0) *
      (c.traitMult.speed ?? 1)
    );
  };
  const ps = speed("player");
  const es = speed("enemy");
  if (ps > es) return ["player", "enemy"];
  if (es > ps) return ["enemy", "player"];
  return rng() < 0.5 ? ["player", "enemy"] : ["enemy", "player"];
}

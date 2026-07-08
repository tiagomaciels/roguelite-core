/**
 * roguelite-core — data contract
 *
 * The engine is content-agnostic. It defines the *shapes* it needs; the
 * consumer provides the actual creatures, items and bosses. No creature
 * names, art or descriptions live here — only mechanical structure.
 */

/** Evolution / growth stages, ordered from earliest to latest. */
export type Stage = "child" | "adult" | "perfect" | "ultimate";

/**
 * Rock–paper–scissors type triangle: A beats B beats C beats A.
 * "free" is neutral (no advantage or disadvantage).
 */
export type Attribute = "vaccine" | "data" | "virus" | "free";

/** Soft elemental effectiveness layer, applied on top of the attribute triangle. */
export type Element =
  | "fire"
  | "water"
  | "nature"
  | "electric"
  | "earth"
  | "wind"
  | "ice"
  | "light"
  | "dark"
  | "neutral";

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  special: number;
  speed: number;
}

export type MoveTier = 1 | 2 | 3;

export interface Move {
  name: string;
  tier: MoveTier;
  power: number;
}

/** A creature species (template). Instances are created from this at runtime. */
export interface Species {
  id: number;
  name: string;
  stage: Stage;
  attribute: Attribute;
  element: Element;
  baseStats: BaseStats;
  /** Exactly 3 moves, tiers 1..3, matching the species' element. */
  moves: Move[];
  /** ids (within the roster) of the immediate next-stage evolutions. */
  evolvesTo: number[];
  /** Consumer-defined path to the sprite/art asset. */
  sprite: string;
  /** Flavor description for UI. */
  description: string;
}

export type ItemEffect =
  | { kind: "damage-boost"; percent: number; recoilPercent?: number }
  | {
      kind: "stat-boost";
      stat: keyof BaseStats;
      percent: number;
      onlyNonFinalStage?: boolean;
      penaltyStat?: keyof BaseStats;
      penaltyPercent?: number;
    }
  | { kind: "crit-boost"; critChance: number }
  | { kind: "heal-per-turn"; percent: number }
  | { kind: "xp-bonus"; extraLevelChance: number };

export interface Item {
  id: string;
  name: string;
  description: string;
  effect: ItemEffect;
}

export interface BossTeamMember {
  speciesId: number;
  level: number;
}

export interface Boss {
  id: string;
  name: string;
  /** Thematic subtitle shown in the UI. */
  title: string;
  /** Which map of the run this boss appears in (1-based). */
  mapIndex: number;
  /** Species whose sprite represents the boss on the map. */
  spriteSpeciesId: number;
  /** Fixed team, in send-out order. */
  team: BossTeamMember[];
}

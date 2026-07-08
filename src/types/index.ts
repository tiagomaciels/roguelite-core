import type { Attribute, BaseStats, Boss, Species, Item } from "../contract";

/** Lado de uma batalha. */
export type Side = "player" | "enemy";

/** Condições de status em batalha (battle-scoped — ver ADR 0001). */
export type StatusKind = "poison" | "freeze";

/** Estágios de stat acumulados em batalha (-6..+6 por stat; ausente = 0). */
export type StatStages = Partial<Record<keyof BaseStats, number>>;

/** Multiplicadores de stat fixos na batalha (ex.: traits de sinergia; ausente = ×1). */
export type StatMultipliers = Partial<Record<keyof BaseStats, number>>;

/** Sinergia de equipe ativa (ADR 0002): N membros do mesmo atributo. */
export interface TeamTrait {
  attribute: Attribute;
  /** Quantos membros compartilham o atributo. */
  count: number;
  tier: 1 | 2;
  /** Stat reforçado e o bônus aplicado aos membros desse atributo. */
  stat: keyof BaseStats;
  bonusPercent: number;
}

/** Índices imutáveis dos dados de conteúdo (snapshot), passados como contexto aos reducers. */
export interface GameData {
  species: ReadonlyMap<number, Species>;
  items: ReadonlyMap<string, Item>;
  bosses: readonly Boss[];
}

export function buildGameData(
  species: Species[],
  items: Item[],
  bosses: Boss[],
): GameData {
  return {
    species: new Map(species.map((s) => [s.id, s])),
    items: new Map(items.map((i) => [i.id, i])),
    bosses,
  };
}

/** A concrete unit on the team or in battle (an instance of a species). */
export interface Unit {
  /** Identificador único dentro da run. */
  uid: string;
  speciesId: number;
  level: number;
  /** HP atual — persiste entre batalhas; 0 = desmaiado. */
  currentHp: number;
  /** Item equipado (id) ou null. */
  itemId: string | null;
}

/** Snapshot de um combatente para o log de batalha (a UI renderiza isto). */
export interface CombatantSnapshot {
  uid: string;
  speciesId: number;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
}

export type BattleEvent =
  | { type: "start"; player: CombatantSnapshot; enemy: CombatantSnapshot }
  | {
      type: "attack";
      side: Side;
      attackerUid: string;
      moveName: string;
      damage: number;
      /** Multiplicador total de efetividade (triângulo × elemento), para a UI rotular. */
      multiplier: number;
      crit: boolean;
      defenderHpAfter: number;
    }
  | { type: "recoil"; side: Side; uid: string; amount: number; hpAfter: number }
  | { type: "item-heal"; side: Side; uid: string; amount: number; hpAfter: number }
  | { type: "faint"; side: Side; uid: string }
  | { type: "switch-in"; side: Side; combatant: CombatantSnapshot }
  | { type: "overtime" }
  /** Status infligido a um combatente (no acerto, por elemento do golpe). */
  | { type: "status"; side: Side; uid: string; status: StatusKind }
  /** Dano de veneno ao fim do round. */
  | { type: "poison-damage"; side: Side; uid: string; amount: number; hpAfter: number }
  /** Descongelou e poderá agir. */
  | { type: "thaw"; side: Side; uid: string }
  /** Pulou a ação por estar congelado. */
  | { type: "frozen-skip"; side: Side; uid: string }
  /** Mudança de estágio de stat (ex.: crítico baixa a defesa atingida). */
  | {
      type: "stat-stage";
      side: Side;
      uid: string;
      stat: keyof BaseStats;
      delta: number;
      stage: number;
    }
  | { type: "end"; winner: Side; rounds: number };

export interface BattleResult {
  winner: Side;
  events: BattleEvent[];
  rounds: number;
  /** HP final de cada membro do time do jogador (uid → hp). */
  playerHpAfter: Record<string, number>;
}

/** Tipos de nó do mapa procedural. */
export type NodeType =
  | "start"
  | "battle"
  | "recruit"
  | "item"
  | "heal"
  | "trade"
  | "rival"
  | "rare"
  | "boss";

export interface MapNode {
  id: string;
  type: NodeType;
  layer: number;
  /** Posição horizontal na camada (0-based) — usada pelo layout da UI. */
  index: number;
  /** ids dos nós alcançáveis a partir deste. */
  next: string[];
}

export interface GameMap {
  nodes: MapNode[];
  startNodeId: string;
  bossNodeId: string;
}

/** Opção oferecida num nó de recrutamento. */
export interface RecruitOption {
  speciesId: number;
  level: number;
}

/** Oferta de troca: o jogador escolhe qual membro atual entregar. */
export interface TradeOffer {
  speciesId: number;
  level: number;
}

/** Encontro pendente/resolvido no nó atual. */
export type Encounter =
  | { kind: "battle"; result: BattleResult; levelsGained: number }
  | { kind: "rival"; result: BattleResult; levelsGained: number }
  | { kind: "boss"; bossId: string; result: BattleResult; levelsGained: number }
  | { kind: "recruit"; options: RecruitOption[] }
  | { kind: "trade"; offer: TradeOffer }
  | { kind: "rare"; option: RecruitOption }
  | { kind: "item"; options: string[] }
  | { kind: "heal" };

/** Prompt de digievolução aguardando escolha do jogador. */
export interface DigivolvePrompt {
  uid: string;
  /** speciesIds candidatos (estágio seguinte, dentro do roster). */
  options: number[];
}

export type RunPhase = "map" | "encounter" | "digivolve" | "victory" | "game-over";

/** Modo de regras da run. Normal preserva o comportamento do MVP. */
export type RunMode = "normal" | "nuzlocke";

export interface RunState {
  mode: RunMode;
  seed: number;
  mapIndex: number;
  map: GameMap;
  currentNodeId: string;
  visitedNodeIds: string[];
  team: Unit[];
  /** Itens no inventário (não equipados). */
  inventory: string[];
  phase: RunPhase;
  encounter: Encounter | null;
  digivolveQueue: DigivolvePrompt[];
  /** Mapas onde o jogador já aceitou um recrutamento em modo Nuzlocke. */
  recruitedMapIndexes: number[];
  /** Contador para gerar uids únicos. */
  nextUid: number;
  /** Total de batalhas vencidas na run (telemetria/balance). */
  battlesWon: number;
}

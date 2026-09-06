export type Identity = 'lord' | 'loyalist' | 'rebel' | 'spy'
export type Suit = 'spade' | 'heart' | 'club' | 'diamond'
export type CardName = 'sha' | 'shan' | 'tao' | 'jiu' | 'duel' | 'dismantle' | 'snatch' | 'exnihilo' | 'barbarian' | 'arrows' | 'peachGarden' | 'nullify' | 'ironChain' | 'fireAttack' | 'crossbow' | 'qinggang' | 'iceSword' | 'gudingDao' | 'blade' | 'spear' | 'halberd' | 'doubleSword' | 'eightDiagram' | 'renwang' | 'vine' | 'silverLion' | 'offensiveHorse' | 'defensiveHorse' | 'chitu' | 'dayuan' | 'zixing' | 'jueying' | 'dilu' | 'zhuahuangfeidian' | 'indulgence' | 'supplyShortage' | 'lightning'
export type EquipmentSlot = 'weapon' | 'armor' | 'offensiveHorse' | 'defensiveHorse'
export type Phase = 'draw' | 'play' | 'discard' | 'finished'
export type ActionKind = 'card' | 'skill' | 'response' | 'turn'
export type SelectionKind = 'guanxing' | 'targetCard' | 'iceChoice' | 'iceDiscard' | 'fireDiscard' | 'doubleSwordChoice' | 'spear'
export type DamageNature = 'normal' | 'fire' | 'thunder'

export interface Card {
  id: string
  name: CardName
  suit: Suit
  rank: number
  type: 'basic' | 'trick' | 'equipment' | 'delayed'
  label: string
  description: string
}

export interface Hero {
  id: string
  name: string
  title: string
  faction: string
  maxHp: number
  skills: { id: string; name: string; description: string }[]
  accent: string
  gender: 'male' | 'female'
}

export interface PlayerState {
  id: string
  hero: Hero
  identity: Identity
  hp: number
  maxHp: number
  hand: Card[]
  alive: boolean
  isHuman: boolean
  usedSha: boolean
  faceUp: boolean
  marks: Record<string, number>
  gender: 'male' | 'female'
  distance: number
  equipment: Partial<Record<EquipmentSlot, Card>>
  judgment: Card[]
}

export interface GameEvent {
  id: number
  text: string
  tone?: 'gold' | 'damage' | 'heal' | 'skill' | 'system' | 'response'
  kind?: 'card' | 'damage' | 'heal' | 'skill' | 'draw' | 'turn' | 'death' | 'response'
  actorId?: string
  targetId?: string
  targetIds?: string[]
  presentation?: 'play' | 'response' | 'prompt' | 'effect'
  skillId?: string
  amount?: number
  outcome?: Identity | 'draw'
  voiceCue?: 'lowhp'
  cardName?: CardName
  damageNature?: DamageNature
}

export interface PendingAction {
  kind: ActionKind
  sourceId: string
  card?: Card
  targetIds: string[]
  requiredResponses: number
  responses: number
  stage: 'select' | 'respond' | 'resolve'
  responseType?: 'shan' | 'sha' | 'peach' | 'nullify' | 'blade' | 'ice'
  responseSourceId?: string
  responseDamage?: number
  nullifyDepth?: number
  nullifyTargetId?: string
  rescueTargetId?: string
  rescueOrder?: string[]
  rescueIndex?: number
  damageChain?: { sourceId: string; targetIds: string[]; nextIndex: number; amount: number; nature: DamageNature }
  resumeTurn?: boolean
  continuation?: { kind: 'barbarian' | 'arrows' | 'sha'; targetIds: string[]; nextIndex: number }
  duel?: { attackerId: string; defenderId: string; currentResponderId: string }
  skillId?: string
  choices?: Card[]
  discardRequired?: number
  discardSelectedIds?: string[]
  selectionKind?: SelectionKind
  selectionTargetId?: string
  selectionRequired?: number
  selectionSelectedIds?: string[]
  effectTargetIds?: string[]
  damageNature?: DamageNature
  revealedCard?: Card
}

export interface GameState {
  players: PlayerState[]
  currentPlayer: number
  phase: Phase
  deck: Card[]
  discard: Card[]
  selectedCardId?: string
  selectedTargets: string[]
  events: GameEvent[]
  winner?: Identity | 'draw'
  round: number
  soundOn: boolean
  pendingAction?: PendingAction
  responseWindow?: PendingAction
  actionQueue: GameEvent[]
  skillCooldowns: Record<string, number>
  turnStats: Record<string, { shaUsed: number; cardsPlayed: number }>
  animationEvents: GameEvent[]
}

import { describe, expect, it } from 'vitest'
import { cardName } from './cards'
import { canRespondWithPeach, confirmTargetCard, createGame, endTurn, passResponse, playCard, respondToAction } from './engine'
import { heroes } from './heroes'
import type { Card, CardName, GameState, Suit } from './types'

let serial = 0
function card(name: CardName, suit: Suit = 'heart'): Card {
  const type = ['lightning', 'indulgence'].includes(name) ? 'delayed'
    : ['iceSword', 'qinggang', 'chitu'].includes(name) ? 'equipment'
      : ['fireAttack', 'barbarian', 'duel'].includes(name) ? 'trick' : 'basic'
  return { id: `damage-test-${serial++}`, name, suit, rank: 5, type, label: cardName(name), description: '' }
}
function game(): GameState {
  const state = createGame(heroes[0], 'lord', false)
  state.players.forEach(player => { player.hand = []; player.equipment = {}; player.judgment = []; player.marks = {} })
  state.deck = Array.from({ length: 20 }, () => card('sha'))
  state.discard = []
  state.events = []; state.animationEvents = []; state.actionQueue = []
  return state
}
function lightning(state: GameState, seat = 0) {
  state.players[seat].judgment.push(card('lightning'))
  state.deck.push(card('sha', 'spade'))
  state.currentPlayer = (seat + 3) % 4
  return endTurn(state, false)
}
function humanAttacked(state: GameState) {
  state.currentPlayer = 1
  const slash = card('sha', 'spade')
  state.players[1].hand.push(slash)
  return passResponse(playCard(state, slash.id, ['p0']))
}
function fire(state: GameState, targetId = 'p1') {
  const fireCard = card('fireAttack')
  const cost = card('sha', 'club')
  state.players[0].hand.push(fireCard, cost)
  state.players.find(player => player.id === targetId)!.hand = [card('sha', 'club')]
  return confirmTargetCard(playCard(state, fireCard.id, [targetId]), cost.id)
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

describe('濒死、连环伤害与死亡结算', () => {
  it('负二体力需要三张桃，救援期间不会提前摸牌', () => {
    const state = game()
    const peaches = [card('tao'), card('tao'), card('tao')]
    state.players[0].hp = 1
    state.players[0].hand = peaches
    const pending = lightning(state)
    expect(pending.players[0].hp).toBe(-2)
    expect(pending.pendingAction?.requiredResponses).toBe(3)
    const first = respondToAction(freeze(pending), peaches[0].id)
    expect(first.players[0].hp).toBe(-1)
    expect(first.phase).toBe('draw')
    expect(first.players[0].hand).toHaveLength(2)
    const second = respondToAction(first, peaches[1].id)
    expect(second.players[0].hp).toBe(0)
    expect(second.pendingAction?.responses).toBe(2)
    const rescued = respondToAction(second, peaches[2].id)
    expect(rescued.players[0].hp).toBe(1)
    expect(rescued.pendingAction).toBeUndefined()
    expect(rescued.phase).toBe('play')
    expect(rescued.players[0].hand).toHaveLength(2)
    expect(rescued.events.filter(event => event.kind === 'draw' && !event.cardName)).toHaveLength(1)
    expect(rescued.discard.map(item => item.id)).toEqual(expect.arrayContaining(peaches.map(item => item.id)))
    expect(pending.players[0].hp).toBe(-2)
  })

  it('桃不足以救回负体力角色时会阵亡，并清空响应', () => {
    const state = game()
    const peach = card('tao')
    state.players[0].hp = 1
    state.players[0].hand = [peach]
    const lost = respondToAction(lightning(state), peach.id)
    expect(lost.players[0].hp).toBe(-1)
    expect(lost.players[0].alive).toBe(false)
    expect(lost.winner).toBe('rebel')
    expect(lost.pendingAction).toBeUndefined()
    expect(lost.responseWindow).toBeUndefined()
  })

  it('濒死者可用酒自救，且不会获得下一张杀的增伤标记', () => {
    const state = game()
    const wine = card('jiu')
    state.players[0].hp = 1
    state.players[0].hand = [wine]
    const pending = humanAttacked(state)
    expect(canRespondWithPeach(pending, wine)).toBe(true)
    const rescued = respondToAction(pending, wine.id)
    expect(rescued.players[0].hp).toBe(1)
    expect(rescued.players[0].marks.wine ?? 0).toBe(0)
    expect(rescued.discard.some(item => item.id === wine.id)).toBe(true)
  })

  it('酒不能救援其他角色，非法响应不会消耗酒或桃', () => {
    const state = game()
    const slash = card('sha'), wine = card('jiu'), peach = card('tao')
    state.players[0].hand = [slash, wine, peach]
    state.players[1].hp = 1
    const pending = playCard(state, slash.id, ['p1'])
    expect(canRespondWithPeach(pending, wine)).toBe(false)
    const rejected = respondToAction(pending, wine.id)
    expect(rejected.players[0].hand.map(item => item.id)).toEqual([wine.id, peach.id])
    expect(rejected.pendingAction?.rescueTargetId).toBe('p1')
    expect(rejected.players[1].hp).toBe(0)
  })

  it('濒死者始终优先自救，其他角色只能在其放弃后响应', () => {
    const state = game()
    const slash = card('sha'), selfPeach = card('tao'), allyPeach = card('tao')
    state.currentPlayer = 1
    state.players[1].hand = [slash]
    state.players[0].hand = [selfPeach]
    state.players[2].hand = [allyPeach]
    state.players[0].hp = 1
    const pending = passResponse(playCard(state, slash.id, ['p0']))
    expect(pending.pendingAction?.targetIds).toEqual(['p0'])
    expect(pending.pendingAction?.rescueTargetId).toBe('p0')
    const rejected = respondToAction(pending, allyPeach.id)
    expect(rejected.players[0].hp).toBe(0)
    expect(rejected.players[2].hand.some(item => item.id === allyPeach.id)).toBe(true)
    const saved = respondToAction(rejected, selfPeach.id)
    expect(saved.players[0].hp).toBe(1)
    expect(saved.players[0].alive).toBe(true)
    expect(saved.discard.some(item => item.id === selfPeach.id)).toBe(true)
  })

  it('AI 也按每张桃回复一点体力，所有救援牌进入弃牌堆', () => {
    const state = game()
    const peaches = [card('tao'), card('tao'), card('tao')]
    state.players[1].hp = 1
    state.players[1].hand = peaches
    const rescued = lightning(state, 1)
    expect(rescued.players[1].hp).toBe(1)
    expect(rescued.players[1].alive).toBe(true)
    expect(rescued.players[1].hand).toHaveLength(2)
    expect(rescued.discard.map(item => item.id)).toEqual(expect.arrayContaining(peaches.map(item => item.id)))
  })

  it('玩家放弃救援后，后续友军 AI 仍有救援机会', () => {
    const state = game()
    const slash = card('sha'), humanPeach = card('tao'), allyPeach = card('tao')
    state.players[0].hand = [slash, humanPeach]
    state.players[1].hp = 1
    state.players[2].identity = 'loyalist'
    state.players[2].hand = [allyPeach]
    const pending = playCard(state, slash.id, ['p1'])
    const rescued = passResponse(pending)
    expect(rescued.players[1].alive).toBe(true)
    expect(rescued.players[1].hp).toBe(1)
    expect(rescued.players[0].hand.some(item => item.id === humanPeach.id)).toBe(true)
    expect(rescued.discard.some(item => item.id === allyPeach.id)).toBe(true)
  })

  it('主公 AI 不会自动用桃救敌方反贼', () => {
    const state = game()
    const peach = card('tao'), slash = card('sha', 'spade')
    state.players[0].isHuman = false
    state.players[0].hand = [peach]
    state.currentPlayer = 1
    state.players[1].hand = [slash]
    state.players[2].hp = 1
    const dead = playCard(state, slash.id, ['p2'])
    expect(dead.players[2].alive).toBe(false)
    expect(dead.players[0].hand.some(item => item.id === peach.id)).toBe(true)
  })

  it('连续连环濒死逐人暂停，救回第一人后才伤害第二人', () => {
    const state = game()
    const peaches = [card('tao'), card('tao')]
    state.players[0].hand = peaches
    state.players[1].hp = state.players[2].hp = 1
    state.players[1].marks.chained = state.players[2].marks.chained = 1
    const first = fire(state)
    expect(first.pendingAction?.rescueTargetId).toBe('p1')
    expect(first.players[2].hp).toBe(1)
    expect(first.players[2].marks.chained).toBe(1)
    const second = respondToAction(freeze(first), peaches[0].id)
    expect(second.pendingAction?.rescueTargetId).toBe('p2')
    expect(second.players[1].hp).toBe(1)
    expect(second.players[2].hp).toBe(0)
    const done = respondToAction(second, peaches[1].id)
    expect(done.pendingAction).toBeUndefined()
    expect(done.players[1].alive && done.players[2].alive).toBe(true)
    expect(done.players[2].hp).toBe(1)
    expect(done.events.filter(event => event.kind === 'damage')).toHaveLength(2)
    expect(first.pendingAction?.damageChain?.nextIndex).toBe(0)
  })

  it('闪电连环全部结算后才恢复原角色的摸牌阶段', () => {
    const state = game()
    const peaches = [card('tao'), card('tao')]
    state.players[0].hand = peaches
    state.players[0].hp = state.players[1].hp = 3
    state.players[0].marks.chained = state.players[1].marks.chained = 1
    const first = lightning(state)
    const second = respondToAction(first, peaches[0].id)
    expect(second.pendingAction?.rescueTargetId).toBe('p1')
    expect(second.currentPlayer).toBe(0)
    expect(second.phase).toBe('draw')
    expect(second.players[0].hand).toHaveLength(1)
    const done = respondToAction(second, peaches[1].id)
    expect(done.phase).toBe('play')
    expect(done.currentPlayer).toBe(0)
    expect(done.players[0].hand).toHaveLength(2)
    expect(done.players[1].hp).toBe(1)
  })

  it('群体锦囊遇到 AI 濒死后可恢复剩余目标，且不重复伤害', () => {
    const state = game()
    const mass = card('barbarian'), peach = card('tao')
    state.players[0].hand = [mass, peach]
    state.players[1].hp = 1
    const pending = playCard(state, mass.id)
    expect(pending.pendingAction?.rescueTargetId).toBe('p1')
    expect(pending.players[2].hp).toBe(pending.players[2].maxHp)
    const done = respondToAction(pending, peach.id)
    expect(done.players[1].hp).toBe(1)
    expect(done.players[2].hp).toBe(done.players[2].maxHp - 1)
    expect(done.players[3].hp).toBe(done.players[3].maxHp - 1)
    expect(done.events.filter(event => event.kind === 'damage')).toHaveLength(3)
  })

  it('伤害来源在连环中阵亡后仍继续传导，并跳过其剩余回合', () => {
    const state = game()
    state.players[0].identity = 'spy'
    state.players[1].identity = 'lord'
    state.players[3].identity = 'loyalist'
    state.players[0].hp = 1
    state.players[0].marks.chained = state.players[1].marks.chained = state.players[2].marks.chained = 1
    const done = fire(state)
    expect(done.players[0].alive).toBe(false)
    expect(done.players[2].hp).toBe(done.players[2].maxHp - 1)
    expect(done.currentPlayer).toBe(1)
    expect(done.phase).toBe('play')
    expect(done.winner).toBeUndefined()
  })

  it('主公在连环中阵亡后立即终止后续伤害和摸牌', () => {
    const state = game()
    state.players[0].hp = 1
    state.players[0].marks.chained = state.players[1].marks.chained = state.players[2].marks.chained = 1
    const done = fire(state)
    expect(done.winner).toBe('rebel')
    expect(done.phase).toBe('finished')
    expect(done.players[2].hp).toBe(done.players[2].maxHp)
    expect(done.events.filter(event => event.kind === 'draw')).toHaveLength(0)
  })

  it('闪电直接杀死主公后不能继续处理剩余判定或摸牌', () => {
    const state = game()
    state.players[0].hp = 1
    const pending = lightning(state)
    expect(pending.winner).toBe('rebel')
    expect(pending.phase).toBe('finished')
    expect(pending.events.filter(event => event.kind === 'draw' && !event.cardName)).toHaveLength(0)
    expect(pending.players[0].hand).toHaveLength(0)
  })

  it('忠臣击杀反贼也获得三张奖励牌', () => {
    const state = game()
    const slash = card('sha', 'spade')
    state.currentPlayer = 1
    state.players[1].hand = [slash]
    state.players[2].hp = 1
    const done = playCard(state, slash.id, ['p2'])
    expect(done.players[2].alive).toBe(false)
    expect(done.players[1].hand).toHaveLength(3)
  })

  it('主公误杀忠臣弃置全部手牌和装备，保留判定区', () => {
    const state = game()
    const slash = card('sha'), retained = card('sha'), horse = card('chitu'), delayed = card('indulgence')
    state.players[0].hand = [slash, retained]
    state.players[0].equipment.offensiveHorse = horse
    state.players[0].judgment = [delayed]
    state.players[1].hp = 1
    const done = playCard(state, slash.id, ['p1'])
    expect(done.players[0].hand).toHaveLength(0)
    expect(done.players[0].equipment).toEqual({})
    expect(done.players[0].judgment.map(item => item.id)).toEqual([delayed.id])
    expect(done.discard.map(item => item.id)).toEqual(expect.arrayContaining([retained.id, horse.id]))
  })

  it.each(['duel', 'barbarian'] as const)('寒冰剑不能替代%s造成的伤害', name => {
    const state = game()
    const trick = card(name, 'club')
    state.currentPlayer = 1
    state.players[1].hand = [trick]
    state.players[1].equipment.weapon = card('iceSword')
    const a = card('jiu'), b = card('tao')
    state.players[0].hand = [a, b]
    let pending = playCard(state, trick.id, name === 'duel' ? ['p0'] : [])
    if (pending.pendingAction?.responseType === 'nullify') pending = passResponse(pending)
    const done = passResponse(pending)
    expect(done.players[0].hp).toBe(done.players[0].maxHp - 1)
    expect(done.players[0].hand.map(item => item.id)).toEqual([a.id, b.id])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createGame, runAiTurn } from './engine'
import { heroes } from './heroes'
import type { GameState } from './types'

function cardsInGame(state: GameState) {
  return [
    ...state.deck, ...state.discard,
    ...state.players.flatMap(player => [...player.hand, ...player.judgment, ...Object.values(player.equipment)]),
  ].filter(Boolean).map(card => card!.id).sort()
}

describe('可重复完整牌局', () => {
  it.each([1, 7, 19, 42, 97, 123, 701, 2026])('种子 %i 的 AI 对局可结算且实体牌不丢失或重复', seed => {
    let value = seed
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0
      return value / 4294967296
    })
    try {
      let state = createGame(heroes[0], 'lord', false)
      state.players.forEach(player => { player.isHuman = false })
      const original = cardsInGame(state)
      for (let step = 0; step < 1200 && !state.winner; step++) {
        expect(state.pendingAction, 'AI 座位不应等待玩家响应').toBeUndefined()
        expect(state.players[state.currentPlayer].alive, '不能卡在阵亡者的回合').toBe(true)
        state = runAiTurn(state)
        expect(cardsInGame(state), '实体牌必须恰好位于一个区域').toEqual(original)
        expect(state.players.filter(player => player.alive && player.hp <= 0)).toHaveLength(0)
      }
      expect(state.winner, JSON.stringify({ round: state.round, current: state.currentPlayer, phase: state.phase, players: state.players.map(player => ({ hero: player.hero.id, alive: player.alive, hp: player.hp, marks: player.marks, hand: player.hand.map(card => card.name) })), events: state.events.slice(0, 4).map(event => event.text) })).toBeDefined()
      expect(state.phase).toBe('finished')
    } finally {
      random.mockRestore()
    }
  })
})

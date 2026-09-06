import { cardName, makeDeck } from './cards'
import { heroes } from './heroes'
import type { Card, DamageNature, GameEvent, GameState, Identity, PendingAction, PlayerState } from './types'

const allies = (a: Identity, b: Identity) => (a === 'lord' || a === 'loyalist') && (b === 'lord' || b === 'loyalist')
const hostile = (a: Identity, b: Identity) => a !== b && !allies(a, b)
const ev = (text: string, tone: GameEvent['tone'] = 'system', extra: Partial<GameEvent> = {}): GameEvent => ({ id: Date.now() + Math.random(), text, tone, ...extra })
const actionText = (source: PlayerState, targets: PlayerState[], name: Card['name'], verb = '使用') => {
  const visibleTargets = targets.filter(target => target.id !== source.id)
  const targetText = visibleTargets.length ? `对${visibleTargets.map(target => target.hero.name).join('、')}` : ''
  return `${source.hero.name}${targetText}${verb}【${cardName(name)}】`
}
const clonePending = (pending?: PendingAction) => pending ? { ...pending, targetIds: [...pending.targetIds], rescueOrder: pending.rescueOrder ? [...pending.rescueOrder] : undefined, damageChain: pending.damageChain ? { ...pending.damageChain, targetIds: [...pending.damageChain.targetIds] } : undefined, effectTargetIds: pending.effectTargetIds ? [...pending.effectTargetIds] : undefined, card: pending.card ? { ...pending.card } : undefined, revealedCard: pending.revealedCard ? { ...pending.revealedCard } : undefined, choices: pending.choices?.map(card => ({ ...card })), discardSelectedIds: pending.discardSelectedIds ? [...pending.discardSelectedIds] : undefined, selectionSelectedIds: pending.selectionSelectedIds ? [...pending.selectionSelectedIds] : undefined, continuation: pending.continuation ? { ...pending.continuation, targetIds: [...pending.continuation.targetIds] } : undefined, duel: pending.duel ? { ...pending.duel } : undefined } : undefined
const copy = (s: GameState): GameState => {
  const pendingAction = clonePending(s.pendingAction ?? s.responseWindow)
  return { ...s, players: s.players.map(p => ({ ...p, hand: [...p.hand], marks: { ...p.marks }, equipment: { ...p.equipment }, judgment: [...p.judgment] })), deck: [...s.deck], discard: [...s.discard], selectedTargets: [...s.selectedTargets], events: [...s.events], actionQueue: [...s.actionQueue], animationEvents: [...s.animationEvents], pendingAction, responseWindow: pendingAction, turnStats: Object.fromEntries(Object.entries(s.turnStats).map(([id, v]) => [id, { ...v }])), skillCooldowns: { ...s.skillCooldowns } }
}
const setPending = (s: GameState, pending: PendingAction) => { s.pendingAction = pending; s.responseWindow = pending }
const clearPending = (s: GameState) => { s.pendingAction = undefined; s.responseWindow = undefined }
const get = (s: GameState, id: string) => s.players.find(p => p.id === id)!
const now = (s: GameState) => s.players[s.currentPlayer]
const next = (s: GameState, from: number) => { for (let i = 1; i <= s.players.length; i += 1) { const idx = (from + i) % s.players.length; if (s.players[idx].alive) return idx } return from }
const distanceBetween = (s: GameState, sourceId: string, targetId: string) => { const source = s.players.findIndex(p => p.id === sourceId); const target = s.players.findIndex(p => p.id === targetId); if (source < 0 || target < 0) return Infinity; const alive = s.players.map((p, index) => ({ p, index })).filter(x => x.p.alive).map(x => x.index); if (alive.length < 2) return Infinity; const sourcePos = alive.indexOf(source); const targetPos = alive.indexOf(target); if (sourcePos < 0 || targetPos < 0) return Infinity; const gap = Math.abs(sourcePos - targetPos); return Math.min(gap, alive.length - gap) }
export const getDistance = (s: GameState, sourceId: string, targetId: string) => {
  const base = distanceBetween(s, sourceId, targetId)
  if (!Number.isFinite(base)) return base
  const source = get(s, sourceId)
  const target = get(s, targetId)
  const offensive = source.equipment.offensiveHorse ? 1 : 0
  const defensive = target.equipment.defensiveHorse ? 1 : 0
  return Math.max(1, base - offensive + defensive)
}
const refreshDistances = (s: GameState) => { s.players.forEach(source => { source.distance = Math.min(...s.players.filter(target => target.alive && target.id !== source.id).map(target => getDistance(s, source.id, target.id)), Infinity) }) }
const attackRange = (p: PlayerState) => { const weapon = p.equipment.weapon?.name; return weapon ? ({ crossbow: 1, qinggang: 2, iceSword: 2, gudingDao: 2, blade: 3, spear: 3, halberd: 4, doubleSword: 2 } as Partial<Record<Card['name'], number>>)[weapon] ?? 1 : 1 }
const equipmentSlotFor = (name: Card['name']) => (['crossbow', 'qinggang', 'iceSword', 'gudingDao', 'blade', 'spear', 'halberd', 'doubleSword'].includes(name) ? 'weapon' : ['offensiveHorse', 'chitu', 'dayuan', 'zixing'].includes(name) ? 'offensiveHorse' : ['defensiveHorse', 'jueying', 'dilu', 'zhuahuangfeidian'].includes(name) ? 'defensiveHorse' : 'armor') as keyof PlayerState['equipment']
const sameSide = (a: Identity, b: Identity) => a === b || allies(a, b)
export function shouldUseNullify(source: PlayerState, responder: PlayerState, card: Card, target?: PlayerState) {
  if (!responder.hand.some(item => item.name === 'nullify') || !source.alive || !responder.alive) return false
  const sourceEnemy = hostile(source.identity, responder.identity)
  const hostileTarget = target ? hostile(responder.identity, target.identity) : false
  const targetSelf = target?.id === responder.id
  if (!target && ['exnihilo', 'barbarian', 'arrows', 'peachGarden'].includes(card.name)) return sourceEnemy
  if (card.name === 'duel') return targetSelf || (Boolean(target) && sourceEnemy && !hostileTarget)
  const harmfulTarget = targetSelf || (Boolean(target) && sourceEnemy && !hostileTarget)
  if (card.name === 'dismantle' || card.name === 'snatch') return harmfulTarget && (target?.hand.length ?? 0) + Object.values(target?.equipment ?? {}).filter(Boolean).length >= 1
  if (card.name === 'fireAttack') return harmfulTarget && (target?.hand.length ?? 0) >= 1
  if (card.name === 'ironChain') return harmfulTarget || Boolean(target?.marks.chained && hostileTarget)
  if (card.name === 'indulgence' || card.name === 'supplyShortage') return harmfulTarget
  if (card.name === 'lightning') return harmfulTarget
  if (card.name === 'peachGarden') return sourceEnemy && targetSelf
  if (card.name === 'exnihilo') return sourceEnemy && targetSelf && (target?.hand.length ?? 0) >= 3
  if (card.name === 'barbarian' || card.name === 'arrows') return sourceEnemy
  return false
}
export function chooseAiTarget(s: GameState, source: PlayerState, card?: Card) {
  const candidates = s.players.filter(player => player.alive && player.id !== source.id && hostile(source.identity, player.identity) && (!card || legalTargets(s, card, source.id).includes(player.id)))
  return candidates.sort((a, b) => {
    const aThreat = (a.identity === 'lord' ? 30 : 0) + (a.hp <= 1 ? 18 : 0) + a.hand.length * 2
    const bThreat = (b.identity === 'lord' ? 30 : 0) + (b.hp <= 1 ? 18 : 0) + b.hand.length * 2
    return bThreat - aThreat
  })[0]
}
export function chooseAiDiscard(hand: Card[], count: number) {
  const value = (card: Card) => card.name === 'tao' ? 90 : card.name === 'shan' ? 75 : card.name === 'nullify' ? 72 : card.name === 'sha' ? 60 : card.type === 'equipment' ? 55 : card.type === 'trick' ? 42 : 20
  return hand.slice().sort((a, b) => value(a) - value(b)).slice(0, Math.max(0, count))
}
function aiNullifyChain(s: GameState, source: PlayerState, initial: PlayerState, card?: Card, target?: PlayerState): number {
  let depth = 0
  let responder = initial
  while (responder) {
    const index = responder.hand.findIndex(card => card.name === 'nullify')
    if (index < 0) break
    if (card && (depth === 0 ? !shouldUseNullify(source, responder, card, target) : !actionFavorsPlayer(source, responder, card, target))) break
    s.discard.push(responder.hand.splice(index, 1)[0]); depth += 1
    const response = ev(`${responder.hero.name} 使用第 ${depth} 张【无懈可击】响应 ${source.hero.name}。`, 'response', { kind: 'response', presentation: 'response', actorId: responder.id, targetId: source.id, targetIds: [source.id], cardName: 'nullify' })
    s.events.unshift(response); s.animationEvents.push(response); s.actionQueue.push(response)
    const nextSide = !sameSide(source.identity, responder.identity)
    responder = s.players.find(player => player.alive && !player.isHuman && player.id !== responder.id && player.hand.some(item => item.name === 'nullify') && sameSide(source.identity, player.identity) === nextSide && (!card || actionFavorsPlayer(source, player, card, target)))!
  }
  return depth
}
function nextNullifyResponder(s: GameState, source: PlayerState, depth: number, excluded: Set<string>, card?: Card, target?: PlayerState): PlayerState | undefined {
  // The first response was made by the opposite side; alternate back to the
  // original card's side for the next layer.
  const expectedSourceSide = depth % 2 === 1
  return s.players.find(player => player.alive && !excluded.has(player.id) && player.hand.some(item => item.name === 'nullify') && sameSide(source.identity, player.identity) === expectedSourceSide && (player.isHuman || !card || actionFavorsPlayer(source, player, card, target)))
}

// A nullify response should be spent by the side that benefits from the
// original trick. The parity of the current chain layer decides whether that
// side is restoring a canceled trick or canceling an active one.
function actionFavorsPlayer(source: PlayerState, player: PlayerState, card: Card, target?: PlayerState) {
  const globalPositive = ['exnihilo', 'peachGarden'].includes(card.name)
  const targetHarm = ['duel', 'dismantle', 'snatch', 'fireAttack', 'indulgence', 'supplyShortage', 'lightning', 'ironChain'].includes(card.name)
  if (globalPositive || !target) return sameSide(source.identity, player.identity)
  if (targetHarm) {
    const favorsSource = hostile(source.identity, target.identity)
    return favorsSource ? sameSide(source.identity, player.identity) : !sameSide(source.identity, player.identity)
  }
  return shouldUseNullify(source, player, card, target)
}
function continueNullify(s: GameState, pending: PendingAction, depth: number, lastResponderId: string): boolean {
  const source = get(s, pending.sourceId)
  const excluded = new Set([lastResponderId])
  const candidate = nextNullifyResponder(s, source, depth, excluded, pending.card, pending.nullifyTargetId ? get(s, pending.nullifyTargetId) : undefined)
  if (!candidate) return false
  if (candidate.isHuman) {
    setPending(s, { ...pending, targetIds: [candidate.id], nullifyDepth: depth })
    const prompt = ev(`${candidate.hero.name} 可使用第 ${depth + 1} 层【无懈可击】。`, 'response', { kind: 'response', actorId: lastResponderId, targetId: candidate.id, cardName: 'nullify' })
    s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
    return true
  }
  const index = candidate.hand.findIndex(card => card.name === 'nullify')
  s.discard.push(candidate.hand.splice(index, 1)[0])
  const response = ev(`${candidate.hero.name} 使用第 ${depth + 1} 层【无懈可击】响应 ${source.hero.name}。`, 'response', { kind: 'response', presentation: 'response', actorId: candidate.id, targetId: source.id, targetIds: [source.id], cardName: 'nullify' })
  s.events.unshift(response); s.animationEvents.push(response); s.actionQueue.push(response)
  // Keep the final parity visible to the caller when the remaining layers are
  // resolved automatically by AI.
  pending.nullifyDepth = depth + 1
  return continueNullify(s, pending, depth + 1, candidate.id)
}

export function createGame(hero: PlayerState['hero'], identity: Identity, soundOn = true, randomizeOpponents = false): GameState {
  const identities: Identity[] = [identity, ...(['lord', 'loyalist', 'rebel', 'spy'] as Identity[]).filter(role => role !== identity)]
  const shuffledHeroes = (randomizeOpponents ? heroes.filter(candidate => candidate.id !== hero.id).sort(() => Math.random() - 0.5) : heroes.filter(candidate => candidate.id !== hero.id))
  let pickIndex = 0
  const pick = () => shuffledHeroes[pickIndex++] ?? heroes.find(candidate => candidate.id !== hero.id) ?? heroes[0]
  const players: PlayerState[] = [{ id: 'p0', hero, identity, hp: hero.maxHp, maxHp: hero.maxHp, hand: [], alive: true, isHuman: true, usedSha: false, faceUp: true, marks: {}, gender: hero.gender, distance: 1, equipment: {}, judgment: [] }]
  for (let i = 1; i < 4; i += 1) { const h = pick(); players.push({ id: `p${i}`, hero: h, identity: identities[i], hp: h.maxHp, maxHp: h.maxHp, hand: [], alive: true, isHuman: false, usedSha: false, faceUp: identities[i] === 'lord', marks: {}, gender: h.gender, distance: 1, equipment: {}, judgment: [] }) }
  const s: GameState = { players, currentPlayer: 0, phase: 'draw', deck: makeDeck(), discard: [], selectedTargets: [], events: [ev('烽烟再起，四方身份已就位。', 'gold', { kind: 'turn' })], round: 1, soundOn, actionQueue: [], skillCooldowns: {}, turnStats: Object.fromEntries(players.map(p => [p.id, { shaUsed: 0, cardsPlayed: 0 }])), animationEvents: [] }
  refreshDistances(s); players.forEach(p => draw(s, p, 4)); draw(s, players[0], 2); s.phase = 'play'; const startEvent = ev('你的回合，摸牌 2 张。', 'gold', { kind: 'turn', actorId: 'p0' }); s.events.unshift(startEvent); s.animationEvents.push(startEvent); s.actionQueue.push(startEvent); return hero.id === 'zhugeliang' ? activateSkill(s, 'guanxing') : s
}
function draw(s: GameState, p: PlayerState, count: number) { for (let i = 0; i < count; i += 1) { if (!s.deck.length) s.deck = s.discard.splice(0).sort(() => Math.random() - 0.5); const c = s.deck.pop(); if (c) p.hand.push(c) } const drawn = ev(`${p.hero.name} 摸了 ${count} 张牌。`, 'system', { kind: 'draw', actorId: p.id }); s.events.unshift(drawn); s.animationEvents.push(drawn); s.actionQueue.push(drawn) }
const isRed = (card: Card) => card.suit === 'heart' || card.suit === 'diamond'
const virtualName = (source: PlayerState, card: Card) => {
  const guanyuConversion = source.hero.id === 'guanyu' && isRed(card) && !['tao', 'jiu'].includes(card.name)
  if (card.type === 'equipment' || card.type === 'delayed') return guanyuConversion && source.marks.wushengArmed ? 'sha' : card.name
  return guanyuConversion && source.marks.wushengArmed ? 'sha' : source.hero.id === 'zhaoyun' && card.name === 'shan' ? 'sha' : card.name
}
export function legalTargets(s: GameState, card: Card, sourceId: string) {
  const source = get(s, sourceId); const name = virtualName(source, card)
  if (card.type === 'delayed' && name === card.name) {
    return s.players.filter(target => target.alive && !target.judgment.some(judgment => judgment.name === card.name) && (
      card.name === 'lightning' ? target.id === sourceId :
        target.id !== sourceId && (card.name !== 'supplyShortage' || getDistance(s, sourceId, target.id) <= 1)
    )).map(target => target.id)
  }
  return s.players.filter(target => target.alive && !(card.type === 'delayed' && target.judgment.some(judgment => judgment.name === card.name)) && (target.id === sourceId && !['tao', 'ironChain'].includes(name) ? false : true) && (
    (name === 'sha' && getDistance(s, sourceId, target.id) <= attackRange(source)) ||
    name === 'duel' ||
    (name === 'indulgence') ||
    (name === 'supplyShortage' && getDistance(s, sourceId, target.id) <= 1) ||
    (name === 'ironChain') ||
    (name === 'fireAttack' && target.hand.length > 0) ||
    (name === 'tao' && target.hp < target.maxHp) ||
    (name === 'dismantle' && (target.hand.length > 0 || Object.values(target.equipment).some(Boolean))) ||
    (name === 'snatch' && (target.hand.length > 0 || Object.values(target.equipment).some(Boolean)) && getDistance(s, sourceId, target.id) <= 1)
  )).map(p => p.id)
}
export function canPlayCard(s: GameState, card: Card, sourceId = now(s).id) { const source = get(s, sourceId); if (!source.alive || s.phase !== 'play' || s.winner || s.pendingAction) return { ok: false, reason: s.pendingAction ? '请先完成当前响应' : '当前不能出牌' }; if (source.id !== now(s).id) return { ok: false, reason: '还没轮到该角色行动' }; if (source.marks.skipPlay) return { ok: false, reason: '【乐不思蜀】生效，本回合不能出牌' }; if (card.name === 'shan' && !(source.hero.id === 'zhaoyun' || (source.hero.id === 'guanyu' && source.marks.wushengArmed && isRed(card)))) return { ok: false, reason: '【闪】只能在响应时使用' }; if (card.name === 'nullify' && !(source.hero.id === 'guanyu' && source.marks.wushengArmed && isRed(card))) return { ok: false, reason: '【无懈可击】只能在锦囊响应时使用' }; const name = virtualName(source, card); if (name === 'sha' && source.usedSha && source.hero.id !== 'zhangfei' && !source.equipment.weapon?.name?.includes('crossbow') && !source.marks.bladeReady) return { ok: false, reason: '本回合已使用过【杀】' }; if (name === 'tao' && source.hp >= source.maxHp && !s.players.some(p => p.alive && p.id !== source.id && p.hp < p.maxHp)) return { ok: false, reason: '没有需要救治的角色' }; if (name === 'jiu' && source.marks.wine) return { ok: false, reason: '醉意尚未结束，不能重复使用【酒】' }; return { ok: true } }
export function canUseSpear(s: GameState, sourceId = now(s).id, cardIds: string[] = []) {
  const source = get(s, sourceId)
  if (!source.alive || s.phase !== 'play' || source.id !== now(s).id || source.equipment.weapon?.name !== 'spear') return { ok: false, reason: '当前不能发动丈八蛇矛' }
  const unique = [...new Set(cardIds)]; if (unique.length !== 2 || unique.some(id => !source.hand.some(card => card.id === id))) return { ok: false, reason: '请选择两张手牌' }
  if (source.usedSha && source.hero.id !== 'zhangfei' && !source.equipment.weapon?.name?.includes('crossbow')) return { ok: false, reason: '本回合已使用过【杀】' }
  return { ok: true }
}
export function useSpear(input: GameState, cardIds: string[], targetIds: string[] = []) {
  const s = copy(input); const source = now(s); const verdict = canUseSpear(s, source.id, cardIds); if (!verdict.ok) return s
  const legal = s.players.filter(player => player.alive && player.id !== source.id && legalTargets(s, { id: 'virtual-spear', name: 'sha', suit: 'spade', rank: 1, type: 'basic', label: '杀', description: '' }, source.id).includes(player.id)).map(player => player.id)
  if (targetIds.length !== 1 || !legal.includes(targetIds[0])) return s
  const used = source.hand.filter(card => cardIds.includes(card.id)); source.hand = source.hand.filter(card => !cardIds.includes(card.id)); s.discard.push(...used)
  source.usedSha = true; s.turnStats[source.id].shaUsed += 1; source.marks.lastShaBlack = 0
  const action = ev(`${actionText(source, [get(s, targetIds[0])], 'sha')}（两张手牌转化）`, 'gold', { kind: 'card', presentation: 'play', actorId: source.id, targetId: targetIds[0], targetIds: [...targetIds], cardName: 'sha' }); s.events.unshift(action); s.animationEvents.push(action); s.actionQueue.push(action)
  attack(s, source, get(s, targetIds[0])); checkWinner(s); return s
}
export function playableCards(s: GameState, sourceId = now(s).id) { return get(s, sourceId).hand.map(card => ({ card, ...canPlayCard(s, card, sourceId) })) }
export function playCard(input: GameState, cardId: string, targetIds: string[] = []): GameState {
  const s = copy(input)
  if (s.winner || s.phase !== 'play' || s.pendingAction) return s
  const source = now(s)
  const index = source.hand.findIndex(c => c.id === cardId)
  if (index < 0) return s
  const card = source.hand[index]
  const allowed = canPlayCard(s, card)
  const name = virtualName(source, card)
  const needsTarget = ['sha', 'duel', 'dismantle', 'snatch', 'indulgence', 'supplyShortage', 'ironChain', 'fireAttack'].includes(name)
  const multiTarget = name === 'ironChain'
  const multiSha = name === 'sha' && source.equipment.weapon?.name === 'halberd' && source.hand.length <= 1
  const maxTargets = multiTarget ? 2 : multiSha ? 3 : 1
  const legal = legalTargets(s, card, source.id)
  const requiresPeachTarget = name === 'tao' && source.hp >= source.maxHp
  const delayedTargetId = targetIds[0] ?? (card.name === 'lightning' ? source.id : undefined)
  if (!allowed.ok || (needsTarget && (multiTarget ? targetIds.length !== 2 : targetIds.length < 1)) || targetIds.length > maxTargets || new Set(targetIds).size !== targetIds.length || (requiresPeachTarget && targetIds.length < 1) || targetIds.some(id => !legal.includes(id)) || (card.type === 'delayed' && (!delayedTargetId || !legal.includes(delayedTargetId)))) {
    const blocked = ev(allowed.reason ?? '请选择合法目标。', 'damage')
    s.events.unshift(blocked)
    s.animationEvents.push(blocked)
    s.actionQueue.push(blocked)
    return s
  }

  source.hand.splice(index, 1)
  s.discard.push(card)
  if (source.marks.wushengArmed && name === 'sha') source.marks.wushengArmed = 0
  s.turnStats[source.id].cardsPlayed += 1
  const affectedIds = ['barbarian', 'arrows'].includes(name)
    ? s.players.filter(player => player.alive && player.id !== source.id).map(player => player.id)
    : name === 'peachGarden' ? s.players.filter(player => player.alive).map(player => player.id)
      : targetIds.length ? [...targetIds] : [source.id]
  // Equipment emits a dedicated event below; avoid a duplicate generic card
  // event so its voice and animation play exactly once.
  if (card.type !== 'equipment') {
    const action = ev(actionText(source, affectedIds.map(id => get(s, id)), name), 'gold', { kind: 'card', presentation: 'play', actorId: source.id, cardName: name, targetId: affectedIds[0], targetIds: affectedIds })
    s.events.unshift(action)
    s.animationEvents.push(action)
    s.actionQueue.push(action)
  }
  const target = targetIds[0] ? get(s, targetIds[0]) : undefined

  const globalTrick = card.type === 'trick' && ['exnihilo', 'barbarian', 'arrows', 'peachGarden'].includes(name) && name === card.name
  if (globalTrick) {
    const responder = source.isHuman
      ? s.players.find(p => p.alive && !p.isHuman && hostile(source.identity, p.identity) && shouldUseNullify(source, p, card, target))
      : s.players.find(p => p.alive && p.isHuman && hostile(source.identity, p.identity) && shouldUseNullify(source, p, card, target))
    if (responder) {
      if (responder.isHuman) {
        setPending(s, { kind: 'response', sourceId: source.id, card, targetIds: [responder.id], requiredResponses: 1, responses: 0, stage: 'respond', responseType: 'nullify', responseSourceId: source.id, nullifyDepth: 0, nullifyTargetId: targetIds[0] })
        const windowEvent = ev(`${responder.hero.name} 面临【${cardName(name)}】，可使用【无懈可击】响应。`, 'response', { kind: 'response', actorId: source.id, targetId: responder.id })
        s.events.unshift(windowEvent)
        s.animationEvents.push(windowEvent)
        s.actionQueue.push(windowEvent)
        return s
      }
      if (responder.hand.some(c => c.name === 'nullify')) {
        const depth = aiNullifyChain(s, source, responder, card, target)
        const canceled = ev(`${responder.hero.name} 的无懈响应使【${cardName(name)}】${depth % 2 === 1 ? '被抵消' : '恢复生效'}。`, 'response', { kind: 'response', actorId: responder.id, targetId: source.id, cardName: 'nullify' })
        s.events.unshift(canceled); s.animationEvents.push(canceled); s.actionQueue.push(canceled)
        if (source.isHuman && source.hand.some(c => c.name === 'nullify')) {
          setPending(s, { kind: 'response', sourceId: source.id, card, targetIds: [source.id], effectTargetIds: [...targetIds], requiredResponses: 1, responses: 0, stage: 'respond', responseType: 'nullify', responseSourceId: source.id, nullifyDepth: depth, nullifyTargetId: targetIds[0] })
          const chainPrompt = ev('可使用【无懈可击】回应对方的无懈。', 'response', { kind: 'response', actorId: responder.id, targetId: source.id }); s.events.unshift(chainPrompt); s.animationEvents.push(chainPrompt); s.actionQueue.push(chainPrompt)
          return s
        }
        if (depth % 2 === 0) resolveTrick(s, source, card, targetIds[0] ? get(s, targetIds[0]) : undefined, targetIds)
        return s
      }
    }
  }

  if (card.type === 'trick' && target && ['duel', 'dismantle', 'snatch', 'ironChain', 'fireAttack'].includes(name)) {
    if (!target.isHuman) {
      const nullifyIndex = target.hand.findIndex(c => c.name === 'nullify')
      const worthNullifying = shouldUseNullify(source, target, card, target)
      if (nullifyIndex >= 0 && worthNullifying) {
        const depth = aiNullifyChain(s, source, target, card, target)
        const canceled = ev(`${target.hero.name} 的无懈响应使【${cardName(name)}】${depth % 2 === 1 ? '被抵消' : '恢复生效'}。`, 'response', { kind: 'response', actorId: target.id, targetId: source.id, cardName: 'nullify' })
        s.events.unshift(canceled); s.animationEvents.push(canceled); s.actionQueue.push(canceled)
        if (source.isHuman && source.hand.some(c => c.name === 'nullify')) {
          setPending(s, { kind: 'response', sourceId: source.id, card, targetIds: [source.id], effectTargetIds: [...targetIds], requiredResponses: 1, responses: 0, stage: 'respond', responseType: 'nullify', responseSourceId: source.id, nullifyDepth: depth, nullifyTargetId: target.id })
          const chainPrompt = ev('可使用【无懈可击】回应对方的无懈。', 'response', { kind: 'response', actorId: target.id, targetId: source.id }); s.events.unshift(chainPrompt); s.animationEvents.push(chainPrompt); s.actionQueue.push(chainPrompt)
          return s
        }
        if (depth % 2 === 0) resolveTrick(s, source, card, target, targetIds)
        return s
      }
    } else {
      setPending(s, { kind: 'response', sourceId: source.id, card, targetIds: [target.id], effectTargetIds: [...targetIds], requiredResponses: 1, responses: 0, stage: 'respond', responseType: 'nullify', responseSourceId: source.id, nullifyDepth: 0, nullifyTargetId: target.id })
      const windowEvent = ev(`${target.hero.name} 面临【${cardName(name)}】，可使用【无懈可击】响应。`, 'response', { kind: 'response', actorId: source.id, targetId: target.id })
      s.events.unshift(windowEvent)
      s.animationEvents.push(windowEvent)
      s.actionQueue.push(windowEvent)
      return s
    }
  }

  if (card.type === 'equipment' && name !== 'sha') {
    s.discard.pop()
    const slot = equipmentSlotFor(card.name)
    const old = source.equipment[slot]
    if (old) s.discard.push(old)
    source.equipment[slot] = card
    const equipped = ev(`${source.hero.name} 装备【${cardName(card.name)}】。`, 'skill', { kind: 'card', presentation: 'play', actorId: source.id, targetId: source.id, targetIds: [source.id], cardName: card.name })
    s.events.unshift(equipped); s.animationEvents.push(equipped); s.actionQueue.push(equipped)
  } else if (card.type === 'delayed' && name !== 'sha') {
    const delayedTarget = targetIds[0] ? get(s, targetIds[0]) : source
    const nullifier = s.players.find(p => p.alive && p.id !== source.id && hostile(source.identity, p.identity) && (p.isHuman ? p.hand.some(item => item.name === 'nullify') : shouldUseNullify(source, p, card, delayedTarget)))
    if (nullifier?.isHuman) {
      setPending(s, { kind: 'response', sourceId: source.id, card, targetIds: [nullifier.id], requiredResponses: 1, responses: 0, stage: 'respond', responseType: 'nullify', responseSourceId: source.id, nullifyDepth: 0, nullifyTargetId: delayedTarget.id })
      const prompt = ev(`${nullifier.hero.name} 可使用【无懈可击】响应【${cardName(card.name)}】。`, 'response', { kind: 'response', actorId: source.id, targetId: nullifier.id, cardName: 'nullify' }); s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
      return s
    }
    if (nullifier && !nullifier.isHuman && (card.name !== 'lightning' || delayedTarget.judgment.length === 0)) {
      const depth = aiNullifyChain(s, source, nullifier, card, delayedTarget)
      const blocked = ev(`${nullifier.hero.name} 的无懈响应使【${cardName(card.name)}】${depth % 2 === 1 ? '被抵消' : '恢复生效'}。`, 'response', { kind: 'response', actorId: nullifier.id, targetId: source.id, cardName: 'nullify' }); s.events.unshift(blocked); s.animationEvents.push(blocked); s.actionQueue.push(blocked)
      if (source.isHuman && source.hand.some(item => item.name === 'nullify')) {
        setPending(s, { kind: 'response', sourceId: source.id, card, targetIds: [source.id], requiredResponses: 1, responses: 0, stage: 'respond', responseType: 'nullify', responseSourceId: source.id, nullifyDepth: depth, nullifyTargetId: delayedTarget.id })
      } else if (depth % 2 === 0) placeDelayed(s, source, card, delayedTarget)
      return s
    }
    placeDelayed(s, source, card, delayedTarget)
  } else if (name === 'sha') {
    source.usedSha = true
    source.marks.bladeReady = 0
    s.turnStats[source.id].shaUsed += 1
    source.marks.lastShaBlack = card.suit === 'spade' || card.suit === 'club' ? 1 : 0
    if (targetIds.length > 1) attackTargets(s, source, targetIds)
    else attack(s, source, target!)
  } else if (name === 'tao') {
    const healTarget = targetIds[0] ? get(s, targetIds[0]) : source
    if (healTarget?.alive && (healTarget.id === source.id || healTarget.hp < healTarget.maxHp)) heal(s, healTarget, 1)
  } else if (name === 'jiu') {
    source.marks.wine = 1
    const wineEvent = ev(`${source.hero.name} 进入醉意状态，下一张【杀】伤害 +1。`, 'skill', { kind: 'skill', actorId: source.id })
    s.events.unshift(wineEvent)
    s.animationEvents.push(wineEvent)
    s.actionQueue.push(wineEvent)
  } else if (name === 'duel') {
    attack(s, source, target!, true)
  } else if (name === 'dismantle') {
    if (!target || !beginTargetCardSelection(s, source, card, target)) discardFrom(s, target!)
  } else if (name === 'snatch') {
    if (!target || !beginTargetCardSelection(s, source, card, target)) steal(s, source, target!)
  } else if (name === 'exnihilo') {
    draw(s, source, 2)
  } else if (name === 'barbarian') {
    resolveMass(s, source, 'barbarian', s.players.filter(p => p.alive && p.id !== source.id).map(p => p.id))
  } else if (name === 'arrows') {
    resolveMass(s, source, 'arrows', s.players.filter(p => p.alive && p.id !== source.id).map(p => p.id))
  } else if (name === 'ironChain') {
    resolveIronChain(s, source, targetIds.map(id => get(s, id)))
  } else if (name === 'fireAttack') {
    resolveFireAttack(s, source, target!)
  } else if (name === 'peachGarden') {
    s.players.filter(p => p.alive).forEach(p => heal(s, p, 1))
  }
  return settleAction(s)
}

function targetCards(target: PlayerState) { return [...target.hand, ...Object.values(target.equipment).filter((card): card is Card => Boolean(card))] }
function beginTargetCardSelection(s: GameState, source: PlayerState, card: Card, target: PlayerState) {
  const choices = targetCards(target)
  if (!source.isHuman || !choices.length || (card.name === 'dismantle' && target.hand.length === 0 && choices.length === 1)) return false
  setPending(s, { kind: 'card', sourceId: source.id, card, targetIds: [target.id], requiredResponses: 0, responses: 0, stage: 'select', selectionKind: 'targetCard', selectionTargetId: target.id, selectionRequired: 1, selectionSelectedIds: [], choices })
  const prompt = ev(`${source.hero.name} 请从 ${target.hero.name} 的区域中选择一张牌。`, 'gold', { kind: 'response', actorId: source.id, targetId: target.id, cardName: card.name })
  s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
  return true
}
function beginIceSelection(s: GameState, source: PlayerState, target: PlayerState, damageAmount: number, continuation?: PendingAction['continuation']) {
  const choices = targetCards(target)
  if (!source.isHuman || choices.length < 2) return false
  setPending(s, { kind: 'card', sourceId: source.id, targetIds: [target.id], requiredResponses: 0, responses: 0, stage: 'select', responseDamage: damageAmount, responseType: 'ice', selectionKind: 'iceChoice', selectionTargetId: target.id, selectionRequired: 2, selectionSelectedIds: [], choices, continuation })
  const prompt = ev(`${source.hero.name} 的寒冰剑命中，请选择造成伤害或弃置目标两张牌。`, 'skill', { kind: 'skill', actorId: source.id, targetId: target.id, cardName: 'iceSword' })
  s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
  return true
}
function resolveIceSwordAi(s: GameState, source: PlayerState, target: PlayerState) {
  const choices = targetCards(target)
  if (choices.length < 2) return false
  const value = (card: Card) => card.name === 'tao' ? 90 : card.name === 'shan' ? 75 : card.type === 'equipment' ? 70 : card.type === 'trick' ? 45 : 20
  choices.sort((a, b) => value(a) - value(b)).slice(0, 2).forEach(card => { const removed = removeSpecificCard(s, target, card.id); if (removed) s.discard.push(removed) })
  const iced = ev(`${source.hero.name} 以寒冰剑弃置 ${target.hero.name} 两张牌，伤害被替代。`, 'skill', { kind: 'skill', actorId: source.id, targetId: target.id, cardName: 'iceSword' })
  s.events.unshift(iced); s.animationEvents.push(iced); s.actionQueue.push(iced)
  return true
}
function beginDoubleSwordChoice(s: GameState, source: PlayerState, target: PlayerState, damageAmount: number, continuation?: PendingAction['continuation']) {
  if (!target.isHuman || target.hand.length === 0) return false
  const choices = target.hand.map(card => ({ ...card }))
  setPending(s, { kind: 'card', sourceId: source.id, targetIds: [target.id], requiredResponses: 0, responses: 0, stage: 'select', responseDamage: damageAmount, selectionKind: 'doubleSwordChoice', selectionTargetId: target.id, selectionRequired: 1, selectionSelectedIds: [], choices, continuation })
  const prompt = ev(`${target.hero.name} 面临雌雄双股剑效果：弃置一张手牌，或令此【杀】伤害 +1。`, 'skill', { kind: 'skill', actorId: source.id, targetId: target.id, cardName: 'doubleSword' })
  s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
  return true
}
function resolveDoubleSwordAi(s: GameState, source: PlayerState, target: PlayerState, damageAmount: number, continuation?: PendingAction['continuation']) {
  if (target.hand.length > 0) {
    const discard = chooseAiDiscard(target.hand, 1)[0]
    if (discard) {
      const removed = removeSpecificCard(s, target, discard.id)
      if (removed) s.discard.push(removed)
      const event = ev(`${target.hero.name} 弃置一张手牌，雌雄双股剑效果结算。`, 'response', { kind: 'response', actorId: target.id, targetId: source.id, cardName: 'doubleSword' })
      s.events.unshift(event); s.animationEvents.push(event); s.actionQueue.push(event)
      damage(s, target, damageAmount, source, continuation)
      return true
    }
  }
  const event = ev(`${target.hero.name} 没有弃置手牌，雌雄双股剑使伤害 +1。`, 'damage', { kind: 'damage', actorId: source.id, targetId: target.id, cardName: 'doubleSword' })
  s.events.unshift(event); s.animationEvents.push(event); s.actionQueue.push(event)
  damage(s, target, damageAmount + 1, source, continuation)
  return true
}
function removeSpecificCard(s: GameState, target: PlayerState, cardId: string) {
  const handIndex = target.hand.findIndex(card => card.id === cardId)
  if (handIndex >= 0) return target.hand.splice(handIndex, 1)[0]
  const slot = (Object.keys(target.equipment) as (keyof PlayerState['equipment'])[]).find(key => target.equipment[key]?.id === cardId)
  if (slot) {
    const card = target.equipment[slot]!
    delete target.equipment[slot]
    if (card.name === 'silverLion' && target.alive) {
      heal(s, target, 1)
      const restored = ev(`${target.hero.name} 失去【白银狮子】，回复 1 点体力。`, 'heal', { kind: 'skill', targetId: target.id, cardName: 'silverLion' })
      s.events.unshift(restored); s.animationEvents.push(restored); s.actionQueue.push(restored)
    }
    return card
  }
  return undefined
}
function resolveIronChain(s: GameState, source: PlayerState, targets: PlayerState[]) {
  targets.filter(target => target?.alive).forEach(target => { target.marks.chained = target.marks.chained ? 0 : 1 })
  const names = targets.filter(target => target?.alive).map(target => target.hero.name).join('、')
  const chained = ev(`${source.hero.name} 对${names}使用【铁索连环】，${targets.some(target => target.marks.chained) ? '进入' : '解除'}连环状态。`, 'skill', { kind: 'card', presentation: 'play', actorId: source.id, targetId: targets[0]?.id, targetIds: targets.map(target => target.id), cardName: 'ironChain' })
  s.events.unshift(chained); s.animationEvents.push(chained); s.actionQueue.push(chained)
}
function resolveFireAttack(s: GameState, source: PlayerState, target: PlayerState) {
  if (!target?.alive || !target.hand.length) return
  const revealed = target.hand[Math.floor(Math.random() * target.hand.length)]
  const revealEvent = ev(`${target.hero.name} 展示手牌【${cardName(revealed.name)}】，花色为${revealed.suit === 'heart' ? '红桃' : revealed.suit === 'diamond' ? '方块' : revealed.suit === 'club' ? '梅花' : '黑桃'}。`, 'response', { kind: 'response', actorId: target.id, targetId: source.id, cardName: 'fireAttack' })
  s.events.unshift(revealEvent); s.animationEvents.push(revealEvent); s.actionQueue.push(revealEvent)
  const matches = source.hand.filter(card => card.suit === revealed.suit)
  if (!matches.length) {
    const miss = ev(`${source.hero.name} 没有同花色牌，火攻未造成伤害。`, 'system', { kind: 'card', actorId: source.id, targetId: target.id, cardName: 'fireAttack' })
    s.events.unshift(miss); s.animationEvents.push(miss); s.actionQueue.push(miss); return
  }
  if (source.isHuman) {
    setPending(s, { kind: 'card', sourceId: source.id, card: undefined, targetIds: [target.id], requiredResponses: 0, responses: 0, stage: 'select', selectionKind: 'fireDiscard', selectionTargetId: target.id, selectionRequired: 1, selectionSelectedIds: [], choices: matches, revealedCard: revealed })
    const prompt = ev(`请选择一张${revealed.suit === 'heart' ? '红桃' : revealed.suit === 'diamond' ? '方块' : revealed.suit === 'club' ? '梅花' : '黑桃'}牌弃置以发动火攻，或放弃。`, 'gold', { kind: 'response', actorId: source.id, targetId: target.id, cardName: 'fireAttack' })
    s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
    return
  }
  const matchIndex = source.hand.findIndex(card => card.suit === revealed.suit)
  s.discard.push(source.hand.splice(matchIndex, 1)[0])
  const cost = ev(`${source.hero.name} 弃置同花色牌，火攻命中。`, 'skill', { kind: 'card', actorId: source.id, targetId: target.id, cardName: 'fireAttack' })
  s.events.unshift(cost); s.animationEvents.push(cost); s.actionQueue.push(cost)
  damage(s, target, 1, source, undefined, false, 'fire')
}
function resolveTrick(s: GameState, source: PlayerState, card: Card, target?: PlayerState, targetIds: string[] = []) {
  const name = virtualName(source, card)
  if (card.type === 'delayed') { placeDelayed(s, source, card, target ?? source); return }
  if (name === 'duel') attack(s, source, target!, true)
  else if (name === 'dismantle') { if (!target || !targetCards(target).length || !beginTargetCardSelection(s, source, card, target)) discardFrom(s, target!) }
  else if (name === 'snatch') { if (!target || !targetCards(target).length || !beginTargetCardSelection(s, source, card, target)) steal(s, source, target!) }
  else if (name === 'ironChain') resolveIronChain(s, source, (targetIds.length ? targetIds : target ? [target.id] : []).map(id => get(s, id)))
  else if (name === 'fireAttack') resolveFireAttack(s, source, target!)
  else if (name === 'exnihilo') draw(s, source, 2)
  else if (name === 'barbarian') resolveMass(s, source, 'barbarian', s.players.filter(p => p.alive && p.id !== source.id).map(p => p.id))
  else if (name === 'arrows') resolveMass(s, source, 'arrows', s.players.filter(p => p.alive && p.id !== source.id).map(p => p.id))
  else if (name === 'peachGarden') s.players.filter(p => p.alive).forEach(p => heal(s, p, 1))
}
function placeDelayed(s: GameState, source: PlayerState, card: Card, target: PlayerState) {
  const placedIndex = s.discard.findIndex(item => item.id === card.id)
  if (placedIndex >= 0) s.discard.splice(placedIndex, 1)
  target.judgment.push(card)
  const delayed = ev(`${source.hero.name} 对${target.hero.name}使用【${cardName(card.name)}】，置于其判定区。`, 'skill', { kind: 'card', presentation: 'play', actorId: source.id, targetId: target.id, targetIds: [target.id], cardName: card.name })
  s.events.unshift(delayed); s.animationEvents.push(delayed); s.actionQueue.push(delayed)
}
function responseEvent(s: GameState, responder: PlayerState, source: PlayerState, name: Card['name'], against: Card['name']) {
  const response = ev(`${responder.hero.name} 使用【${cardName(name)}】响应 ${source.hero.name} 的【${cardName(against)}】。`, 'response', { kind: 'response', presentation: 'response', actorId: responder.id, targetId: source.id, targetIds: [source.id], cardName: name })
  s.events.unshift(response); s.animationEvents.push(response); s.actionQueue.push(response)
}
function respondShan(s: GameState, target: PlayerState, count: number, source: PlayerState, against: Card['name'] = 'sha') {
  let used = 0
  while (used < count) {
    const i = target.hand.findIndex(c => c.name === 'shan' || (target.hero.id === 'zhaoyun' && c.name === 'sha'))
    if (i < 0) break
    s.discard.push(target.hand.splice(i, 1)[0]); used += 1
    responseEvent(s, target, source, 'shan', against)
  }
  return used === count
}
function respondSha(s: GameState, target: PlayerState, count: number, source: PlayerState, against: Card['name'] = 'duel') {
  let used = 0
  while (used < count) {
    const i = target.hand.findIndex(c => c.name === 'sha' || (target.hero.id === 'zhaoyun' && c.name === 'shan'))
    if (i < 0) break
    s.discard.push(target.hand.splice(i, 1)[0]); used += 1
    responseEvent(s, target, source, 'sha', against)
  }
  return used === count
}
function resolveMass(s: GameState, source: PlayerState, kind: 'barbarian' | 'arrows', targetIds: string[], start = 0) {
  for (let index = start; index < targetIds.length && !s.winner; index += 1) {
    const target = get(s, targetIds[index])
    if (!target?.alive) continue
    const responseType = kind === 'barbarian' ? 'sha' : 'shan'
    const continuation = { kind, targetIds, nextIndex: index + 1 }
    if (target.isHuman) {
      setPending(s, { kind: 'response', sourceId: source.id, targetIds: [target.id], requiredResponses: 1, responses: 0, stage: 'respond', responseType, responseSourceId: source.id, responseDamage: 1, continuation })
      const prompt = ev(`${target.hero.name} 面临【${kind === 'barbarian' ? '南蛮入侵' : '万箭齐发'}】，请使用【${kind === 'barbarian' ? '杀' : '闪'}】响应。`, 'damage', { kind: 'response', actorId: source.id, targetId: target.id })
      s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
      return
    }
    const responded = kind === 'barbarian' ? respondSha(s, target, 1, source, kind) : respondShan(s, target, 1, source, kind)
    if (!responded) {
      if (target.equipment.armor?.name === 'vine') {
        const immune = ev(`${target.hero.name} 的藤甲免疫【${kind === 'barbarian' ? '南蛮入侵' : '万箭齐发'}】。`, 'response', { kind: 'response', actorId: target.id, targetId: source.id })
        s.events.unshift(immune); s.animationEvents.push(immune); s.actionQueue.push(immune)
      } else damage(s, target, 1, source, continuation)
    }
    if (s.pendingAction) return
  }
}
function continueMass(s: GameState, pending: PendingAction) { const continuation = pending.continuation; if (!continuation || s.winner || s.pendingAction) return; const source = get(s, pending.responseSourceId ?? pending.sourceId); if (!source) return; if (continuation.kind === 'sha') attackTargets(s, source, continuation.targetIds, continuation.nextIndex); else resolveMass(s, source, continuation.kind, continuation.targetIds, continuation.nextIndex) }
function resolveMassDamage(s: GameState, target: PlayerState, source: PlayerState, continuation: PendingAction['continuation']) {
  if (target.equipment.armor?.name === 'vine' && continuation && (continuation.kind === 'barbarian' || continuation.kind === 'arrows')) {
    const immune = ev(`${target.hero.name} 的藤甲免疫【${continuation.kind === 'barbarian' ? '南蛮入侵' : '万箭齐发'}】。`, 'response', { kind: 'response', actorId: target.id, targetId: source.id })
    s.events.unshift(immune); s.animationEvents.push(immune); s.actionQueue.push(immune)
    return
  }
  damage(s, target, 1, source, continuation)
}
function resolveDuelResponder(s: GameState, responder: PlayerState, opponent: PlayerState, attackerId: string, defenderId: string) {
  if (!responder?.alive || !opponent?.alive) return
  // Wushuang applies to the first defender facing Lu Bu's duel, not to Lu Bu
  // when the duel returns to him.
  const attacker = get(s, attackerId)
  const required = responder.id === defenderId && attacker?.hero.id === 'lvbu' ? 2 : 1
  if (responder.isHuman) {
    setPending(s, { kind: 'response', sourceId: opponent.id, targetIds: [responder.id], requiredResponses: required, responses: 0, stage: 'respond', responseType: 'sha', responseSourceId: opponent.id, responseDamage: 1, duel: { attackerId, defenderId, currentResponderId: responder.id } })
    const duelWindow = ev(`${responder.hero.name} 面临【决斗】，请使用 ${required} 张【杀】响应。`, 'damage', { kind: 'response', actorId: opponent.id, targetId: responder.id, cardName: 'duel' }); s.events.unshift(duelWindow); s.animationEvents.push(duelWindow); s.actionQueue.push(duelWindow); return
  }
  if (respondSha(s, responder, required, opponent)) { resolveDuelResponder(s, opponent, responder, attackerId, defenderId); return }
  damage(s, responder, 1, opponent)
}
function attackTargets(s: GameState, source: PlayerState, targetIds: string[], start = 0) {
  for (let index = start; index < targetIds.length && !s.winner; index += 1) {
    const target = get(s, targetIds[index]); if (!target?.alive) continue
    attack(s, source, target, false, { kind: 'sha', targetIds, nextIndex: index + 1 })
    if (s.pendingAction) return
  }
}
function attack(s: GameState, source: PlayerState, target: PlayerState, duel = false, continuation?: PendingAction['continuation']) {
  if (!target?.alive) return
  if (duel) { resolveDuelResponder(s, target, source, source.id, target.id); return }
  const need = source.hero.id === 'lvbu' ? 2 : 1
  const ignoreArmor = source.equipment.weapon?.name === 'qinggang'
  if (!ignoreArmor && target.equipment.armor?.name === 'renwang' && source.marks.lastShaBlack) {
    const blocked = ev(`${target.hero.name} 的仁王盾挡住了黑色【杀】。`, 'response', { kind: 'response', actorId: source.id, targetId: target.id })
    s.events.unshift(blocked); s.animationEvents.push(blocked); s.actionQueue.push(blocked); source.marks.wine = 0; return
  }
  if (!ignoreArmor && target.equipment.armor?.name === 'eightDiagram' && s.deck.length) { const judge = s.deck.pop()!; s.discard.push(judge); if (judge.suit === 'heart' || judge.suit === 'diamond') { const dodged = ev(`${target.hero.name} 触发八卦阵，判定为红色，视为使用【闪】。`, 'response', { kind: 'response', actorId: target.id }); s.events.unshift(dodged); s.animationEvents.push(dodged); s.actionQueue.push(dodged); source.marks.wine = 0; return } }
  const baseDamage = 1 + (source.marks.wine ? 1 : 0) + (source.equipment.weapon?.name === 'gudingDao' && target.hand.length === 0 ? 1 : 0)
  if (target.isHuman) { setPending(s, { kind: 'response', sourceId: source.id, targetIds: [target.id], requiredResponses: need, responses: 0, stage: 'respond', responseType: 'shan', responseSourceId: source.id, responseDamage: baseDamage, continuation }); const threat = ev(`${target.hero.name} 受到【杀】威胁，请选择是否出【闪】。`, 'damage', { kind: 'response', actorId: source.id, targetId: target.id }); s.events.unshift(threat); s.animationEvents.push(threat); s.actionQueue.push(threat); return }
  if (respondShan(s, target, need, source)) { source.marks.wine = 0; if (source.equipment.weapon?.name === 'blade') { source.marks.bladeReady = 1; const follow = ev(`${source.hero.name} 的青龙偃月刀触发，可继续使用一张【杀】。`, 'skill', { kind: 'skill', actorId: source.id, cardName: 'blade' }); s.events.unshift(follow); s.animationEvents.push(follow); s.actionQueue.push(follow) } return }
  if (source.equipment.weapon?.name === 'doubleSword' && source.gender !== target.gender) {
    const chose = target.isHuman
      ? beginDoubleSwordChoice(s, source, target, baseDamage, continuation)
      : resolveDoubleSwordAi(s, source, target, baseDamage, continuation)
    if (chose) return
  }
  if (source.equipment.weapon?.name === 'iceSword') {
    const replaced = source.isHuman ? beginIceSelection(s, source, target, baseDamage, continuation) : resolveIceSwordAi(s, source, target)
    if (replaced) { source.marks.wine = 0; return }
  }
  damage(s, target, baseDamage, source, continuation); source.marks.wine = 0
}

export function respondToAttack(input: GameState, cardId?: string): GameState {
  const s = copy(input); const pending = s.pendingAction
  if (!pending || pending.stage !== 'respond' || pending.responseType !== 'shan') return s
  const target = get(s, pending.targetIds[0]); if (!target?.isHuman) return s
  const source = get(s, pending.responseSourceId ?? pending.sourceId)
  if (cardId) {
    const index = target.hand.findIndex(c => c.id === cardId && (c.name === 'shan' || (target.hero.id === 'zhaoyun' && c.name === 'sha')))
    if (index < 0) return s
    s.discard.push(target.hand.splice(index, 1)[0]); pending.responses += 1
    responseEvent(s, target, source, 'shan', pending.continuation?.kind === 'arrows' ? 'arrows' : 'sha')
  }
  if (pending.responses >= pending.requiredResponses) {
    clearPending(s)
    const dodged = ev(`${target.hero.name} 成功闪避 ${source.hero.name} 的攻击。`, 'response', { kind: 'response', targetId: target.id })
    s.events.unshift(dodged); s.animationEvents.push(dodged); s.actionQueue.push(dodged)
    source.marks.wine = 0
    if (source.equipment.weapon?.name === 'blade') {
      source.marks.bladeReady = 1
      const follow = ev(`${source.hero.name} 的青龙偃月刀触发，可继续使用一张【杀】。`, 'skill', { kind: 'skill', actorId: source.id, cardName: 'blade' })
      s.events.unshift(follow); s.animationEvents.push(follow); s.actionQueue.push(follow)
    }
    continueMass(s, pending)
  }
  return s
}
export function respondToDuel(input: GameState, cardId?: string): GameState {
  const s = copy(input); const pending = s.pendingAction
  if (!pending || pending.stage !== 'respond' || pending.responseType !== 'sha') return s
  const target = get(s, pending.targetIds[0]); if (!target?.isHuman || !cardId) return s
  const index = target.hand.findIndex(c => c.id === cardId && (c.name === 'sha' || (target.hero.id === 'zhaoyun' && c.name === 'shan'))); if (index < 0) return s
  s.discard.push(target.hand.splice(index, 1)[0]); pending.responses += 1
  responseEvent(s, target, get(s, pending.responseSourceId ?? pending.sourceId), 'sha', pending.continuation?.kind === 'barbarian' ? 'barbarian' : 'duel')
  if (pending.responses < pending.requiredResponses) return s
  const duel = pending.duel; clearPending(s)
  if (duel) { const opponentId = target.id === duel.attackerId ? duel.defenderId : duel.attackerId; resolveDuelResponder(s, get(s, opponentId), target, duel.attackerId, duel.defenderId) } else continueMass(s, pending)
  return settleAction(s)
}
export function respondToNullify(input: GameState, cardId?: string): GameState {
  const s = copy(input); const pending = s.pendingAction
  if (!pending || pending.stage !== 'respond' || pending.responseType !== 'nullify') return s
  const target = get(s, pending.targetIds[0]); if (!target?.isHuman || !cardId) return s
  const index = target.hand.findIndex(c => c.id === cardId && c.name === 'nullify'); if (index < 0) return s
  s.discard.push(target.hand.splice(index, 1)[0])
  const depth = (pending.nullifyDepth ?? 0) + 1
  const response = ev(`${target.hero.name} 使用【无懈可击】响应 ${get(s, pending.sourceId).hero.name}，形成第 ${depth} 层响应。`, 'response', { kind: 'response', presentation: 'response', actorId: target.id, targetId: pending.sourceId, targetIds: [pending.sourceId], cardName: 'nullify' })
  s.events.unshift(response); s.animationEvents.push(response); s.actionQueue.push(response)
  // Keep the chain interactive: only the human side gets another response
  // window. AI responders are handled when the original action is created.
  if (continueNullify(s, pending, depth, target.id)) return s
  const finalDepth = pending.nullifyDepth ?? depth
  clearPending(s)
  if (finalDepth % 2 === 1) { const canceled = ev('锦囊被无懈抵消。', 'response', { kind: 'response', actorId: pending.sourceId, cardName: pending.card?.name }); s.events.unshift(canceled); s.animationEvents.push(canceled); s.actionQueue.push(canceled) }
  else if (pending.card) resolveTrick(s, get(s, pending.sourceId), pending.card, pending.nullifyTargetId ? get(s, pending.nullifyTargetId) : undefined, pending.effectTargetIds)
  return s
}
export function canRespondWithPeach(s: GameState, card: Card, responderId = s.pendingAction?.targetIds[0]) {
  const pending = s.pendingAction
  if (s.winner || pending?.responseType !== 'peach' || pending.stage !== 'respond' || responderId !== pending.targetIds[0]) return false
  const responder = get(s, responderId)
  const dying = get(s, pending.rescueTargetId ?? responderId)
  return Boolean(responder?.alive && dying?.alive && dying.hp <= 0 && responder.hand.some(item => item.id === card.id) &&
    (card.name === 'tao' || (card.name === 'jiu' && responder.id === dying.id)))
}
export function respondToPeach(input: GameState, cardId?: string): GameState {
  const s = copy(input)
  const pending = s.pendingAction
  if (!pending || pending.responseType !== 'peach' || pending.stage !== 'respond' || !cardId) return s
  const responder = get(s, pending.targetIds[0])
  const card = responder?.hand.find(item => item.id === cardId)
  if (!responder?.isHuman || !card || !canRespondWithPeach(s, card, responder.id)) return s
  const dying = get(s, pending.rescueTargetId ?? responder.id)
  consumeRescueCard(s, pending, responder, dying, card)
  clearPending(s)
  if (dying.hp <= 0) resolveRescue(s, pending)
  return s.pendingAction ? s : resumeAfterDamage(s, pending)
}
export function respondToAction(input: GameState, cardId?: string): GameState { return input.pendingAction?.responseType === 'nullify' ? respondToNullify(input, cardId) : input.pendingAction?.responseType === 'sha' ? respondToDuel(input, cardId) : input.pendingAction?.responseType === 'peach' ? respondToPeach(input, cardId) : respondToAttack(input, cardId) }
export function passResponse(input: GameState): GameState {
  const s = copy(input)
  const pending = s.pendingAction
  if (!pending || pending.stage !== 'respond' || s.winner) return s
  const target = get(s, pending.targetIds[0])
  const source = get(s, pending.responseSourceId ?? pending.sourceId)
  clearPending(s)
  if (pending.responseType === 'nullify' && pending.card) {
    const originalTarget = pending.nullifyTargetId ? get(s, pending.nullifyTargetId) : undefined
    if ((pending.nullifyDepth ?? 0) % 2 === 1) {
      const canceled = ev('锦囊被无懈抵消。', 'response', { kind: 'response', actorId: source.id, cardName: pending.card.name })
      s.events.unshift(canceled); s.animationEvents.push(canceled); s.actionQueue.push(canceled)
    } else {
      resolveTrick(s, source, pending.card, originalTarget, pending.effectTargetIds)
    }
  } else if (pending.responseType === 'peach') {
    pending.rescueIndex = (pending.rescueIndex ?? 0) + 1
    resolveRescue(s, pending)
    return s.pendingAction ? s : resumeAfterDamage(s, pending)
  } else {
    const attackDamage = pending.responseDamage ?? 1
    const isSlash = pending.responseType === 'shan' && (!pending.continuation || pending.continuation.kind === 'sha')
    if (isSlash && source.equipment.weapon?.name === 'iceSword' && targetCards(target).length >= 2) {
      const replaced = source.isHuman ? beginIceSelection(s, source, target, attackDamage, pending.continuation) : resolveIceSwordAi(s, source, target)
      if (!replaced) damage(s, target, attackDamage, source, pending.continuation)
    } else if (isSlash && source.equipment.weapon?.name === 'doubleSword' && source.gender !== target.gender) {
      const chose = target.isHuman
        ? beginDoubleSwordChoice(s, source, target, attackDamage, pending.continuation)
        : resolveDoubleSwordAi(s, source, target, attackDamage, pending.continuation)
      if (!chose) damage(s, target, attackDamage, source, pending.continuation)
    } else if (pending.continuation?.kind === 'barbarian' || pending.continuation?.kind === 'arrows') resolveMassDamage(s, target, source, pending.continuation)
    else damage(s, target, attackDamage, source, pending.continuation)
    if (isSlash) source.marks.wine = 0
    if (!s.pendingAction && !s.winner) continueMass(s, pending)
  }
  checkWinner(s)
  return s
}
function finishDeath(s: GameState, target: PlayerState, source: PlayerState) {
  if (!target.alive) return
  target.alive = false
  target.faceUp = true
  s.discard.push(...target.hand.splice(0), ...target.judgment.splice(0))
  Object.values(target.equipment).forEach(card => { if (card) s.discard.push(card) })
  target.equipment = {}
  refreshDistances(s)
  const death = ev(`${target.hero.name} 阵亡。`, 'damage', { kind: 'death', targetId: target.id })
  s.events.unshift(death); s.animationEvents.push(death); s.actionQueue.push(death)
  checkWinner(s)
  if (s.winner || !source.alive || source.id === target.id) return
  if (target.identity === 'rebel') draw(s, source, 3)
  else if (target.identity === 'loyalist' && source.identity === 'lord') {
    s.discard.push(...source.hand.splice(0))
    Object.values(source.equipment).forEach(card => { if (card) s.discard.push(card) })
    source.equipment = {}
    refreshDistances(s)
    const penalty = ev(`${source.hero.name} 误杀忠臣，弃置所有手牌和装备。`, 'system', { kind: 'card', actorId: source.id })
    s.events.unshift(penalty); s.animationEvents.push(penalty); s.actionQueue.push(penalty)
  }
}
function actionOrder(s: GameState) {
  return Array.from({ length: s.players.length }, (_, offset) => s.players[(s.currentPlayer + offset) % s.players.length])
}
function shouldRescue(s: GameState, responder: PlayerState, dying: PlayerState) {
  if (responder.id === dying.id || sameSide(responder.identity, dying.identity)) return true
  return responder.identity === 'spy' && dying.identity === 'lord' &&
    s.players.some(player => player.alive && player.id !== responder.id && player.id !== dying.id)
}
function rescueCards(responder: PlayerState, dying: PlayerState) {
  return responder.hand.filter(card => card.name === 'tao' || (responder.id === dying.id && card.name === 'jiu'))
}
function consumeRescueCard(s: GameState, pending: PendingAction, responder: PlayerState, dying: PlayerState, card: Card) {
  s.discard.push(responder.hand.splice(responder.hand.findIndex(item => item.id === card.id), 1)[0])
  dying.hp += 1
  pending.responses += 1
  const saved = ev(`${responder.hero.name} 使用【${cardName(card.name)}】令 ${dying.hero.name} 回复 1 点体力${dying.hp <= 0 ? '，仍处于濒死状态' : '，脱离濒死'}。`, 'heal', { kind: 'heal', presentation: 'response', actorId: responder.id, targetId: dying.id, targetIds: [dying.id], cardName: card.name })
  s.events.unshift(saved); s.animationEvents.push(saved); s.actionQueue.push(saved)
}
function resolveRescue(s: GameState, pending: PendingAction) {
  const dying = get(s, pending.rescueTargetId ?? pending.targetIds[0])
  if (!dying?.alive || dying.hp > 0 || s.winner) return
  pending.rescueOrder ??= [dying.id, ...actionOrder(s).filter(player => player.alive && player.id !== dying.id).map(player => player.id)]
  pending.rescueIndex ??= 0
  while (pending.rescueIndex < pending.rescueOrder.length) {
    const responder = get(s, pending.rescueOrder[pending.rescueIndex])
    const cards = responder?.alive ? rescueCards(responder, dying) : []
    if (!cards.length || (!responder.isHuman && !shouldRescue(s, responder, dying))) {
      pending.rescueIndex += 1
      continue
    }
    if (responder.isHuman) {
      pending.targetIds = [responder.id]
      setPending(s, pending)
      const prompt = ev(`${dying.hero.name} 濒死（${dying.hp} 点体力），还需回复 ${1 - dying.hp} 点体力。`, 'damage', { kind: 'response', voiceCue: 'lowhp', actorId: dying.id, targetId: responder.id })
      s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
      return
    }
    // Use wine for self-rescue first, keeping peaches available for allies.
    consumeRescueCard(s, pending, responder, dying, cards.find(card => card.name === 'jiu') ?? cards[0])
    if (dying.hp > 0) return
  }
  finishDeath(s, dying, get(s, pending.responseSourceId ?? pending.sourceId))
}
type DamageContext = Pick<PendingAction, 'continuation' | 'resumeTurn' | 'damageChain'> & { cardName?: Card['name'] }
function applyDamage(s: GameState, target: PlayerState, amount: number, source: PlayerState, nature: DamageNature, context: DamageContext) {
  if (!target.alive || s.winner) return
  if (nature !== 'normal') target.marks.chained = 0
  const adjustedAmount = target.equipment.armor?.name === 'silverLion'
    ? Math.min(amount, 1)
    : target.equipment.armor?.name === 'vine' && nature === 'fire'
      ? amount + 1
      : amount
  target.hp -= adjustedAmount
  const cardName = context.cardName ?? (context.continuation?.kind === 'sha' ? 'sha' : context.continuation?.kind === 'barbarian' ? 'barbarian' : context.continuation?.kind === 'arrows' ? 'arrows' : undefined)
  const hit = ev(`${target.hero.name} 受到 ${adjustedAmount} 点${nature === 'fire' ? '火焰' : nature === 'thunder' ? '雷电' : ''}伤害。`, 'damage', { kind: 'damage', presentation: 'effect', actorId: source.id, targetId: target.id, targetIds: [target.id], amount: adjustedAmount, cardName, damageNature: nature })
  s.events.unshift(hit); s.animationEvents.push(hit); s.actionQueue.push(hit)
  if (target.hp <= 0) {
    resolveRescue(s, {
      kind: 'response', sourceId: source.id, responseSourceId: source.id,
      targetIds: [target.id], rescueTargetId: target.id,
      rescueOrder: [target.id, ...actionOrder(s).filter(player => player.alive && player.id !== target.id).map(player => player.id)], rescueIndex: 0,
      requiredResponses: 1 - target.hp, responses: 0, stage: 'respond', responseType: 'peach',
      continuation: context.continuation, resumeTurn: context.resumeTurn, damageChain: context.damageChain,
    })
  }
}
function continueDamageChain(s: GameState, context: DamageContext) {
  const chain = context.damageChain
  if (!chain) return
  while (chain.nextIndex < chain.targetIds.length && !s.pendingAction && !s.winner) {
    const target = get(s, chain.targetIds[chain.nextIndex++])
    if (!target?.alive) continue
    applyDamage(s, target, chain.amount, get(s, chain.sourceId), chain.nature, context)
  }
}
function resumeAfterDamage(s: GameState, pending: PendingAction): GameState {
  continueDamageChain(s, pending)
  if (s.pendingAction || s.winner) return s
  checkWinner(s)
  if (s.winner) return s
  if (pending.resumeTurn) return beginTurn(s, now(s))
  continueMass(s, pending)
  return settleAction(s)
}
function settleAction(s: GameState): GameState {
  checkWinner(s)
  if (!s.pendingAction && !s.winner && !now(s).alive) return advanceTurn(s, now(s))
  return s
}
function damage(s: GameState, target: PlayerState, amount: number, source: PlayerState, continuation?: PendingAction['continuation'], resumeTurn = false, nature: DamageNature = 'normal', cardName?: Card['name']) {
  if (!target?.alive || s.winner || s.pendingAction) return
  // Snapshot linked recipients, then suspend the sequence at each rescue window.
  const linked = nature !== 'normal' && target.marks.chained
    ? actionOrder(s).filter(player => player.alive && player.id !== target.id && player.marks.chained).map(player => player.id)
    : []
  const context = {
    continuation, resumeTurn, cardName,
    damageChain: linked.length ? { sourceId: source.id, targetIds: linked, nextIndex: 0, amount, nature } : undefined,
  }
  applyDamage(s, target, amount, source, nature, context)
  continueDamageChain(s, context)
}
function heal(s: GameState, target: PlayerState, amount: number) { if (!target.alive) return; const before = target.hp; target.hp = Math.min(target.maxHp, target.hp + amount); if (target.hp > before) { const restored = ev(`${target.hero.name} 回复 ${target.hp - before} 点体力。`, 'heal', { kind: 'heal', targetId: target.id }); s.events.unshift(restored); s.animationEvents.push(restored); s.actionQueue.push(restored) } }
function discardFrom(s: GameState, target: PlayerState) { if (target.hand.length) { s.discard.push(target.hand.pop()!) } else { const slot = (Object.keys(target.equipment) as (keyof typeof target.equipment)[]).find(key => target.equipment[key]); if (slot) { s.discard.push(target.equipment[slot]!); delete target.equipment[slot] } else return } const discarded = ev(`${target.hero.name} 的一张牌被弃置。`, 'skill', { kind: 'card', targetId: target.id }); s.events.unshift(discarded); s.animationEvents.push(discarded); s.actionQueue.push(discarded) }
function steal(s: GameState, source: PlayerState, target: PlayerState) { const card = target.hand.pop() ?? (() => { const slot = (Object.keys(target.equipment) as (keyof typeof target.equipment)[]).find(key => target.equipment[key]); if (!slot) return undefined; const card = target.equipment[slot]!; delete target.equipment[slot]; return card })(); if (card) { source.hand.push(card); const stolen = ev(`${source.hero.name} 获得了 ${target.hero.name} 的一张牌。`, 'skill', { kind: 'card', actorId: source.id, targetId: target.id }); s.events.unshift(stolen); s.animationEvents.push(stolen); s.actionQueue.push(stolen) } }
function resolveJudgment(s: GameState, player: PlayerState) {
  let guard = 0
  while (player.alive && !s.winner && player.judgment.length && guard < 8) {
    guard += 1
    const delayed = player.judgment.shift()!
    const judge = s.deck.pop()
    if (!judge) { s.discard.push(delayed); continue }
    s.discard.push(judge)
    const red = judge.suit === 'heart' || judge.suit === 'diamond'
    const black = judge.suit === 'spade' || judge.suit === 'club'
    const pass = delayed.name === 'indulgence' ? judge.suit === 'heart' : delayed.name === 'supplyShortage' ? judge.suit === 'club' : delayed.name === 'lightning' ? (judge.suit === 'spade' && judge.rank >= 2 && judge.rank <= 9) : false
    const judged = ev(`${player.hero.name} 判定【${cardName(delayed.name)}】：${cardName(judge.name)} ${red ? '红色' : black ? '黑色' : ''}。`, 'system', { kind: 'draw', actorId: player.id, cardName: delayed.name }); s.events.unshift(judged); s.animationEvents.push(judged); s.actionQueue.push(judged)
    if (delayed.name === 'indulgence') { s.discard.push(delayed); if (!pass) player.marks.skipPlay = 1 }
    else if (delayed.name === 'supplyShortage') { s.discard.push(delayed); if (!pass) player.marks.skipDraw = 1 }
    else if (delayed.name === 'lightning' && pass) { s.discard.push(delayed); damage(s, player, 3, player, undefined, true, 'thunder'); if (s.pendingAction) break }
    else if (delayed.name === 'lightning' && !pass) {
      let recipient: PlayerState | undefined
      let cursor = s.players.indexOf(player)
      for (let i = 0; i < s.players.length; i += 1) {
        cursor = next(s, cursor)
        const candidate = s.players[cursor]
        if (candidate?.alive && !candidate.judgment.some(item => item.name === 'lightning')) { recipient = candidate; break }
      }
      if (recipient) recipient.judgment.push(delayed)
      else s.discard.push(delayed)
      break
    }
  }
}

export function activateSkill(input: GameState, skillId: string, targetIds: string[] = [], cardIds: string[] = []): GameState {
  const s = copy(input); const source = now(s); const skill = source.hero.skills.find(x => x.id === skillId); if (!skill || s.phase !== 'play' || s.winner || s.pendingAction || source.marks.skipPlay) return s
  const key = `${source.id}:${skillId}:${s.round}`; if (s.skillCooldowns[key]) return s
  const targets = targetIds.map(id => get(s, id)).filter(p => p?.alive)
  if (skillId === 'rende') {
    const target = targets[0]
    const cards = source.hand.filter(c => cardIds.includes(c.id))
    if (!cards.length || !target || target.id === source.id) return s
    source.hand = source.hand.filter(c => !cardIds.includes(c.id))
    target.hand.push(...cards)
    source.marks.rendeCount = (source.marks.rendeCount ?? 0) + cards.length
    if (!source.marks.rendeHealed) { heal(s, target, 1); source.marks.rendeHealed = 1 }
  }
  else if (skillId === 'zhiheng') { const chosen = source.hand.filter(c => cardIds.includes(c.id)); if (!chosen.length) return s; chosen.forEach(c => { source.hand = source.hand.filter(x => x.id !== c.id); s.discard.push(c) }); draw(s, source, chosen.length) }
  else if (skillId === 'guanxing') { const top = s.deck.splice(Math.max(0, s.deck.length - 2), 2).reverse(); if (source.isHuman && !cardIds.length) { setPending(s, { kind: 'skill', sourceId: source.id, targetIds: [], requiredResponses: 0, responses: 0, stage: 'select', skillId: 'guanxing', choices: top }); const preview = ev(`${source.hero.name} 观星，查看牌堆顶的两张牌并调整顺序。`, 'skill', { kind: 'skill', actorId: source.id }); s.events.unshift(preview); s.animationEvents.push(preview); s.actionQueue.push(preview); return s } const ordered = cardIds.length ? cardIds.map(id => top.find(card => card.id === id)).filter((card): card is Card => Boolean(card)) : top; s.deck.push(...ordered.reverse()); }
  else if (skillId === 'lijian') { const [a, b] = targets.filter(p => p.gender === 'male'); const cost = source.hand.find(card => cardIds.includes(card.id)); if (!a || !b || a.id === b.id || !cost) return s; source.hand = source.hand.filter(card => card.id !== cost.id); s.discard.push(cost); const liJianEvent = ev(`${source.hero.name} 令${a.hero.name}与${b.hero.name}进行【决斗】。`, 'skill', { kind: 'skill', presentation: 'play', actorId: source.id, targetId: a.id, targetIds: [a.id, b.id], cardName: 'duel', skillId: 'lijian' }); s.events.unshift(liJianEvent); s.animationEvents.push(liJianEvent); s.actionQueue.push(liJianEvent); attack(s, a, b, true) }
  else if (skillId === 'biyue') draw(s, source, 1)
  else if (skillId === 'wusheng') { source.marks.wushengArmed = 1; const armed = ev(`${source.hero.name} 准备将红色牌当作【杀】使用。`, 'skill', { kind: 'skill', actorId: source.id }); s.events.unshift(armed); s.animationEvents.push(armed); s.actionQueue.push(armed); checkWinner(s); return s }
  else if (['paoxiao', 'longdan', 'wushuang'].includes(skillId)) { source.marks[skillId] = 1 }
  else return s
  s.skillCooldowns[key] = 1
  const skillEvent = ev(`${source.hero.name} 发动技能【${skill.name}】。`, 'skill', { kind: 'skill', presentation: 'effect', skillId, actorId: source.id }); s.events.unshift(skillEvent); s.animationEvents.push(skillEvent); s.actionQueue.push(skillEvent); checkWinner(s); return s
}
export function cancelSkill(input: GameState, skillId: string): GameState {
  const s = copy(input)
  if (skillId === 'wusheng') s.players[s.currentPlayer].marks.wushengArmed = 0
  return s
}

export function confirmGuanxing(input: GameState, cardIds: string[]): GameState { const s = copy(input); const pending = s.pendingAction; if (!pending || pending.stage !== 'select' || pending.skillId !== 'guanxing' || pending.choices?.length !== 2 || cardIds.length !== 2 || new Set(cardIds).size !== 2) return s; const choices = pending.choices; const ordered = cardIds.map(id => choices.find(card => card.id === id)); if (ordered.some(card => !card)) return s; const source = get(s, pending.sourceId); s.deck.push(...(ordered as Card[]).reverse()); clearPending(s); s.skillCooldowns[`${source.id}:guanxing:${s.round}`] = 1; const confirmed = ev(`${source.hero.name} 观星完毕，牌堆顺序已调整。`, 'skill', { kind: 'skill', actorId: source.id }); s.events.unshift(confirmed); s.animationEvents.push(confirmed); s.actionQueue.push(confirmed); return s }
export function confirmTargetCard(input: GameState, cardId: string): GameState {
  const s = copy(input); const pending = s.pendingAction
  if (!pending || pending.stage !== 'select' || !pending.selectionKind || !['targetCard', 'iceDiscard', 'fireDiscard', 'doubleSwordChoice'].includes(pending.selectionKind) || !pending.selectionTargetId) return s
  const target = get(s, pending.selectionTargetId); const source = get(s, pending.sourceId)
  const valid = pending.selectionKind === 'fireDiscard'
    ? (pending.choices ?? []).some(card => card.id === cardId) && source.hand.some(card => card.id === cardId)
    : (pending.choices ?? []).some(card => card.id === cardId) && targetCards(target).some(card => card.id === cardId)
  if (!valid) return s
  if (pending.selectionKind === 'fireDiscard') {
    const index = source.hand.findIndex(card => card.id === cardId)
    if (index < 0) return s
    s.discard.push(source.hand.splice(index, 1)[0])
    const hit = ev(`${source.hero.name} 弃置同花色牌，火攻命中。`, 'skill', { kind: 'card', actorId: source.id, targetId: target.id, cardName: 'fireAttack' })
    s.events.unshift(hit); s.animationEvents.push(hit); s.actionQueue.push(hit)
    clearPending(s); damage(s, target, 1, source, undefined, false, 'fire'); return settleAction(s)
  }
  if (pending.selectionKind === 'doubleSwordChoice') {
    if (!target.hand.some(card => card.id === cardId)) return s
    const removed = removeSpecificCard(s, target, cardId)
    if (!removed) return s
    s.discard.push(removed)
    const event = ev(`${target.hero.name} 弃置一张手牌，雌雄双股剑效果结算。`, 'response', { kind: 'response', actorId: target.id, targetId: source.id, cardName: 'doubleSword' })
    s.events.unshift(event); s.animationEvents.push(event); s.actionQueue.push(event)
    const continuation = pending.continuation
    clearPending(s)
    damage(s, target, pending.responseDamage ?? 1, source, continuation)
    if (continuation && !s.pendingAction) continueMass(s, pending)
    return s
  }
  if (pending.selectionKind === 'iceDiscard') {
    const selected = pending.selectionSelectedIds ?? []
    const next = selected.includes(cardId) ? selected.filter(id => id !== cardId) : [...selected, cardId]
    if (next.length < (pending.selectionRequired ?? 2)) { pending.selectionSelectedIds = next; return s }
    next.forEach(id => { const removed = removeSpecificCard(s, target, id); if (removed) s.discard.push(removed) })
    const iced = ev(`${source.hero.name} 以寒冰剑弃置 ${target.hero.name} 两张牌，伤害被替代。`, 'skill', { kind: 'skill', actorId: source.id, targetId: target.id, cardName: 'iceSword' })
    s.events.unshift(iced); s.animationEvents.push(iced); s.actionQueue.push(iced); source.marks.wine = 0; const continuation = pending.continuation; clearPending(s); if (continuation) continueMass(s, { ...pending, continuation }); return s
  }
  const removed = removeSpecificCard(s, target, cardId); if (!removed) return s
  if (pending.selectionKind === 'targetCard' && pending.card?.name === 'snatch') source.hand.push(removed); else s.discard.push(removed)
  const actionName = pending.card?.name === 'snatch' ? '获得' : '弃置'
  const selectedEvent = ev(`${source.hero.name}${actionName}${target.hero.name}的【${cardName(removed.name)}】。`, 'skill', { kind: 'card', actorId: source.id, targetId: target.id, cardName: pending.card?.name })
  s.events.unshift(selectedEvent); s.animationEvents.push(selectedEvent); s.actionQueue.push(selectedEvent)
  clearPending(s); checkWinner(s); return s
}
export function resolveIceChoice(input: GameState, useDiscard: boolean): GameState {
  const s = copy(input); const pending = s.pendingAction
  if (!pending || pending.stage !== 'select' || pending.selectionKind !== 'iceChoice' || !pending.selectionTargetId) return s
  const source = get(s, pending.sourceId); const target = get(s, pending.selectionTargetId); const continuation = pending.continuation
  if (useDiscard) { pending.selectionKind = 'iceDiscard'; pending.selectionSelectedIds = []; return s }
  clearPending(s); damage(s, target, pending.responseDamage ?? 1, source, continuation); source.marks.wine = 0
  if (continuation && !s.pendingAction) continueMass(s, { ...pending, continuation })
  return s
}
export function cancelSelection(input: GameState): GameState {
  const s = copy(input); const pending = s.pendingAction
  if (pending?.stage === 'select' && pending.skillId === 'guanxing' && pending.choices?.length) s.deck.push(...pending.choices.slice().reverse())
  if (pending?.stage === 'select' && (pending.selectionKind === 'iceChoice' || pending.selectionKind === 'iceDiscard')) {
    const source = get(s, pending.sourceId); const target = get(s, pending.selectionTargetId ?? pending.targetIds[0]); const continuation = pending.continuation; clearPending(s); if (source && target) { damage(s, target, pending.responseDamage ?? 1, source, continuation); source.marks.wine = 0; if (continuation && !s.pendingAction) continueMass(s, { ...pending, continuation }) }; return s
  }
  if (pending?.stage === 'select' && pending.selectionKind === 'doubleSwordChoice') {
    const source = get(s, pending.sourceId); const target = get(s, pending.selectionTargetId ?? pending.targetIds[0]); const continuation = pending.continuation; clearPending(s)
    const event = ev(`${target.hero.name} 承受雌雄双股剑的额外伤害。`, 'damage', { kind: 'damage', actorId: source.id, targetId: target.id, cardName: 'doubleSword' })
    s.events.unshift(event); s.animationEvents.push(event); s.actionQueue.push(event)
    damage(s, target, (pending.responseDamage ?? 1) + 1, source, continuation)
    if (continuation && !s.pendingAction) continueMass(s, pending)
    return s
  }
  if (pending?.stage === 'select' && pending.selectionKind === 'fireDiscard') {
    const source = get(s, pending.sourceId); const target = get(s, pending.selectionTargetId ?? pending.targetIds[0]); clearPending(s)
    const miss = ev(`${source.hero.name} 放弃弃置同花色牌，火攻未造成伤害。`, 'system', { kind: 'card', actorId: source.id, targetId: target.id, cardName: 'fireAttack' })
    s.events.unshift(miss); s.animationEvents.push(miss); s.actionQueue.push(miss); return s
  }
  if (pending?.stage === 'select' && pending.selectionKind === 'targetCard' && pending.card) {
    const source = get(s, pending.sourceId)
    const index = s.discard.findIndex(card => card.id === pending.card?.id)
    if (index >= 0) source.hand.push(s.discard.splice(index, 1)[0])
  }
  if (pending?.stage === 'select') clearPending(s)
  return s
}

function beginTurn(s: GameState, nextPlayer: PlayerState): GameState {
  checkWinner(s)
  if (s.winner) return s
  s.turnStats[nextPlayer.id] = { shaUsed: 0, cardsPlayed: 0 }
  s.phase = 'draw'
  resolveJudgment(s, nextPlayer)
  if (s.pendingAction || s.winner) return s
  if (!nextPlayer.alive) {
    s.currentPlayer = next(s, s.currentPlayer)
    if (s.currentPlayer === 0) s.round += 1
    return beginTurn(s, now(s))
  }
  if (!nextPlayer.marks.skipDraw) draw(s, nextPlayer, 2)
  else { const skipped = ev(`${nextPlayer.hero.name} 因【兵粮寸断】跳过摸牌。`, 'damage', { kind: 'response', actorId: nextPlayer.id }); s.events.unshift(skipped); s.animationEvents.push(skipped); s.actionQueue.push(skipped) }
  nextPlayer.marks.skipDraw = 0
  refreshDistances(s)
  s.phase = 'play'
  const turnEvent = ev(`第 ${s.round} 轮，轮到 ${nextPlayer.hero.name} 行动。`, 'gold', { kind: 'turn', actorId: nextPlayer.id }); s.events.unshift(turnEvent); s.animationEvents.push(turnEvent); s.actionQueue.push(turnEvent)
  if (nextPlayer.hero.id === 'zhugeliang') s = activateSkill(s, 'guanxing')
  return s
}

function advanceTurn(s: GameState, ending: PlayerState): GameState {
  if (ending.alive && ending.hero.id === 'diaochan' && ending.hand.length === 0) {
    draw(s, ending, 1)
    const moon = ev(`${ending.hero.name} 触发【闭月】，摸一张牌。`, 'skill', { kind: 'skill', actorId: ending.id })
    s.events.unshift(moon); s.animationEvents.push(moon); s.actionQueue.push(moon)
  }
  ending.usedSha = false
  ending.marks.wine = 0
  ending.marks.bladeReady = 0
  ending.marks.skipPlay = 0
  ending.marks.rendeCount = 0
  ending.marks.rendeHealed = 0
  s.turnStats[ending.id] = { shaUsed: 0, cardsPlayed: 0 }
  s.currentPlayer = next(s, s.currentPlayer)
  if (s.currentPlayer === 0) s.round += 1
  return beginTurn(s, now(s))
}

export function selectDiscard(input: GameState, cardIds: string[]): GameState {
  const s = copy(input)
  const pending = s.pendingAction
  const player = now(s)
  if (!pending || pending.skillId !== 'discard' || pending.stage !== 'select' || s.phase !== 'discard') return s
  const unique = [...new Set(cardIds)]
  if (unique.length > (pending.discardRequired ?? 0) || unique.some(id => !player.hand.some(card => card.id === id))) return s
  pending.discardSelectedIds = unique
  return s
}

export function cancelDiscard(input: GameState): GameState {
  const s = copy(input)
  if (s.pendingAction?.skillId === 'discard' && s.pendingAction.stage === 'select') s.pendingAction.discardSelectedIds = []
  return s
}

export function confirmDiscard(input: GameState): GameState {
  const s = copy(input)
  const pending = s.pendingAction
  const ending = now(s)
  if (!pending || pending.skillId !== 'discard' || pending.stage !== 'select' || s.phase !== 'discard') return s
  const ids = pending.discardSelectedIds ?? []
  if (ids.length !== (pending.discardRequired ?? 0)) return s
  const selected = ending.hand.filter(card => ids.includes(card.id))
  if (selected.length !== ids.length) return s
  ending.hand = ending.hand.filter(card => !ids.includes(card.id))
  s.discard.push(...selected)
  clearPending(s)
  const discarded = ev(`${ending.hero.name} 选择弃置 ${selected.length} 张牌。`, 'system', { kind: 'card', actorId: ending.id })
  s.events.unshift(discarded); s.animationEvents.push(discarded); s.actionQueue.push(discarded)
  return advanceTurn(s, ending)
}

export function endTurn(input: GameState, manualDiscard = true): GameState {
  const s = copy(input)
  if (s.winner || s.pendingAction) return s
  const ending = now(s)
  s.phase = 'discard'
  const required = Math.max(0, ending.hand.length - ending.hp)
  if (required > 0 && ending.isHuman && manualDiscard) {
    setPending(s, { kind: 'turn', sourceId: ending.id, targetIds: [], requiredResponses: 0, responses: 0, stage: 'select', skillId: 'discard', discardRequired: required, discardSelectedIds: [] })
    const prompt = ev(`${ending.hero.name} 手牌超过体力上限，请选择弃置 ${required} 张牌。`, 'gold', { kind: 'turn', actorId: ending.id })
    s.events.unshift(prompt); s.animationEvents.push(prompt); s.actionQueue.push(prompt)
    return s
  }
  if (required > 0) {
    const selected = ending.hand.slice(-required)
    ending.hand = ending.hand.filter(card => !selected.includes(card))
    s.discard.push(...selected)
  }
  return advanceTurn(s, ending)
}

export function runAiTurn(input: GameState): GameState {
  const s = copy(input)
  if (s.winner || now(s).isHuman || !now(s).alive || s.pendingAction) return s
  const ai = now(s)
  const safeAction = (nextState: GameState) => {
    const progressed = nextState.currentPlayer !== s.currentPlayer || nextState.phase !== s.phase || Boolean(nextState.pendingAction) || nextState.turnStats[ai.id].cardsPlayed !== s.turnStats[ai.id].cardsPlayed || nextState.players[s.currentPlayer].hand.length !== ai.hand.length || JSON.stringify(nextState.players[s.currentPlayer].marks) !== JSON.stringify(ai.marks)
    return progressed ? nextState : finishAiTurn(s)
  }
  // One invocation performs one meaningful action. The UI schedules the next
  // invocation, which keeps AI turns readable and gives every card/response
  // animation a chance to render.
  if (s.turnStats[ai.id].cardsPlayed >= 8) return finishAiTurn(s)
  if (ai.marks.skipPlay) { ai.marks.skipPlay = 0; return finishAiTurn(s) }
  const target = chooseAiTarget(s, ai)
  const woundedAlly = s.players.find(p => p.alive && p.id !== ai.id && allies(ai.identity, p.identity) && p.hp < p.maxHp)
  const skillKey = (id: string) => `${ai.id}:${id}:${s.round}`
  if (ai.hero.id === 'zhugeliang' && !s.skillCooldowns[skillKey('guanxing')]) return safeAction(activateSkill(s, 'guanxing'))
  if (ai.hero.id === 'liubei' && woundedAlly && ai.hand.length && !s.skillCooldowns[skillKey('rende')]) return safeAction(activateSkill(s, 'rende', [woundedAlly.id], [ai.hand[0].id]))
  if (ai.hero.id === 'sunquan' && ai.hand.length >= 3 && !s.skillCooldowns[skillKey('zhiheng')]) return safeAction(activateSkill(s, 'zhiheng', [], ai.hand.slice(0, 2).map(c => c.id)))
  const maleTargets = s.players.filter(p => p.alive && p.gender === 'male' && p.id !== ai.id)
  if (ai.hero.id === 'diaochan' && maleTargets.length >= 2 && ai.hand.length && !s.skillCooldowns[skillKey('lijian')]) return safeAction(activateSkill(s, 'lijian', maleTargets.slice(0, 2).map(p => p.id), [ai.hand[0].id]))
  const healCard = ai.hand.find(c => c.name === 'tao' && (ai.hp < ai.maxHp || Boolean(woundedAlly)))
  const peachGarden = ai.hand.find(c => c.name === 'peachGarden' && virtualName(ai, c) === c.name)
  const drawCard = ai.hand.find(c => c.name === 'exnihilo' && virtualName(ai, c) === c.name)
  const wineCard = ai.hand.find(c => c.name === 'jiu')
  const massCard = ai.hand.find(c => ['barbarian', 'arrows'].includes(c.name) && virtualName(ai, c) === c.name)
  const chainCard = ai.hand.find(c => c.name === 'ironChain')
  const equipCard = ai.hand.find(c => c.type === 'equipment' && !ai.equipment[equipmentSlotFor(c.name)])
  const delayedCard = ai.hand.find(c => c.type === 'delayed' && (c.name === 'lightning' || target && legalTargets(s, c, ai.id).includes(target.id)))
  const trick = ai.hand.find(c => ['dismantle', 'snatch', 'duel', 'fireAttack'].includes(c.name) && virtualName(ai, c) === c.name)
  const attackCard = ai.hand.find(c => virtualName(ai, c) === 'sha')
  const guanyuRedEquipment = ai.hero.id === 'guanyu' && ai.hand.find(card => card.type === 'equipment' && isRed(card))
  if (healCard) return safeAction(playCard(s, healCard.id, ai.hp < ai.maxHp ? [] : [woundedAlly!.id]))
  if (peachGarden && (woundedAlly || ai.hp < ai.maxHp)) return safeAction(playCard(s, peachGarden.id))
  if (drawCard) return safeAction(playCard(s, drawCard.id))
  if (wineCard && attackCard && !ai.marks.wine) return safeAction(playCard(s, wineCard.id))
  if (massCard && s.players.filter(p => p.alive && p.id !== ai.id).length >= 2) return safeAction(playCard(s, massCard.id))
  const chainTargets = chainCard ? s.players.filter(p => p.alive && p.id !== ai.id && hostile(ai.identity, p.identity)).slice(0, 2) : []
  if (chainCard && chainTargets.length === 2 && chainTargets.some(p => !p.marks.chained)) return safeAction(playCard(s, chainCard.id, chainTargets.map(p => p.id)))
  if (equipCard) return safeAction(playCard(s, equipCard.id))
  if (delayedCard) return safeAction(playCard(s, delayedCard.id, delayedCard.name === 'lightning' ? [] : [target!.id]))
  if (trick && target && legalTargets(s, trick, ai.id).includes(target.id)) return safeAction(playCard(s, trick.id, [target.id]))
  if (guanyuRedEquipment && target && !ai.usedSha && !ai.marks.wushengArmed) return safeAction(activateSkill(s, 'wusheng'))
  const attackTarget = attackCard ? s.players.filter(p => p.alive && p.id !== ai.id && hostile(ai.identity, p.identity) && legalTargets(s, attackCard, ai.id).includes(p.id)).sort((a, b) => (a.hp + a.hand.length) - (b.hp + b.hand.length))[0] : undefined
  if (attackCard && attackTarget && (!ai.usedSha || ai.hero.id === 'zhangfei' || ai.marks.bladeReady)) return safeAction(playCard(s, attackCard.id, [attackTarget.id]))
  if (ai.equipment.weapon?.name === 'spear' && !ai.usedSha) {
    const convert = chooseAiDiscard(ai.hand, 2).filter(card => !['tao', 'shan', 'nullify'].includes(card.name))
    const spearTarget = chooseAiTarget(s, ai, { id: 'virtual-spear-ai', name: 'sha', suit: 'spade', rank: 1, type: 'basic', label: '杀', description: '' })
    if (convert.length === 2 && spearTarget) return safeAction(useSpear(s, convert.map(card => card.id), [spearTarget.id]))
  }
  return finishAiTurn(s)
}
function finishAiTurn(input: GameState) {
  let s = copy(input)
  const ending = now(s)
  s.phase = 'discard'
  const required = Math.max(0, ending.hand.length - ending.hp)
  if (required > 0) {
    setPending(s, { kind: 'turn', sourceId: ending.id, targetIds: [], requiredResponses: 0, responses: 0, stage: 'select', skillId: 'discard', discardRequired: required, discardSelectedIds: [] })
    const ids = chooseAiDiscard(ending.hand, required).map(card => card.id)
    s = selectDiscard(s, ids)
    s = confirmDiscard(s)
    return s
  }
  return advanceTurn(s, ending)
}
export function checkWinner(s: GameState) {
  if (s.winner) return
  const lord = s.players.find(player => player.identity === 'lord')
  const rebelsAlive = s.players.some(player => player.alive && player.identity === 'rebel')
  const spy = s.players.find(player => player.identity === 'spy')
  const anyoneAlive = s.players.some(player => player.alive)
  const nonSpyAlive = s.players.some(player => player.alive && player.identity !== 'spy')
  if (!anyoneAlive) s.winner = 'draw'
  else if (!lord?.alive && rebelsAlive) s.winner = 'rebel'
  else if (!lord?.alive && !rebelsAlive && spy?.alive && !nonSpyAlive) s.winner = 'spy'
  else if (!lord?.alive && !rebelsAlive && !spy?.alive) s.winner = 'draw'
  else if (lord?.alive && !rebelsAlive && !spy?.alive) s.winner = 'lord'
  if (s.winner) {
    s.phase = 'finished'
    clearPending(s)
    const result = ev(s.winner === 'lord' ? '主公阵营获胜！' : s.winner === 'rebel' ? '反贼席卷天下！' : s.winner === 'spy' ? '内奸笑到最后！' : '四方俱灭，战局平局。', 'gold', { kind: 'turn', presentation: 'effect', outcome: s.winner, voiceCue: undefined })
    s.events.unshift(result); s.animationEvents.push(result); s.actionQueue.push(result)
  }
}

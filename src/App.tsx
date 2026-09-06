import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, History, RotateCcw, Shield, Sparkles, Volume2, VolumeX, X } from 'lucide-react'
import { heroes, identityLabels } from './game/heroes'
import { cardName } from './game/cards'
import { activateSkill, cancelDiscard, cancelSelection, cancelSkill, canPlayCard, canRespondWithPeach, canUseSpear, confirmDiscard, confirmGuanxing, confirmTargetCard, createGame, endTurn, legalTargets, passResponse, playCard, respondToAction, resolveIceChoice, runAiTurn, selectDiscard, useSpear } from './game/engine'
import type { Card, GameEvent, GameState, Identity, PlayerState } from './game/types'
import { assets, cardArtFor, portraitFor, portraitLargeFor } from './assets'
import './styles/app.css'
import { initAudio, ping, setAudioEnabled, speak } from './game/audio'

const suits = { spade: '♠', heart: '♥', club: '♣', diamond: '♦' }
const identityTone: Record<Identity, string> = { lord: '主公', loyalist: '忠臣', rebel: '反贼', spy: '内奸' }

function CardTile({ card, selected, onClick, disabled, blockedReason }: { card: Card; selected: boolean; onClick: () => void; disabled?: boolean; blockedReason?: string }) {
  return <button className={`card-tile ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={selected} title={blockedReason ?? card.description}>
    <img src={cardArtFor(card.name)} alt="" /><span className={`card-suit ${card.suit === 'heart' || card.suit === 'diamond' ? 'red' : ''}`}>{suits[card.suit]}</span><strong>{card.label}</strong><i>{card.rank}</i>
  </button>
}

function HeroBadge({ player, active, compact = false, targetable = false, onClick }: { player: PlayerState; active: boolean; compact?: boolean; targetable?: boolean; onClick?: () => void }) {
  const equipped = Object.values(player.equipment).filter(Boolean)
  return <button className={`hero-badge ${active ? 'active' : ''} ${targetable ? 'targetable' : ''} ${!player.alive ? 'dead' : ''} ${compact ? 'compact' : ''}`} onClick={onClick}>
    <img src={portraitFor(player.hero.id)} alt={player.hero.name} /><span className="hero-copy"><b>{player.hero.name}</b><em>{player.isHuman || player.faceUp ? identityTone[player.identity] : '身份未知'}</em><label><span style={{ width: `${Math.max(0, player.hp / player.maxHp) * 100}%` }} /></label><small>{player.hp} / {player.maxHp} 体力</small>{equipped.length > 0 && <span className="status-cards" aria-label="装备区">{equipped.map(card => <span className="status-card" key={card!.id} title={card!.description}><img src={cardArtFor(card!.name)} alt="" /><b>{card!.label}</b></span>)}</span>}{player.judgment.length > 0 && <span className="status-cards judgments" aria-label="判定区">{player.judgment.map(card => <span className="status-card" key={card.id} title={card.description}><img src={cardArtFor(card.name)} alt="" /><b>{card.label}</b></span>)}</span>}{player.marks.chained ? <i className="chain-strip">铁索连环</i> : null}</span>
  </button>
}

function Setup({ onStart }: { onStart: (heroId: string, identity: Identity, sound: boolean) => void }) {
  const [heroId, setHeroId] = useState('liubei'); const [identity, setIdentity] = useState<Identity>('lord'); const [sound, setSound] = useState(true)
  const hero = heroes.find(h => h.id === heroId)!
  return <main className="setup-screen"><div className="setup-ornament">赤 壁 · 牌 局</div><section className="setup-panel"><div className="brand-mark">汉</div><p className="eyebrow">SANGUOSHA · SOLO ARENA</p><h1>三国杀</h1><p className="subtitle">烽火连天，谁主沉浮</p><div className="divider"><span>✦</span></div><div className="setup-grid"><div><h2>选择武将</h2><div className="hero-grid">{heroes.map(h => <button key={h.id} className={`hero-choice ${heroId === h.id ? 'picked' : ''}`} onClick={() => setHeroId(h.id)}><img src={portraitFor(h.id)} alt={h.name} /><span>{h.name}</span><small>{h.title}</small></button>)}</div></div><div className="loadout"><h2>身份抉择</h2><div className="identity-list">{(['lord', 'loyalist', 'rebel', 'spy'] as Identity[]).map(id => <button key={id} className={identity === id ? 'picked' : ''} onClick={() => setIdentity(id)}><b>{identityLabels[id]}</b><span>{id === 'lord' ? '统领全局，保护主公阵营' : id === 'loyalist' ? '辅佐主公，清剿反贼' : id === 'rebel' ? '推翻主公，席卷天下' : '伺机而动，笑到最后'}</span></button>)}</div><div className="selected-hero"><img src={portraitFor(hero.id)} alt="" /><div><b>{hero.name} · {hero.title}</b><p>{hero.skills[0].name}：{hero.skills[0].description}</p></div></div></div></div><div className="setup-footer"><button className="quiet-btn" onClick={() => setSound(!sound)}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />} 音效 {sound ? '开启' : '关闭'}</button><button className="primary-btn" onClick={() => onStart(heroId, identity, sound)}>开始对局 <ChevronRight size={18} /></button></div></section><p className="setup-note">单机身份局 · 4 人混战 · 原创演绎</p></main>
}


export function BattleScreen({ initial, onRestart }: { initial: GameState; onRestart: () => void }) {
  const [state, setState] = useState(initial)
  const [logOpen, setLogOpen] = useState(false)
  const [selected, setSelected] = useState<string>()
  const [targeting, setTargeting] = useState<string[]>([])
  const [guanxingOrder, setGuanxingOrder] = useState<string[]>([])
  const [skillMode, setSkillMode] = useState<string>()
  const [displayFx, setDisplayFx] = useState<GameEvent | undefined>(initial.animationEvents[initial.animationEvents.length - 1])
  const fxQueue = useRef<GameEvent[]>([])
  const fxSeen = useRef(new Set<number>(initial.animationEvents.map(event => event.id)))
  const fxTimer = useRef<number>()
  const announcedEvents = useRef<Set<number>>(new Set(initial.animationEvents.slice(0, -1).map(event => event.id)))
  const human = state.players[0]
  const selectedCard = human.hand.find(card => card.id === selected)
  const canTarget = selectedCard ? legalTargets(state, selectedCard, human.id) : skillMode === 'spear' ? legalTargets(state, { id: 'virtual-spear-ui', name: 'sha', suit: 'spade', rank: 1, type: 'basic', label: '杀', description: '' }, human.id) : []
  const latestFx = displayFx
  const pendingType = state.pendingAction?.responseType
  const dying = state.players.find(player => player.id === state.pendingAction?.rescueTargetId)
  const responseText = pendingType === 'shan'
    ? state.pendingAction?.continuation ? '【万箭齐发】来袭：请打出【闪】响应' : `【杀】来袭：还需 ${state.pendingAction!.requiredResponses - state.pendingAction!.responses} 张【闪】`
    : pendingType === 'sha'
      ? state.pendingAction?.continuation ? `${state.pendingAction.continuation.kind === 'barbarian' ? '【南蛮入侵】' : '【万箭齐发】'}来袭：请打出【${state.pendingAction.continuation.kind === 'barbarian' ? '杀' : '闪'}】响应` : `【决斗】来袭：还需 ${(state.pendingAction?.requiredResponses ?? 1) - (state.pendingAction?.responses ?? 0)} 张【杀】响应`
      : pendingType === 'peach'
        ? `${dying?.hero.name ?? '角色'} 濒死 · ${dying?.hp ?? 0} 点体力 · 还需回复 ${Math.max(0, 1 - (dying?.hp ?? 0))} 点 · ${dying?.id === human.id ? '【桃】或【酒】' : '【桃】'}`
        : pendingType === 'nullify'
          ? `锦囊【${state.pendingAction?.card ? cardName(state.pendingAction.card.name) : '未知'}】生效前，可使用【无懈可击】`
          : ''
  const fxActor = latestFx?.actorId ? state.players.find(player => player.id === latestFx.actorId) : undefined
  const fxTargets = latestFx?.targetIds?.length
    ? latestFx.targetIds.map(id => state.players.find(player => player.id === id)).filter(Boolean) as PlayerState[]
    : latestFx?.targetId ? [state.players.find(player => player.id === latestFx.targetId)].filter(Boolean) as PlayerState[] : []
  const fxText = latestFx?.kind === 'card'
    ? `${fxActor?.hero.name ?? '有人'} → ${fxTargets.length && !(fxTargets.length === 1 && fxTargets[0].id === fxActor?.id) ? fxTargets.map(target => target.hero.name).join('、') : '自身'} · 【${latestFx.cardName ? cardName(latestFx.cardName) : '出牌'}】`
    : latestFx?.kind === 'response' ? `${fxActor?.hero.name ?? '有人'} 响应 · 【${latestFx.cardName ? cardName(latestFx.cardName) : '响应'}】`
      : latestFx?.kind === 'damage' ? `${fxActor?.hero.name ?? ''} ⚔ ${fxTargets[0]?.hero.name ?? ''}${latestFx.cardName ? ` · 【${cardName(latestFx.cardName)}】` : ''}`
        : latestFx?.kind === 'heal' ? `${fxTargets[0]?.hero.name ?? ''} 回复体力`
          : latestFx?.kind === 'skill' ? `${fxActor?.hero.name ?? ''}${fxTargets.length ? ` → ${fxTargets.map(target => target.hero.name).join('、')}` : ''} 发动${latestFx.cardName ? `【${cardName(latestFx.cardName)}】` : '技能'}`
            : latestFx?.kind === 'death' ? '阵亡' : latestFx?.kind === 'draw' ? '判定' : ''
  const fxTargetIds = new Set(latestFx?.targetIds ?? (latestFx?.targetId ? [latestFx.targetId] : []))
  useEffect(() => {
    const fresh = state.animationEvents.filter(event => !fxSeen.current.has(event.id))
    if (!fresh.length) return
    fresh.forEach(event => { fxSeen.current.add(event.id); fxQueue.current.push(event) })
    const pump = () => {
      if (fxTimer.current || !fxQueue.current.length) return
      setDisplayFx(fxQueue.current.shift())
      fxTimer.current = window.setTimeout(() => { fxTimer.current = undefined; pump() }, 850)
    }
    pump()
  }, [state.animationEvents])
  useEffect(() => () => { if (fxTimer.current) window.clearTimeout(fxTimer.current) }, [])
  const isTargetable = (player: PlayerState) => {
    if (!player.alive) return false
    if (player.id === human.id) return Boolean(selectedCard?.name === 'tao' && player.hp < player.maxHp)
    if (skillMode === 'rende') return true
    if (skillMode === 'lijian') return player.gender === 'male'
    if (skillMode === 'spear') return targeting.length === 2 && canTarget.includes(player.id)
    return Boolean(selectedCard && canTarget.includes(player.id))
  }
  useEffect(() => {
    const actor = state.players[state.currentPlayer]
    if (actor && !actor.isHuman && !state.winner && !state.pendingAction) {
      const timer = window.setTimeout(() => setState(runAiTurn(state)), 3000)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [state.currentPlayer, state.round, state.events, state.winner, state.pendingAction])
  useEffect(() => {
    setAudioEnabled(state.soundOn)
    if (!state.soundOn) return
    const fresh = state.animationEvents.filter(event => !announcedEvents.current.has(event.id))
    fresh.forEach(event => {
      announcedEvents.current.add(event.id)
      if (event.kind === 'damage') ping('hit')
      else if (event.kind === 'draw') ping('draw')
      else if (event.kind === 'heal') ping('heal')
      else if (event.kind === 'skill') ping('skill')
      else if (event.kind === 'card') ping('card')
      else if (event.kind === 'death') ping('death')
      else if (event.kind === 'response') ping('dodge')
      else if (event.kind === 'turn') ping(event.outcome ? 'victory' : 'turn')
      speak(event, event.actorId ? state.players.find(player => player.id === event.actorId)?.hero.id : undefined)
    })
  }, [state.events, state.soundOn, state.players])
  const chooseCard = (card: Card) => {
    if (state.pendingAction?.selectionKind === 'targetCard' || state.pendingAction?.selectionKind === 'iceDiscard' || state.pendingAction?.selectionKind === 'fireDiscard' || state.pendingAction?.selectionKind === 'doubleSwordChoice') {
      if (state.pendingAction.choices?.some(choice => choice.id === card.id)) setState(confirmTargetCard(state, card.id))
      return
    }
    if (state.pendingAction?.selectionKind === 'iceChoice') return
    if (state.pendingAction?.skillId === 'discard') {
      const current = state.pendingAction.discardSelectedIds ?? []
      const next = current.includes(card.id) ? current.filter(id => id !== card.id) : [...current, card.id]
      setState(selectDiscard(state, next))
      return
    }
    if (pendingType === 'shan') { if (card.name === 'shan' || (human.hero.id === 'zhaoyun' && card.name === 'sha')) setState(respondToAction(state, card.id)); return }
    if (pendingType === 'sha') { if (card.name === 'sha' || (human.hero.id === 'zhaoyun' && card.name === 'shan')) setState(respondToAction(state, card.id)); return }
    if (pendingType === 'peach') { if (canRespondWithPeach(state, card, human.id)) setState(respondToAction(state, card.id)); return }
    if (pendingType === 'nullify') { if (card.name === 'nullify') setState(respondToAction(state, card.id)); return }
    if (state.currentPlayer !== 0 || state.phase !== 'play') return
    if (skillMode === 'spear') {
      const next = targeting.includes(card.id) ? targeting.filter(id => id !== card.id) : targeting.length < 2 ? [...targeting, card.id] : targeting
      setTargeting(next); return
    }
    if (skillMode === 'wusheng') {
      if (!((card.suit === 'heart' || card.suit === 'diamond') && !['tao', 'jiu'].includes(card.name))) return
      const verdict = canPlayCard(state, card)
      if (!verdict.ok) return
      setSelected(card.id); setTargeting([]); return
    }
    if (skillMode === 'lijian') { setSelected(card.id); return }
    if (skillMode === 'rende') { const next = targeting.includes(card.id) ? targeting.filter(id => id !== card.id) : [...targeting, card.id]; setTargeting(next); setSelected(next[next.length - 1]); return }
    if (skillMode === 'zhiheng') { setTargeting(current => current.includes(card.id) ? current.filter(id => id !== card.id) : [...current, card.id]); return }
    const verdict = canPlayCard(state, card)
    if (!verdict.ok) return
    if (card.type === 'equipment' || card.name === 'lightning' || (['tao', 'jiu', 'exnihilo', 'barbarian', 'arrows', 'peachGarden'].includes(card.name) && legalTargets(state, card, human.id).length === 0)) { setState(playCard(state, card.id)); return }
    setSelected(card.id)
    setTargeting([])
  }
  const chooseTarget = (id: string) => {
    if (skillMode === 'rende') { const cards = targeting.length ? targeting : selected ? [selected] : []; if (!cards.length || id === human.id) return; setState(activateSkill(state, 'rende', [id], cards)); setSkillMode(undefined); setSelected(undefined); setTargeting([]); return }
    if (skillMode === 'lijian') { if (!selected || state.players.find(player => player.id === selected)?.id === id || state.players.find(player => player.id === id)?.gender !== 'male') return; const nextTargets = targeting.includes(id) ? targeting.filter(targetId => targetId !== id) : [...targeting, id]; if (nextTargets.length === 2) { setState(activateSkill(state, 'lijian', nextTargets, [selected])); setSkillMode(undefined); setTargeting([]) } else setTargeting(nextTargets); return }
    if (skillMode === 'spear') {
      if (targeting.length !== 2) return
      const verdict = canUseSpear(state, human.id, targeting); if (!verdict.ok || !canTarget.includes(id)) return
      setState(useSpear(state, targeting, [id])); setTargeting([]); setSkillMode(undefined); return
    }
    if (!selectedCard || !canTarget.includes(id)) return
    if (selectedCard.name === 'ironChain') {
      const nextTargets = targeting.includes(id) ? targeting.filter(targetId => targetId !== id) : [...targeting, id]
      if (nextTargets.length === 2) { setState(playCard(state, selectedCard.id, nextTargets)); setSelected(undefined); setTargeting([]) }
      else setTargeting(nextTargets)
      return
    }
    setState(playCard(state, selectedCard.id, [id])); setSelected(undefined); setTargeting([]); setSkillMode(undefined)
  }
  const cardBlockedReason = (card: Card) => {
    if (state.winner) return '对局已经结束'
    if (pendingType === 'shan') return card.name === 'shan' || (human.hero.id === 'zhaoyun' && card.name === 'sha') ? undefined : state.pendingAction?.continuation?.kind === 'arrows' ? '万箭齐发需要使用【闪】响应' : '当前需要使用【闪】响应'
    if (pendingType === 'sha') return card.name === 'sha' || (human.hero.id === 'zhaoyun' && card.name === 'shan') ? undefined : state.pendingAction?.continuation?.kind === 'barbarian' ? '南蛮入侵需要使用【杀】响应' : '决斗中需要使用【杀】响应'
    if (pendingType === 'peach') return canRespondWithPeach(state, card, human.id) ? undefined : dying?.id === human.id ? '自救需要【桃】或【酒】' : '救援其他角色只能使用【桃】'
    if (pendingType === 'nullify') return card.name === 'nullify' ? undefined : '当前需要使用【无懈可击】响应'
    if (state.pendingAction?.selectionKind) return state.pendingAction.choices?.some(choice => choice.id === card.id) ? undefined : '请从弹窗中选择目标牌'
    if (state.pendingAction?.skillId === 'discard') return undefined
    if (state.currentPlayer !== 0) return '等待你的回合'
    if (skillMode === 'spear') return targeting.includes(card.id) || targeting.length < 2 ? undefined : '丈八蛇矛只需两张手牌'
    if (skillMode === 'wusheng') return (card.suit === 'heart' || card.suit === 'diamond') && !['tao', 'jiu'].includes(card.name) ? undefined : '武圣需要红色牌（桃、酒除外）'
    if (skillMode === 'lijian') return !selected || card.id === selected ? undefined : '先选择离间弃置牌，再选择目标'
    if (skillMode === 'zhiheng' || skillMode === 'rende') return undefined
    const verdict = canPlayCard(state, card)
    return verdict.ok ? undefined : verdict.reason
  }
  const finish = () => { if (state.pendingAction?.skillId === 'discard') { setState(confirmDiscard(state)); return } if (skillMode === 'spear' || skillMode === 'wusheng') { setState(cancelSkill(state, skillMode)); setSelected(undefined); setTargeting([]); setSkillMode(undefined); return } if (skillMode === 'zhiheng' && targeting.length) { setState(activateSkill(state, 'zhiheng', [], targeting)); setSelected(undefined); setTargeting([]); setSkillMode(undefined); return } setSelected(undefined); setTargeting([]); setSkillMode(undefined); if (state.pendingAction?.stage === 'select') { setState(cancelSelection(state)); setGuanxingOrder([]) } else setState(state.pendingAction ? passResponse(state) : endTurn(state, true)) }
  const chooseGuanxing = (cardId: string) => setGuanxingOrder(order => order.includes(cardId) ? order.filter(id => id !== cardId) : order.length < 2 ? [...order, cardId] : order)
  const useSkill = (skillId: string) => { if (['paoxiao', 'longdan', 'wushuang', 'guanxing', 'biyue'].includes(skillId)) return; if (skillId === 'wusheng') { setState(activateSkill(state, skillId)); setSkillMode('wusheng'); setSelected(undefined); setTargeting([]); return }; if (skillId === 'spear') { setSkillMode('spear'); setSelected(undefined); setTargeting([]); return }; if (['rende', 'zhiheng', 'lijian'].includes(skillId)) { setSkillMode(skillId); setSelected(undefined); setTargeting([]); return }; setState(activateSkill(state, skillId)) }
  const aiPlayers = state.players.slice(1)
  return <main className="battle-screen">
    <header className="topbar"><div className="mini-brand"><span>汉</span><div><b>赤壁</b><small>身份局 · 第 {state.round} 轮</small></div></div><div className="turn-ribbon"><Sparkles size={15} /> {state.winner ? '对局结束' : state.pendingAction?.skillId === 'discard' ? '弃牌阶段' : state.pendingAction?.selectionKind === 'targetCard' ? '选择目标牌' : state.pendingAction?.selectionKind === 'iceDiscard' ? '寒冰剑结算' : state.pendingAction?.selectionKind === 'fireDiscard' ? '火攻选牌' : state.pendingAction?.skillId === 'guanxing' ? '观星调整' : state.pendingAction ? pendingType === 'nullify' ? '请响应【无懈可击】' : pendingType === 'peach' ? '濒死响应' : pendingType === 'sha' ? '请响应【杀】' : '请响应【闪】' : state.currentPlayer === 0 ? '你的回合' : `${state.players[state.currentPlayer].hero.name} 的回合`}</div><div className="top-actions"><button title="战斗记录" onClick={() => setLogOpen(true)}><History size={18} /></button><button title="音效" onClick={() => { const next = !state.soundOn; setAudioEnabled(next); setState({ ...state, soundOn: next }) }}>{state.soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button title="重新开始" onClick={onRestart}><RotateCcw size={18} /></button></div></header>
    <div className="battle-layout"><aside className="opponents"><div className="section-label">敌我态势 <span>{state.players.filter(player => player.alive).length} / 4 存活</span></div>{aiPlayers.map((player, index) => <HeroBadge key={player.id} player={player} active={state.currentPlayer === index + 1} targetable={isTargetable(player)} compact onClick={() => chooseTarget(player.id)} />)}<div className="deck-stack"><img src={assets.cardBack} alt="牌堆" /><div><b>{state.deck.length}</b><small>牌堆余量</small></div></div></aside>
      <section className="table-area"><div className="table-glow" /><div className="event-banner">{state.events[0]?.text}</div><div className="battle-ring"><div className="ring-line" /><div className="center-focus"><img src={portraitLargeFor(state.players[state.currentPlayer].hero.id)} alt={state.players[state.currentPlayer].hero.name} /><b>{state.players[state.currentPlayer].hero.name}</b><small>{state.players[state.currentPlayer].hero.title}</small></div>{aiPlayers.map(player => <div key={player.id} className={`ring-seat seat-${player.id} ${state.currentPlayer === state.players.indexOf(player) ? 'turn' : ''} ${fxTargetIds.has(player.id) ? 'fx-target' : ''}`}><HeroBadge player={player} active={state.currentPlayer === state.players.indexOf(player)} targetable={isTargetable(player)} onClick={() => chooseTarget(player.id)} /></div>)}<div className="table-card-count"><span>弃牌堆</span><b>{state.discard.length}</b></div><div className={`action-fx ${latestFx?.kind ?? ''}`} key={latestFx?.id}><span className="fx-route">{fxText}</span>{latestFx?.kind === 'card' && <><img className="fx-card-image" src={cardArtFor(latestFx.cardName ?? 'sha')} alt="" /><span className="fx-card-glyph">{latestFx.cardName ? cardName(latestFx.cardName) : '出牌'}</span></>}</div></div>
        <div className="player-zone"><HeroBadge player={human} active={state.currentPlayer === 0} targetable={isTargetable(human)} onClick={() => chooseTarget(human.id)} /><div className="hand-area"><div className="response-prompt">{state.pendingAction?.skillId === 'discard' ? <><Shield size={15} /> 弃牌阶段：还需 {(state.pendingAction.discardRequired ?? 0) - (state.pendingAction.discardSelectedIds?.length ?? 0)} 张牌</> : responseText ? <><Shield size={15} /> {responseText}</> : null}</div><div className="skill-bar">{[...human.hero.skills, ...(human.equipment.weapon?.name === 'spear' ? [{ id: 'spear', name: '丈八蛇矛', description: '选择两张手牌当作【杀】使用。' }] : [])].map(skill => { const passive = ['paoxiao', 'longdan', 'wushuang', 'guanxing', 'biyue'].includes(skill.id); return <button key={skill.id} title={skill.description} className={`skill-btn ${skillMode === skill.id ? 'armed' : ''} ${passive ? 'passive' : ''}`} onClick={() => useSkill(skill.id)} disabled={passive || Boolean(human.marks.skipPlay) || state.currentPlayer !== 0 || Boolean(state.pendingAction) || Boolean(state.skillCooldowns[`${human.id}:${skill.id}:${state.round}`])}><Sparkles size={13} /> {skill.name}</button> })}</div><div className="hand-head"><span>手牌 · {human.hand.length}</span><small>{state.pendingAction?.skillId === 'discard' ? `已选择 ${state.pendingAction.discardSelectedIds?.length ?? 0}/${state.pendingAction.discardRequired ?? 0} 张牌` : state.pendingAction ? responseText : skillMode === 'wusheng' ? `${selectedCard ? `已选【${selectedCard.label}】` : '选择一张红色牌'}，再选择目标` : skillMode === 'spear' ? `${targeting.length}/2 张手牌已选，再选择一名目标` : skillMode === 'rende' ? `${targeting.length} 张牌已选，请选择一名角色` : skillMode === 'zhiheng' ? '选择要弃置的牌' : skillMode === 'lijian' ? `${selected ? '已选弃置牌，' : '先选一张弃置牌，'}已选择 ${targeting.length}/2 名男性角色` : selectedCard ? `已选择【${selectedCard.label}】，请选择目标` : '点击手牌出牌'}</small></div><div className="hand-scroll">{human.hand.map(card => { const blockedReason = cardBlockedReason(card); return <CardTile key={card.id} card={card} selected={selected === card.id || ((skillMode === 'zhiheng' || skillMode === 'rende') && targeting.includes(card.id)) || Boolean(state.pendingAction?.skillId === 'discard' && state.pendingAction.discardSelectedIds?.includes(card.id))} onClick={() => chooseCard(card)} disabled={Boolean(blockedReason)} blockedReason={blockedReason} /> })}</div><div className="action-row"><button className="secondary-btn" onClick={() => { if (state.pendingAction?.skillId === 'discard') { setState(cancelDiscard(state)); return }; setState(cancelSkill(state, 'wusheng')); setSelected(undefined); setTargeting([]); setSkillMode(undefined) }} disabled={!selected && !skillMode && state.pendingAction?.skillId !== 'discard'}>取消选择 <X size={15} /></button><button className="primary-btn" onClick={finish} disabled={Boolean(state.winner) || (!state.pendingAction && state.currentPlayer !== 0) || (skillMode === 'zhiheng' && !targeting.length) || (state.pendingAction?.skillId === 'discard' && (state.pendingAction.discardSelectedIds?.length ?? 0) !== (state.pendingAction.discardRequired ?? 0))}>{state.pendingAction?.skillId === 'discard' ? '确认弃牌' : state.pendingAction ? pendingType === 'nullify' ? '不使用【无懈可击】' : pendingType === 'peach' ? '放弃救治' : pendingType === 'sha' ? '不出【杀】' : '不出【闪】' : skillMode === 'zhiheng' ? `确认制衡（${targeting.length}）` : '结束回合'} <ChevronRight size={17} /></button></div></div></div>
      </section><aside className={`battle-log ${logOpen ? 'open' : ''}`}><div className="log-head"><b>战斗记录</b><button onClick={() => setLogOpen(false)}><X size={17} /></button></div>{state.events.slice(0, 15).map(event => <p key={event.id} className={event.tone}><i />{event.text}</p>)}</aside></div>
    {state.pendingAction?.skillId === 'guanxing' && <div className="selection-overlay"><div className="selection-card"><p className="eyebrow">观星 · TOP TWO</p><h2>调整牌堆顶顺序</h2><p>按想要的牌堆顶顺序依次点击两张牌。</p><div className="selection-cards">{state.pendingAction.choices?.map((card, index) => <CardTile key={card.id} card={card} selected={guanxingOrder.includes(card.id)} onClick={() => chooseGuanxing(card.id)} blockedReason={guanxingOrder.includes(card.id) ? `第 ${guanxingOrder.indexOf(card.id) + 1} 张` : undefined} />)}</div><button className="primary-btn" disabled={guanxingOrder.length !== 2} onClick={() => { setState(confirmGuanxing(state, guanxingOrder)); setGuanxingOrder([]) }}>确认顺序 <ChevronRight size={17} /></button></div></div>}
    {state.pendingAction?.selectionKind === 'iceChoice' && <div className="selection-overlay"><div className="selection-card"><p className="eyebrow">ICE SWORD · CHOICE</p><h2>寒冰剑命中</h2><p>你可以让【杀】正常造成伤害，或弃置目标区域中的两张牌。</p><div className="selection-actions"><button className="primary-btn" onClick={() => setState(resolveIceChoice(state, false))}>造成伤害 <ChevronRight size={17} /></button><button className="secondary-btn" onClick={() => setState(resolveIceChoice(state, true))}>弃置两张牌 <Shield size={15} /></button></div><button className="quiet-btn" onClick={() => setState(cancelSelection(state))}>取消选择 <X size={15} /></button></div></div>}
    {state.pendingAction?.selectionKind === 'doubleSwordChoice' && <div className="selection-overlay"><div className="selection-card"><p className="eyebrow">DOUBLE SWORD · CHOICE</p><h2>雌雄双股剑</h2><p>请选择一张手牌弃置，或承受这张【杀】额外的 1 点伤害。</p><div className="selection-cards">{state.pendingAction.choices?.map(card => <CardTile key={card.id} card={card} selected={false} onClick={() => chooseCard(card)} />)}</div><div className="selection-actions"><button className="secondary-btn" onClick={() => setState(cancelSelection(state))}>承受额外伤害 <Shield size={15} /></button></div></div></div>}
    {state.pendingAction?.selectionKind && state.pendingAction.selectionKind !== 'iceChoice' && state.pendingAction.selectionKind !== 'doubleSwordChoice' && <div className="selection-overlay"><div className="selection-card"><p className="eyebrow">{state.pendingAction.selectionKind === 'iceDiscard' ? 'ICE SWORD' : state.pendingAction.selectionKind === 'fireDiscard' ? 'FIRE ATTACK' : 'CARD TARGET'}</p><h2>{state.pendingAction.selectionKind === 'iceDiscard' ? '选择两张牌弃置' : state.pendingAction.selectionKind === 'fireDiscard' ? '选择同花色牌弃置' : state.pendingAction.card?.name === 'snatch' ? '选择要获得的牌' : '选择要弃置的牌'}</h2><p>{state.pendingAction.selectionKind === 'iceDiscard' ? `从 ${state.players.find(player => player.id === state.pendingAction?.selectionTargetId)?.hero.name ?? '目标'} 的区域选择两张牌。` : state.pendingAction.selectionKind === 'fireDiscard' ? `目标展示了【${state.pendingAction.revealedCard ? cardName(state.pendingAction.revealedCard.name) : '一张牌'}】，选择一张相同花色的手牌弃置。` : '点击目标区域中的一张牌完成结算。'}</p><div className="selection-cards">{state.pendingAction.choices?.map(card => <CardTile key={card.id} card={card} selected={Boolean(state.pendingAction?.selectionSelectedIds?.includes(card.id))} onClick={() => chooseCard(card)} />)}</div><button className="secondary-btn" onClick={() => { setState(cancelSelection(state)) }}>{state.pendingAction.selectionKind === 'fireDiscard' ? '不弃置，结束火攻' : '取消出牌'} <X size={15} /></button></div></div>}
    {state.winner && <div className="result-overlay"><div className="result-card"><div className="result-seal">✦</div><p className="eyebrow">BATTLE RESULT</p><h2>{state.winner === 'lord' ? '主公阵营获胜' : state.winner === 'rebel' ? '反贼席卷天下' : state.winner === 'spy' ? '内奸笑到最后' : '四方俱灭，战局平局'}</h2><p>烽烟暂歇，新的篇章即将开启。</p><button className="primary-btn" onClick={onRestart}>再战一局 <RotateCcw size={17} /></button></div></div>}
  </main>
}

export default function App() { const [game, setGame] = useState<GameState>(); const [config, setConfig] = useState<{ heroId: string; identity: Identity; sound: boolean }>(); const hero = useMemo(() => heroes.find(h => h.id === config?.heroId) ?? heroes[0], [config]); const start = (heroId: string, identity: Identity, sound: boolean) => { setAudioEnabled(sound); if (sound) initAudio(); setConfig({ heroId, identity, sound }); setGame(createGame(heroes.find(h => h.id === heroId)!, identity, sound, true)) }; return game ? <BattleScreen initial={game} onRestart={() => { setAudioEnabled(false); setGame(undefined); setConfig(undefined) }} /> : <Setup onStart={start} /> }

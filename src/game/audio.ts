import catalog from './voice-lines.json'
import type { GameEvent } from './types'

type VoiceProfile = { lines: Record<string, string[]> }
export type SoundEffect = 'card' | 'hit' | 'heal' | 'skill' | 'turn' | 'death' | 'draw' | 'dodge' | 'victory'
type Voice = { file: string; fallback: string; priority: number; queuedAt: number }
let context: AudioContext | undefined
let master: GainNode | undefined
let enabled = true
let current: { audio: HTMLAudioElement; priority: number; finish: () => void } | undefined
let waiting: Voice[] = []
const seen = new Set<number>()
const variations = new Map<string, number>()

export function initAudio() {
  try {
    context ??= new AudioContext()
    if (!master) { master = context.createGain(); master.connect(context.destination) }
    master.gain.setValueAtTime(enabled ? 0.4 : 0, context.currentTime)
    if (context.state === 'suspended') void context.resume().catch(() => undefined)
  } catch { /* Audio is optional when the browser has no audio device. */ }
}

export function stopAudio() {
  waiting = []
  current?.finish()
  seen.clear()
  variations.clear()
}

export function setAudioEnabled(value: boolean) {
  enabled = value
  master?.gain.setValueAtTime(value ? 0.4 : 0, context?.currentTime ?? 0)
  if (!value) stopAudio()
}

export function ping(type: SoundEffect) {
  if (!enabled || !context || !master || context.state !== 'running') return
  const ctx = context, bus = master, start = ctx.currentTime
  const tone = (frequency: number, end: number, duration: number, volume: number, delay = 0, wave: OscillatorType = 'sine') => {
    const oscillator = ctx.createOscillator(), gain = ctx.createGain(), t = start + delay
    oscillator.type = wave
    oscillator.frequency.setValueAtTime(frequency, t)
    oscillator.frequency.exponentialRampToValueAtTime(end, t + duration)
    gain.gain.setValueAtTime(0.001, t)
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    oscillator.connect(gain); gain.connect(bus)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    oscillator.start(t); oscillator.stop(t + duration + 0.01)
  }
  const rustle = (duration: number, frequency: number, volume: number) => {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
    source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.6
    gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    source.connect(filter); filter.connect(gain); gain.connect(bus)
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect() }
    source.start(start)
  }
  if (type === 'card' || type === 'draw') { rustle(0.22, 2600, 0.45); tone(320, 130, 0.13, 0.12) }
  else if (type === 'hit') { rustle(0.3, 1100, 0.65); tone(155, 48, 0.32, 0.55); tone(940, 270, 0.16, 0.12, 0, 'triangle') }
  else if (type === 'dodge') { rustle(0.28, 4300, 0.35); tone(700, 1700, 0.22, 0.12) }
  else if (type === 'heal') [523, 659, 784].forEach((f, i) => tone(f, f * 1.01, 0.5, 0.19, i * 0.09))
  else if (type === 'skill') { tone(98, 196, 0.55, 0.24); [392, 587, 784].forEach((f, i) => tone(f, f, 0.5, 0.15, i * 0.08)) }
  else if (type === 'death') { tone(110, 38, 0.9, 0.35); rustle(0.6, 500, 0.3) }
  else if (type === 'victory') [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.75, 0.22, i * 0.13))
  else tone(440, 330, 0.25, 0.15)
}

export function voiceChoices(event: GameEvent, heroId?: string): { files: string[]; priority: number; fallback: string } | undefined {
  const file = (name: string) => `/audio/voices/${name}.mp3`
  const hero = (catalog.heroes as Record<string, VoiceProfile>)[heroId ?? '']
  const heroFiles = (cue: string) => hero?.lines[cue]?.map((_, i) => file(`${heroId}-${cue}-${i}`)) ?? []
  if (event.outcome) return { files: [file(`system-${event.outcome}`)], priority: 100, fallback: 'victory' }
  if (event.kind === 'death') return { files: heroFiles('death'), priority: 90, fallback: 'death' }
  if (event.voiceCue === 'lowhp') return { files: heroFiles('lowhp'), priority: 85, fallback: 'lowhp' }
  if (event.kind === 'damage' && event.amount) return { files: heroFiles('hit'), priority: 30, fallback: 'hit' }
  if (event.kind === 'skill' && event.skillId) return { files: heroFiles(event.skillId === 'biyue' ? 'biyue' : 'skill'), priority: 65, fallback: hero ? `${heroId}-skill` : 'skill' }
  if (event.presentation === 'play' || event.presentation === 'response') {
    if (!event.cardName) return undefined
    if (heroId === 'diaochan') {
      const expressive = heroFiles('card')
      if (expressive.length) return { files: expressive, priority: 60, fallback: 'diaochan-skill' }
    }
    const named = file(`cards-${event.cardName}`)
    const expressive = event.cardName === 'sha' ? heroFiles('attack') : event.cardName === 'shan' ? heroFiles('dodge') : []
    return { files: [...expressive, named], priority: 60, fallback: event.cardName === 'shan' ? 'dodge' : event.cardName === 'sha' ? 'attack' : 'card' }
  }
  return undefined
}

function playNext() {
  if (!enabled || current) return
  const time = Date.now()
  waiting = waiting.filter(voice => time - voice.queuedAt < (voice.priority >= 85 ? 12000 : 4500))
  const voice = waiting.shift()
  if (!voice) return
  const audio = new Audio(voice.file)
  audio.volume = 0.72
  let done = false, fallbackUsed = false
  const finish = () => {
    if (done) return
    done = true
    clearTimeout(watchdog)
    audio.onended = null; audio.onerror = null
    audio.pause()
    if (current?.audio === audio) current = undefined
    playNext()
  }
  const fallback = () => {
    if (done) return
    if (fallbackUsed) { finish(); return }
    fallbackUsed = true
    audio.src = `/audio/${voice.fallback}.mp3`
    void audio.play().catch(finish)
  }
  const watchdog = setTimeout(finish, 8000)
  current = { audio, priority: voice.priority, finish }
  audio.onended = finish; audio.onerror = fallback
  void audio.play().catch(error => { if (error?.name === 'NotAllowedError') finish(); else fallback() })
}

export function speak(event: GameEvent, heroId?: string) {
  if (!enabled || seen.has(event.id)) return
  seen.add(event.id)
  if (seen.size > 512) seen.delete(seen.values().next().value!)
  const choice = voiceChoices(event, heroId)
  if (!choice) return
  const key = choice.files.join('|') || choice.fallback
  const index = variations.get(key) ?? 0
  variations.set(key, index + 1)
  const file = choice.files.length ? choice.files[index % choice.files.length] : `/audio/${choice.fallback}.mp3`
  if (choice.priority >= 85) waiting = waiting.filter(voice => voice.priority >= choice.priority)
  waiting.push({ file, fallback: choice.fallback, priority: choice.priority, queuedAt: Date.now() })
  waiting.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt)
  waiting = waiting.slice(0, 4)
  if (current && choice.priority >= 90 && choice.priority > current.priority) current.finish()
  else playNext()
}

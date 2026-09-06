import { readFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = promisify(execFile)
const catalog = JSON.parse(await readFile(new URL('../src/game/voice-lines.json', import.meta.url)))
const output = new URL('../public/audio/voices/', import.meta.url)
await mkdir(output, { recursive: true })
const scratch = await mkdtemp(join(tmpdir(), 'sanguosha-voices-'))
const jobs = []
for (const [hero, profile] of Object.entries(catalog.heroes)) {
  for (const [cue, lines] of Object.entries(profile.lines)) {
    lines.forEach((text, index) => jobs.push({ file: `${hero}-${cue}-${index}`, text, ...profile }))
  }
}
for (const section of ['cards', 'system']) {
  for (const [name, text] of Object.entries(catalog[section])) {
    jobs.push({ file: `${section}-${name}`, text, voice: 'zh-CN-YunyangNeural', pitch: '-4Hz', rate: '+8%' })
  }
}
let completed = 0
const failed = []
try {
  const pending = [...jobs]
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let job; (job = pending.shift());) {
      const destination = new URL(`${job.file}.mp3`, output)
      if (!process.argv.includes('--force') && await stat(destination).then(s => s.size > 1000).catch(() => false)) { completed++; continue }
      const raw = join(scratch, `${job.file}.mp3`)
      let lastError
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await run('edge-tts', ['--voice', job.voice, `--pitch=${job.pitch}`, `--rate=${job.rate}`, '--text', job.text, '--write-media', raw], { timeout: 45000 })
          await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', 'highpass=f=75,lowpass=f=10500,loudnorm=I=-18:TP=-2:LRA=8', '-ar', '48000', '-b:a', '96k', destination.pathname], { timeout: 15000 })
          lastError = undefined
          completed++
          if (completed % 20 === 0) console.log(`Voices: ${completed}/${jobs.length}`)
          break
        } catch (error) { lastError = error.message }
      }
      if (lastError) failed.push({ file: job.file, error: lastError })
    }
  }))
} finally { await rm(scratch, { recursive: true, force: true }) }
console.log(JSON.stringify({ completed, total: jobs.length, failed }, null, 2))
if (failed.length) process.exitCode = 1

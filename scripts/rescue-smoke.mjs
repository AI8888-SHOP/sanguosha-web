import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const baseURL = process.env.GAME_URL ?? 'http://localhost:5173'
const output = resolve('artifacts/rescue-smoke')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--no-sandbox'],
})
const errors = []
const reports = []

async function mount(page, scenario) {
  await page.goto(baseURL)
  await page.locator('.setup-screen').waitFor()
  await page.evaluate(async scenario => {
    const [{ default: React }, { default: ReactDOM }, { BattleScreen, default: App }, engine, { heroes }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'),
      import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/App.tsx'),
      import('/src/game/engine.ts'),
      import('/src/game/heroes.ts'),
    ])
    let serial = 0
    const card = (name, suit = 'heart') => ({
      id: 'smoke-' + serial++, name, suit, rank: 5,
      type: name === 'lightning' ? 'delayed' : name === 'fireAttack' ? 'trick' : 'basic',
      label: ({ tao: '桃', jiu: '酒', sha: '杀', lightning: '闪电', fireAttack: '火攻' })[name],
      description: '',
    })
    let state = engine.createGame(heroes[0], 'lord', false)
    state.players.forEach(player => { player.hand = []; player.marks = {} })
    state.deck = Array.from({ length: 20 }, () => card('sha'))
    state.discard = []; state.events = []; state.animationEvents = []; state.actionQueue = []
    if (scenario === 'chain') {
      state.players[0].hand = [card('tao'), card('tao')]
      state.players[1].hp = state.players[2].hp = 1
      state.players[1].marks.chained = state.players[2].marks.chained = 1
      state.players[1].hand = [card('sha', 'club')]
      const attack = card('fireAttack'), cost = card('sha', 'club')
      state.players[0].hand.push(attack, cost)
      state = engine.confirmTargetCard(engine.playCard(state, attack.id, ['p1']), cost.id)
    } else {
      state.players[0].hp = scenario === 'wine' ? 3 : 1
      state.players[0].hand = scenario === 'wine' ? [card('jiu'), card('sha')]
        : scenario === 'lose' ? [card('tao')] : [card('tao'), card('tao'), card('tao'), card('sha')]
      state.players[0].judgment = [card('lightning')]
      state.deck.push(card('sha', 'spade'))
      state.currentPlayer = 3
      state = engine.endTurn(state, false)
    }
    document.getElementById('root').style.display = 'none'
    const host = document.createElement('div')
    document.body.append(host)
    const root = ReactDOM.createRoot(host)
    root.render(React.createElement(BattleScreen, { initial: state, onRestart: () => root.render(React.createElement(App)) }))
  }, scenario)
  await page.locator('.response-prompt').filter({ hasText: '濒死' }).waitFor()
}

try {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    page.on('pageerror', error => errors.push(error.message))
    await mount(page, 'negative')
    assert.match(await page.locator('.response-prompt').innerText(), /还需回复 3 点/)
    assert.equal(await page.locator('.hand-scroll .card-tile:disabled').count(), 1)
    await page.screenshot({ path: resolve(output, 'negative-' + viewport.width + '.png'), fullPage: true })
    for (const remaining of [2, 1]) {
      await page.locator('.hand-scroll .card-tile').filter({ has: page.locator('strong', { hasText: /^桃$/ }) }).first().click()
      assert.match(await page.locator('.response-prompt').innerText(), new RegExp('还需回复 ' + remaining + ' 点'))
    }
    await page.locator('.hand-scroll .card-tile').filter({ has: page.locator('strong', { hasText: /^桃$/ }) }).first().click()
    assert.equal(await page.locator('.response-prompt').innerText(), '')
    assert.match(await page.locator('.player-zone .hero-copy small').innerText(), /1 \/ 4/)
    assert.equal(await page.locator('.hand-scroll .card-tile').count(), 3)

    await mount(page, 'wine')
    await page.locator('.hand-scroll .card-tile').filter({ has: page.locator('strong', { hasText: /^酒$/ }) }).click()
    assert.equal(await page.locator('.response-prompt').innerText(), '')
    assert.match(await page.locator('.player-zone .hero-copy small').innerText(), /1 \/ 4/)

    await mount(page, 'chain')
    assert.match(await page.locator('.response-prompt').innerText(), /关羽/)
    await page.locator('.hand-scroll .card-tile').first().click()
    assert.match(await page.locator('.response-prompt').innerText(), /张飞/)
    await page.locator('.hand-scroll .card-tile').first().click()
    assert.equal(await page.locator('.response-prompt').innerText(), '')
    assert.equal(await page.locator('.hero-badge.dead').count(), 0)

    await mount(page, 'lose')
    await page.locator('.hand-scroll .card-tile').first().click()
    await page.locator('.result-overlay').waitFor()
    assert.match(await page.locator('.result-overlay h2').innerText(), /反贼/)
    await page.getByRole('button', { name: /再战一局/ }).click()
    await page.locator('.setup-screen:visible').waitFor()

    await page.getByRole('button', { name: /开始对局/ }).last().click()
    await page.getByRole('button', { name: /结束回合/ }).click()
    const prompt = await page.locator('.response-prompt').innerText()
    const count = Number(prompt.match(/还需 (\d+)/)?.[1])
    assert.equal(count, 2)
    for (let i = 0; i < count; i++) await page.locator('.hand-scroll .card-tile').nth(i).click()
    assert.equal(await page.getByRole('button', { name: /确认弃牌/ }).isEnabled(), true)
    await page.screenshot({ path: resolve(output, 'discard-' + viewport.width + '.png'), fullPage: true })
    assert.equal(await page.locator('body').evaluate(body => body.scrollWidth), viewport.width)
    const brokenImages = await page.locator('img:visible').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src))
    assert.deepEqual(brokenImages, [])
    reports.push({ viewport, negativeHp: 'passed', wineRescue: 'passed', chainRescue: 'passed', lossRestart: 'passed', manualDiscard: 'passed' })
    await page.close()
  }
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ reports, errors, screenshots: output }, null, 2))
} finally {
  await browser.close()
}

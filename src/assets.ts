export const assets = {
  table: '/assets/ink-table-ai.png',
  cardBack: '/assets/card-back-gpt2.png',
  seal: '/assets/jade-seal.svg',
}

export const portraitFor = (id: string) => `/assets/thumbs/hero-${id}-gpt2.png`
export const portraitLargeFor = (id: string) => `/assets/hero-${id}-gpt2.png`
const cardArt: Record<string, string> = {
  sha: '/assets/card-sha-gpt2.webp', shan: '/assets/card-shan-gpt2.webp', tao: '/assets/card-tao-gpt2.webp', jiu: '/assets/card-jiu-gpt2.webp',
  duel: '/assets/card-duel-gpt2.webp', dismantle: '/assets/card-dismantle-gpt2.webp', snatch: '/assets/card-snatch-gpt2.webp',
  exnihilo: '/assets/card-exnihilo-gpt2.webp', barbarian: '/assets/card-barbarian-gpt2.webp', arrows: '/assets/card-arrows-gpt2.webp',
  peachGarden: '/assets/card-peach-garden-gpt2.webp', nullify: '/assets/card-nullify-gpt2.webp', ironChain: '/assets/card-iron-chain-gpt2.webp',
  fireAttack: '/assets/card-fire-attack-gpt2.webp', indulgence: '/assets/card-indulgence-gpt2.webp', supplyShortage: '/assets/card-supply-shortage-gpt2.webp',
  lightning: '/assets/card-lightning-gpt2.webp', crossbow: '/assets/card-crossbow-gpt2.webp', qinggang: '/assets/card-qinggang-gpt2.webp',
  iceSword: '/assets/card-ice-sword-gpt2.webp', gudingDao: '/assets/card-guding-dao-gpt2.webp', blade: '/assets/card-blade-gpt2.webp',
  spear: '/assets/card-spear-gpt2.webp', halberd: '/assets/card-halberd-gpt2.webp', doubleSword: '/assets/card-double-sword-gpt2.webp',
  eightDiagram: '/assets/card-eight-diagram-gpt2.webp', renwang: '/assets/card-renwang-gpt2.webp', vine: '/assets/card-vine-gpt2.webp',
  silverLion: '/assets/card-silver-lion-gpt2.webp', offensiveHorse: '/assets/card-horse-offensive-gpt2.webp', defensiveHorse: '/assets/card-horse-defensive-gpt2.webp',
  chitu: '/assets/card-chitu-gpt2.webp', dayuan: '/assets/card-dayuan-gpt2.webp', zixing: '/assets/card-zixing-gpt2.webp',
  jueying: '/assets/card-jueying-gpt2.webp', dilu: '/assets/card-dilu-gpt2.webp', zhuahuangfeidian: '/assets/card-zhuahuangfeidian-gpt2.webp',
}
export const cardArtFor = (name: string) => cardArt[name] ?? '/assets/card-trick.png'

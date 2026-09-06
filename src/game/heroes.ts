import type { Hero } from './types'

export const heroes: Hero[] = [
  { id: 'liubei', name: '刘备', title: '乱世枭雄', faction: '蜀', maxHp: 4, accent: '#c58a42', gender: 'male', skills: [{ id: 'rende', name: '仁德', description: '出牌阶段，你可将一张牌交给一名角色，回复 1 点体力。' }] },
  { id: 'guanyu', name: '关羽', title: '美髯公', faction: '蜀', maxHp: 4, accent: '#a94a38', gender: 'male', skills: [{ id: 'wusheng', name: '武圣', description: '你可以将一张红色牌当作【杀】使用。' }] },
  { id: 'zhangfei', name: '张飞', title: '万夫不当', faction: '蜀', maxHp: 4, accent: '#d66e35', gender: 'male', skills: [{ id: 'paoxiao', name: '咆哮', description: '出牌阶段，你使用【杀】无次数限制。' }] },
  { id: 'zhaoyun', name: '赵云', title: '常胜将军', faction: '蜀', maxHp: 4, accent: '#6e9fb3', gender: 'male', skills: [{ id: 'longdan', name: '龙胆', description: '你可以将【杀】当【闪】、将【闪】当【杀】使用。' }] },
  { id: 'zhugeliang', name: '诸葛亮', title: '卧龙', faction: '蜀', maxHp: 3, accent: '#8b6f9f', gender: 'male', skills: [{ id: 'guanxing', name: '观星', description: '回合开始时，预见牌堆顶的两张牌。' }] },
  { id: 'sunquan', name: '孙权', title: '江东之主', faction: '吴', maxHp: 4, accent: '#4f9b84', gender: 'male', skills: [{ id: 'zhiheng', name: '制衡', description: '出牌阶段，你可弃置任意张牌并摸等量的牌。' }] },
  { id: 'lvbu', name: '吕布', title: '人中赤兔', faction: '群', maxHp: 5, accent: '#bd4d4b', gender: 'male', skills: [{ id: 'wushuang', name: '无双', description: '你使用【杀】时，目标需使用两张【闪】响应。' }] },
  { id: 'diaochan', name: '貂蝉', title: '闭月羞花', faction: '群', maxHp: 3, accent: '#b76d9f', gender: 'female', skills: [{ id: 'lijian', name: '离间', description: '出牌阶段，令两名男性角色决斗。' }, { id: 'biyue', name: '闭月', description: '回合结束时，若你没有手牌，摸一张牌。' }] },
]

export const identityLabels: Record<string, string> = { lord: '主公', loyalist: '忠臣', rebel: '反贼', spy: '内奸' }

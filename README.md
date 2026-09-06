# 赤壁 · 三国杀

一个原创暗金水墨风的单机 1v3 身份局网页游戏。玩家可以选择武将与身份，和三名 AI 角色进行一局完整的基础牌局。

## 启动

```bash
npm install
npm run dev
```

生产构建：`npm run build`；测试：`npm test`。

## 部署到 Cloudflare Workers

首次运行 `npx wrangler login` 登录自己的 Cloudflare 账号，然后执行 `npm run deploy`。项目使用 Workers Static Assets 托管 `dist/`，Worker 名称为 `sanguosha-web`，配置在 `wrangler.toml`。自动化环境可通过 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 环境变量提供凭据，切勿提交到仓库。

语音资源已经预生成到 `public/audio/voices`。如需替换台词或声线，编辑 `src/game/voice-lines.json` 后执行 `npm run generate:voices`（追加 `-- --force` 可强制重新生成）。

规则引擎位于 `src/game`，React 组件位于 `src/components`（首版 UI 组件集中在 `src/App.tsx`），美术资源位于 `public/assets`，本地 EdgeTTS 语音位于 `public/audio`。8 名武将高清立绘和牌组内 37 张牌面插画由当前配置的 `gpt-image-2` API 生成，原图和桌面缩略图分别保存在 `public/assets/hero-*-gpt2.png` 与 `public/assets/thumbs/hero-*-gpt2.png`，牌面网页资源使用压缩后的 `public/assets/card-*-gpt2.webp`，生成原图保存在 `output/imagegen/`。牌组、技能和 AI 都可以从规则层继续扩展。

当前规则包含响应式【杀】【闪】、决斗与群体锦囊、按阵营交替的多层【无懈可击】窗口、濒死时任意角色【桃】救援、酒伤害、每回合出杀限制、手动选择弃牌、目标手牌/装备选择、【铁索连环】、装备区（诸葛连弩、青釭剑、寒冰剑、古锭刀、青龙偃月刀、丈八蛇矛、方天画戟、雌雄双股剑、八卦阵、仁王盾、赤兔/大宛/紫骍进攻马、绝影/的卢/爪黄飞电防御马）、动态距离、完整判定队列与延时锦囊（乐不思蜀、兵粮寸断、闪电）、八名武将技能、身份目标 AI、3 秒 AI 行动节奏、来源/目标牌面特效、牌面动效、Web Audio 音效和本地 EdgeTTS 角色语音。每局会从未选武将中随机抽取 3 名 AI 对手；主公身份公开显示，其余身份按身份局规则隐藏。女性武将使用女性角色音色，装备牌只触发一次出牌播报；“的卢”语音文本使用“笛卢”以改善 EdgeTTS 发音。寒冰剑支持命中后选择弃置两牌或直接伤害，火攻会展示目标手牌并由玩家自主选择同花色弃牌，铁索连环会在目标濒死时继续传导元素伤害；青龙偃月刀支持闪避后的追击，雌雄双股剑会针对异性弃牌。AI 使用统一的 `chooseAiTarget`、`chooseAiDiscard` 与 `shouldUseNullify` 评分入口，在响应窗口评估【闪】、【杀】、【桃】和多层【无懈可击】，并在合适时装备马匹和使用【桃】；首次点击“开始对局”后浏览器才会允许播放声音。

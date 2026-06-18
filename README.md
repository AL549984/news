# 腾讯研究院 AI 研究情报库 · TRI Intelligence

汇集腾讯研究院 2026 年 AI 相关研究文章，按主题、月份与关键词整理成可检索、可筛选、可追踪的研究情报索引。视觉采用克莱因蓝（`#002fa7`）+ 白色调，配合鼠标驱动的交互特效。

## 特性

- **克莱因蓝主题**：单一强调色锁定全站，干净的蓝白配色与机构级排版。
- **鼠标特效**
  - 跟随光标的克莱因蓝聚光（spotlight）光晕
  - 卡片随光标位置发光（cursor-aware glow）
  - 主要 / 次要按钮磁吸（magnetic）效果
- **滚动动效**
  - 区块与卡片进入视口时渐入上浮（IntersectionObserver，无滚动监听抖动）
  - 归档条形图进入视口时从 0 生长
  - 顶部导航滚动收拢 + 英雄图轻微视差
  - 英雄区指标数字递增动画
- **可访问性**：完整支持 `prefers-reduced-motion`，触屏设备自动关闭光标特效。
- **检索能力**：按主题、月份筛选，关键词搜索标题 / 日期 / 主题。

## 项目结构

```
index.html         页面结构、SEO 元信息与脚本入口
styles.css         设计令牌、布局与全部视觉 / 特效样式
articles.js        文章数据（window.ARTICLES）
app.js             渲染主题、精选、归档、检索列表与筛选逻辑
interactions.js    鼠标与滚动驱动的交互特效
favicon.svg        站点图标
hero-knowledge.png 英雄区背景图
```

## 本地运行

这是纯静态站点，任意静态服务器均可。

```bash
# 方式一：使用内置脚本（基于 serve）
npm run dev      # 打开 http://localhost:5173

# 方式二：Python
python3 -m http.server 5173

# 方式三：直接用浏览器打开 index.html
```

## Trigger.dev 自动更新

项目已经内置 Trigger.dev 定时任务，用来把腾讯研究院同步结果发布到前端仓库：

```
trigger.config.ts                         Trigger.dev 项目配置
trigger/tencent-research.ts               每天 19:00 的同步 / 发布任务
scripts/export_tencent_research_site_articles.py
                                           state.json -> articles.js 导出器
.env.example                              Dashboard / 本地环境变量模板
```

默认任务 `sync-tencent-research-site` 会在生产环境按 `0 19 * * *`、`Asia/Shanghai` 运行。`TRIGGER_PROJECT_REF` 必须来自当前 CLI profile 有权限访问的 Trigger.dev 项目。流程是：

1. 如果存在 `scripts/sync_tencent_research_wechat_to_feishu_wiki.py`，先执行公众号到飞书 Wiki 的同步脚本。
2. 如果存在 `data/tencent_research_wechat_wiki/state.json`，执行导出器生成 `articles.js`。
3. 如果 `GITHUB_TOKEN` 已配置，将 `articles.js` 写回 `AL549984/news` 的 `main` 分支，触发 Vercel 重新部署。

本地开发：

```bash
cp .env.example .env
npm run trigger:dev
```

部署到 Trigger.dev：

```bash
npm run trigger:deploy
```

Dashboard 里至少需要配置：

```bash
TRIGGER_PROJECT_REF=proj_xxx
TRIGGER_SECRET_KEY=tr_prod_xxx
GITHUB_TOKEN=github_pat_xxx
GITHUB_REPOSITORY=AL549984/news
GITHUB_BRANCH=main
```

如果本地 deploy 提示 `Project not found`，说明当前 CLI profile 登录的账号无权访问这个 `TRIGGER_PROJECT_REF`。先运行：

```bash
npx --yes trigger.dev@latest list-profiles
npx --yes trigger.dev@latest whoami
npx --yes trigger.dev@latest login --profile tencent-research --no-browser
npx --yes trigger.dev@latest deploy --dry-run --profile tencent-research
```

也可以不用本机 profile，改用正确账号生成的 Personal Access Token。Token 必须以 `tr_pat_` 开头，并且要作为 shell 环境变量传给 CLI：

```bash
export TRIGGER_ACCESS_TOKEN=tr_pat_xxx
export TRIGGER_PROJECT_REF=proj_xxx
npm run trigger:deploy -- --dry-run
```

注意：`deploy` 会在读取 `.env` 之前先认证，所以 `TRIGGER_ACCESS_TOKEN` 不要只写进 `.env`，要先 `export` 到当前 shell。

如果真实同步脚本或状态文件路径不同，用这些变量覆盖：

```bash
TENCENT_RESEARCH_SYNC_SCRIPT=./scripts/sync_tencent_research_wechat_to_feishu_wiki.py
TENCENT_RESEARCH_EXPORT_SCRIPT=./scripts/export_tencent_research_site_articles.py
TENCENT_RESEARCH_STATE_PATH=./data/tencent_research_wechat_wiki/state.json
TENCENT_RESEARCH_ARTICLES_PATH=./articles.js
```

## 自定义

- **配色**：修改 `styles.css` 中 `:root` 的 `--blue`、`--cyan` 等令牌。
- **文章数据**：编辑 `articles.js` 中的 `window.ARTICLES` 数组。
- **主题描述 / 精选**：在 `app.js` 顶部的 `themeDescriptions` 与 `featuredTitles` 中调整。
- **特效强度**：在 `interactions.js` 中调整磁吸系数、聚光半径与视差倍率。

## 许可证

MIT

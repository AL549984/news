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

## 自定义

- **配色**：修改 `styles.css` 中 `:root` 的 `--blue`、`--cyan` 等令牌。
- **文章数据**：编辑 `articles.js` 中的 `window.ARTICLES` 数组。
- **主题描述 / 精选**：在 `app.js` 顶部的 `themeDescriptions` 与 `featuredTitles` 中调整。
- **特效强度**：在 `interactions.js` 中调整磁吸系数、聚光半径与视差倍率。

## 许可证

MIT

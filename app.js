const articles = Array.isArray(window.ARTICLES) ? window.ARTICLES : [];

const themeDescriptions = {
  "AI 技术与 Agent": "大模型、智能体、Harness、具身智能、AI Coding 与技术基础设施。",
  "产业与商业化": "Token 经济、AI 商业模式、产业政策、企业组织与市场落地。",
  "AI 治理与社会": "AI 伦理、安全、社会结构、人机关系与未来社会议题。",
  "文化与内容创新": "数字文化、艺术、音乐、影视、IP 与内容生产方式变化。",
  "教育与公共服务": "教育、健康、就业、公共服务、青少年与老龄化相关观察。",
  "趋势观察": "跨主题趋势、月度速递、关键词和综合性研究线索。",
};

const featuredTitles = [
  "超级个体时代｜腾讯研究院3万字报告",
  "《AI原生工作报告》——从信任鸿沟到可靠协作的十个关键词",
  "人人都聊未来产业，无人关心未来社会",
  "丰饶之后：AI Coding 观察报告 2.0｜AI 透镜系列研究",
  "Token经济学七问——一份关于AI新经济的入门地图",
];

const state = {
  theme: "全部",
  month: "全部",
  query: "",
};

const parseDateNum = (dateText = "") => {
  const match = dateText.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!match) return 0;
  const [, y, m, d] = match.map(Number);
  return y * 10000 + m * 100 + d;
};

const newestFirst = [...articles].sort((a, b) => parseDateNum(b.date) - parseDateNum(a.date));
const themes = ["全部", ...Object.keys(themeDescriptions).filter((name) => articles.some((item) => item.theme === name))];
const months = ["全部", ...Array.from(new Set(articles.map((item) => item.month))).sort((a, b) => b.localeCompare(a, "zh-Hans"))];

function countBy(key) {
  return articles.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

function cleanTitle(title) {
  return (title || "").replace(/\s+/g, " ").trim();
}

function setMetrics() {
  document.querySelector("#metric-total").textContent = articles.length;
  document.querySelector("#metric-themes").textContent = themes.length - 1;
  document.querySelector("#metric-months").textContent = months.length - 1;
}

function renderThemes() {
  const counts = countBy("theme");
  const grid = document.querySelector("#theme-grid");
  grid.innerHTML = Object.keys(themeDescriptions)
    .filter((theme) => counts[theme])
    .map((theme) => `
      <button class="theme-card" type="button" data-theme="${theme}">
        <span class="theme-count">${counts[theme]} 篇</span>
        <h3>${theme}</h3>
        <p>${themeDescriptions[theme]}</p>
      </button>
    `)
    .join("");

  grid.querySelectorAll("[data-theme]").forEach((node) => {
    node.addEventListener("click", () => {
      state.theme = node.dataset.theme;
      document.querySelector("#library").scrollIntoView({ behavior: "smooth" });
      renderAll();
    });
  });
}

function renderFeatured() {
  const pool = featuredTitles
    .map((needle) => articles.find((item) => item.title.includes(needle) || item.fullTitle.includes(needle)))
    .filter(Boolean);
  const fallback = newestFirst.filter((item) => item.images >= 6).slice(0, 5);
  const picks = [...pool, ...fallback].filter((item, index, arr) => arr.findIndex((x) => x.url === item.url) === index).slice(0, 5);
  const [major, ...rest] = picks;
  const grid = document.querySelector("#featured-grid");
  grid.innerHTML = `
    <article class="featured-card major">
      <div>
        <div class="featured-meta">
          <span class="article-theme">${major.theme}</span>
          <span>${major.date}</span>
          <span>${major.images} 图</span>
        </div>
        <h3>${cleanTitle(major.title)}</h3>
      </div>
      <a href="${major.url}" target="_blank" rel="noreferrer">打开飞书文档</a>
    </article>
    <div class="featured-stack">
      ${rest.map((item) => `
        <article class="featured-card">
          <div>
            <div class="featured-meta">
              <span class="article-theme">${item.theme}</span>
              <span>${item.date}</span>
            </div>
            <h3>${cleanTitle(item.title)}</h3>
          </div>
          <a href="${item.url}" target="_blank" rel="noreferrer">打开飞书文档</a>
        </article>
      `).join("")}
    </div>
  `;
}

function renderArchive() {
  const counts = countBy("month");
  const max = Math.max(...Object.values(counts));
  document.querySelector("#month-bars").innerHTML = months
    .filter((month) => month !== "全部")
    .map((month) => {
      const count = counts[month] || 0;
      return `
        <button class="month-row" type="button" data-month="${month}">
          <span>${month.replace("2026 年 ", "")}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(8, (count / max) * 100)}%"></span></span>
          <strong>${count}</strong>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll(".month-row").forEach((node) => {
    node.addEventListener("click", () => {
      state.month = node.dataset.month;
      document.querySelector("#library").scrollIntoView({ behavior: "smooth" });
      renderAll();
    });
  });
}

function renderFilterRow(target, values, active, key) {
  document.querySelector(target).innerHTML = values
    .map((value) => {
      const activeClass = value === active ? " active" : "";
      return `<button class="chip${activeClass}" type="button" data-${key}="${value}">${value}</button>`;
    })
    .join("");

  document.querySelectorAll(`${target} [data-${key}]`).forEach((node) => {
    node.addEventListener("click", () => {
      state[key] = node.dataset[key];
      renderAll();
    });
  });
}

function filteredArticles() {
  const query = state.query.trim().toLowerCase();
  return newestFirst.filter((item) => {
    const byTheme = state.theme === "全部" || item.theme === state.theme;
    const byMonth = state.month === "全部" || item.month === state.month;
    const haystack = `${item.title} ${item.fullTitle} ${item.theme} ${item.month} ${item.date}`.toLowerCase();
    return byTheme && byMonth && (!query || haystack.includes(query));
  });
}

function renderArticles() {
  const list = filteredArticles();
  document.querySelector("#result-count").textContent = `${list.length} 篇匹配文章`;
  document.querySelector("#article-list").innerHTML = list
    .slice(0, 90)
    .map((item) => `
      <article class="article-card">
        <div>
          <div class="article-meta">
            <span class="article-theme">${item.theme}</span>
            <span>${item.date}</span>
            <span>${item.images} 图</span>
          </div>
          <h3>${cleanTitle(item.title)}</h3>
        </div>
        <a href="${item.url}" target="_blank" rel="noreferrer">打开飞书文档</a>
      </article>
    `)
    .join("");
}

function renderAll() {
  renderFilterRow("#theme-filters", themes, state.theme, "theme");
  renderFilterRow("#month-filters", months, state.month, "month");
  renderArticles();
}

document.querySelector("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderArticles();
});

document.querySelector("#reset-filters").addEventListener("click", () => {
  state.theme = "全部";
  state.month = "全部";
  state.query = "";
  document.querySelector("#search-input").value = "";
  renderAll();
});

setMetrics();
renderThemes();
renderFeatured();
renderArchive();
renderAll();

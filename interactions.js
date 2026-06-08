/**
 * interactions.js
 * Cursor-driven and scroll-driven motion for the TRI Intelligence site.
 * All effects honor prefers-reduced-motion and degrade cleanly on touch devices.
 * No window scroll math drives React-style state here; this is plain DOM + rAF.
 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  /* ------------------------------------------------------------------ *
   * 1. Cursor spotlight: a soft Klein-blue glow that trails the cursor.
   * ------------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    const glow = document.createElement("div");
    glow.className = "cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let visible = false;

    window.addEventListener(
      "pointermove",
      (event) => {
        targetX = event.clientX;
        targetY = event.clientY;
        if (!visible) {
          visible = true;
          glow.classList.add("is-active");
        }
      },
      { passive: true }
    );

    document.addEventListener("pointerleave", () => {
      visible = false;
      glow.classList.remove("is-active");
    });

    const followLoop = () => {
      currentX += (targetX - currentX) * 0.16;
      currentY += (targetY - currentY) * 0.16;
      glow.style.setProperty("--pointer-x", `${currentX.toFixed(1)}px`);
      glow.style.setProperty("--pointer-y", `${currentY.toFixed(1)}px`);
      requestAnimationFrame(followLoop);
    };
    requestAnimationFrame(followLoop);
  }

  /* ------------------------------------------------------------------ *
   * 2. Card spotlight: cards glow under the cursor. Delegated so it
   *    keeps working as the article list re-renders on filter changes.
   * ------------------------------------------------------------------ */
  if (finePointer) {
    const cardSelector = ".theme-card, .article-card, .featured-card:not(.major)";
    document.addEventListener(
      "pointermove",
      (event) => {
        const card = event.target.closest(cardSelector);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const mx = ((event.clientX - rect.left) / rect.width) * 100;
        const my = ((event.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty("--mx", `${mx.toFixed(2)}%`);
        card.style.setProperty("--my", `${my.toFixed(2)}%`);
      },
      { passive: true }
    );
  }

  /* ------------------------------------------------------------------ *
   * 3. Magnetic buttons: primary and secondary CTAs lean toward cursor.
   * ------------------------------------------------------------------ */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll(".primary-action, .secondary-action").forEach((btn) => {
      btn.addEventListener("pointermove", (event) => {
        const rect = btn.getBoundingClientRect();
        const mx = event.clientX - (rect.left + rect.width / 2);
        const my = event.clientY - (rect.top + rect.height / 2);
        btn.style.transform = `translate(${(mx * 0.28).toFixed(1)}px, ${(my * 0.4).toFixed(1)}px)`;
      });
      btn.addEventListener("pointerleave", () => {
        btn.style.transform = "";
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 4. Scroll reveal: sections and cards rise into view on first sight.
   * ------------------------------------------------------------------ */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );

  const registerReveal = (el, index = 0) => {
    if (!el || el.classList.contains("reveal")) return;
    el.classList.add("reveal");
    el.style.setProperty("--reveal-delay", `${clamp(index, 0, 8) * 0.06}s`);
    revealObserver.observe(el);
  };

  // Static structure: section headings, panels, hero text blocks.
  document
    .querySelectorAll(
      ".section-heading, .hero-inner > *, .archive-panel, .insight-panel, .library-head, .filters, .footer > *"
    )
    .forEach((el, i) => registerReveal(el, i % 6));

  // Dynamic grids: tag each child as it is rendered, with a gentle stagger.
  const revealChildren = (container) => {
    if (!container) return;
    Array.from(container.children).forEach((child, i) => registerReveal(child, i));
  };

  ["#theme-grid", "#article-list", "#month-bars"].forEach((sel) =>
    revealChildren(document.querySelector(sel))
  );

  // Featured grid mixes a major card and a stack of smaller cards.
  const featured = document.querySelector("#featured-grid");
  if (featured) {
    revealChildren(featured);
    revealChildren(featured.querySelector(".featured-stack"));
  }

  // Re-tag children when the article list re-renders after a filter/search.
  const articleList = document.querySelector("#article-list");
  if (articleList && "MutationObserver" in window) {
    const mo = new MutationObserver(() => revealChildren(articleList));
    mo.observe(articleList, { childList: true });
  }

  /* ------------------------------------------------------------------ *
   * 5. Archive bars: grow from zero when the archive scrolls into view.
   * ------------------------------------------------------------------ */
  const bars = Array.from(document.querySelectorAll(".bar-fill"));
  if (bars.length && !reduceMotion) {
    const barObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const bar = entry.target;
          const target = bar.dataset.width || bar.style.width;
          requestAnimationFrame(() => {
            bar.style.width = target;
          });
          barObserver.unobserve(bar);
        });
      },
      { threshold: 0.2 }
    );
    bars.forEach((bar) => {
      bar.dataset.width = bar.style.width;
      bar.style.width = "0%";
      barObserver.observe(bar);
    });
  }

  /* ------------------------------------------------------------------ *
   * 6. Topbar condense + subtle hero parallax tied to scroll position.
   * ------------------------------------------------------------------ */
  const topbar = document.querySelector(".topbar");
  const heroMedia = document.querySelector(".hero-media");
  let scrollScheduled = false;

  const onScroll = () => {
    if (scrollScheduled) return;
    scrollScheduled = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || window.pageYOffset;
      if (topbar) topbar.classList.toggle("is-condensed", y > 40);
      if (heroMedia && !reduceMotion && y < window.innerHeight) {
        heroMedia.style.setProperty("--hero-shift", `${(y * 0.16).toFixed(1)}px`);
      }
      scrollScheduled = false;
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------ *
   * 7. Count-up: the hero metric numbers tick up to their final value.
   * ------------------------------------------------------------------ */
  const countUp = (el) => {
    const target = parseInt(el.textContent.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(target) || target <= 0) return;
    if (reduceMotion) {
      el.textContent = String(target);
      return;
    }
    const duration = 1200;
    const startTime = performance.now();
    const tick = (now) => {
      const progress = clamp((now - startTime) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  ["#metric-total", "#metric-themes", "#metric-months"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) countUp(el);
  });
})();

/* 《旧神与钢铁》阅读站 —— 目录与阅读页 */
(function () {
  "use strict";

  var data = window.__NOVEL__;
  if (!data || !data.chapters || !data.chapters.length) return;

  var chapters = data.chapters;
  var byId = {};
  chapters.forEach(function (chapter) { byId[chapter.id] = chapter; });

  var KEY_LAST = "novel:last";
  var KEY_SIZE = "novel:size";
  var SIZES = ["17", "19", "22"];

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (err) { return null; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* 隐私模式下静默 */ }
  }

  function href(id) { return "chapter.html?c=" + id; }

  function glyph(kind) {
    return kind === "序章" ? "序" : "正";
  }

  /* ── 目录页 ─────────────────────────────────── */
  function renderCatalog() {
    var mount = document.getElementById("catalog");
    if (!mount) return;

    var last = load(KEY_LAST);
    var lastId = last && byId[last.id] ? last.id : null;

    if (lastId) {
      var strip = document.getElementById("resume");
      if (strip) {
        var chapter = byId[lastId];
        strip.innerHTML =
          '上次读到 <b>' + chapter.label + '「' + chapter.title + '」</b>' +
          '<a href="' + href(lastId) + '">接着读 →</a>';
        strip.hidden = false;
      }
    }

    var order = [];
    var groups = {};
    chapters.forEach(function (chapter) {
      if (!groups[chapter.group]) { groups[chapter.group] = []; order.push(chapter.group); }
      groups[chapter.group].push(chapter);
    });

    var glosses = {
      "序章": "组标签《记一个古都的陨灭》· 主角不出场",
      "正文": "主角出场"
    };

    mount.innerHTML = order.map(function (name) {
      var entries = groups[name].map(function (chapter) {
        var current = chapter.id === lastId;
        return '' +
          '<a class="entry' + (current ? ' is-current' : '') + '" href="' + href(chapter.id) + '">' +
            '<span class="label">' + glyph(name) + ' · ' + chapter.label + '</span>' +
            (current ? '<span class="badge">读到此处</span>' : '') +
            '<h3 class="title">' + chapter.title + '</h3>' +
            '<p class="summary">' + chapter.summary + '</p>' +
            '<p class="foot">' + chapter.anchor +
              '<span class="dot">·</span>' + chapter.words + ' 字</p>' +
            '<span class="read">进入 →</span>' +
          '</a>';
      }).join("");

      return '' +
        '<section class="group' + (name === "序章" ? " is-prologue" : " is-epilogue") + '">' +
          '<div class="group-head">' +
            '<h2>' + name + '</h2>' +
            '<span class="gloss">' + (glosses[name] || "") + '</span>' +
          '</div>' +
          entries +
        '</section>';
    }).join("");

    var stats = document.getElementById("stats");
    if (stats) {
      var words = chapters.reduce(function (sum, chapter) { return sum + chapter.words; }, 0);
      stats.innerHTML =
        '共 ' + chapters.length + ' 章<span class="mark"> · </span>合计 ' +
        words.toLocaleString("zh-Hans-CN") + ' 字<span class="mark"> · </span>' +
        '帝历 1000 年 · 秋<span class="mark"> · </span>更新于 ' + data.builtAt;
    }
  }

  /* ── 阅读页 ─────────────────────────────────── */
  function renderReader() {
    var body = document.getElementById("chapter-body");
    if (!body) return;

    var params = new URLSearchParams(window.location.search);
    var wanted = parseInt(params.get("c") || "", 10);
    var index = chapters.findIndex(function (chapter) { return chapter.id === wanted; });
    if (index < 0) index = 0;
    var chapter = chapters[index];

    document.title = chapter.title + " · " + data.volume;

    var head = document.getElementById("chapter-head");
    head.innerHTML = '' +
      '<p class="label">' + chapter.label + '</p>' +
      '<h1>' + chapter.title + '</h1>' +
      '<p class="anchor">' + chapter.anchor + '</p>';

    body.innerHTML = chapter.html;

    var here = document.getElementById("here");
    if (here) here.textContent = chapter.label + "「" + chapter.title + "」";

    var pager = document.getElementById("pager");
    var prev = chapters[index - 1];
    var next = chapters[index + 1];
    pager.innerHTML = '' +
      (prev
        ? '<a href="' + href(prev.id) + '"><span class="dir">上一章</span>' + prev.title + '</a>'
        : '<span class="disabled"><span class="dir">上一章</span>已是开头</span>') +
      (next
        ? '<a class="next" href="' + href(next.id) + '"><span class="dir">下一章</span>' + next.title + '</a>'
        : '<span class="disabled next"><span class="dir">下一章</span>尚未更新</span>');

    var colophon = document.getElementById("colophon");
    if (colophon) {
      colophon.textContent = data.volume + " · " + chapter.words + " 字";
    }

    /* 字号 */
    var stored = load(KEY_SIZE);
    var size = SIZES.indexOf(String(stored)) >= 0 ? String(stored) : "19";
    var buttons = document.querySelectorAll("[data-size]");
    function applySize() {
      document.documentElement.style.setProperty("--fs", size + "px");
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.size === size));
      });
      save(KEY_SIZE, size);
    }
    buttons.forEach(function (button) {
      button.addEventListener("click", function () { size = button.dataset.size; applySize(); });
    });
    applySize();

    /* 进度条 */
    var bar = document.getElementById("progress");
    function onScroll() {
      var height = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = height > 0 ? window.scrollY / height : 0;
      bar.style.width = Math.min(100, Math.max(0, ratio * 100)) + "%";
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    /* 阅读位置 */
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    var last = load(KEY_LAST);
    if (last && last.id === chapter.id && typeof last.y === "number") {
      requestAnimationFrame(function () { window.scrollTo(0, last.y); });
    } else {
      window.scrollTo(0, 0);
    }

    var pending = false;
    function remember() {
      save(KEY_LAST, { id: chapter.id, y: Math.round(window.scrollY), t: Date.now() });
      pending = false;
    }
    window.addEventListener("scroll", function () {
      if (pending) return;
      pending = true;
      setTimeout(remember, 400);
    }, { passive: true });
    window.addEventListener("pagehide", remember);

    /* 键盘：左右翻章 */
    document.addEventListener("keydown", function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft" && prev) window.location.href = href(prev.id);
      if (event.key === "ArrowRight" && next) window.location.href = href(next.id);
    });
  }

  renderCatalog();
  renderReader();
})();
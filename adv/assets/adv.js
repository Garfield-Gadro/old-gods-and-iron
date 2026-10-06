/* 《旧神与钢铁》文字 ADV —— 序章场景机
   页面：index.html（幕目）／play.html（场景机）
   数据：data/scenarios.js（由 tools/build-adv.py 生成，勿手改） */
(function () {
  "use strict";

  var D = window.__ADV__;
  if (!D || !D.scenes) return;

  var K_STATE = "adv:state";

  function loadState() {
    try { return JSON.parse(localStorage.getItem(K_STATE) || "null"); } catch (err) { return null; }
  }
  function saveState(value) {
    try { localStorage.setItem(K_STATE, JSON.stringify(value)); } catch (err) { /* 隐私模式下静默 */ }
  }

  var state = loadState() || {};
  if (!state.unlocked) state.unlocked = [];
  if (!state.seen) state.seen = [];
  if (!state.scene) state.scene = null;
  function persist() { saveState(state); }

  function byId(id) { return document.getElementById(id); }

  function allSceneIds() {
    var ids = [];
    D.chapters.forEach(function (chapter) { ids = ids.concat(chapter.scenes); });
    return ids;
  }
  function firstSceneId() { return allSceneIds()[0]; }
  function sceneNext(sid) {
    var ids = allSceneIds();
    var index = ids.indexOf(sid);
    return index >= 0 && index + 1 < ids.length ? ids[index + 1] : null;
  }
  function sceneInvestIds(scene) {
    var ids = [];
    scene.blocks.forEach(function (block) {
      if (block.t === "invest") {
        block.ids.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      }
    });
    return ids;
  }
  function totalWords() {
    var sum = 0;
    allSceneIds().forEach(function (sid) { sum += D.scenes[sid].words || 0; });
    return sum;
  }

  function renderBlock(block) {
    if (block.t === "p") return "<p>" + block.html + "</p>";
    if (block.t === "img") {
      return '<figure class="scene-img"><img src="' + block.src + '" alt="" loading="lazy">' +
        (block.cap ? "<figcaption>" + block.cap + "</figcaption>" : "") + "</figure>";
    }
    if (block.t === "invest") {
      var chips = block.ids.map(function (id) {
        var card = D.cards[id];
        return '<button class="chip" type="button" data-card="' + id + '">' +
          (card ? card.title : id) + "</button>";
      }).join("");
      return '<div class="invest-row"><span class="invest-label">可调查</span>' + chips + "</div>";
    }
    return "";
  }

  /* ══ 首页 ══════════════════════════════════════ */

  var home = byId("home-app");
  if (!home && byId("home-catalog")) initHome();

  function initHome() {
    var resume = byId("home-resume");
    if (state.scene && D.scenes[state.scene]) {
      var scene = D.scenes[state.scene];
      resume.hidden = false;
      resume.innerHTML = "上次读到 <b>" + scene.label + "「" + scene.title + "」</b>" +
        '<a href="play.html?s=' + scene.id + '">接着读 →</a>';
    }

    var catalog = byId("home-catalog");
    var html = "";
    D.chapters.forEach(function (chapter) {
      html += '<section class="group">' +
        '<div class="group-head"><h2>' + chapter.label + "</h2>" +
        '<span class="gloss">' + chapter.title + " · 共 " + chapter.scenes.length + " 幕</span></div>";
      chapter.scenes.forEach(function (sid) {
        var scene = D.scenes[sid];
        html += '<a class="entry" href="play.html?s=' + sid + '">' +
          '<span class="label">' + scene.label + "</span>" +
          '<h3 class="title">' + scene.title + "</h3>" +
          '<p class="foot">' + scene.anchor + '<span class="dot">·</span>' + scene.words + " 字</p>" +
          '<span class="read">进入 →</span></a>';
      });
      html += "</section>";
    });
    catalog.innerHTML = html;

    var stats = byId("home-stats");
    stats.innerHTML =
      "已收录调查 <b>" + state.unlocked.length + "</b> / " + Object.keys(D.cards).length +
      '<span class="mark"> · </span>已见另一种可能性 <b>' + state.seen.length + "</b> / " + Object.keys(D.badends).length +
      '<span class="mark"> · </span>序章 ' + totalWords() + " 字";

    var start = byId("home-start");
    if (state.scene && D.scenes[state.scene]) {
      start.textContent = "继续 · " + D.scenes[state.scene].label;
    }

    byId("home-reset").addEventListener("click", function () {
      if (!window.confirm("清空阅读进度与收集，从头开始？")) return;
      state = { scene: null, unlocked: [], seen: [] };
      persist();
      location.reload();
    });
  }

  /* ══ 场景机 ══════════════════════════════════════ */

  var stage = byId("stage");
  if (!stage) return;

  var overlay = byId("overlay");
  var overlayStack = [];
  var currentScene = null;
  var currentHasChoice = false;

  function initPlay() {
    var params = new URLSearchParams(location.search);
    var sid = params.get("s");
    if (!sid || !D.scenes[sid]) {
      sid = state.scene && D.scenes[state.scene] ? state.scene : firstSceneId();
    }
    renderScene(sid);

    byId("bar-invest").addEventListener("click", openInvestList);
    byId("bar-ask").addEventListener("click", openAsks);
    stage.addEventListener("click", onStageClick);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeOverlay();
    });

    /* 覆盖层统一事件代理（避免重绘后监听器失效） */
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay && !overlay.classList.contains("is-badend")) {
        closeOverlay();
        return;
      }
      if (event.target.closest("[data-close]")) { closeOverlay(); return; }
      var item = event.target.closest(".list-item");
      if (item) { openCard(item.getAttribute("data-card")); return; }
      if (event.target.closest("#badend-return")) {
        var top = overlayStack[overlayStack.length - 1];
        if (top && top.returnTo && D.scenes[top.returnTo]) {
          closeOverlay();
          renderScene(top.returnTo, { scrollTo: "choice" });
        }
      }
    });
  }

  function onScroll() {
    var bar = byId("progress");
    var height = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) * 100 : 0) + "%";
  }

  function renderScene(sid, options) {
    options = options || {};
    var scene = D.scenes[sid];
    if (!scene) return;
    currentScene = sid;
    state.scene = sid;
    persist();

    document.title = scene.title + " · 序章 · 旧神与钢铁";
    byId("bar-here").textContent = scene.label + "「" + scene.title + "」";

    var head = '<header class="scene-head">' +
      '<p class="label">' + scene.label + "</p>" +
      "<h1>" + scene.title + "</h1>" +
      '<p class="anchor">' + scene.anchor + "</p></header>";

    var mainBlocks = [];
    var afterBlocks = [];
    var choicePosition = -1;
    var seenChoice = false;

    scene.blocks.forEach(function (block, index) {
      if (block.t === "choice") {
        seenChoice = true;
        choicePosition = index;
        mainBlocks.push(renderChoice(block, index));
        return;
      }
      var chunk = renderBlock(block);
      if (seenChoice) afterBlocks.push(chunk); else mainBlocks.push(chunk);
    });

    var html = head + '<div class="scene-body">' + mainBlocks.join("") + "</div>";
    if (choicePosition >= 0) {
      currentHasChoice = true;
      html += '<div class="scene-body scene-after" id="scene-after" hidden>' +
        afterBlocks.join("") + "</div>";
    } else {
      currentHasChoice = false;
    }

    var next = sceneNext(sid);
    if (next) {
      html += '<div class="next-wrap"><button class="big-btn" id="continue-next" type="button">继续 →</button></div>';
    } else {
      html += '<div class="fin-panel"><p class="fin-label">序章 · 终</p>' +
        '<p class="fin-note">第 2 章「画家元首总是自刎归天」· 待制作</p>' +
        '<a class="big-btn ghost" href="index.html">返回幕目</a></div>';
    }

    stage.innerHTML = html;

    var nextButton = byId("continue-next");
    if (nextButton) {
      nextButton.addEventListener("click", function () { renderScene(next); });
    }

    updateBar(scene);
    window.scrollTo(0, 0);
    onScroll();

    if (options.scrollTo === "choice" && choicePosition >= 0) {
      var choiceBox = byId("choice-" + choicePosition);
      if (choiceBox) {
        setTimeout(function () { choiceBox.scrollIntoView({ block: "center", behavior: "smooth" }); }, 60);
      }
    }
  }

  function renderChoice(block, index) {
    var buttons = block.options.map(function (option, optionIndex) {
      var attrs = 'class="choice-btn" type="button"';
      if (option.to === null) attrs += ' data-continue="' + optionIndex + '"';
      else if (option.to.indexOf("be-") === 0) attrs += ' data-badend="' + option.to + '"';
      else attrs += ' data-goto="' + option.to + '"';
      return "<button " + attrs + ">「" + option.label + "」</button>";
    }).join("");
    return '<div class="choice-box" id="choice-' + index + '">' +
      '<p class="choice-hint">此刻，你可以——</p>' + buttons + "</div>";
  }

  function onStageClick(event) {
    var target = event.target.closest("button, a");
    if (!target) return;

    var cardId = target.getAttribute("data-card");
    if (cardId) { openCard(cardId); return; }

    var badendId = target.getAttribute("data-badend");
    if (badendId) { enterBadend(badendId, currentScene); return; }

    var gotoId = target.getAttribute("data-goto");
    if (gotoId) { renderScene(gotoId); return; }

    if (target.getAttribute("data-continue") !== null) {
      var choiceBox = target.closest(".choice-box");
      if (choiceBox && !choiceBox.classList.contains("is-decided")) {
        choiceBox.classList.add("is-decided");
        target.classList.add("is-picked");
        var after = byId("scene-after");
        if (after) {
          after.hidden = false;
          after.classList.add("is-revealing");
          setTimeout(function () { after.scrollIntoView({ block: "start", behavior: "smooth" }); }, 60);
        }
      }
      return;
    }
  }

  function updateBar(scene) {
    var investIds = sceneInvestIds(scene);
    var investBtn = byId("bar-invest");
    var askBtn = byId("bar-ask");
    var investN = byId("bar-invest-n");

    investBtn.disabled = investIds.length === 0;
    investN.textContent = investIds.length ? " · " + investIds.length : "";
    askBtn.disabled = !(D.asks && D.asks[scene.id]);
  }

  /* ══ 覆盖层（卡片 / 追问 / 坏结局） ═════════════════ */

  function openOverlay(html, className, returnTo) {
    overlayStack.push({ html: html, cls: className || "", returnTo: returnTo || null });
    paintOverlay();
  }
  function closeOverlay() {
    overlayStack.pop();
    paintOverlay();
  }
  function paintOverlay() {
    if (!overlayStack.length) {
      overlay.hidden = true;
      overlay.innerHTML = "";
      overlay.className = "overlay";
      document.body.classList.remove("is-locked");
      return;
    }
    var top = overlayStack[overlayStack.length - 1];
    overlay.className = "overlay " + top.cls;
    overlay.hidden = false;
    overlay.innerHTML = '<div class="overlay-panel">' + top.html + "</div>";
    document.body.classList.add("is-locked");
  }

  function cardHtml(cardId) {
    var card = D.cards[cardId];
    if (!card) return "";
    var unlocked = state.unlocked.indexOf(cardId) >= 0;
    if (!unlocked) { state.unlocked.push(cardId); persist(); }
    var body = card.blocks.map(renderBlock).join("");
    return '<div class="panel-head"><p class="panel-label">调查 · 附录</p><h2>' + card.title + "</h2></div>" +
      '<div class="panel-body">' + body + "</div>" +
      '<div class="panel-foot"><span class="got">' + (unlocked ? "已在收录中" : "已收录") + "</span>" +
      '<button class="big-btn slim" type="button" data-close>合上</button></div>';
  }

  function openCard(cardId) {
    openOverlay(cardHtml(cardId), "is-card");
  }

  function openInvestList() {
    var scene = D.scenes[currentScene];
    if (!scene) return;
    var ids = sceneInvestIds(scene);
    if (!ids.length) return;
    var items = ids.map(function (id) {
      var card = D.cards[id];
      var unlocked = state.unlocked.indexOf(id) >= 0;
      return '<button class="list-item" type="button" data-card="' + id + '">' +
        '<span class="list-title">' + (card ? card.title : id) + "</span>" +
        '<span class="list-tag">' + (unlocked ? "已收录" : "未收录") + "</span></button>";
    }).join("");
    openOverlay('<div class="panel-head"><p class="panel-label">调查</p><h2>本幕可查之物</h2></div>' +
      '<div class="panel-body list">' + items + "</div>" +
      '<div class="panel-foot"><button class="big-btn slim" type="button" data-close>合上</button></div>',
      "is-list");
  }

  function openAsks() {
    var groups = D.asks && D.asks[currentScene];
    if (!groups) return;
    var body = groups.map(function (group) {
      var items = group.items.map(function (item) {
        return '<details class="ask-item"><summary>' + item.q + "</summary><p>" + item.a + "</p></details>";
      }).join("");
      return '<section class="ask-group"><h3>' + group.who + "</h3>" + items + "</section>";
    }).join("");
    openOverlay('<div class="panel-head"><p class="panel-label">追问</p><h2>问在场的人</h2></div>' +
      '<div class="panel-body">' + body + "</div>" +
      '<div class="panel-foot"><button class="big-btn slim" type="button" data-close>合上</button></div>',
      "is-ask");
  }

  function enterBadend(badendId, fromScene) {
    var badend = D.badends[badendId];
    if (!badend) return;
    if (state.seen.indexOf(badendId) < 0) { state.seen.push(badendId); persist(); }

    var body = badend.blocks.map(renderBlock).join("");
    var returnTo = badend.returnTo || fromScene;
    openOverlay(
      '<div class="badend-head"><p class="panel-label">' + badend.label + "</p>" +
      "<h2>" + badend.title + "</h2></div>" +
      '<div class="panel-body badend-body">' + body + "</div>" +
      '<div class="notice-card"><p class="notice-label">' + badend.label + "</p>" +
      "<p>" + badend.notice + "</p></div>" +
      '<div class="panel-foot center"><button class="big-btn" id="badend-return" type="button">回到那一刻</button></div>',
      "is-badend", returnTo);
  }

  initPlay();
})();
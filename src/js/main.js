/* ==========================================================================
   main.js
   应用装配与界面交互
   职责：
   1. 初始化主题系统与故事注册表，进入后首先显示故事选择画面。
   2. 选择故事后加载对应剧情、应用对应主题，并设置存档隔离上下文。
   3. 管理标题 / 章节列表 / 游戏 / 结局四个画面的切换。
   4. 负责正文的打字机效果、选项渲染、章节列表、主题面板与故事列表渲染。
   5. 负责手动存档 / 读档弹窗（故事 + 用户名 + 10 档位 + 导入导出）。
   6. 清理旧版本遗留的存档数据，并响应窗口尺寸与主题变化重绘画布贴图。
   ========================================================================== */

window.App = (function () {

  // ---------- 内部状态 ----------
  var typeTimer = null;
  var typing = false;
  var typeEl = null;
  var typeFullText = "";
  var typeDoneCb = null;
  var currentTexture = null;
  var saveMode = "save"; // "save" | "load"
  var toastTimer = null;
  var currentStoryId = null;
  var dialogueAdvance = null; // 对话播放时的"继续"回调

  // 打字机速度：每字间隔毫秒
  var TYPE_SPEED = 24;

  function $(id) {
    return document.getElementById(id);
  }

  // ---------- 画面切换 ----------
  var SCREEN_IDS = ["stories", "title", "chapters", "game", "end"];

  function showScreen(name) {
    for (var i = 0; i < SCREEN_IDS.length; i++) {
      var el = $("screen-" + SCREEN_IDS[i]);
      if (!el) {
        continue;
      }
      if (SCREEN_IDS[i] === name) {
        el.classList.remove("is-hidden");
      } else {
        el.classList.add("is-hidden");
      }
    }
  }

  // ---------- 旧存档清理 ----------
  /** 删除旧版本（wtg_ 前缀）遗留的测试存档，新版本统一使用 wtg2_ 前缀。 */
  function cleanupLegacyStorage() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        keys.push(localStorage.key(i));
      }
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        if (key.indexOf("wtg_") === 0 && key.indexOf("wtg2_") !== 0) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      // 忽略隐私模式等场景下的失败
    }
  }

  // ---------- 故事选择 ----------
  function renderStories() {
    var list = $("storyList");
    var stories = StoryRegistry.list();
    var themes = ThemeManager.list();
    list.innerHTML = "";

    stories.forEach(function (story) {
      var theme = null;
      for (var i = 0; i < themes.length; i++) {
        if (themes[i].id === story.theme) {
          theme = themes[i];
          break;
        }
      }

      var li = document.createElement("li");
      li.className = "story-li";
      var card = document.createElement("button");
      card.type = "button";
      card.className = "story-card";

      var swatch = document.createElement("span");
      swatch.className = "story-swatch";
      swatch.style.background = (theme && theme.swatch) ? theme.swatch : defaultSwatch(story.theme || story.id);

      var text = document.createElement("div");
      text.className = "story-card-text";

      var title = document.createElement("div");
      title.className = "story-card-title";
      title.textContent = story.title;

      var sub = document.createElement("div");
      sub.className = "story-card-sub";
      sub.textContent = story.subtitle || "";

      var desc = document.createElement("div");
      desc.className = "story-card-desc";
      desc.textContent = story.description || "";

      var themeBadge = document.createElement("span");
      themeBadge.className = "story-card-theme";
      var source = story.remote ? "服务器已发布" : (story.custom ? "本地导入" : "内置");
      themeBadge.textContent = "主题 · " + (theme ? theme.name : "默认") + " · " + source;

      text.appendChild(title);
      text.appendChild(sub);
      text.appendChild(desc);
      text.appendChild(themeBadge);
      card.appendChild(swatch);
      card.appendChild(text);

      card.addEventListener("click", function () {
        selectStory(story.id);
      });

      li.appendChild(card);

      if (story.custom) {
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "story-remove";
        removeBtn.textContent = "删除";
        removeBtn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          removeCustomStory(story.id);
        });
        li.appendChild(removeBtn);
      }

      list.appendChild(li);
    });
  }

  function selectStory(id) {
    var story = StoryRegistry.get(id);
    if (!story) {
      return;
    }
    currentStoryId = story.id;
    currentTexture = null;
    ChapterSystem.loadStory(story);
    SaveManager.setStoryId(story.id);
    ThemeManager.apply(story.theme); // 应用该故事的主题（触发画布重绘）
    renderTitle();
    showScreen("title");
  }

  function goToStories() {
    renderStories();
    showScreen("stories");
  }

  // ---------- 自定义故事（导入 / 持久化 / 删除） ----------
  var CUSTOM_STORIES_KEY = "wtg2_stories";

  /** 从 localStorage 载入自定义故事并注册到注册表。 */
  function loadCustomStories() {
    try {
      var raw = localStorage.getItem(CUSTOM_STORIES_KEY);
      var arr = JSON.parse(raw || "null");
      if (!Array.isArray(arr)) {
        return;
      }
      arr.forEach(function (story) {
        if (story && story.id) {
          story.custom = true;
          StoryRegistry.register(story);
        }
      });
    } catch (e) {
      // 忽略
    }
  }

  /** 持久化所有自定义故事。 */
  function saveCustomStories() {
    try {
      var stories = StoryRegistry.list().filter(function (s) {
        return s.custom;
      });
      localStorage.setItem(CUSTOM_STORIES_KEY, JSON.stringify(stories));
    } catch (e) {
      // 忽略
    }
  }

  /** 从 JSON 文件导入一个自定义故事。 */
  function importStory(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var story = (data && data.story) ? data.story : data;
        if (!story || !story.id || !Array.isArray(story.chapters)) {
          toast("导入失败：故事文件格式不正确");
          return;
        }
        story.custom = true;
        StoryRegistry.register(story);
        saveCustomStories();
        renderStories();
        toast("已导入故事「" + story.title + "」");
      } catch (err) {
        toast("导入失败：文件格式不正确");
      }
    };
    reader.onerror = function () {
      toast("导入失败：无法读取文件");
    };
    reader.readAsText(file);
  }

  /** 删除一个自定义故事。 */
  function removeCustomStory(id) {
    if (!confirm("确定删除该自定义故事吗？此操作无法撤销。")) {
      return;
    }
    StoryRegistry.remove(id);
    saveCustomStories();
    renderStories();
    toast("已删除故事");
  }

  /** 标题画面画布贴图：根据当前故事的主题选择氛围，并优先使用自定义剧情背景图。 */
  function titleTexture() {
    var story = StoryRegistry.get(currentStoryId);
    var image = (story && story.background) || "";
    if (story && story.theme === "ocean-theme") {
      return { kind: "ocean", image: image };
    }
    return { kind: "dawn", image: image };
  }

  // ---------- 标题画面 ----------
  function renderTitle() {
    var story = StoryRegistry.get(currentStoryId);
    if (story) {
      $("brandTitle").textContent = story.title;
      $("titleKicker").textContent = story.subtitle || "互动文字冒险";
      $("titleName").textContent = story.title;
      $("titleSub").textContent = story.description || "";
    }

    var has = ChapterSystem.hasSave();
    var finished = ChapterSystem.isFinished();
    $("btnStart").textContent = (has && !finished) ? "继续游戏" : "开始游戏";
  }

  // ---------- 章节列表 ----------
  function renderChapterList() {
    var list = $("chapterList");
    var chapters = ChapterSystem.getChapters();
    list.innerHTML = "";
    var doneCount = 0;

    chapters.forEach(function (chapter, index) {
      var unlocked = ChapterSystem.isChapterUnlocked(index);
      var completed = ChapterSystem.isChapterCompleted(index);
      if (completed) {
        doneCount++;
      }

      var li = document.createElement("li");
      var item = document.createElement("button");
      item.type = "button";
      item.className = "chapter-item" + (unlocked ? "" : " is-locked");

      var main = document.createElement("div");
      main.className = "chapter-item-main";

      var title = document.createElement("div");
      title.className = "chapter-item-title";
      title.textContent = chapter.title;

      var sub = document.createElement("div");
      sub.className = "chapter-item-sub";
      sub.textContent = chapter.subtitle || "";

      main.appendChild(title);
      main.appendChild(sub);

      var badge = document.createElement("span");
      badge.className = "chapter-item-badge" + (completed ? " is-done" : "");
      badge.textContent = completed ? "已通关" : (unlocked ? "可进入" : "未解锁");

      item.appendChild(main);
      item.appendChild(badge);

      if (unlocked) {
        item.addEventListener("click", function () {
          ChapterSystem.enterChapter(index);
          showScreen("game");
          renderScene();
        });
      }

      li.appendChild(item);
      list.appendChild(li);
    });

    $("chapterProgress").textContent =
      "共 " + chapters.length + " 章 · 已通关 " + doneCount + " 章";
  }

  // ---------- 游戏画面 ----------
  // ---------- 对话与人物 ----------
  var DialogManager = (function () {
    var data = { dialogues: {} };

    /** 合并一份对话数据（服务端内容后合并，优先级更高）。 */
    function merge(source) {
      if (!source) {
        return;
      }
      Object.keys(source).forEach(function (storyId) {
        data.dialogues[storyId] = data.dialogues[storyId] || {};
        var group = source[storyId] || {};
        Object.keys(group).forEach(function (dialogueId) {
          data.dialogues[storyId][dialogueId] = group[dialogueId];
        });
      });
    }

    /** 加载对话：先读内置 dialog.json，再合并服务端已审核发布的对话。 */
    function load() {
      return fetch("dialog.json?v=3")
        .then(function (r) { return r.json(); })
        .then(function (json) {
          if (json && json.dialogues) {
            merge(json.dialogues);
          }
        })
        .catch(function () {
          // 内置对话读取失败时不影响游戏
        })
        .then(function () {
          if (!window.Api) {
            return;
          }
          // 先探测后端，避免纯静态部署时产生无意义的 404 请求
          return Api.available().then(function (ok) {
            if (!ok) {
              return;
            }
            return Api.listDialogues().then(function (list) {
              merge(list);
            }).catch(function () {
              // 后端不可用则仅使用内置对话
            });
          });
        });
    }

    function get(dialogueId) {
      var story = data.dialogues[ChapterSystem.getStoryId()];
      return story ? story[dialogueId] : null;
    }

    return { load: load, get: get };
  })();

  // ---------- 服务端已发布故事 ----------
  /** 从后端加载已审核发布的故事并注册（后端不可用时静默跳过）。 */
  function loadServerStories(done) {
    if (!window.Api) {
      if (done) { done(); }
      return;
    }
    Api.available().then(function (ok) {
      if (!ok) {
        return null;
      }
      return Api.listStories().then(function (list) {
        list.forEach(function (item) {
          var story = item.story || item;
          if (story && story.id) {
            story.remote = true;
            StoryRegistry.register(story);
          }
        });
      });
    }).catch(function () {
      // 忽略
    }).then(function () {
      if (done) { done(); }
    });
  }

  /** 将说话人标识解析为显示名（角色 id -> 姓名，旁白/narrator -> 旁白）。 */
  function speakerName(id) {
    if (!id || id === "旁白" || id === "narrator") {
      return "旁白";
    }
    var characters = ChapterSystem.getCharacters();
    for (var i = 0; i < characters.length; i++) {
      if (characters[i].id === id) {
        return characters[i].name || id;
      }
    }
    return id;
  }

  function applyAffinity(deltas) {
    if (deltas) {
      ChapterSystem.addAffinity(deltas);
    }
  }

  /** 播放一段对话（来自 dialog.json），逐句显示，结束结算好感度。 */
  function playDialogue(dialogueId, done) {
    var dialogue = DialogManager.get(dialogueId);
    if (!dialogue || !dialogue.lines || !dialogue.lines.length) {
      if (done) {
        done();
      }
      return;
    }
    var index = 0;
    var lines = dialogue.lines;

    function showLine() {
      var line = lines[index];
      $("speaker").textContent = speakerName(line.speaker);
      hideContinue();
      typewrite($("sceneText"), line.text, function () {
        $("btnContinue").textContent = (index < lines.length - 1) ? "下一句" : "继续";
        showContinue();
      });
    }

    dialogueAdvance = function () {
      index += 1;
      if (index >= lines.length) {
        dialogueAdvance = null;
        applyAffinity(dialogue.affinity);
        hideContinue();
        if (done) {
          done();
        }
      } else {
        showLine();
      }
    };

    showLine();
  }

  function openCharacterPanel() {
    renderCharacterPanel();
    $("charPanel").classList.remove("is-hidden");
  }

  function closeCharacterPanel() {
    $("charPanel").classList.add("is-hidden");
  }

  /** 渲染人物面板：人设 + 好感度进度 + 攻略状态。 */
  function renderCharacterPanel() {
    var box = $("charList");
    box.innerHTML = "";
    var characters = ChapterSystem.getCharacters();
    if (!characters.length) {
      var empty = document.createElement("p");
      empty.className = "panel-sub";
      empty.textContent = "本故事暂无人物。";
      box.appendChild(empty);
      return;
    }
    characters.forEach(function (c) {
      var li = document.createElement("li");
      li.className = "char-item";

      // 人物图片（可选，来自编辑器上传）
      if (c.image) {
        var avatar = document.createElement("img");
        avatar.className = "char-avatar";
        avatar.src = c.image;
        avatar.alt = c.name || c.id;
        li.appendChild(avatar);
      }

      var main = document.createElement("div");
      main.className = "char-main";

      var head = document.createElement("div");
      head.className = "char-head";
      var name = document.createElement("span");
      name.className = "char-name";
      name.textContent = c.name || c.id;
      head.appendChild(name);
      var role = document.createElement("span");
      role.className = "char-role";
      role.textContent = c.role || "";
      head.appendChild(role);
      main.appendChild(head);

      var personality = document.createElement("div");
      personality.className = "char-personality";
      personality.textContent = c.personality ? "性格 · " + c.personality : "";
      main.appendChild(personality);

      var desc = document.createElement("div");
      desc.className = "char-desc";
      desc.textContent = c.description || "";
      main.appendChild(desc);

      var affinity = ChapterSystem.getAffinity(c.id);
      var target = (typeof c.target === "number" && c.target > 0) ? c.target : 0;
      var done = target > 0 && affinity >= target;
      var pct = target > 0 ? Math.min(100, Math.round(affinity / target * 100)) : 0;

      var bar = document.createElement("div");
      bar.className = "char-affinity";
      var track = document.createElement("div");
      track.className = "affinity-track";
      var fill = document.createElement("div");
      fill.className = "affinity-fill";
      fill.style.width = pct + "%";
      track.appendChild(fill);
      bar.appendChild(track);
      var label = document.createElement("span");
      label.className = "affinity-label" + (done ? " is-done" : "");
      label.textContent = "好感度 " + affinity + (target > 0 ? " / " + target : "") + (done ? " · 攻略成功" : "");
      bar.appendChild(label);
      main.appendChild(bar);

      li.appendChild(main);
      box.appendChild(li);
    });
  }

  function renderScene() {
    if (ChapterSystem.isFinished()) {
      showScreen("end");
      return;
    }

    var chapter = ChapterSystem.getCurrentChapter();
    var scene = ChapterSystem.getCurrentScene();
    if (!chapter || !scene) {
      showScreen("end");
      return;
    }

    $("chapterLabel").textContent = chapter.title;
    $("choices").innerHTML = "";
    hideContinue();

    // 背景优先级：场景自定义背景图 > 故事剧情背景图 > 程序化贴图
    var storyData = ChapterSystem.getStory();
    var bgImage = scene.background || (storyData && storyData.background) || "";
    currentTexture = {
      kind: (scene.texture && scene.texture.kind) ? scene.texture.kind : "default",
      image: bgImage
    };
    TextureRenderer.render($("sceneCanvas"), currentTexture);

    $("speaker").textContent = scene.speaker || "旁白";

    var visibleChoices = filterChoices(scene);
    typewrite($("sceneText"), scene.text, function () {
      if (scene.dialogue) {
        playDialogue(scene.dialogue, function () {
          $("speaker").textContent = scene.speaker || "旁白";
          showChoices(visibleChoices);
        });
      } else {
        showChoices(visibleChoices);
      }
    });

    // 重新触发进入动画
    var card = $("sceneCard");
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "";
  }

  function filterChoices(scene) {
    var flags = ChapterSystem.getFlags();
    return (scene.choices || []).filter(function (choice) {
      if (choice.require && !flags[choice.require]) {
        return false;
      }
      if (choice.requireAffinity) {
        for (var key in choice.requireAffinity) {
          if (Object.prototype.hasOwnProperty.call(choice.requireAffinity, key)) {
            if (ChapterSystem.getAffinity(key) < choice.requireAffinity[key]) {
              return false;
            }
          }
        }
      }
      return true;
    });
  }

  function showChoices(choices) {
    var box = $("choices");
    box.innerHTML = "";

    if (choices && choices.length) {
      choices.forEach(function (choice) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = choice.text;
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          ChapterSystem.choose(choice);
          if (choice.affinity) {
            ChapterSystem.addAffinity(choice.affinity);
          }
          if (choice.dialogue) {
            playDialogue(choice.dialogue, function () {
              renderScene();
            });
          } else {
            renderScene();
          }
        });
        box.appendChild(btn);
      });
    } else {
      showContinue();
    }
  }

  function showContinue() {
    $("btnContinue").classList.remove("is-hidden");
  }

  function hideContinue() {
    $("btnContinue").classList.add("is-hidden");
  }

  // ---------- 打字机效果 ----------
  function makeCursor() {
    var span = document.createElement("span");
    span.className = "type-cursor";
    return span;
  }

  function typewrite(el, text, done) {
    clearInterval(typeTimer);
    typeTimer = null;
    typing = true;
    typeEl = el;
    typeFullText = text;
    typeDoneCb = done;

    var i = 0;
    el.textContent = "";

    typeTimer = setInterval(function () {
      i++;
      el.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(typeTimer);
        typeTimer = null;
        typing = false;
        el.textContent = text;
        var cb = typeDoneCb;
        typeDoneCb = null;
        if (cb) {
          cb();
        }
      } else {
        el.appendChild(makeCursor());
      }
    }, TYPE_SPEED);
  }

  /** 跳过打字动画，立即显示全文并触发完成回调。 */
  function finishTyping() {
    if (!typing) {
      return;
    }
    clearInterval(typeTimer);
    typeTimer = null;
    typing = false;
    if (typeEl) {
      typeEl.textContent = typeFullText;
    }
    var cb = typeDoneCb;
    typeDoneCb = null;
    if (cb) {
      cb();
    }
  }

  // ---------- 主题面板 ----------
  function openThemePanel() {
    $("themePanel").classList.remove("is-hidden");
  }

  function closeThemePanel() {
    $("themePanel").classList.add("is-hidden");
  }

  function renderThemeList() {
    var list = $("themeList");
    list.innerHTML = "";
    var themes = ThemeManager.list();
    var currentId = ThemeManager.getCurrent();

    themes.forEach(function (theme) {
      var li = document.createElement("li");
      var item = document.createElement("button");
      item.type = "button";
      item.className = "theme-item" + (currentId === theme.id ? " is-active" : "");

      var swatch = document.createElement("span");
      swatch.className = "theme-swatch";
      swatch.style.background = theme.swatch || defaultSwatch(theme.id);

      var text = document.createElement("div");
      text.className = "theme-item-text";

      var name = document.createElement("div");
      name.className = "theme-item-name";
      name.textContent = theme.name;

      var desc = document.createElement("div");
      desc.className = "theme-item-desc";
      desc.textContent = theme.desc || "";

      text.appendChild(name);
      text.appendChild(desc);
      item.appendChild(swatch);
      item.appendChild(text);

      item.addEventListener("click", function () {
        ThemeManager.apply(theme.id);
        renderThemeList();
        closeThemePanel();
      });

      li.appendChild(item);
      list.appendChild(li);
    });
  }

  /** 当主题未提供色块时，用主题 id 派生一个稳定颜色。 */
  function defaultSwatch(id) {
    var hash = 0;
    for (var i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    var hue = hash % 360;
    return "hsl(" + hue + ", 45%, 62%)";
  }

  // ---------- 轻提示 ----------
  function toast(message) {
    var el = $("toast");
    el.textContent = message;
    el.classList.remove("is-hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add("is-hidden");
    }, 2000);
  }

  // ---------- 存档 / 读档 ----------
  function openSavePanel(mode) {
    saveMode = mode;
    var last = SaveManager.getLastUser();
    $("saveUsername").value = last || "玩家";

    var story = StoryRegistry.get(currentStoryId);
    $("saveStoryLabel").textContent = story ? story.title : "当前故事";

    var tabs = document.querySelectorAll(".save-tab");
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      if (tab.getAttribute("data-mode") === mode) {
        tab.classList.add("is-active");
      } else {
        tab.classList.remove("is-active");
      }
    }

    renderSaveChips();
    renderSlots();
    $("savePanel").classList.remove("is-hidden");
  }

  function closeSavePanel() {
    $("savePanel").classList.add("is-hidden");
  }

  /** 当前输入框里的用户名（空则回退为默认）。 */
  function currentUsername() {
    var value = $("saveUsername").value.trim();
    return value || "玩家";
  }

  function formatTime(ts) {
    var d = new Date(ts);
    function pad(n) {
      return (n < 10 ? "0" : "") + n;
    }
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /** 渲染已存在的用户名，供快速选择。 */
  function renderSaveChips() {
    var box = $("saveUserChips");
    var datalist = $("saveUserList");
    var users = SaveManager.getUsers();
    var cur = currentUsername();

    box.innerHTML = "";
    datalist.innerHTML = "";

    users.forEach(function (user) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "user-chip" + (user === cur ? " is-active" : "");
      chip.textContent = user;
      chip.addEventListener("click", function () {
        $("saveUsername").value = user;
        renderSaveChips();
        renderSlots();
      });
      box.appendChild(chip);

      var option = document.createElement("option");
      option.value = user;
      datalist.appendChild(option);
    });
  }

  /** 渲染 10 个档位；根据存档 / 读档模式决定点击行为。 */
  function renderSlots() {
    var username = currentUsername();
    var list = $("slotList");
    var slots = SaveManager.getSlots(SaveManager.getStoryId(), username);
    list.innerHTML = "";

    for (var i = 0; i < SaveManager.MAX_SLOTS; i++) {
      var record = slots[i];
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot-item" + (record ? "" : " is-empty");

      var num = document.createElement("div");
      num.className = "slot-num";
      num.textContent = "槽位 " + (i + 1);

      var meta = document.createElement("div");
      meta.className = "slot-meta";

      if (record) {
        meta.textContent = record.chapterTitle || "";
        if (record.preview) {
          meta.textContent += " · " + record.preview;
        }
        var time = document.createElement("div");
        time.className = "slot-time";
        time.textContent = formatTime(record.time);
        btn.appendChild(num);
        btn.appendChild(meta);
        btn.appendChild(time);
      } else {
        meta.textContent = "（空）";
        btn.appendChild(num);
        btn.appendChild(meta);
      }

      if (saveMode === "load" && !record) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", (function (index) {
          return function () {
            handleSlotClick(index);
          };
        })(i));
      }

      li.appendChild(btn);
      list.appendChild(li);
    }
  }

  function handleSlotClick(index) {
    var username = currentUsername();
    var record = SaveManager.read(username, index);

    if (saveMode === "save") {
      if (record) {
        if (!confirm("槽位 " + (index + 1) + " 已有存档，是否覆盖？")) {
          return;
        }
      }
      SaveManager.write(username, index);
      renderSaveChips();
      renderSlots();
      toast("已保存到「" + username + "」的槽位 " + (index + 1));
    } else {
      if (!record) {
        return;
      }
      if (SaveManager.load(username, index)) {
        closeSavePanel();
        showScreen("game");
        renderScene();
        toast("已读取「" + username + "」的槽位 " + (index + 1));
      }
    }
  }

  function exportSaves() {
    var username = currentUsername();
    var data = SaveManager.exportData(username);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = username + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
    toast("已导出「" + username + "」的存档文件，可放入 saves 目录");
  }

  function importSaves(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var username = (data && data.username) || currentUsername();
        if (!confirm("将导入用户「" + username + "」的存档并覆盖其现有槽位，是否继续？")) {
          return;
        }
        SaveManager.importData(username, data);
        $("saveUsername").value = username;
        renderSaveChips();
        renderSlots();
        toast("已导入「" + username + "」的存档");
      } catch (err) {
        toast("导入失败：文件格式不正确");
      }
    };
    reader.onerror = function () {
      toast("导入失败：无法读取文件");
    };
    reader.readAsText(file);
  }

  // ---------- 画布重绘 ----------
  function renderCanvases() {
    TextureRenderer.render($("titleCanvas"), titleTexture());
    if (currentTexture) {
      TextureRenderer.render($("sceneCanvas"), currentTexture);
    }
  }

  /** 主题切换回调（由 ThemeManager 调用）。 */
  function onThemeChanged() {
    renderCanvases();
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  // ---------- 流程动作 ----------
  function startOrResume() {
    if (ChapterSystem.hasSave()) {
      ChapterSystem.load();
      showScreen("game");
      renderScene();
    } else {
      ChapterSystem.startNew();
      showScreen("game");
      renderScene();
    }
  }

  function restartGame() {
    ChapterSystem.clearSave();
    ChapterSystem.startNew();
    showScreen("game");
    renderScene();
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $("btnStart").addEventListener("click", startOrResume);
    $("btnBackStories").addEventListener("click", goToStories);
    $("btnChapters").addEventListener("click", function () {
      renderChapterList();
      showScreen("chapters");
    });
    $("btnBackTitle").addEventListener("click", function () {
      renderTitle();
      showScreen("title");
    });
    $("btnBackTitleEnd").addEventListener("click", function () {
      renderTitle();
      showScreen("title");
    });
    $("btnMenu").addEventListener("click", function () {
      renderChapterList();
      showScreen("chapters");
    });
    // 游玩中返回主页（故事选择）：进度已实时自动保存，不会丢失
    $("btnHome").addEventListener("click", goToStories);
    $("btnContinue").addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (dialogueAdvance) {
        dialogueAdvance();
      } else {
        ChapterSystem.advance();
        renderScene();
      }
    });
    $("btnReplay").addEventListener("click", restartGame);
    $("btnRestart").addEventListener("click", restartGame);

    // 章节列表与结局画面也提供返回主页
    $("btnHomeChapters").addEventListener("click", goToStories);
    $("btnHomeEnd").addEventListener("click", goToStories);

    // 点击正文区域可跳过打字动画
    $("sceneCard").addEventListener("click", function () {
      if (typing) {
        finishTyping();
      }
    });

    // 主题面板
    $("btnTheme").addEventListener("click", function () {
      renderThemeList();
      openThemePanel();
    });
    $("btnCloseTheme").addEventListener("click", closeThemePanel);
    $("themeBackdrop").addEventListener("click", closeThemePanel);

    // 人物面板
    $("btnChars").addEventListener("click", openCharacterPanel);
    $("btnCloseChars").addEventListener("click", closeCharacterPanel);
    $("charBackdrop").addEventListener("click", closeCharacterPanel);

    // 自定义故事导入
    $("btnImportStory").addEventListener("click", function () {
      $("storyFile").click();
    });
    $("storyFile").addEventListener("change", function (ev) {
      if (ev.target.files && ev.target.files[0]) {
        importStory(ev.target.files[0]);
      }
      ev.target.value = "";
    });

    // 存档 / 读档
    $("btnSave").addEventListener("click", function () {
      openSavePanel("save");
    });
    $("btnLoad").addEventListener("click", function () {
      openSavePanel("load");
    });
    $("btnLoadTitle").addEventListener("click", function () {
      openSavePanel("load");
    });
    $("btnCloseSave").addEventListener("click", closeSavePanel);
    $("saveBackdrop").addEventListener("click", closeSavePanel);
    $("saveUsername").addEventListener("input", function () {
      renderSaveChips();
      renderSlots();
    });
    $("btnExport").addEventListener("click", exportSaves);
    $("btnImport").addEventListener("click", function () {
      $("importFile").click();
    });
    $("importFile").addEventListener("change", function (ev) {
      if (ev.target.files && ev.target.files[0]) {
        importSaves(ev.target.files[0]);
      }
      ev.target.value = "";
    });

    // 存档面板的模式切换标签
    var tabs = document.querySelectorAll(".save-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        saveMode = this.getAttribute("data-mode");
        var all = document.querySelectorAll(".save-tab");
        for (var j = 0; j < all.length; j++) {
          all[j].classList.remove("is-active");
        }
        this.classList.add("is-active");
        renderSlots();
      });
    }

    // 窗口尺寸变化时重绘画布
    window.addEventListener("resize", debounce(renderCanvases, 150));
  }

  // ---------- 初始化 ----------
  /** 读取 URL 中的 story 参数，用于从编辑器/后台深链预览指定故事。 */
  function getQueryStory() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("story");
    } catch (e) {
      return null;
    }
  }

  function init() {
    if (window.AssetCheck) {
      AssetCheck.verify("--wtg-css-version", "5", "base.css", "游戏样式");
    }
    cleanupLegacyStorage();
    ThemeManager.init();
    bindEvents();
    renderThemeList();
    loadCustomStories();
    DialogManager.load();

    var requested = getQueryStory();
    if (requested) {
      // 深链可能指向服务端已发布故事，先等服务端加载再进入
      loadServerStories(function () {
        if (StoryRegistry.get(requested)) {
          selectStory(requested);
        } else {
          renderStories();
          showScreen("stories");
        }
      });
    } else {
      renderStories();
      showScreen("stories");
      loadServerStories(function () {
        renderStories();
      });
    }
  }

  init();

  // 页面完全加载后再重绘一次，确保首次布局尺寸准确
  window.addEventListener("load", renderCanvases);

  return {
    onThemeChanged: onThemeChanged
  };
})();

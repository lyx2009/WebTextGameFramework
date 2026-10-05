/* ==========================================================================
   editor.js
   故事编辑工具逻辑
   职责：
   1. 以可视化方式编辑故事：故事信息、章节、场景、选项（分支）。
   2. 支持拖拽排序（章节 / 场景 / 选项），并提供上移 / 下移作为触屏回退方案。
   3. 支持"新建分支"（一键创建选项 + 目标场景）与"添加选项"。
   4. 草稿保存到 localStorage；导出为 JSON（供 index.html 导入）或 JS（供源码放置）。

   数据模型与游戏引擎一致：story = { id, title, subtitle, description, theme,
   chapters: [ { id, title, subtitle, startScene, scenes: {id: scene} } ] }。
   场景对象：{ id, speaker, text, texture, next, choices:[{text,next,set,require}] }。
   额外维护 chapter.sceneOrder 数组用于场景排序（游戏引擎会忽略该字段）。
   ========================================================================== */

(function () {
  "use strict";

  var DRAFTS_KEY = "wtg2_editor_drafts";
  var DIALOGUE_DRAFTS_KEY = "wtg2_editor_dialogues";
  var END_MARK = "__chapterEnd__";

  var THEMES = [
    { id: "test-theme", name: "测试主题 · 晨雾" },
    { id: "ocean-theme", name: "深海" },
    { id: "night-theme", name: "星夜" },
    { id: "dusk-theme", name: "暮色" },
    { id: "forest-theme", name: "翡翠" }
  ];

  var TEXTURES = ["dawn", "forest", "night", "cave", "lake", "ocean", "abyss"];

  var story = null;
  var selectedChapterId = null;
  var selectedSceneId = null;
  var selectedCharacterId = null;

  // ---------- 流程图编辑器状态 ----------
  var viewMode = "flow";                 // "flow"（默认） | "form"
  var FLOW_POS_KEY = "wtg2_editor_flow";
  var flowPositions = {};                // { "<storyId>|<chapterId>": { mode, nodes: { sceneId: {x,y} } } }
  var flowTransform = { x: 40, y: 40, scale: 1 };
  var flowChapterId = null;
  var flowSelectedId = null;
  var flowDrag = null;
  var nodeDragDistance = 0;
  var lastFlowMode = null;
  var flowResizeTimer = null;
  var NODE_W = 220;
  var NODE_H = 96;
  var COL_W = 280;
  var ROW_H = 168;
  var counter = 0;
  var toastTimer = null;

  // ---------- 工具函数 ----------
  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) {
      n.className = cls;
    }
    if (text != null) {
      n.textContent = text;
    }
    return n;
  }

  function uid(prefix) {
    counter += 1;
    return (prefix || "id") + "_" + Date.now().toString(36) + counter.toString(36);
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function moveItem(arr, index, dir) {
    var target = index + dir;
    if (target < 0 || target >= arr.length) {
      return;
    }
    var tmp = arr[index];
    arr[index] = arr[target];
    arr[target] = tmp;
  }

  function toast(message) {
    var box = $("toast");
    box.textContent = message;
    box.classList.remove("is-hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      box.classList.add("is-hidden");
    }, 2000);
  }

  function download(text, filename, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  // ---------- 数据构造 ----------
  function newScene() {
    return { id: uid("s"), speaker: "旁白", text: "", texture: "dawn", next: "", choices: [] };
  }

  function addSceneToChapter(chapter) {
    var scene = newScene();
    chapter.scenes[scene.id] = scene;
    ensureSceneOrder(chapter);
    chapter.sceneOrder.push(scene.id);
    return scene;
  }

  function newChapter() {
    var chapter = { id: uid("ch"), title: "新章节", subtitle: "", startScene: "", scenes: {}, sceneOrder: [] };
    var scene = addSceneToChapter(chapter);
    chapter.startScene = scene.id;
    return chapter;
  }

  function makeNewStory() {
    var chapter = newChapter();
    return {
      id: uid("custom"),
      title: "未命名故事",
      subtitle: "",
      description: "",
      theme: "test-theme",
      characters: [],
      chapters: [chapter]
    };
  }

  // ---------- 模型访问 ----------
  function currentChapter() {
    for (var i = 0; i < story.chapters.length; i++) {
      if (story.chapters[i].id === selectedChapterId) {
        return story.chapters[i];
      }
    }
    return story.chapters[0] || null;
  }

  function currentScene() {
    var chapter = currentChapter();
    if (!chapter) {
      return null;
    }
    return chapter.scenes[selectedSceneId] || null;
  }

  function ensureSceneOrder(chapter) {
    if (!Array.isArray(chapter.sceneOrder)) {
      chapter.sceneOrder = [];
    }
    Object.keys(chapter.scenes).forEach(function (id) {
      if (chapter.sceneOrder.indexOf(id) === -1) {
        chapter.sceneOrder.push(id);
      }
    });
    chapter.sceneOrder = chapter.sceneOrder.filter(function (id) {
      return chapter.scenes[id];
    });
    return chapter.sceneOrder;
  }

  function sceneLabel(scene) {
    var preview = scene.text ? scene.text.replace(/\s+/g, " ").slice(0, 14) : "（空）";
    return (scene.speaker || "旁白") + " · " + preview;
  }

  function sceneIdOptions(chapter, includeEmpty) {
    var opts = [];
    if (includeEmpty) {
      opts.push({ value: "", label: "（无）" });
    }
    ensureSceneOrder(chapter);
    chapter.sceneOrder.forEach(function (id) {
      if (chapter.scenes[id]) {
        opts.push({ value: id, label: sceneLabel(chapter.scenes[id]) });
      }
    });
    opts.push({ value: END_MARK, label: "章节结束" });
    return opts;
  }

  // ---------- 通用小部件 ----------
  function makeBtn(text, onClick) {
    var b = el("button", "mini-btn", text);
    b.type = "button";
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      onClick();
    });
    return b;
  }

  function populateSelect(select, options, selected) {
    select.innerHTML = "";
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === selected) {
        o.selected = true;
      }
      select.appendChild(o);
    });
  }

  // ---------- 渲染：故事信息 ----------
  function renderMeta() {
    $("fTitle").value = story.title || "";
    $("fSubtitle").value = story.subtitle || "";
    $("fDescription").value = story.description || "";
    $("fTheme").value = story.theme || "test-theme";
    setImagePreview("storyBgPreview", story.background);
  }

  // ---------- 渲染：草稿列表 ----------
  function renderDraftList() {
    var ul = $("draftList");
    ul.innerHTML = "";
    var drafts = loadDrafts();
    Object.keys(drafts).forEach(function (id) {
      var li = el("li", "ed-item", null);
      var body = el("div", "ed-item-body", null);
      body.appendChild(el("div", "ed-item-title", (drafts[id].title || "未命名") + ""));
      body.appendChild(el("div", "ed-item-sub", "草稿"));
      li.appendChild(body);
      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("载入", function () { loadDraft(id); }));
      actions.appendChild(makeBtn("删除", function () { deleteDraft(id); }));
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  // ---------- 渲染：章节列表 ----------
  function renderChapterList() {
    var ul = $("chapterList");
    ul.innerHTML = "";
    story.chapters.forEach(function (chapter) {
      var li = el("li", "ed-item" + (chapter.id === selectedChapterId ? " is-active" : ""), null);
      li.setAttribute("data-id", chapter.id);
      var grip = el("span", "grip", "≡");
      grip.draggable = true;
      li.appendChild(grip);
      var body = el("div", "ed-item-body", null);
      body.appendChild(el("div", "ed-item-title", chapter.title || "未命名章节"));
      body.appendChild(el("div", "ed-item-sub", "场景数 " + Object.keys(chapter.scenes).length));
      li.appendChild(body);
      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("上移", function () { moveChapter(chapter.id, -1); }));
      actions.appendChild(makeBtn("下移", function () { moveChapter(chapter.id, 1); }));
      actions.appendChild(makeBtn("删除", function () { deleteChapter(chapter.id); }));
      li.appendChild(actions);
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".ed-item-actions")) {
          return;
        }
        selectedChapterId = chapter.id;
        selectedSceneId = null;
        renderChapterList();
        renderChapterForm();
        renderSceneList();
        renderSceneForm();
      });
      ul.appendChild(li);
    });
  }

  // ---------- 渲染：章节设置 ----------
  function renderChapterForm() {
    var chapter = currentChapter();
    $("fChapterTitle").value = chapter ? (chapter.title || "") : "";
    $("fChapterSubtitle").value = chapter ? (chapter.subtitle || "") : "";
  }

  // ---------- 渲染：场景列表 ----------
  function renderSceneList() {
    var chapter = currentChapter();
    var ul = $("sceneList");
    ul.innerHTML = "";
    if (!chapter) {
      return;
    }
    ensureSceneOrder(chapter);
    chapter.sceneOrder.forEach(function (id) {
      var scene = chapter.scenes[id];
      if (!scene) {
        return;
      }
      var li = el("li", "ed-item" + (id === selectedSceneId ? " is-active" : ""), null);
      li.setAttribute("data-id", id);
      var grip = el("span", "grip", "≡");
      grip.draggable = true;
      li.appendChild(grip);
      var body = el("div", "ed-item-body", null);
      body.appendChild(el("div", "ed-item-title", sceneLabel(scene)));
      if (chapter.startScene === id) {
        body.appendChild(el("div", "ed-item-sub", "起始场景"));
      }
      li.appendChild(body);
      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("上移", function () { moveScene(id, -1); }));
      actions.appendChild(makeBtn("下移", function () { moveScene(id, 1); }));
      actions.appendChild(makeBtn("删除", function () { deleteScene(id); }));
      li.appendChild(actions);
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".ed-item-actions")) {
          return;
        }
        selectedSceneId = id;
        renderSceneList();
        renderSceneForm();
      });
      ul.appendChild(li);
    });
  }

  // ---------- 渲染：场景编辑表单 ----------
  function renderSceneForm() {
    var scene = currentScene();
    var form = $("sceneForm");
    if (!scene) {
      form.classList.add("is-hidden");
      return;
    }
    form.classList.remove("is-hidden");
    $("sceneFormId").textContent = scene.id;
    $("fSpeaker").value = scene.speaker || "";
    $("fText").value = scene.text || "";
    $("fTexture").value = scene.texture || "dawn";

    var chapter = currentChapter();
    populateSelect($("fNext"), sceneIdOptions(chapter, true), scene.next || "");
    $("fDialogue").value = scene.dialogue || "";
    setImagePreview("sceneBgPreview", scene.background);
    renderScenePortrait(scene);

    $("btnSetStart").textContent = (chapter.startScene === scene.id) ? "已是起始场景" : "设为起始场景";

    renderChoiceList();
  }

  // ---------- 渲染：选项列表 ----------
  function renderChoiceList() {
    var scene = currentScene();
    var ul = $("choiceList");
    ul.innerHTML = "";
    if (!scene) {
      return;
    }
    var chapter = currentChapter();
    (scene.choices || []).forEach(function (choice, idx) {
      var li = el("li", "ed-item choice-item", null);
      li.setAttribute("data-choice", String(idx));
      var grip = el("span", "grip", "≡");
      grip.draggable = true;
      li.appendChild(grip);

      var fields = el("div", "choice-fields", null);

      var textInput = el("input", "text-input", null);
      textInput.type = "text";
      textInput.placeholder = "选项文案";
      textInput.value = choice.text || "";
      textInput.addEventListener("input", function () {
        choice.text = textInput.value;
      });

      var nextSelect = el("select", "text-input", null);
      populateSelect(nextSelect, sceneIdOptions(chapter, false), choice.next || "");
      nextSelect.addEventListener("change", function () {
        choice.next = nextSelect.value;
      });

      var setInput = el("input", "text-input", null);
      setInput.type = "text";
      setInput.placeholder = "设置标记（可选）";
      setInput.value = choice.set || "";
      setInput.addEventListener("input", function () {
        choice.set = setInput.value || undefined;
      });

      var reqInput = el("input", "text-input", null);
      reqInput.type = "text";
      reqInput.placeholder = "需要标记（可选）";
      reqInput.value = choice.require || "";
      reqInput.addEventListener("input", function () {
        choice.require = reqInput.value || undefined;
      });

      var affInput = el("input", "text-input", null);
      affInput.type = "text";
      affInput.placeholder = "好感度变化（如 lin:+1,zhou:-1）";
      affInput.value = affinityToText(choice.affinity);
      affInput.addEventListener("input", function () {
        var parsed = parseAffinityText(affInput.value);
        choice.affinity = Object.keys(parsed).length ? parsed : undefined;
      });

      var affReqInput = el("input", "text-input", null);
      affReqInput.type = "text";
      affReqInput.placeholder = "需要好感度（如 lin:2）";
      affReqInput.value = affinityToText(choice.requireAffinity);
      affReqInput.addEventListener("input", function () {
        var parsed = parseAffinityText(affReqInput.value);
        choice.requireAffinity = Object.keys(parsed).length ? parsed : undefined;
      });

      fields.appendChild(textInput);
      fields.appendChild(nextSelect);
      fields.appendChild(setInput);
      fields.appendChild(reqInput);
      fields.appendChild(affInput);
      fields.appendChild(affReqInput);
      li.appendChild(fields);

      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("上移", function () { moveChoice(idx, -1); }));
      actions.appendChild(makeBtn("下移", function () { moveChoice(idx, 1); }));
      actions.appendChild(makeBtn("删除", function () {
        scene.choices.splice(idx, 1);
        renderChoiceList();
      }));
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  // ---------- 故事库（自动导入 / 预览） ----------
  var CUSTOM_STORIES_KEY = "wtg2_stories";

  function getCustomStories() {
    try {
      var arr = JSON.parse(localStorage.getItem(CUSTOM_STORIES_KEY) || "null");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function renderLibrary() {
    var ul = $("libraryList");
    ul.innerHTML = "";
    var entries = [];
    StoryRegistry.list().forEach(function (s) {
      entries.push({ story: s, custom: false });
    });
    getCustomStories().forEach(function (s) {
      entries.push({ story: s, custom: true });
    });

    if (!entries.length) {
      ul.appendChild(el("li", "ed-item", "暂无故事"));
      return;
    }

    entries.forEach(function (entry) {
      var s = entry.story;
      var li = el("li", "ed-item", null);
      var body = el("div", "ed-item-body", null);
      body.appendChild(el("div", "ed-item-title", s.title || s.id));
      body.appendChild(el("div", "ed-item-sub", (entry.custom ? "自定义" : "内置") + " · " + (s.chapters ? s.chapters.length : 0) + " 章"));
      li.appendChild(body);
      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("载入", function () { loadStoryIntoEditor(s); }));
      actions.appendChild(makeBtn("预览", function () { previewStory(s.id); }));
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  function loadStoryIntoEditor(s) {
    story = deepCopy(s);
    selectedChapterId = story.chapters.length ? story.chapters[0].id : null;
    selectedSceneId = selectedChapterId ? story.chapters[0].startScene : null;
    renderAll();
    toast("已载入故事「" + (s.title || s.id) + "」");
  }

  function previewStory(id) {
    $("previewFrame").src = "index.html?story=" + encodeURIComponent(id);
    var found = StoryRegistry.get(id);
    if (!found) {
      found = getCustomStories().find(function (s) { return s.id === id; });
    }
    $("previewTitle").textContent = "预览 · " + (found ? found.title : id);
    $("previewModal").classList.remove("is-hidden");
  }

  function openGuide() {
    $("guideModal").classList.remove("is-hidden");
  }

  function closeGuide() {
    $("guideModal").classList.add("is-hidden");
  }

  function closePreview() {
    $("previewModal").classList.add("is-hidden");
    $("previewFrame").src = "about:blank";
  }

  // ---------- 人物系统（人设 / 好感度 / 攻略） ----------
  function newCharacter() {
    return { id: uid("c"), name: "新人物", role: "", personality: "", description: "", affinity: 0, target: 1 };
  }

  function currentCharacter() {
    var characters = story.characters || [];
    for (var i = 0; i < characters.length; i++) {
      if (characters[i].id === selectedCharacterId) {
        return characters[i];
      }
    }
    return null;
  }

  function renderCharacters() {
    var ul = $("characterList");
    ul.innerHTML = "";
    var characters = story.characters || [];
    characters.forEach(function (c) {
      var li = el("li", "ed-item" + (c.id === selectedCharacterId ? " is-active" : ""), null);
      li.setAttribute("data-id", c.id);
      li.appendChild(el("span", "grip", "≡"));
      var body = el("div", "ed-item-body", null);
      body.appendChild(el("div", "ed-item-title", c.name || c.id));
      body.appendChild(el("div", "ed-item-sub", "初始好感 " + (c.affinity || 0) + " · 攻略目标 " + (c.target || 0)));
      li.appendChild(body);
      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("上移", function () { moveCharacter(c.id, -1); }));
      actions.appendChild(makeBtn("下移", function () { moveCharacter(c.id, 1); }));
      actions.appendChild(makeBtn("删除", function () { deleteCharacter(c.id); }));
      li.appendChild(actions);
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".ed-item-actions")) {
          return;
        }
        selectedCharacterId = c.id;
        renderCharacters();
        renderCharacterForm();
      });
      ul.appendChild(li);
    });
  }

  function renderCharacterForm() {
    var c = currentCharacter();
    var form = $("characterForm");
    if (!c) {
      form.classList.add("is-hidden");
      return;
    }
    form.classList.remove("is-hidden");
    $("characterFormId").textContent = c.id;
    $("fCharName").value = c.name || "";
    $("fCharRole").value = c.role || "";
    $("fCharPersonality").value = c.personality || "";
    $("fCharDesc").value = c.description || "";
    $("fCharAffinity").value = (c.affinity || 0);
    $("fCharTarget").value = (c.target || 0);
    setImagePreview("charImagePreview", c.image);
    renderPortraits();
  }

  function addCharacter() {
    story.characters = story.characters || [];
    var c = newCharacter();
    story.characters.push(c);
    selectedCharacterId = c.id;
    renderCharacters();
    renderCharacterForm();
  }

  function moveCharacter(id, dir) {
    story.characters = story.characters || [];
    var idx = -1;
    for (var i = 0; i < story.characters.length; i++) {
      if (story.characters[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return;
    }
    moveItem(story.characters, idx, dir);
    renderCharacters();
  }

  function deleteCharacter(id) {
    story.characters = story.characters || [];
    if (!confirm("删除该人物？")) {
      return;
    }
    story.characters = story.characters.filter(function (c) {
      return c.id !== id;
    });
    if (selectedCharacterId === id) {
      selectedCharacterId = null;
    }
    renderCharacters();
    renderCharacterForm();
  }

  // ---------- 对话编辑（dialog.json） ----------
  var allDialogues = {};
  var selectedDialogueId = null;

  function mergeDialogues(source) {
    if (!source) {
      return;
    }
    Object.keys(source).forEach(function (storyId) {
      allDialogues[storyId] = allDialogues[storyId] || {};
      var group = source[storyId] || {};
      Object.keys(group).forEach(function (dialogueId) {
        allDialogues[storyId][dialogueId] = group[dialogueId];
      });
    });
  }

  /** 先读内置 dialog.json，再合并服务端已发布的对话。 */
  function loadDialogues() {
    return fetch("dialog.json?v=3")
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json && json.dialogues) {
          mergeDialogues(json.dialogues);
        }
      })
      .catch(function () {
        // 忽略
      })
      .then(function () {
        if (!window.Api) {
          updateApiStatus(false);
          return;
        }
        return Api.available().then(function (ok) {
          updateApiStatus(ok);
          if (!ok) {
            return;
          }
          return Api.listDialogues().then(function (list) {
            mergeDialogues(list);
          }).catch(function () {
            // 后端不可用则仅使用内置对话
          });
        });
      })
      .then(function () {
        renderDialogues();
        renderDialogueForm();
        if (viewMode === "flow") {
          renderFlowchart();
        }
      });
  }

  /** 更新顶部的后端连接状态提示。 */
  function updateApiStatus(ok) {
    var node = $("apiStatus");
    if (!node) {
      return;
    }
    node.textContent = ok ? "后端：已连接（可提交审核）" : "后端：未连接（发布审核不可用）";
    node.className = "ed-api-status " + (ok ? "is-ok" : "is-off");
  }

  function currentDialogueStore() {
    if (!story) {
      return {};
    }
    allDialogues[story.id] = allDialogues[story.id] || {};
    return allDialogues[story.id];
  }

  function currentDialogue() {
    var store = currentDialogueStore();
    return store[selectedDialogueId] || null;
  }

  function renderDialogues() {
    var ul = $("dialogueList");
    ul.innerHTML = "";
    var store = currentDialogueStore();
    var ids = Object.keys(store);
    if (!ids.length) {
      ul.appendChild(el("li", "ed-item", "（暂无对话）"));
      return;
    }
    ids.forEach(function (id) {
      var entry = store[id];
      var li = el("li", "ed-item" + (id === selectedDialogueId ? " is-active" : ""), null);
      var body = el("div", "ed-item-body", null);
      body.appendChild(el("div", "ed-item-title", id));
      body.appendChild(el("div", "ed-item-sub",
        (entry.characterId || "未指定角色") + " · " + ((entry.lines || []).length) + " 行"));
      li.appendChild(body);
      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("删除", function () { deleteDialogue(id); }));
      li.appendChild(actions);
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".ed-item-actions")) {
          return;
        }
        selectedDialogueId = id;
        renderDialogues();
        renderDialogueForm();
      });
      ul.appendChild(li);
    });
  }

  function renderDialogueForm() {
    var entry = currentDialogue();
    var form = $("dialogueForm");
    if (!entry) {
      form.classList.add("is-hidden");
      return;
    }
    form.classList.remove("is-hidden");
    $("dialogueFormId").textContent = selectedDialogueId;
    $("fDlgId").value = selectedDialogueId || "";
    $("fDlgChar").value = entry.characterId || "";
    $("fDlgTitle").value = entry.title || "";
    $("fDlgAffinity").value = affinityToText(entry.affinity);
    if (!Array.isArray(entry.lines)) {
      entry.lines = [];
    }
    renderLineList();
  }

  function renderLineList() {
    var entry = currentDialogue();
    var ul = $("lineList");
    ul.innerHTML = "";
    if (!entry) {
      return;
    }
    (entry.lines || []).forEach(function (line, idx) {
      var li = el("li", "ed-item choice-item", null);
      var fields = el("div", "choice-fields", null);

      var speakerInput = el("input", "text-input", null);
      speakerInput.type = "text";
      speakerInput.placeholder = "说话人（角色 id 或 旁白）";
      speakerInput.value = line.speaker || "";
      speakerInput.addEventListener("input", function () {
        line.speaker = speakerInput.value;
      });

      var textInput = el("input", "text-input", null);
      textInput.type = "text";
      textInput.placeholder = "台词内容";
      textInput.value = line.text || "";
      textInput.addEventListener("input", function () {
        line.text = textInput.value;
      });

      var emotionInput = el("input", "text-input", null);
      emotionInput.type = "text";
      emotionInput.placeholder = "情绪（可选，如 开心；对应该角色的立绘）";
      emotionInput.value = line.emotion || "";
      emotionInput.addEventListener("input", function () {
        line.emotion = emotionInput.value || undefined;
      });

      fields.appendChild(speakerInput);
      fields.appendChild(textInput);
      fields.appendChild(emotionInput);
      li.appendChild(fields);

      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("上移", function () { moveLine(idx, -1); }));
      actions.appendChild(makeBtn("下移", function () { moveLine(idx, 1); }));
      actions.appendChild(makeBtn("删除", function () {
        entry.lines.splice(idx, 1);
        renderLineList();
      }));
      li.appendChild(actions);
      ul.appendChild(li);
    });
  }

  function moveLine(idx, dir) {
    var entry = currentDialogue();
    if (!entry) {
      return;
    }
    moveItem(entry.lines, idx, dir);
    renderLineList();
  }

  function addDialogue() {
    var store = currentDialogueStore();
    var id = "dialogue_" + (Object.keys(store).length + 1);
    var n = 1;
    while (store[id]) {
      n += 1;
      id = "dialogue_" + n;
    }
    store[id] = { characterId: "", title: "", lines: [{ speaker: "旁白", text: "" }] };
    selectedDialogueId = id;
    renderDialogues();
    renderDialogueForm();
  }

  function deleteDialogue(id) {
    if (!confirm("删除该对话？")) {
      return;
    }
    var store = currentDialogueStore();
    delete store[id];
    if (selectedDialogueId === id) {
      selectedDialogueId = null;
    }
    renderDialogues();
    renderDialogueForm();
  }

  function renameDialogue(newId) {
    var store = currentDialogueStore();
    var entry = store[selectedDialogueId];
    if (!entry || !newId || newId === selectedDialogueId) {
      return;
    }
    if (store[newId]) {
      toast("对话 id 已存在");
      return;
    }
    store[newId] = entry;
    delete store[selectedDialogueId];
    selectedDialogueId = newId;
    $("dialogueFormId").textContent = newId;
    renderDialogues();
  }

  // ---------- 导入对话文件 ----------
  /** 打开对话文件选择框。 */
  function openDialogImport() {
    $("dialogFileInput").click();
  }

  /**
   * 归一化导入的对话文件，返回 { storyId: { dialogueId: entry } }，无法识别时返回 null。
   * 支持的形态：
   *   1. { format:"wtg-dialog", dialogues:{ storyId:{...} } }   标准 dialog.json
   *   2. { storyId, dialogues:{ dialogueId: entry } }           服务端投稿 payload 形态
   *   3. { storyId: { dialogueId: entry } }                     仅故事映射
   *   4. { dialogueId: entry }                                  单故事对话表，归入当前故事
   */
  function normalizeDialogueImport(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    var keys = Object.keys(data);
    if (!keys.length) {
      return null;
    }

    if (data.dialogues && typeof data.dialogues === "object" && !Array.isArray(data.dialogues)) {
      if (data.storyId) {
        var wrapped = {};
        wrapped[String(data.storyId)] = data.dialogues;
        return wrapped;
      }
      return data.dialogues;
    }

    // 值为对话条目（含 lines 数组）时，视为当前故事的对话表
    var allEntries = keys.every(function (key) {
      var value = data[key];
      return value && typeof value === "object" && Array.isArray(value.lines);
    });
    if (allEntries) {
      var single = {};
      single[story.id] = data;
      return single;
    }

    var allStoryMaps = keys.every(function (key) {
      var value = data[key];
      return value && typeof value === "object" && !Array.isArray(value);
    });
    if (allStoryMaps) {
      return data;
    }

    return null;
  }

  /** 从 JSON 文件导入对话并合并进编辑器（同名对话会被文件内容覆盖）。 */
  function importDialogues(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var data;
      try {
        data = JSON.parse(e.target.result);
      } catch (err) {
        toast("导入失败：文件不是合法 JSON");
        return;
      }

      var normalized = normalizeDialogueImport(data);
      if (!normalized) {
        toast("导入失败：无法识别的对话文件格式");
        return;
      }

      var total = 0;
      var currentCount = 0;
      var importedStoryIds = [];

      Object.keys(normalized).forEach(function (storyId) {
        var group = normalized[storyId] || {};
        var ids = Object.keys(group);
        if (!ids.length) {
          return;
        }
        allDialogues[storyId] = allDialogues[storyId] || {};
        importedStoryIds.push(storyId);
        ids.forEach(function (dialogueId) {
          allDialogues[storyId][dialogueId] = group[dialogueId];
          total += 1;
          if (storyId === story.id) {
            currentCount += 1;
          }
        });
      });

      selectedDialogueId = null;
      renderDialogues();
      renderDialogueForm();
      if (viewMode === "flow") {
        renderFlowchart();
      }

      if (!total) {
        toast("文件中没有可导入的对话");
      } else if (currentCount) {
        toast("已导入 " + total + " 段对话，其中 " + currentCount + " 段属于当前故事");
      } else {
        toast("已导入 " + total + " 段对话，属于其它故事：" + importedStoryIds.join("、"));
      }
    };
    reader.onerror = function () {
      toast("导入失败：无法读取文件");
    };
    reader.readAsText(file);
  }

  /** 导出全部对话为 dialog.json 格式的文件（可直接覆盖项目根目录的 dialog.json）。 */
  function exportDialogues() {
    var hasAny = Object.keys(allDialogues).some(function (storyId) {
      return Object.keys(allDialogues[storyId] || {}).length > 0;
    });
    if (!hasAny) {
      toast("暂无可导出的对话");
      return;
    }
    var data = { format: "wtg-dialog", version: 1, dialogues: deepCopy(allDialogues) };
    download(JSON.stringify(data, null, 2), "dialog.json", "application/json");
    toast("已导出 dialog.json");
  }

  // ---------- 提交审核 ----------
  function submitStory() {
    if (!validateStory()) {
      return;
    }
    if (!window.Api) {
      toast("未检测到后端脚本，可改用「导出 JSON」");
      return;
    }
    Api.available(true).then(function (ok) {
      updateApiStatus(ok);
      if (!ok) {
        toast("未检测到后端服务：发布审核需要运行 server.js，并把 /api/ 反向代理过去；也可先用「导出 JSON」");
        return;
      }
      return Api.submit("story", deepCopy(story), "来自编辑器").then(function (res) {
        toast("故事已提交审核，编号 " + res.id);
      }).catch(function (err) {
        toast("提交失败：" + err.message);
      });
    });
  }

  function submitDialogues() {
    var store = currentDialogueStore();
    if (!Object.keys(store).length) {
      toast("当前故事没有可提交的对话");
      return;
    }
    if (!window.Api) {
      toast("未检测到后端脚本，可改用「导出对话 JSON」");
      return;
    }
    Api.available(true).then(function (ok) {
      updateApiStatus(ok);
      if (!ok) {
        toast("未检测到后端服务：发布审核需要运行 server.js，并把 /api/ 反向代理过去；也可先用「导出对话 JSON」");
        return;
      }
      return Api.submit("dialog", { storyId: story.id, dialogues: deepCopy(store) }, "来自编辑器")
        .then(function (res) {
          toast("对话已提交审核，编号 " + res.id);
        }).catch(function (err) {
          toast("提交失败：" + err.message);
        });
    });
  }

  // ---------- 好感度文本解析 ----------
  function parseAffinityText(text) {
    var out = {};
    if (!text) {
      return out;
    }
    String(text).split(",").forEach(function (pair) {
      var m = pair.trim().match(/^([^:]+):([+-]?\d+)$/);
      if (m) {
        out[m[1].trim()] = parseInt(m[2], 10);
      }
    });
    return out;
  }

  function affinityToText(obj) {
    if (!obj) {
      return "";
    }
    return Object.keys(obj).map(function (k) {
      return k + ":" + obj[k];
    }).join(",");
  }

  // ---------- 全量渲染 ----------
  var lastStoryId = null;

  function renderAll() {
    // 切换故事时清空对话选中状态
    if (story && story.id !== lastStoryId) {
      lastStoryId = story.id;
      selectedDialogueId = null;
    }
    renderMeta();
    renderLibrary();
    renderDraftList();
    renderCharacters();
    renderCharacterForm();
    renderDialogues();
    renderDialogueForm();
    renderChapterList();
    renderChapterForm();
    renderSceneList();
    renderSceneForm();
    if (viewMode === "flow") {
      renderFlowchart();
    }
  }

  // ---------- 移动 / 删除 / 新增 ----------
  function moveChapter(id, dir) {
    var idx = -1;
    for (var i = 0; i < story.chapters.length; i++) {
      if (story.chapters[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return;
    }
    moveItem(story.chapters, idx, dir);
    renderChapterList();
  }

  function moveScene(id, dir) {
    var chapter = currentChapter();
    if (!chapter) {
      return;
    }
    ensureSceneOrder(chapter);
    var idx = chapter.sceneOrder.indexOf(id);
    if (idx < 0) {
      return;
    }
    moveItem(chapter.sceneOrder, idx, dir);
    renderSceneList();
  }

  function moveChoice(idx, dir) {
    var scene = currentScene();
    if (!scene) {
      return;
    }
    moveItem(scene.choices, idx, dir);
    renderChoiceList();
  }

  function deleteChapter(id) {
    if (story.chapters.length <= 1) {
      toast("至少保留一个章节");
      return;
    }
    if (!confirm("删除该章节及其所有场景？")) {
      return;
    }
    story.chapters = story.chapters.filter(function (c) {
      return c.id !== id;
    });
    if (selectedChapterId === id) {
      selectedChapterId = story.chapters[0].id;
      selectedSceneId = null;
    }
    renderAll();
  }

  function deleteScene(id) {
    var chapter = currentChapter();
    if (!chapter) {
      return false;
    }
    if (Object.keys(chapter.scenes).length <= 1) {
      toast("章节至少需要一个场景");
      return false;
    }
    if (!confirm("删除该场景？指向它的跳转将被清空。")) {
      return false;
    }
    delete chapter.scenes[id];
    ensureSceneOrder(chapter);
    if (chapter.startScene === id) {
      chapter.startScene = chapter.sceneOrder[0] || "";
    }
    // 清理其它场景对它的引用
    Object.keys(chapter.scenes).forEach(function (sid) {
      var s = chapter.scenes[sid];
      if (s.next === id) {
        s.next = "";
      }
      (s.choices || []).forEach(function (c) {
        if (c.next === id) {
          c.next = "";
        }
      });
    });
    if (selectedSceneId === id) {
      selectedSceneId = null;
    }
    renderAll();
    return true;
  }

  function addChapter() {
    var chapter = newChapter();
    story.chapters.push(chapter);
    selectedChapterId = chapter.id;
    selectedSceneId = chapter.startScene;
    renderAll();
  }

  function addScene() {
    var chapter = currentChapter();
    if (!chapter) {
      return;
    }
    var scene = addSceneToChapter(chapter);
    selectedSceneId = scene.id;
    renderAll();
  }

  function addChoice() {
    var scene = currentScene();
    if (!scene) {
      toast("请先选择一个场景");
      return;
    }
    scene.choices = scene.choices || [];
    scene.choices.push({ text: "", next: "", set: undefined, require: undefined });
    renderChoiceList();
  }

  /** 新建分支：同时创建选项与目标场景，并自动接上跳转。 */
  function branchScene() {
    var chapter = currentChapter();
    var scene = currentScene();
    if (!chapter || !scene) {
      toast("请先选择一个场景");
      return;
    }
    var target = addSceneToChapter(chapter);
    scene.choices = scene.choices || [];
    scene.choices.push({ text: "前往新场景", next: target.id, set: undefined, require: undefined });
    selectedSceneId = target.id;
    renderAll();
    toast("已创建分支并生成目标场景");
  }

  function setStartScene() {
    var chapter = currentChapter();
    var scene = currentScene();
    if (!chapter || !scene) {
      return;
    }
    chapter.startScene = scene.id;
    renderSceneForm();
    renderSceneList();
  }

  // ---------- 拖拽排序（事件委托，绑定一次） ----------
  var dragEl = null;

  function getDragAfterElement(container, y) {
    var els = Array.prototype.slice.call(container.querySelectorAll(".ed-item:not(.dragging)"));
    var closest = null;
    var closestOffset = Number.NEGATIVE_INFINITY;
    els.forEach(function (child) {
      var box = child.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closestOffset) {
        closestOffset = offset;
        closest = child;
      }
    });
    return closest;
  }

  function syncContainerOrder(container) {
    if (container.id === "chapterList") {
      syncChaptersOrder();
      renderChapterList();
    } else if (container.id === "sceneList") {
      syncScenesOrder();
      renderSceneList();
    } else if (container.id === "choiceList") {
      syncChoicesOrder();
      renderChoiceList();
    }
  }

  function syncChaptersOrder() {
    var ids = [];
    document.querySelectorAll("#chapterList [data-id]").forEach(function (n) {
      ids.push(n.getAttribute("data-id"));
    });
    var byId = {};
    story.chapters.forEach(function (c) {
      byId[c.id] = c;
    });
    story.chapters = ids.map(function (id) {
      return byId[id];
    }).filter(Boolean);
  }

  function syncScenesOrder() {
    var chapter = currentChapter();
    if (!chapter) {
      return;
    }
    var ids = [];
    document.querySelectorAll("#sceneList [data-id]").forEach(function (n) {
      ids.push(n.getAttribute("data-id"));
    });
    chapter.sceneOrder = ids.filter(function (id) {
      return chapter.scenes[id];
    });
  }

  function syncChoicesOrder() {
    var scene = currentScene();
    if (!scene) {
      return;
    }
    var indexes = [];
    document.querySelectorAll("#choiceList [data-choice]").forEach(function (n) {
      indexes.push(parseInt(n.getAttribute("data-choice"), 10));
    });
    var ordered = indexes.map(function (idx) {
      return scene.choices[idx];
    }).filter(function (c) {
      return !!c;
    });
    scene.choices = ordered;
  }

  function bindDragAndDrop() {
    document.addEventListener("dragstart", function (e) {
      var grip = e.target.closest(".grip[draggable='true']");
      if (!grip) {
        return;
      }
      var item = grip.closest(".ed-item");
      if (!item) {
        return;
      }
      dragEl = item;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", "");
      } catch (err) {
        // 忽略
      }
    });

    document.addEventListener("dragover", function (e) {
      if (!dragEl) {
        return;
      }
      var container = dragEl.parentNode;
      if (!container) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var after = getDragAfterElement(container, e.clientY);
      if (after == null) {
        container.appendChild(dragEl);
      } else {
        container.insertBefore(dragEl, after);
      }
    });

    document.addEventListener("drop", function (e) {
      if (!dragEl) {
        return;
      }
      e.preventDefault();
      var container = dragEl.parentNode;
      dragEl.classList.remove("dragging");
      dragEl = null;
      container.querySelectorAll(".dragging").forEach(function (n) {
        n.classList.remove("dragging");
      });
      if (container) {
        syncContainerOrder(container);
      }
    });

    document.addEventListener("dragend", function () {
      if (dragEl) {
        dragEl.classList.remove("dragging");
      }
      dragEl = null;
    });
  }

  // ---------- 草稿 ----------
  function loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  /** 对话草稿单独存放，按故事 id 组织，避免与故事草稿结构互相影响。 */
  function loadDialogueDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DIALOGUE_DRAFTS_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function saveDialogueDraft(storyId, store) {
    try {
      var all = loadDialogueDrafts();
      all[storyId] = store;
      localStorage.setItem(DIALOGUE_DRAFTS_KEY, JSON.stringify(all));
    } catch (e) {
      // 忽略
    }
  }

  function deleteDialogueDraft(storyId) {
    try {
      var all = loadDialogueDrafts();
      delete all[storyId];
      localStorage.setItem(DIALOGUE_DRAFTS_KEY, JSON.stringify(all));
    } catch (e) {
      // 忽略
    }
  }

  function saveDraft() {
    if (!story) {
      return;
    }
    try {
      var drafts = loadDrafts();
      drafts[story.id] = story;
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      saveDialogueDraft(story.id, currentDialogueStore());
      renderDraftList();
      toast("草稿已保存（含对话）");
    } catch (e) {
      toast("保存草稿失败");
    }
  }

  function loadDraft(id) {
    var drafts = loadDrafts();
    var draft = drafts[id];
    if (!draft) {
      return;
    }
    story = deepCopy(draft);
    // 还原该故事的对话草稿
    var dialogueDrafts = loadDialogueDrafts();
    if (dialogueDrafts[id]) {
      allDialogues[id] = deepCopy(dialogueDrafts[id]);
    }
    selectedChapterId = story.chapters.length ? story.chapters[0].id : null;
    selectedSceneId = selectedChapterId ? story.chapters[0].startScene : null;
    renderAll();
    toast("已载入草稿");
  }

  function deleteDraft(id) {
    try {
      var drafts = loadDrafts();
      delete drafts[id];
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      deleteDialogueDraft(id);
      renderDraftList();
      toast("草稿已删除");
    } catch (e) {
      toast("删除草稿失败");
    }
  }

  // ---------- 新建 / 导入 / 导出 ----------
  function newStory() {
    if (story && !confirm("新建将丢弃当前未保存的修改，是否继续？")) {
      return;
    }
    story = makeNewStory();
    selectedChapterId = story.chapters[0].id;
    selectedSceneId = story.chapters[0].startScene;
    renderAll();
    toast("已新建故事");
  }

  function validateStory() {
    if (!story || !story.title || !story.title.trim()) {
      toast("请先填写故事标题");
      return false;
    }
    if (!story.chapters.length) {
      toast("至少需要一个章节");
      return false;
    }
    for (var i = 0; i < story.chapters.length; i++) {
      var chapter = story.chapters[i];
      if (!chapter.startScene || !chapter.scenes[chapter.startScene]) {
        toast("章节「" + (chapter.title || chapter.id) + "」缺少起始场景");
        return false;
      }
    }
    return true;
  }

  function exportJson() {
    if (!validateStory()) {
      return;
    }
    var data = { format: "wtg-story", version: 1, story: deepCopy(story) };
    download(JSON.stringify(data, null, 2), (story.title || story.id) + ".story.json", "application/json");
    toast("已导出 JSON 故事文件");
  }

  function exportJs() {
    if (!validateStory()) {
      return;
    }
    var text = "// 由故事编辑工具生成\nwindow.StoryRegistry.register(" + JSON.stringify(deepCopy(story), null, 2) + ");\n";
    download(text, story.id + ".story.js", "text/javascript");
    toast("已导出 JS 故事文件");
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var imported = (data && data.story) ? data.story : data;
        if (!imported || !Array.isArray(imported.chapters)) {
          toast("导入失败：不是有效的故事文件");
          return;
        }
        story = deepCopy(imported);
        selectedChapterId = story.chapters.length ? story.chapters[0].id : null;
        selectedSceneId = selectedChapterId ? story.chapters[0].startScene : null;
        renderAll();
        toast("已导入故事「" + (imported.title || imported.id) + "」");
      } catch (err) {
        toast("导入失败：文件格式不正确");
      }
    };
    reader.onerror = function () {
      toast("导入失败：无法读取文件");
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // 流程图编辑器（默认视图）
  // ==========================================================================
  function flowPosKey(chapterId) {
    return story.id + "|" + chapterId;
  }

  function flowChapter() {
    for (var i = 0; i < story.chapters.length; i++) {
      if (story.chapters[i].id === flowChapterId) {
        return story.chapters[i];
      }
    }
    return currentChapter();
  }

  function loadFlowPositions() {
    try {
      flowPositions = JSON.parse(localStorage.getItem(FLOW_POS_KEY) || "{}") || {};
    } catch (e) {
      flowPositions = {};
    }
  }

  function saveFlowPositions() {
    try {
      localStorage.setItem(FLOW_POS_KEY, JSON.stringify(flowPositions));
    } catch (e) {
      // 忽略
    }
  }

  function isNarrowFlow() {
    return window.innerWidth <= 860;
  }

  function flowMode() {
    return isNarrowFlow() ? "narrow" : "wide";
  }

  /** 读取当前章节的节点坐标表。 */
  function flowNodePositions(chapter) {
    var entry = flowPositions[flowPosKey(chapter.id)];
    return (entry && entry.nodes) ? entry.nodes : {};
  }

  /**
   * 自动排版。
   * 宽屏：从起始场景 BFS，按深度分列、同层按序号分行（横向流程图）。
   * 窄屏（手机）：改为自上而下的单列，避免节点跑到屏幕外面、也更好点按。
   */
  function autoLayout(chapter, narrow) {
    var order = [];
    var visited = {};
    var depth = {};
    var start = chapter.startScene;
    if (!chapter.scenes[start]) {
      start = Object.keys(chapter.scenes)[0];
    }
    depth[start] = 0;
    var queue = [start];

    while (queue.length) {
      var id = queue.shift();
      if (visited[id] || !chapter.scenes[id]) {
        continue;
      }
      visited[id] = true;
      order.push({ id: id, depth: depth[id] || 0 });

      var scene = chapter.scenes[id];
      var nexts = [];
      if (scene.next && scene.next !== "__chapterEnd__") {
        nexts.push(scene.next);
      }
      (scene.choices || []).forEach(function (c) {
        if (c.next && c.next !== "__chapterEnd__") {
          nexts.push(c.next);
        }
      });
      nexts.forEach(function (nid) {
        if (chapter.scenes[nid] && !visited[nid]) {
          if (depth[nid] === undefined) {
            depth[nid] = (depth[id] || 0) + 1;
          }
          queue.push(nid);
        }
      });
    }

    // 没有被连到的孤立场景也要排进去
    Object.keys(chapter.scenes).forEach(function (id) {
      if (!visited[id]) {
        order.push({ id: id, depth: 0 });
      }
    });

    var pos = {};
    if (narrow) {
      order.forEach(function (item, i) {
        pos[item.id] = { x: 24, y: 40 + i * ROW_H };
      });
      return pos;
    }

    var rows = {};
    order.forEach(function (item) {
      var d = item.depth;
      if (rows[d] === undefined) {
        rows[d] = 0;
      }
      pos[item.id] = { x: 40 + d * COL_W, y: 40 + rows[d] * ROW_H };
      rows[d] += 1;
    });
    return pos;
  }

  function ensureFlowPositions(chapter) {
    var key = flowPosKey(chapter.id);
    var mode = flowMode();
    var entry = flowPositions[key];

    // 首次生成，或宽窄（手机 / 电脑）发生变化时重新排版
    if (!entry || !entry.nodes || entry.mode !== mode) {
      entry = { mode: mode, nodes: autoLayout(chapter, mode === "narrow") };
      flowPositions[key] = entry;
      saveFlowPositions();
    }

    var nodes = entry.nodes;
    var auto = autoLayout(chapter, mode === "narrow");
    var existing = {};
    Object.keys(chapter.scenes).forEach(function (id) {
      if (nodes[id]) {
        existing[id] = nodes[id];
      }
    });
    // 新增场景补位，已删除的场景自动丢弃
    Object.keys(chapter.scenes).forEach(function (id) {
      if (!existing[id]) {
        existing[id] = auto[id] || { x: 24, y: (Object.keys(existing).length + 1) * ROW_H };
      }
    });
    entry.nodes = existing;
  }

  function shortTarget(id) {
    if (!id) {
      return "？";
    }
    if (id === "__chapterEnd__") {
      return "结束";
    }
    return id;
  }

  function computeEndPosition(chapter) {
    var pos = flowNodePositions(chapter);
    var maxX = 0;
    var sumY = 0;
    var count = 0;
    Object.keys(chapter.scenes).forEach(function (id) {
      var p = pos[id];
      if (!p) {
        return;
      }
      if (p.x > maxX) {
        maxX = p.x;
      }
      sumY += p.y;
      count += 1;
    });
    return { x: maxX + COL_W, y: count ? sumY / count : 40 };
  }

  function applyFlowTransform() {
    var vp = $("flowViewport");
    vp.style.transform = "translate(" + flowTransform.x + "px," + flowTransform.y + "px) scale(" + flowTransform.scale + ")";
  }

  function renderFlowchart() {
    var chapter = currentChapter();
    if (!chapter) {
      return;
    }
    flowChapterId = chapter.id;
    // 切换故事/章节后，若选中的场景已不存在则关闭详情面板
    if (flowSelectedId && !chapter.scenes[flowSelectedId]) {
      flowSelectedId = null;
      $("flowDetail").classList.add("is-hidden");
    }
    ensureFlowPositions(chapter);
    renderFlowChapterSelect();
    renderFlowNodes(chapter);
    renderFlowEdges(chapter);
    applyFlowTransform();
  }

  function renderFlowChapterSelect() {
    var sel = $("flowChapterSelect");
    sel.innerHTML = "";
    story.chapters.forEach(function (ch) {
      var o = document.createElement("option");
      o.value = ch.id;
      o.textContent = (ch.title || "未命名章节") + "（" + Object.keys(ch.scenes).length + " 场景）";
      sel.appendChild(o);
    });
    sel.value = flowChapterId;
  }

  function renderFlowNodes(chapter) {
    var vp = $("flowViewport");
    var old = vp.querySelectorAll(".flow-node");
    for (var i = 0; i < old.length; i++) {
      old[i].remove();
    }
    var pos = flowNodePositions(chapter);

    Object.keys(chapter.scenes).forEach(function (id) {
      var scene = chapter.scenes[id];
      var p = pos[id] || { x: 0, y: 0 };
      var node = document.createElement("div");
      node.className = "flow-node" +
        (id === flowSelectedId ? " is-selected" : "") +
        (chapter.startScene === id ? " is-start" : "");
      node.setAttribute("data-id", id);
      node.style.left = p.x + "px";
      node.style.top = p.y + "px";

      node.appendChild(el("div", "flow-node-id", id + (chapter.startScene === id ? " · 起始" : "")));
      node.appendChild(el("div", "flow-node-speaker", scene.speaker || "旁白"));
      node.appendChild(el("div", "flow-node-text", (scene.text || "（空）").replace(/\s+/g, " ")));

      var choices = scene.choices || [];
      var choicesEl = el("div", "flow-node-choices", null);
      choices.forEach(function (c) {
        choicesEl.appendChild(el("div", "flow-node-choice", "· " + (c.text || "选项") + " → " + shortTarget(c.next)));
      });
      node.appendChild(choicesEl);

      var badges = el("div", "flow-node-badges", null);
      if (scene.dialogue) {
        badges.appendChild(el("span", "flow-badge is-dialogue", "对话 " + scene.dialogue));
      }
      var ends = scene.next === "__chapterEnd__" || choices.some(function (c) { return c.next === "__chapterEnd__"; });
      if (ends) {
        badges.appendChild(el("span", "flow-badge", "章节结束"));
      }
      if (badges.children.length) {
        node.appendChild(badges);
      }

      node.addEventListener("pointerdown", function (ev) {
        startNodeDrag(ev, id);
      });
      node.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (nodeDragDistance > 4) {
          nodeDragDistance = 0;
          return;
        }
        selectFlowNode(id);
      });

      var port = el("div", "flow-port", "＋");
      port.title = "拖动到另一节点以创建分支连线";
      port.addEventListener("pointerdown", function (ev) {
        startConnect(ev, id);
      });
      node.appendChild(port);

      vp.appendChild(node);
    });

    var hasEnd = Object.keys(chapter.scenes).some(function (id) {
      var s = chapter.scenes[id];
      return s.next === "__chapterEnd__" || (s.choices || []).some(function (c) { return c.next === "__chapterEnd__"; });
    });
    if (hasEnd) {
      var endPos = computeEndPosition(chapter);
      var endNode = document.createElement("div");
      endNode.className = "flow-node is-end";
      endNode.setAttribute("data-id", "__chapterEnd__");
      endNode.style.left = endPos.x + "px";
      endNode.style.top = endPos.y + "px";
      endNode.appendChild(el("div", "flow-node-id", "END"));
      endNode.appendChild(el("div", "flow-node-speaker", "章节结束"));
      endNode.appendChild(el("div", "flow-node-text", "进入下一章或通关"));
      vp.appendChild(endNode);
    }
  }

  function renderFlowEdges(chapter) {
    var svg = $("flowEdges");
    var pos = flowNodePositions(chapter);
    var endPos = computeEndPosition(chapter);

    var maxX = 0;
    var maxY = 0;
    Object.keys(chapter.scenes).forEach(function (id) {
      var p = pos[id];
      if (!p) {
        return;
      }
      maxX = Math.max(maxX, p.x + NODE_W);
      maxY = Math.max(maxY, p.y + NODE_H);
    });
    maxX = Math.max(maxX, endPos.x + NODE_W);
    maxY = Math.max(maxY, endPos.y + NODE_H);
    var svgW = maxX + 220;
    var svgH = maxY + 220;

    svg.setAttribute("width", svgW);
    svg.setAttribute("height", svgH);
    svg.setAttribute("viewBox", "0 0 " + svgW + " " + svgH);

    var defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.appendChild(defs);
    }
    defs.innerHTML = "";
    var marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "flow-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto");
    var arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrowPath.setAttribute("fill", "#9aa2b1");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);

    var oldEdges = svg.querySelectorAll("path.flow-edge");
    for (var i = 0; i < oldEdges.length; i++) {
      oldEdges[i].remove();
    }

    var stroke = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#9aa2b1";

    Object.keys(chapter.scenes).forEach(function (id) {
      var scene = chapter.scenes[id];
      var from = pos[id];
      if (!from) {
        return;
      }
      var targets = [];
      if (scene.next) {
        targets.push(scene.next);
      }
      (scene.choices || []).forEach(function (c) {
        if (c.next) {
          targets.push(c.next);
        }
      });
      targets.forEach(function (toId) {
        var to = (toId === "__chapterEnd__") ? endPos : pos[toId];
        if (!to) {
          return;
        }
        var x1 = from.x + NODE_W / 2;
        var y1 = from.y + NODE_H;
        var x2 = to.x + NODE_W / 2;
        var y2 = to.y;
        var mx = (x1 + x2) / 2;
        var line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("class", "flow-edge");
        line.setAttribute("d", "M " + x1 + " " + y1 + " C " + mx + " " + y1 + ", " + mx + " " + y2 + ", " + x2 + " " + y2);
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", stroke);
        line.setAttribute("stroke-width", "1.5");
        line.setAttribute("marker-end", "url(#flow-arrow)");
        svg.appendChild(line);
      });
    });
  }

  // ---------- 流程图交互 ----------
  function startNodeDrag(ev, id) {
    var chapter = flowChapter();
    var pos = chapter ? flowNodePositions(chapter) : null;
    var p = pos && pos[id];
    if (!p) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    flowDrag = { type: "node", id: id, startX: ev.clientX, startY: ev.clientY, origX: p.x, origY: p.y };
    nodeDragDistance = 0;
  }

  function startPan(ev) {
    ev.preventDefault();
    flowDrag = { type: "pan", startX: ev.clientX, startY: ev.clientY, origX: flowTransform.x, origY: flowTransform.y };
  }

  /** 从节点端口开始创建分支连线。 */
  function startConnect(ev, fromId) {
    ev.preventDefault();
    ev.stopPropagation();
    flowDrag = { type: "connect", fromId: fromId, startX: ev.clientX, startY: ev.clientY };
    nodeDragDistance = 0;
  }

  function clientToWorld(ev) {
    var canvas = $("flowCanvas");
    var rect = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left - flowTransform.x) / flowTransform.scale,
      y: (ev.clientY - rect.top - flowTransform.y) / flowTransform.scale
    };
  }

  function nodePortPos(id) {
    var chapter = flowChapter();
    var pos = chapter ? flowNodePositions(chapter) : null;
    var p = pos && pos[id];
    return { x: (p ? p.x : 0) + NODE_W / 2, y: (p ? p.y : 0) + NODE_H };
  }

  function ensureTempEdge() {
    var svg = $("flowEdges");
    var t = svg.querySelector(".flow-temp");
    if (!t) {
      t = document.createElementNS("http://www.w3.org/2000/svg", "path");
      t.setAttribute("class", "flow-temp");
      t.setAttribute("fill", "none");
      t.setAttribute("stroke", "#4f7cff");
      t.setAttribute("stroke-width", "2");
      t.setAttribute("stroke-dasharray", "6 4");
      svg.appendChild(t);
    }
    return t;
  }

  function removeTempEdge() {
    var svg = $("flowEdges");
    var t = svg.querySelector(".flow-temp");
    if (t) {
      t.remove();
    }
  }

  function finishConnect(ev) {
    var chapter = flowChapter();
    var fromId = flowDrag.fromId;
    var targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
    var targetNode = targetEl && targetEl.closest ? targetEl.closest(".flow-node") : null;
    if (!targetNode) {
      return;
    }
    var toId = targetNode.getAttribute("data-id");
    if (!toId || toId === fromId) {
      return;
    }
    var scene = chapter.scenes[fromId];
    if (!scene) {
      return;
    }
    scene.choices = scene.choices || [];
    scene.choices.push({ text: "", next: toId, set: undefined, require: undefined, affinity: undefined, requireAffinity: undefined });
    renderFlowchart();
    selectFlowNode(fromId);
    toast("已创建分支连线，请在右侧填写选项文案");
  }

  function onFlowPointerMove(ev) {
    if (!flowDrag) {
      return;
    }
    if (flowDrag.type === "node") {
      var dx = (ev.clientX - flowDrag.startX) / flowTransform.scale;
      var dy = (ev.clientY - flowDrag.startY) / flowTransform.scale;
      nodeDragDistance = Math.abs(ev.clientX - flowDrag.startX) + Math.abs(ev.clientY - flowDrag.startY);
      var dragChapter = flowChapter();
      var pos = dragChapter ? flowNodePositions(dragChapter) : null;
      if (!pos) {
        return;
      }
      pos[flowDrag.id] = { x: flowDrag.origX + dx, y: flowDrag.origY + dy };
      var node = $("flowViewport").querySelector('.flow-node[data-id="' + flowDrag.id + '"]');
      if (node) {
        node.style.left = pos[flowDrag.id].x + "px";
        node.style.top = pos[flowDrag.id].y + "px";
      }
      renderFlowEdges(flowChapter());
    } else if (flowDrag.type === "pan") {
      flowTransform.x = flowDrag.origX + (ev.clientX - flowDrag.startX);
      flowTransform.y = flowDrag.origY + (ev.clientY - flowDrag.startY);
      applyFlowTransform();
    } else if (flowDrag.type === "connect") {
      var from = nodePortPos(flowDrag.fromId);
      var to = clientToWorld(ev);
      var temp = ensureTempEdge();
      temp.setAttribute("d", "M " + from.x + " " + from.y + " L " + to.x + " " + to.y);
    }
  }

  function onFlowPointerUp(ev) {
    if (flowDrag && flowDrag.type === "node") {
      saveFlowPositions();
    } else if (flowDrag && flowDrag.type === "connect") {
      finishConnect(ev);
    }
    flowDrag = null;
    removeTempEdge();
  }

  function flowZoom(factor) {
    var canvas = $("flowCanvas");
    var cx = canvas.clientWidth / 2;
    var cy = canvas.clientHeight / 2;
    var newScale = Math.min(2.5, Math.max(0.3, flowTransform.scale * factor));
    var wx = (cx - flowTransform.x) / flowTransform.scale;
    var wy = (cy - flowTransform.y) / flowTransform.scale;
    flowTransform.scale = newScale;
    flowTransform.x = cx - wx * newScale;
    flowTransform.y = cy - wy * newScale;
    applyFlowTransform();
  }

  function flowReset() {
    var canvas = $("flowCanvas");
    if (isNarrowFlow() && canvas.clientWidth) {
      // 手机上单列排版，居中显示并回到顶部
      flowTransform = { x: Math.max(12, (canvas.clientWidth - NODE_W) / 2), y: 24, scale: 1 };
    } else {
      flowTransform = { x: 40, y: 40, scale: 1 };
    }
    applyFlowTransform();
  }

  function flowFit() {
    var chapter = flowChapter();
    if (!chapter) {
      return;
    }
    var pos = flowNodePositions(chapter);
    var endPos = computeEndPosition(chapter);
    var maxX = endPos.x + NODE_W;
    var maxY = endPos.y + NODE_H;
    Object.keys(chapter.scenes).forEach(function (id) {
      var p = pos[id];
      if (!p) {
        return;
      }
      maxX = Math.max(maxX, p.x + NODE_W);
      maxY = Math.max(maxY, p.y + NODE_H);
    });
    var canvas = $("flowCanvas");
    if (!canvas.clientWidth || !maxX || !maxY) {
      return;
    }
    // 留出下方空间，避免最后一个节点被提示条挡住
    var availW = canvas.clientWidth - 48;
    var availH = canvas.clientHeight - 64;
    var scale = Math.min(1, Math.min(availW / maxX, availH / maxY));
    scale = Math.max(0.3, Math.min(1.2, scale));
    flowTransform.scale = scale;
    flowTransform.x = Math.max(12, (canvas.clientWidth - maxX * scale) / 2);
    flowTransform.y = Math.max(12, (canvas.clientHeight - maxY * scale) / 2);
    applyFlowTransform();
  }

  function selectFlowNode(id) {
    flowSelectedId = id;
    renderFlowNodes(flowChapter());
    renderFlowDetail();
  }

  function closeFlowDetail() {
    flowSelectedId = null;
    $("flowDetail").classList.add("is-hidden");
    renderFlowNodes(flowChapter());
  }

  function speakerLabel(id) {
    if (!id || id === "旁白" || id === "narrator") {
      return "旁白";
    }
    var chars = story.characters || [];
    for (var i = 0; i < chars.length; i++) {
      if (chars[i].id === id) {
        return chars[i].name || id;
      }
    }
    return id;
  }

  function renderFlowDetail() {
    var chapter = flowChapter();
    var box = $("flowDetail");
    if (!chapter) {
      box.classList.add("is-hidden");
      return;
    }
    var scene = chapter.scenes[flowSelectedId];
    if (!scene) {
      box.classList.add("is-hidden");
      return;
    }
    box.classList.remove("is-hidden");
    $("flowDetailTitle").textContent = flowSelectedId;

    $("fFlowSpeaker").value = scene.speaker || "";
    $("fFlowText").value = scene.text || "";
    populateSelect($("fFlowNext"), sceneIdOptions(chapter, true), scene.next || "");
    renderFlowDialogueSelect();
    renderFlowDialoguePreview();
    renderFlowChoices();
    setImagePreview("flowBgPreview", scene.background);
    renderFlowPortrait(scene);
  }

  function renderFlowDialogueSelect() {
    var sel = $("fFlowDialogue");
    var chapter = flowChapter();
    var scene = chapter && chapter.scenes[flowSelectedId];
    if (!scene) {
      return;
    }
    var store = currentDialogueStore();
    sel.innerHTML = "";
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "（无对话）";
    sel.appendChild(none);
    Object.keys(store).forEach(function (id) {
      var o = document.createElement("option");
      o.value = id;
      o.textContent = id + (store[id].title ? " · " + store[id].title : "");
      sel.appendChild(o);
    });
    if (scene.dialogue && !store[scene.dialogue]) {
      var extra = document.createElement("option");
      extra.value = scene.dialogue;
      extra.textContent = scene.dialogue + "（未定义）";
      sel.appendChild(extra);
    }
    sel.value = scene.dialogue || "";
  }

  function renderFlowDialoguePreview() {
    var box = $("flowDialoguePreview");
    var chapter = flowChapter();
    var scene = chapter && chapter.scenes[flowSelectedId];
    if (!scene) {
      box.innerHTML = "";
      box.classList.add("is-hidden");
      return;
    }
    var store = currentDialogueStore();
    var dialogue = scene.dialogue ? store[scene.dialogue] : null;
    if (!dialogue) {
      box.innerHTML = "";
      box.classList.add("is-hidden");
      return;
    }
    box.classList.remove("is-hidden");
    box.innerHTML = "";
    if (Array.isArray(dialogue.lines)) {
      dialogue.lines.forEach(function (line) {
        var ln = el("div", "flow-detail-line", null);
        ln.appendChild(el("span", "speaker", speakerLabel(line.speaker) + "："));
        ln.appendChild(document.createTextNode(line.text || ""));
        if (line.emotion) {
          ln.appendChild(el("span", "flow-badge", "情绪 " + line.emotion));
        }
        box.appendChild(ln);
      });
    }
    if (dialogue.affinity) {
      box.appendChild(el("div", "flow-detail-line", "结算好感：" + affinityToText(dialogue.affinity)));
    }
  }

  function renderFlowChoices() {
    var chapter = flowChapter();
    var box = $("flowDetailChoices");
    box.innerHTML = "";
    var scene = chapter && chapter.scenes[flowSelectedId];
    if (!scene) {
      return;
    }
    var choices = scene.choices || [];

    choices.forEach(function (choice, idx) {
      var row = el("div", "flow-choice-row", null);

      var textInput = el("input", "text-input", null);
      textInput.type = "text";
      textInput.placeholder = "选项文案";
      textInput.value = choice.text || "";
      textInput.addEventListener("input", function () {
        choice.text = textInput.value;
        renderFlowchart();
      });

      var nextSel = el("select", "text-input", null);
      populateSelect(nextSel, sceneIdOptions(chapter, false), choice.next || "");
      nextSel.addEventListener("change", function () {
        choice.next = nextSel.value;
        renderFlowchart();
      });

      var setInput = el("input", "text-input", null);
      setInput.type = "text";
      setInput.placeholder = "设置标记";
      setInput.value = choice.set || "";
      setInput.addEventListener("input", function () {
        choice.set = setInput.value || undefined;
      });

      var reqInput = el("input", "text-input", null);
      reqInput.type = "text";
      reqInput.placeholder = "需要标记";
      reqInput.value = choice.require || "";
      reqInput.addEventListener("input", function () {
        choice.require = reqInput.value || undefined;
      });

      var affInput = el("input", "text-input", null);
      affInput.type = "text";
      affInput.placeholder = "好感 lin:1";
      affInput.value = affinityToText(choice.affinity);
      affInput.addEventListener("input", function () {
        var p = parseAffinityText(affInput.value);
        choice.affinity = Object.keys(p).length ? p : undefined;
      });

      var affReqInput = el("input", "text-input", null);
      affReqInput.type = "text";
      affReqInput.placeholder = "需好感 lin:2";
      affReqInput.value = affinityToText(choice.requireAffinity);
      affReqInput.addEventListener("input", function () {
        var p = parseAffinityText(affReqInput.value);
        choice.requireAffinity = Object.keys(p).length ? p : undefined;
      });

      row.appendChild(textInput);
      row.appendChild(nextSel);
      var small = el("div", "flow-choice-small", null);
      small.appendChild(setInput);
      small.appendChild(reqInput);
      small.appendChild(affInput);
      small.appendChild(affReqInput);
      row.appendChild(small);

      var actions = el("div", "ed-item-actions", null);
      actions.appendChild(makeBtn("上移", function () { moveFlowChoice(idx, -1); }));
      actions.appendChild(makeBtn("下移", function () { moveFlowChoice(idx, 1); }));
      actions.appendChild(makeBtn("删除", function () {
        choices.splice(idx, 1);
        renderFlowchart();
        renderFlowChoices();
      }));
      row.appendChild(actions);

      box.appendChild(row);
    });

    var addBtn = el("button", "btn btn-ghost btn-small", "添加选项");
    addBtn.type = "button";
    addBtn.addEventListener("click", function () {
      choices.push({ text: "", next: "", set: undefined, require: undefined, affinity: undefined, requireAffinity: undefined });
      renderFlowchart();
      renderFlowChoices();
    });
    box.appendChild(addBtn);
  }

  function moveFlowChoice(idx, dir) {
    var chapter = flowChapter();
    var scene = chapter && chapter.scenes[flowSelectedId];
    if (!scene) {
      return;
    }
    moveItem(scene.choices, idx, dir);
    renderFlowchart();
    renderFlowChoices();
  }

  function refreshFlowNodeText(id, scene) {
    var node = $("flowViewport").querySelector('.flow-node[data-id="' + id + '"]');
    if (!node) {
      return;
    }
    var sp = node.querySelector(".flow-node-speaker");
    var tx = node.querySelector(".flow-node-text");
    if (sp) {
      sp.textContent = scene.speaker || "旁白";
    }
    if (tx) {
      tx.textContent = (scene.text || "（空）").replace(/\s+/g, " ");
    }
  }

  function switchView(mode) {
    viewMode = mode;
    $("formView").classList.toggle("is-hidden", mode !== "form");
    $("flowView").classList.toggle("is-hidden", mode !== "flow");
    $("btnFlowView").classList.toggle("is-active", mode === "flow");
    $("btnFormView").classList.toggle("is-active", mode === "form");
    if (mode === "flow") {
      renderFlowchart();
    }
  }

  // ---------- 图片上传（人物图片 / 剧情背景 / 场景背景） ----------
  /**
   * 读取图片文件，等比压缩后转成 data URL。
   * 压缩是为了避免把原图写进故事文件与草稿后撑爆浏览器存储。
   */
  function readImageFile(file, maxSize, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        try {
          cb(canvas.toDataURL("image/jpeg", 0.82));
        } catch (err) {
          cb(null);
        }
      };
      img.onerror = function () { cb(null); };
      img.src = e.target.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  function setImagePreview(imgId, dataUrl) {
    var img = $(imgId);
    if (!img) {
      return;
    }
    if (dataUrl) {
      img.src = dataUrl;
      img.classList.remove("is-hidden");
    } else {
      img.removeAttribute("src");
      img.classList.add("is-hidden");
    }
  }

  /** 宽窄变化（横竖屏切换）时，若排版模式改变则重新排版并调整视角。 */
  function onWindowResize() {
    clearTimeout(flowResizeTimer);
    flowResizeTimer = setTimeout(function () {
      if (viewMode !== "flow") {
        return;
      }
      var mode = flowMode();
      if (mode === lastFlowMode) {
        return;
      }
      lastFlowMode = mode;
      renderFlowchart();
      if (mode === "narrow") {
        flowReset();
      } else {
        flowFit();
      }
    }, 250);
  }

  // ---------- 人物立绘（按情绪，可选功能） ----------
  var uploadingEmotion = null;

  function renderPortraits() {
    var box = $("portraitList");
    var c = currentCharacter();
    if (!box) {
      return;
    }
    box.innerHTML = "";
    if (!c) {
      return;
    }
    c.portraits = c.portraits || {};
    var emotions = Object.keys(c.portraits);
    if (!emotions.length) {
      box.appendChild(el("div", "ed-hint", "尚未添加立绘；添加后可在剧情或对话中按情绪显示。「普通」会作为默认。"));
      return;
    }
    emotions.forEach(function (emotion) {
      var row = el("div", "portrait-row", null);
      row.appendChild(el("span", "portrait-emotion", emotion));
      var img = el("img", "ed-image-preview" + (c.portraits[emotion] ? "" : " is-hidden"), null);
      if (c.portraits[emotion]) {
        img.src = c.portraits[emotion];
        img.alt = emotion;
      }
      row.appendChild(img);
      var actions = el("div", "ed-image-actions", null);
      actions.appendChild(makeBtn("上传图片", function () {
        uploadingEmotion = emotion;
        $("portraitFile").click();
      }));
      actions.appendChild(makeBtn("删除", function () {
        delete c.portraits[emotion];
        renderPortraits();
      }));
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  function addEmotion() {
    var c = currentCharacter();
    if (!c) {
      return;
    }
    var name = prompt("输入情绪名称，例如：开心、生气、害羞（「普通」会作为默认）", "开心");
    if (!name) {
      return;
    }
    name = name.trim();
    if (!name) {
      return;
    }
    c.portraits = c.portraits || {};
    if (c.portraits[name] !== undefined) {
      toast("该情绪已存在");
      return;
    }
    c.portraits[name] = "";
    renderPortraits();
  }

  /** 场景表单里的立绘选择（角色 + 情绪）。 */
  function renderScenePortrait(scene) {
    var sel = $("fPortraitChar");
    sel.innerHTML = "";
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "（不显示立绘）";
    sel.appendChild(none);
    (story.characters || []).forEach(function (ch) {
      var o = document.createElement("option");
      o.value = ch.id;
      o.textContent = ch.name || ch.id;
      sel.appendChild(o);
    });
    var portrait = scene.portrait || {};
    sel.value = portrait.characterId || "";
    $("fPortraitEmotion").value = portrait.emotion || "";
  }

  /** 流程图详情面板里的立绘选择（角色 + 情绪）。 */
  function renderFlowPortrait(scene) {
    var sel = $("fFlowPortraitChar");
    sel.innerHTML = "";
    var none = document.createElement("option");
    none.value = "";
    none.textContent = "（不显示立绘）";
    sel.appendChild(none);
    (story.characters || []).forEach(function (ch) {
      var o = document.createElement("option");
      o.value = ch.id;
      o.textContent = ch.name || ch.id;
      sel.appendChild(o);
    });
    var portrait = scene.portrait || {};
    sel.value = portrait.characterId || "";
    $("fFlowPortraitEmotion").value = portrait.emotion || "";
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $("btnNewStory").addEventListener("click", newStory);
    $("btnSaveDraft").addEventListener("click", saveDraft);
    $("btnImport").addEventListener("click", function () {
      $("fileInput").click();
    });
    $("fileInput").addEventListener("change", function (ev) {
      if (ev.target.files && ev.target.files[0]) {
        importJson(ev.target.files[0]);
      }
      ev.target.value = "";
    });
    $("btnExportJson").addEventListener("click", exportJson);
    $("btnExportJs").addEventListener("click", exportJs);
    $("btnAddChapter").addEventListener("click", addChapter);
    $("btnAddScene").addEventListener("click", addScene);
    $("btnAddChoice").addEventListener("click", addChoice);
    $("btnBranch").addEventListener("click", branchScene);
    $("btnSetStart").addEventListener("click", setStartScene);
    $("btnDeleteScene").addEventListener("click", function () {
      if (selectedSceneId) {
        deleteScene(selectedSceneId);
      }
    });

    // 故事信息
    $("fTitle").addEventListener("input", function () {
      story.title = this.value;
    });
    $("fSubtitle").addEventListener("input", function () {
      story.subtitle = this.value;
    });
    $("fDescription").addEventListener("input", function () {
      story.description = this.value;
    });
    $("fTheme").addEventListener("change", function () {
      story.theme = this.value;
    });

    // 章节设置
    $("fChapterTitle").addEventListener("input", function () {
      var chapter = currentChapter();
      if (!chapter) {
        return;
      }
      chapter.title = this.value;
      renderChapterList();
    });
    $("fChapterSubtitle").addEventListener("input", function () {
      var chapter = currentChapter();
      if (!chapter) {
        return;
      }
      chapter.subtitle = this.value;
      renderChapterList();
    });

    // 场景编辑
    $("fSpeaker").addEventListener("input", function () {
      var scene = currentScene();
      if (!scene) {
        return;
      }
      scene.speaker = this.value;
      renderSceneList();
    });
    $("fText").addEventListener("input", function () {
      var scene = currentScene();
      if (!scene) {
        return;
      }
      scene.text = this.value;
      renderSceneList();
    });
    $("fTexture").addEventListener("change", function () {
      var scene = currentScene();
      if (!scene) {
        return;
      }
      scene.texture = this.value;
    });
    $("fNext").addEventListener("change", function () {
      var scene = currentScene();
      if (!scene) {
        return;
      }
      scene.next = this.value;
    });
    $("fDialogue").addEventListener("input", function () {
      var scene = currentScene();
      if (!scene) {
        return;
      }
      scene.dialogue = this.value || undefined;
    });

    // 人物系统
    $("btnAddCharacter").addEventListener("click", addCharacter);
    $("btnDeleteCharacter").addEventListener("click", function () {
      if (selectedCharacterId) {
        deleteCharacter(selectedCharacterId);
      }
    });
    $("fCharName").addEventListener("input", function () {
      var c = currentCharacter();
      if (c) {
        c.name = this.value;
        renderCharacters();
      }
    });
    $("fCharRole").addEventListener("input", function () {
      var c = currentCharacter();
      if (c) {
        c.role = this.value;
      }
    });
    $("fCharPersonality").addEventListener("input", function () {
      var c = currentCharacter();
      if (c) {
        c.personality = this.value;
      }
    });
    $("fCharDesc").addEventListener("input", function () {
      var c = currentCharacter();
      if (c) {
        c.description = this.value;
      }
    });
    $("fCharAffinity").addEventListener("input", function () {
      var c = currentCharacter();
      if (c) {
        c.affinity = parseInt(this.value, 10) || 0;
        renderCharacters();
      }
    });
    $("fCharTarget").addEventListener("input", function () {
      var c = currentCharacter();
      if (c) {
        c.target = parseInt(this.value, 10) || 0;
        renderCharacters();
      }
    });

    // 对话编辑
    $("btnAddDialogue").addEventListener("click", addDialogue);
    $("btnDeleteDialogue").addEventListener("click", function () {
      if (selectedDialogueId) {
        deleteDialogue(selectedDialogueId);
      }
    });
    $("btnAddLine").addEventListener("click", function () {
      var entry = currentDialogue();
      if (!entry) {
        return;
      }
      entry.lines = entry.lines || [];
      entry.lines.push({ speaker: "旁白", text: "" });
      renderLineList();
    });
    $("fDlgId").addEventListener("input", function () {
      renameDialogue(this.value.trim());
    });
    $("fDlgChar").addEventListener("input", function () {
      var entry = currentDialogue();
      if (entry) {
        entry.characterId = this.value;
      }
    });
    $("fDlgTitle").addEventListener("input", function () {
      var entry = currentDialogue();
      if (entry) {
        entry.title = this.value;
      }
    });
    $("fDlgAffinity").addEventListener("input", function () {
      var entry = currentDialogue();
      if (!entry) {
        return;
      }
      var parsed = parseAffinityText(this.value);
      entry.affinity = Object.keys(parsed).length ? parsed : undefined;
    });

    // 导入 / 导出对话文件
    $("btnImportDialog").addEventListener("click", openDialogImport);
    $("btnImportDialogLocal").addEventListener("click", openDialogImport);
    $("dialogFileInput").addEventListener("change", function (ev) {
      if (ev.target.files && ev.target.files[0]) {
        importDialogues(ev.target.files[0]);
      }
      ev.target.value = "";
    });
    $("btnExportDialog").addEventListener("click", exportDialogues);

    // 提交审核
    $("btnSubmitStory").addEventListener("click", submitStory);
    $("btnSubmitDialog").addEventListener("click", submitDialogues);

    // 流程图视图
    $("btnFlowView").addEventListener("click", function () { switchView("flow"); });
    $("btnFormView").addEventListener("click", function () { switchView("form"); });
    $("btnFlowZoomIn").addEventListener("click", function () { flowZoom(1.2); });
    $("btnFlowZoomOut").addEventListener("click", function () { flowZoom(1 / 1.2); });
    $("btnFlowReset").addEventListener("click", flowReset);
    $("btnFlowFit").addEventListener("click", flowFit);
    $("btnFlowDetailClose").addEventListener("click", closeFlowDetail);
    $("btnFlowAddScene").addEventListener("click", function () {
      addScene();
      flowSelectedId = selectedSceneId;
      renderFlowNodes(flowChapter());
      renderFlowDetail();
    });
    $("btnFlowEditDialogue").addEventListener("click", function () {
      var chapter = flowChapter();
      var scene = chapter && chapter.scenes[flowSelectedId];
      if (!scene || !scene.dialogue) {
        toast("该场景未关联对话");
        return;
      }
      selectedDialogueId = scene.dialogue;
      switchView("form");
      renderDialogues();
      renderDialogueForm();
    });
    $("btnFlowDeleteScene").addEventListener("click", function () {
      if (!flowSelectedId) {
        return;
      }
      if (deleteScene(flowSelectedId)) {
        flowSelectedId = null;
        $("flowDetail").classList.add("is-hidden");
        renderFlowchart();
      }
    });

    // 流程图上直接编辑剧情
    $("fFlowSpeaker").addEventListener("input", function () {
      var chapter = flowChapter();
      var scene = chapter && chapter.scenes[flowSelectedId];
      if (!scene) {
        return;
      }
      scene.speaker = this.value;
      refreshFlowNodeText(flowSelectedId, scene);
    });
    $("fFlowText").addEventListener("input", function () {
      var chapter = flowChapter();
      var scene = chapter && chapter.scenes[flowSelectedId];
      if (!scene) {
        return;
      }
      scene.text = this.value;
      refreshFlowNodeText(flowSelectedId, scene);
    });
    $("fFlowNext").addEventListener("change", function () {
      var chapter = flowChapter();
      var scene = chapter && chapter.scenes[flowSelectedId];
      if (!scene) {
        return;
      }
      scene.next = this.value || undefined;
      renderFlowchart();
    });
    $("fFlowDialogue").addEventListener("change", function () {
      var chapter = flowChapter();
      var scene = chapter && chapter.scenes[flowSelectedId];
      if (!scene) {
        return;
      }
      scene.dialogue = this.value || undefined;
      renderFlowchart();
      renderFlowDialoguePreview();
    });
    // 流程图：场景立绘（角色 + 情绪）
    $("fFlowPortraitChar").addEventListener("change", function () {
      var chapter = flowChapter();
      var scene = chapter && chapter.scenes[flowSelectedId];
      if (!scene) {
        return;
      }
      if (!this.value) {
        scene.portrait = undefined;
        $("fFlowPortraitEmotion").value = "";
        return;
      }
      scene.portrait = scene.portrait || {};
      scene.portrait.characterId = this.value;
      scene.portrait.emotion = $("fFlowPortraitEmotion").value || "";
    });
    $("fFlowPortraitEmotion").addEventListener("input", function () {
      var chapter = flowChapter();
      var scene = chapter && chapter.scenes[flowSelectedId];
      if (!scene || !scene.portrait) {
        return;
      }
      scene.portrait.emotion = this.value || "";
    });
    $("flowChapterSelect").addEventListener("change", function () {
      flowChapterId = this.value;
      selectedChapterId = this.value;
      flowSelectedId = null;
      closeFlowDetail();
      renderChapterList();
      renderChapterForm();
      renderSceneList();
      renderFlowchart();
    });
    $("flowCanvas").addEventListener("pointerdown", function (ev) {
      if (ev.target.closest(".flow-node")) {
        return;
      }
      startPan(ev);
    });
    $("flowCanvas").addEventListener("wheel", function (ev) {
      ev.preventDefault();
      flowZoom(ev.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    document.addEventListener("pointermove", onFlowPointerMove);
    document.addEventListener("pointerup", onFlowPointerUp);

    // 图片上传：人物图片 / 剧情背景 / 场景背景
    $("btnCharImageUpload").addEventListener("click", function () { $("charImageFile").click(); });
    $("charImageFile").addEventListener("change", function (ev) {
      var file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) {
        return;
      }
      readImageFile(file, 480, function (url) {
        var c = currentCharacter();
        if (!c || !url) {
          toast("图片读取失败");
          return;
        }
        c.image = url;
        setImagePreview("charImagePreview", url);
        toast("已设置人物图片");
      });
    });
    $("btnCharImageClear").addEventListener("click", function () {
      var c = currentCharacter();
      if (!c) {
        return;
      }
      c.image = undefined;
      setImagePreview("charImagePreview", null);
    });

    // 人物立绘（按情绪）
    $("btnAddEmotion").addEventListener("click", addEmotion);
    $("portraitFile").addEventListener("change", function (ev) {
      var file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) {
        return;
      }
      var emotion = uploadingEmotion;
      readImageFile(file, 900, function (url) {
        var c = currentCharacter();
        if (!c || !url) {
          toast("图片读取失败");
          return;
        }
        c.portraits = c.portraits || {};
        c.portraits[emotion] = url;
        renderPortraits();
        toast("已设置「" + emotion + "」立绘");
      });
    });

    // 场景立绘（角色 + 情绪）
    $("fPortraitChar").addEventListener("change", function () {
      var scene = currentScene();
      if (!scene) {
        return;
      }
      if (!this.value) {
        scene.portrait = undefined;
        $("fPortraitEmotion").value = "";
        return;
      }
      scene.portrait = scene.portrait || {};
      scene.portrait.characterId = this.value;
      scene.portrait.emotion = $("fPortraitEmotion").value || "";
    });
    $("fPortraitEmotion").addEventListener("input", function () {
      var scene = currentScene();
      if (!scene) {
        return;
      }
      if (!scene.portrait) {
        return;
      }
      scene.portrait.emotion = this.value || "";
    });

    $("btnStoryBgUpload").addEventListener("click", function () { $("storyBgFile").click(); });
    $("storyBgFile").addEventListener("change", function (ev) {
      var file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) {
        return;
      }
      readImageFile(file, 1280, function (url) {
        if (!url) {
          toast("图片读取失败");
          return;
        }
        story.background = url;
        setImagePreview("storyBgPreview", url);
        toast("已设置剧情背景图");
      });
    });
    $("btnStoryBgClear").addEventListener("click", function () {
      story.background = undefined;
      setImagePreview("storyBgPreview", null);
    });

    $("btnSceneBgUpload").addEventListener("click", function () { $("sceneBgFile").click(); });
    $("sceneBgFile").addEventListener("change", function (ev) {
      var file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) {
        return;
      }
      readImageFile(file, 1280, function (url) {
        var s = currentScene();
        if (!s || !url) {
          toast("图片读取失败");
          return;
        }
        s.background = url;
        setImagePreview("sceneBgPreview", url);
        toast("已设置场景背景图");
      });
    });
    $("btnSceneBgClear").addEventListener("click", function () {
      var s = currentScene();
      if (!s) {
        return;
      }
      s.background = undefined;
      setImagePreview("sceneBgPreview", null);
    });

    $("btnFlowBgUpload").addEventListener("click", function () { $("flowBgFile").click(); });
    $("flowBgFile").addEventListener("change", function (ev) {
      var file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) {
        return;
      }
      readImageFile(file, 1280, function (url) {
        var chapter = flowChapter();
        var s = chapter && chapter.scenes[flowSelectedId];
        if (!s || !url) {
          toast("图片读取失败");
          return;
        }
        s.background = url;
        setImagePreview("flowBgPreview", url);
        toast("已设置场景背景图");
      });
    });
    $("btnFlowBgClear").addEventListener("click", function () {
      var chapter = flowChapter();
      var s = chapter && chapter.scenes[flowSelectedId];
      if (!s) {
        return;
      }
      s.background = undefined;
      setImagePreview("flowBgPreview", null);
    });

    // 流程图使用说明
    $("btnFlowHelp").addEventListener("click", function () {
      $("flowHelpModal").classList.remove("is-hidden");
    });
    $("btnCloseFlowHelp").addEventListener("click", function () {
      $("flowHelpModal").classList.add("is-hidden");
    });
    $("flowHelpBackdrop").addEventListener("click", function () {
      $("flowHelpModal").classList.add("is-hidden");
    });

    // 横竖屏切换时按需重新排版
    window.addEventListener("resize", onWindowResize);

    bindDragAndDrop();

    // 故事库 / 指南 / 预览
    $("btnGuide").addEventListener("click", openGuide);
    $("btnCloseGuide").addEventListener("click", closeGuide);
    $("guideBackdrop").addEventListener("click", closeGuide);
    $("btnClosePreview").addEventListener("click", closePreview);
    $("previewBackdrop").addEventListener("click", closePreview);
  }

  // ---------- 初始化 ----------
  function populateStaticSelects() {
    var themeSelect = $("fTheme");
    themeSelect.innerHTML = "";
    THEMES.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.name;
      themeSelect.appendChild(o);
    });

    var textureSelect = $("fTexture");
    textureSelect.innerHTML = "";
    TEXTURES.forEach(function (kind) {
      var o = document.createElement("option");
      o.value = kind;
      o.textContent = kind;
      textureSelect.appendChild(o);
    });
  }

  function init() {
    if (window.AssetCheck) {
      AssetCheck.verify("--wtg-editor-css-version", "7", "editor.css", "编辑器样式");
    }
    populateStaticSelects();
    story = makeNewStory();
    selectedChapterId = story.chapters[0].id;
    selectedSceneId = story.chapters[0].startScene;
    flowChapterId = selectedChapterId;
    loadFlowPositions();
    lastFlowMode = flowMode();
    bindEvents();
    renderAll();
    loadDialogues();
    // 首次进入时把整张图调整到合适视角（此时布局已完成，clientWidth 才有效）
    setTimeout(function () {
      if (viewMode !== "flow") {
        return;
      }
      if (isNarrowFlow()) {
        flowReset();
      } else {
        flowFit();
      }
    }, 120);
  }

  init();
})();

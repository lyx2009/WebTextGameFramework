/* ==========================================================================
   chapter.js
   章节引擎模块
   职责：
   1. 读取当前故事（由 main.js 通过 loadStory 注入），维护
      "当前章节 + 当前场景 + 标记 + 通关记录"的游戏状态。
   2. 提供推进剧情、选择分支、跳转章节、判断解锁等能力。
   3. 将游戏状态按"故事 id"隔离持久化到 localStorage，支持"继续游戏"。

   本模块只处理流程逻辑，不负责渲染（渲染交给 main.js，贴图交给 render.js）。
   ========================================================================== */

window.ChapterSystem = (function () {
  var STORAGE_PREFIX = "wtg2_save_";
  var END_MARK = "__chapterEnd__";
  var FINISH_MARK = "__finished__";

  var story = null;
  var storyId = null;
  var state = null;

  /** 生成一份全新的初始状态。 */
  function defaultState() {
    return {
      chapterIndex: 0,
      sceneId: null,
      flags: {},
      completedChapters: [],
      affinity: {}
    };
  }

  /** 当前故事自动存档的 localStorage 键。 */
  function storageKey() {
    return STORAGE_PREFIX + (storyId || "default");
  }

  /** 载入剧情数据：切换故事时会重置状态，避免不同故事之间串档。 */
  function loadStory(data) {
    story = data;
    storyId = (data && data.id) ? data.id : "default";
    state = defaultState();
    if (story && story.chapters && story.chapters.length) {
      state.sceneId = story.chapters[0].startScene;
    }
  }

  function getChapter(index) {
    return story && story.chapters[index] ? story.chapters[index] : null;
  }

  function getCurrentChapter() {
    return getChapter(state.chapterIndex);
  }

  function getScene(id) {
    var chapter = getCurrentChapter();
    return chapter && chapter.scenes ? chapter.scenes[id] : null;
  }

  function getCurrentScene() {
    return getScene(state.sceneId);
  }

  /** 开始新游戏：清空状态并进入第一章。 */
  function startNew() {
    state = defaultState();
    state.chapterIndex = 0;
    state.sceneId = story.chapters[0].startScene;
    save();
  }

  /** 跳转到指定章节的起始场景（需已解锁）。 */
  function enterChapter(index) {
    var chapter = getChapter(index);
    if (!chapter) {
      return false;
    }
    state.chapterIndex = index;
    state.sceneId = chapter.startScene;
    save();
    return true;
  }

  /** 处理一个选项：写入标记并推进到目标场景。 */
  function choose(choice) {
    if (!choice) {
      return;
    }
    if (choice.set) {
      state.flags[choice.set] = true;
    }
    if (choice.next === END_MARK) {
      completeChapter();
      return;
    }
    state.sceneId = choice.next;
    save();
  }

  /** 处理无选项时的线性推进。 */
  function advance() {
    var scene = getCurrentScene();
    if (!scene) {
      return;
    }
    if (scene.next === END_MARK) {
      completeChapter();
      return;
    }
    state.sceneId = scene.next;
    save();
  }

  /** 章节完成：记录通关，进入下一章；若已是最后一章则标记为已通关。 */
  function completeChapter() {
    if (state.completedChapters.indexOf(state.chapterIndex) === -1) {
      state.completedChapters.push(state.chapterIndex);
    }
    state.completedChapters.sort();

    var nextIndex = state.chapterIndex + 1;
    if (nextIndex < story.chapters.length) {
      state.chapterIndex = nextIndex;
      state.sceneId = story.chapters[nextIndex].startScene;
    } else {
      state.sceneId = FINISH_MARK;
    }
    save();
  }

  /** 是否已通关全部章节。 */
  function isFinished() {
    return state.sceneId === FINISH_MARK;
  }

  /** 章节是否已解锁（第一章默认解锁，其余需通关前一章）。 */
  function isChapterUnlocked(index) {
    if (index === 0) {
      return true;
    }
    return state.completedChapters.indexOf(index - 1) !== -1;
  }

  /** 某章节是否已通关。 */
  function isChapterCompleted(index) {
    return state.completedChapters.indexOf(index) !== -1;
  }

  /** 是否存在当前故事的自动存档。 */
  function hasSave() {
    try {
      return !!localStorage.getItem(storageKey());
    } catch (e) {
      return false;
    }
  }

  /** 从 localStorage 恢复当前故事状态，返回是否成功。 */
  function load() {
    try {
      var raw = localStorage.getItem(storageKey());
      if (!raw) {
        return false;
      }
      var parsed = JSON.parse(raw);
      state = mergeState(defaultState(), parsed);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 合并默认状态与存档，避免旧存档字段缺失导致异常。 */
  function mergeState(base, saved) {
    var out = {};
    for (var key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        out[key] = base[key];
      }
    }
    for (var key2 in saved) {
      if (Object.prototype.hasOwnProperty.call(saved, key2)) {
        out[key2] = saved[key2];
      }
    }
    return out;
  }

  function save() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch (e) {
      // 忽略写入失败
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(storageKey());
    } catch (e) {
      // 忽略
    }
  }

  /** 导出当前游戏状态（深拷贝），供手动存档系统抓取精确位置。 */
  function getState() {
    return JSON.parse(JSON.stringify(state));
  }

  /** 从手动存档恢复游戏状态，并同步到自动存档（继续游戏）。 */
  function setState(savedState) {
    if (!savedState) {
      return;
    }
    var copy = JSON.parse(JSON.stringify(savedState));
    state = mergeState(defaultState(), copy);
    save();
  }

  /** 读取某角色的当前好感度。 */
  function getAffinity(characterId) {
    return (state.affinity && state.affinity[characterId]) || 0;
  }

  /** 好感度增减（deltas 形如 { lin: 1, zhou: -1 }）。 */
  function addAffinity(deltas) {
    if (!deltas) {
      return;
    }
    state.affinity = state.affinity || {};
    for (var key in deltas) {
      if (Object.prototype.hasOwnProperty.call(deltas, key)) {
        state.affinity[key] = (state.affinity[key] || 0) + deltas[key];
      }
    }
    save();
  }

  return {
    loadStory: loadStory,
    getChapters: function () { return story.chapters; },
    getMeta: function () {
      return story ? { id: story.id, title: story.title, subtitle: story.subtitle } : null;
    },
    getStoryId: function () { return storyId; },
    getCharacters: function () { return story.characters || []; },
    getStory: function () { return story; },
    getCurrentChapter: getCurrentChapter,
    getCurrentScene: getCurrentScene,
    getScene: getScene,
    startNew: startNew,
    enterChapter: enterChapter,
    choose: choose,
    advance: advance,
    isFinished: isFinished,
    isChapterUnlocked: isChapterUnlocked,
    isChapterCompleted: isChapterCompleted,
    hasSave: hasSave,
    load: load,
    clearSave: clearSave,
    getFlags: function () { return state.flags; },
    getAffinity: getAffinity,
    addAffinity: addAffinity,
    getState: getState,
    setState: setState
  };
})();

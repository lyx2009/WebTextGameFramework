/* ==========================================================================
   save.js
   手动存档管理模块
   职责：
   1. 按"故事 + 用户名"双层隔离存档，每个用户名在每个故事下拥有固定数量的
      档位（默认 10 个），互不串档。
   2. 存档记录精确到当前章节 + 当前场景（即每一段话 / 每一个选择点），
      通过 ChapterSystem.getState() 抓取完整游戏状态。
   3. 数据持久化在浏览器 localStorage（容量比 cookie 更大、更适合结构数据）。
   4. 提供导出 / 导入 JSON 文件的能力，导出的文件按用户名命名并携带故事 id，
      可整理到项目 saves/ 目录下长期保存与迁移。

   存档文件格式（JSON）：
   {
     format: "wtg-saves",
     version: 2,
     storyId: "dawn-realm",
     username: "玩家",
     exportedAt: 时间戳,
     slots: [ 存档记录或 null, ... 共 10 项 ]
   }

   每条存档记录：
   {
     username, slot, time,
     chapterTitle, speaker, preview,   // 用于界面摘要展示
     state: { chapterIndex, sceneId, flags, completedChapters }  // 精确游戏位置
   }
   ========================================================================== */

window.SaveManager = (function () {
  var USERS_KEY = "wtg2_users";
  var SLOT_PREFIX = "wtg2_slots_";
  var LAST_USER_KEY = "wtg2_lastuser";
  var MAX_SLOTS = 10;
  var FORMAT = "wtg-saves";
  var VERSION = 2;

  var storyId = null;

  // ---------- 故事上下文 ----------
  /** 设置当前故事，用于槽位隔离。 */
  function setStoryId(id) {
    storyId = id || "default";
  }

  function getStoryId() {
    return storyId || "default";
  }

  // ---------- 底层存储 ----------
  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // 忽略写入失败
    }
  }

  // ---------- 用户名列表（全局共享） ----------
  function getUsers() {
    var raw = storageGet(USERS_KEY);
    try {
      var arr = JSON.parse(raw || "null");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function setUsers(users) {
    storageSet(USERS_KEY, JSON.stringify(users));
  }

  /** 记录一个用户名（去重）。 */
  function addUser(username) {
    if (!username) {
      return;
    }
    var users = getUsers();
    if (users.indexOf(username) === -1) {
      users.push(username);
      setUsers(users);
    }
  }

  // ---------- 槽位（按故事 + 用户名隔离） ----------
  function slotKey(targetStory, username) {
    return SLOT_PREFIX + encodeURIComponent(targetStory) + "_" + encodeURIComponent(username);
  }

  function emptySlots() {
    return new Array(MAX_SLOTS).fill(null);
  }

  function getSlots(targetStory, username) {
    var raw = storageGet(slotKey(targetStory, username));
    try {
      var arr = JSON.parse(raw || "null");
      if (Array.isArray(arr) && arr.length === MAX_SLOTS) {
        return arr;
      }
    } catch (e) {
      // 数据损坏时回退为空档位
    }
    return emptySlots();
  }

  function setSlots(targetStory, username, slots) {
    storageSet(slotKey(targetStory, username), JSON.stringify(slots));
  }

  // ---------- 存档读写（作用于当前故事） ----------
  /** 构造一条存档记录：抓取当前章节引擎的精确位置。 */
  function buildRecord(username, slotIndex) {
    var chapter = ChapterSystem.getCurrentChapter();
    var scene = ChapterSystem.getCurrentScene();
    return {
      username: username,
      slot: slotIndex,
      time: Date.now(),
      chapterTitle: chapter ? chapter.title : "",
      speaker: scene ? (scene.speaker || "旁白") : "",
      preview: scene ? scene.text.replace(/\s+/g, " ").slice(0, 30) : "",
      state: ChapterSystem.getState()
    };
  }

  /** 保存到当前故事的指定槽位（允许覆盖）。 */
  function write(username, slotIndex) {
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
      return;
    }
    var slots = getSlots(getStoryId(), username);
    slots[slotIndex] = buildRecord(username, slotIndex);
    setSlots(getStoryId(), username, slots);
    addUser(username);
    setLastUser(username);
  }

  /** 读取当前故事某个槽位记录，无则返回 null。 */
  function read(username, slotIndex) {
    if (slotIndex < 0 || slotIndex >= MAX_SLOTS) {
      return null;
    }
    return getSlots(getStoryId(), username)[slotIndex];
  }

  /** 读取存档并恢复到章节引擎，成功返回 true。 */
  function load(username, slotIndex) {
    var record = read(username, slotIndex);
    if (record && record.state) {
      ChapterSystem.setState(record.state);
      setLastUser(username);
      return true;
    }
    return false;
  }

  // ---------- 最近用户名（全局） ----------
  function getLastUser() {
    return storageGet(LAST_USER_KEY) || "";
  }

  function setLastUser(username) {
    storageSet(LAST_USER_KEY, username);
  }

  // ---------- 导入 / 导出 ----------
  /** 导出当前故事下某个用户名的存档为可序列化对象。 */
  function exportData(username) {
    return {
      format: FORMAT,
      version: VERSION,
      storyId: getStoryId(),
      username: username,
      exportedAt: Date.now(),
      slots: getSlots(getStoryId(), username)
    };
  }

  /** 导入存档数据：写入文件所属的故事下，覆盖该用户名的现有槽位。 */
  function importData(username, data) {
    var targetStory = (data && data.storyId) ? data.storyId : getStoryId();
    var slots = emptySlots();
    if (data && Array.isArray(data.slots)) {
      for (var i = 0; i < MAX_SLOTS; i++) {
        slots[i] = data.slots[i] || null;
      }
    }
    setSlots(targetStory, username, slots);
    addUser(username);
    setLastUser(username);
  }

  return {
    MAX_SLOTS: MAX_SLOTS,
    setStoryId: setStoryId,
    getStoryId: getStoryId,
    getUsers: getUsers,
    addUser: addUser,
    getSlots: getSlots,
    write: write,
    read: read,
    load: load,
    getLastUser: getLastUser,
    setLastUser: setLastUser,
    exportData: exportData,
    importData: importData
  };
})();

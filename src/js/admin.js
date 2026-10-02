/* ==========================================================================
   admin.js
   管理后台逻辑
   职责：
   1. 登录校验（默认账号 admin，密码 123456@，前端实现）。
   2. 故事管理：列出内置 + 自定义故事，支持预览、导出、删除（自定义）。
   3. 存档管理：按故事查看自动存档与各用户的手动槽位，支持单条 / 整用户 / 全部删除。

   数据与游戏（index.html）、编辑器（edit.html）共享同一套 localStorage 键。
   ========================================================================== */

(function () {
  "use strict";

  var AUTH_KEY = "wtg2_admin_auth";
  var ADMIN_USER = "admin";
  var ADMIN_PASS = "123456@";

  var CUSTOM_KEY = "wtg2_stories";
  var DRAFTS_KEY = "wtg2_editor_drafts";
  var USERS_KEY = "wtg2_users";
  var LAST_USER_KEY = "wtg2_lastuser";
  var SAVE_PREFIX = "wtg2_save_";
  var SLOT_PREFIX = "wtg2_slots_";
  var MAX_SLOTS = 10;

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
      // 忽略
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // 忽略
    }
  }

  function storageKeys() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        out.push(localStorage.key(i));
      }
    } catch (e) {
      // 忽略
    }
    return out;
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

  function btn(label, onClick, danger) {
    var b = el("button", "mgmt-btn mgmt-btn-small" + (danger ? " mgmt-btn-danger" : " mgmt-btn-ghost"), label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------- 登录 ----------
  var serverAvailable = false;

  function isAuthed() {
    if (window.Api && Api.isLoggedIn()) {
      return true;
    }
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function showLogin() {
    $("loginView").classList.remove("is-hidden");
    $("dashboard").classList.add("is-hidden");
  }

  function showDashboard() {
    $("loginView").classList.add("is-hidden");
    $("dashboard").classList.remove("is-hidden");
    renderAll();
  }

  function loginFailed(message) {
    var box = $("loginError");
    box.textContent = message || "账号或密码错误";
    box.classList.remove("is-hidden");
  }

  function loginLocally(user, pass) {
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      try {
        sessionStorage.setItem(AUTH_KEY, "1");
      } catch (e) {
        // 忽略
      }
      $("loginError").classList.add("is-hidden");
      showDashboard();
      return true;
    }
    loginFailed();
    return false;
  }

  /** 有后端时交由后端校验，否则退化为前端校验（纯静态部署）。 */
  function tryLogin() {
    var user = $("loginUser").value.trim();
    var pass = $("loginPass").value;
    if (serverAvailable && window.Api) {
      Api.login(user, pass).then(function () {
        $("loginError").classList.add("is-hidden");
        showDashboard();
      }).catch(function (err) {
        loginFailed(err.message);
      });
      return;
    }
    loginLocally(user, pass);
  }

  function logout() {
    try {
      sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {
      // 忽略
    }
    if (window.Api && Api.isLoggedIn()) {
      Api.logout().then(function () {
        showLogin();
      });
      return;
    }
    showLogin();
  }

  /** 检测后端是否可用（纯静态部署时审核功能不可用）。 */
  function checkServer() {
    if (!window.Api) {
      serverAvailable = false;
      return Promise.resolve(false);
    }
    return Api.available().then(function (ok) {
      serverAvailable = ok;
      return ok;
    }).catch(function () {
      serverAvailable = false;
      return false;
    });
  }

  // ---------- 数据读取 ----------
  function getCustomStories() {
    var raw = storageGet(CUSTOM_KEY);
    try {
      var arr = JSON.parse(raw || "null");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomStories(list) {
    storageSet(CUSTOM_KEY, JSON.stringify(list));
  }

  function getDrafts() {
    var raw = storageGet(DRAFTS_KEY);
    try {
      var obj = JSON.parse(raw || "null");
      return obj && typeof obj === "object" ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function allStories() {
    var list = [];
    StoryRegistry.list().forEach(function (s) {
      list.push({ story: s, custom: false });
    });
    getCustomStories().forEach(function (s) {
      list.push({ story: s, custom: true });
    });
    return list;
  }

  function getSlots(storyId, username) {
    var raw = storageGet(SLOT_PREFIX + storyId + "_" + username);
    try {
      var arr = JSON.parse(raw || "null");
      return Array.isArray(arr) ? arr : new Array(MAX_SLOTS).fill(null);
    } catch (e) {
      return new Array(MAX_SLOTS).fill(null);
    }
  }

  function usersForStory(storyId) {
    var prefix = SLOT_PREFIX + storyId + "_";
    var users = [];
    storageKeys().forEach(function (k) {
      if (k.indexOf(prefix) === 0) {
        var name = k.slice(prefix.length);
        if (name && users.indexOf(name) === -1) {
          users.push(name);
        }
      }
    });
    return users;
  }

  // ---------- 渲染：故事 ----------
  function renderStories() {
    var box = $("storyAdminList");
    box.innerHTML = "";
    var list = allStories();
    if (!list.length) {
      box.appendChild(el("p", "mgmt-empty", "暂无故事"));
      return;
    }
    list.forEach(function (entry) {
      box.appendChild(storyRow(entry.story, entry.custom));
    });
  }

  function storyRow(story, custom) {
    var card = el("div", "mgmt-card", null);
    var head = el("div", "mgmt-card-head", null);
    head.appendChild(el("span", "mgmt-title", story.title || story.id));
    head.appendChild(el("span", "badge", custom ? "自定义" : "内置"));
    head.appendChild(el("span", "mgmt-meta", "主题 " + (story.theme || "默认") + " · " + (story.chapters ? story.chapters.length : 0) + " 章"));
    card.appendChild(head);

    var actions = el("div", "mgmt-actions", null);
    actions.appendChild(btn("预览", function () {
      window.open("index.html?story=" + encodeURIComponent(story.id), "_blank");
    }));
    actions.appendChild(btn("导出", function () {
      exportStory(story);
    }));
    if (custom) {
      actions.appendChild(btn("删除", function () {
        deleteStory(story.id);
      }, true));
    }
    card.appendChild(actions);
    return card;
  }

  function exportStory(story) {
    var data = { format: "wtg-story", version: 1, story: JSON.parse(JSON.stringify(story)) };
    download(JSON.stringify(data, null, 2), (story.title || story.id) + ".story.json", "application/json");
    toast("已导出「" + (story.title || story.id) + "」");
  }

  function deleteStory(id) {
    if (!confirm("删除该自定义故事？其相关存档也会一并删除。")) {
      return;
    }
    var customs = getCustomStories().filter(function (s) {
      return s.id !== id;
    });
    saveCustomStories(customs);

    // 删除该故事的自动存档与手动槽位
    storageRemove(SAVE_PREFIX + id);
    storageKeys().forEach(function (k) {
      if (k.indexOf(SLOT_PREFIX + id + "_") === 0) {
        storageRemove(k);
      }
    });

    renderAll();
    toast("已删除故事");
  }

  // ---------- 渲染：草稿 ----------
  function renderDrafts() {
    var box = $("draftAdminList");
    box.innerHTML = "";
    var drafts = getDrafts();
    var ids = Object.keys(drafts);
    if (!ids.length) {
      box.appendChild(el("p", "mgmt-empty", "暂无草稿"));
      return;
    }
    ids.forEach(function (id) {
      var card = el("div", "mgmt-card", null);
      var head = el("div", "mgmt-card-head", null);
      head.appendChild(el("span", "mgmt-title", drafts[id].title || id));
      head.appendChild(el("span", "badge", "草稿"));
      card.appendChild(head);
      var actions = el("div", "mgmt-actions", null);
      actions.appendChild(btn("删除", function () {
        deleteDraft(id);
      }, true));
      card.appendChild(actions);
      box.appendChild(card);
    });
  }

  function deleteDraft(id) {
    if (!confirm("删除该草稿？")) {
      return;
    }
    var drafts = getDrafts();
    delete drafts[id];
    storageSet(DRAFTS_KEY, JSON.stringify(drafts));
    renderDrafts();
    toast("已删除草稿");
  }

  // ---------- 渲染：人物 ----------
  function renderCharacters() {
    var box = $("charAdminList");
    box.innerHTML = "";
    var list = allStories();
    if (!list.length) {
      box.appendChild(el("p", "mgmt-empty", "暂无故事"));
      return;
    }
    list.forEach(function (entry) {
      var chars = entry.story.characters || [];
      var card = el("div", "mgmt-card", null);
      var head = el("div", "mgmt-card-head", null);
      head.appendChild(el("span", "mgmt-title", entry.story.title || entry.story.id));
      head.appendChild(el("span", "badge", chars.length + " 名人物"));
      card.appendChild(head);

      if (!chars.length) {
        card.appendChild(el("p", "mgmt-empty", "该故事暂无人物"));
      } else {
        chars.forEach(function (c) {
          var row = el("div", "mgmt-char-row", null);
          row.appendChild(el("span", "mgmt-title", c.name || c.id));
          row.appendChild(el("span", "mgmt-meta", (c.role || "") + (c.personality ? " · " + c.personality : "")));
          row.appendChild(el("span", "mgmt-meta", "初始好感 " + (c.affinity || 0) + " · 攻略目标 " + (c.target || 0)));
          if (c.description) {
            row.appendChild(el("div", "mgmt-meta", c.description));
          }
          card.appendChild(row);
        });
      }
      box.appendChild(card);
    });
  }

  // ---------- 渲染：存档 ----------
  function populateStorySelect() {
    var select = $("saveStorySelect");
    var previous = select.value;
    select.innerHTML = "";
    allStories().forEach(function (entry) {
      var o = document.createElement("option");
      o.value = entry.story.id;
      o.textContent = (entry.custom ? "[自定义] " : "") + (entry.story.title || entry.story.id);
      select.appendChild(o);
    });
    if (previous && allStories().some(function (e) { return e.story.id === previous; })) {
      select.value = previous;
    }
  }

  function renderSaves() {
    var box = $("saveAdmin");
    box.innerHTML = "";
    var storyId = $("saveStorySelect").value;
    if (!storyId) {
      box.appendChild(el("p", "mgmt-empty", "请先选择故事"));
      return;
    }

    // 自动存档
    var autoKey = SAVE_PREFIX + storyId;
    var autoRaw = storageGet(autoKey);
    var autoCard = el("div", "mgmt-card", null);
    var autoHead = el("div", "mgmt-card-head", null);
    autoHead.appendChild(el("span", "mgmt-title", "自动存档（继续游戏）"));
    autoHead.appendChild(el("span", "badge", autoRaw ? "存在" : "无"));
    autoCard.appendChild(autoHead);
    if (autoRaw) {
      var autoActions = el("div", "mgmt-actions", null);
      autoActions.appendChild(btn("删除", function () {
        storageRemove(autoKey);
        renderSaves();
        toast("已删除自动存档");
      }, true));
      autoCard.appendChild(autoActions);
    }
    box.appendChild(autoCard);

    // 手动存档
    var users = usersForStory(storyId);
    if (!users.length) {
      box.appendChild(el("p", "mgmt-empty", "该故事暂无手动存档"));
      return;
    }

    users.forEach(function (username) {
      var card = el("div", "mgmt-card", null);
      var head = el("div", "mgmt-card-head", null);
      head.appendChild(el("span", "mgmt-title", "用户：" + username));
      card.appendChild(head);

      var grid = el("div", "slot-grid", null);
      var slots = getSlots(storyId, username);
      slots.forEach(function (record, index) {
        var chip = el("button", "slot-chip" + (record ? "" : " is-empty"), null);
        chip.type = "button";
        if (record) {
          chip.textContent = "槽" + (index + 1) + " · " + (record.chapterTitle || "");
          chip.title = record.preview || "";
          chip.addEventListener("click", function () {
            deleteSlot(storyId, username, index);
          });
        } else {
          chip.textContent = "槽" + (index + 1) + " 空";
          chip.disabled = true;
        }
        grid.appendChild(chip);
      });
      card.appendChild(grid);

      var actions = el("div", "mgmt-actions", null);
      actions.appendChild(btn("删除该用户此故事存档", function () {
        deleteUserSaves(storyId, username);
      }, true));
      card.appendChild(actions);
      box.appendChild(card);
    });
  }

  function deleteSlot(storyId, username, index) {
    if (!confirm("删除「" + username + "」的槽位 " + (index + 1) + "？")) {
      return;
    }
    var slots = getSlots(storyId, username);
    slots[index] = null;
    storageSet(SLOT_PREFIX + storyId + "_" + username, JSON.stringify(slots));
    renderSaves();
    toast("已删除槽位 " + (index + 1));
  }

  function deleteUserSaves(storyId, username) {
    if (!confirm("删除「" + username + "」在此故事下的全部手动存档？")) {
      return;
    }
    storageRemove(SLOT_PREFIX + storyId + "_" + username);
    renderSaves();
    toast("已删除该用户存档");
  }

  function clearAllSaves() {
    if (!confirm("清空全部故事的全部存档（自动 + 手动）？此操作无法撤销。")) {
      return;
    }
    storageKeys().forEach(function (k) {
      if (k.indexOf(SAVE_PREFIX) === 0 || k.indexOf(SLOT_PREFIX) === 0) {
        storageRemove(k);
      }
    });
    storageRemove(USERS_KEY);
    storageRemove(LAST_USER_KEY);
    renderSaves();
    toast("已清空全部存档");
  }

  // ---------- 审核发布 ----------
  function renderReview() {
    var box = $("reviewList");
    if (!box) {
      return;
    }
    box.innerHTML = "";

    if (!serverAvailable) {
      box.appendChild(el("p", "mgmt-empty", "未检测到后端服务：审核与发布功能需要运行 server.js 时才能使用。"));
      return;
    }
    if (!Api.isLoggedIn()) {
      box.appendChild(el("p", "mgmt-empty", "请先登录管理员账号，再查看待审核投稿。"));
      return;
    }

    Api.listSubmissions().then(function (list) {
      box.innerHTML = "";

      var pendingCard = el("div", "mgmt-card", null);
      var head = el("div", "mgmt-card-head", null);
      head.appendChild(el("span", "mgmt-title", "待审核投稿"));
      head.appendChild(el("span", "badge", list.length + " 条"));
      pendingCard.appendChild(head);

      if (!list.length) {
        pendingCard.appendChild(el("p", "mgmt-empty", "暂无待审核投稿"));
      } else {
        list.forEach(function (item) {
          var row = el("div", "mgmt-review-row", null);
          var info = el("div", "mgmt-review-info", null);
          info.appendChild(el("div", "mgmt-title", (item.kind === "story" ? "故事" : "对话") + " · " + item.summary));
          var meta = new Date(item.submittedAt).toLocaleString();
          if (item.note) {
            meta += " · 留言：" + item.note;
          }
          info.appendChild(el("div", "mgmt-meta", meta));
          row.appendChild(info);

          var actions = el("div", "mgmt-actions", null);
          actions.appendChild(btn("通过并发布", function () {
            Api.approve(item.id).then(function () {
              toast("已通过并发布");
              renderReview();
            }).catch(function (err) {
              toast("操作失败：" + err.message);
            });
          }));
          actions.appendChild(btn("驳回", function () {
            if (!confirm("驳回并删除该投稿？")) {
              return;
            }
            Api.reject(item.id).then(function () {
              toast("已驳回");
              renderReview();
            }).catch(function (err) {
              toast("操作失败：" + err.message);
            });
          }, true));
          row.appendChild(actions);
          pendingCard.appendChild(row);
        });
      }
      box.appendChild(pendingCard);

      return Api.listStories().then(function (stories) {
        var pubCard = el("div", "mgmt-card", null);
        var pubHead = el("div", "mgmt-card-head", null);
        pubHead.appendChild(el("span", "mgmt-title", "服务器已发布故事"));
        pubHead.appendChild(el("span", "badge", stories.length + " 个"));
        pubCard.appendChild(pubHead);

        if (!stories.length) {
          pubCard.appendChild(el("p", "mgmt-empty", "暂无已发布故事"));
        } else {
          stories.forEach(function (s) {
            var row = el("div", "mgmt-review-row", null);
            var info = el("div", "mgmt-review-info", null);
            info.appendChild(el("div", "mgmt-title", s.title || s.id));
            info.appendChild(el("div", "mgmt-meta",
              (s.theme || "默认主题") + " · " + s.chapters + " 章 · " + s.characters + " 人物"));
            row.appendChild(info);

            var actions = el("div", "mgmt-actions", null);
            actions.appendChild(btn("预览", function () {
              window.open("index.html?story=" + encodeURIComponent(s.id), "_blank");
            }));
            actions.appendChild(btn("删除", function () {
              if (!confirm("删除服务器上已发布的该故事？")) {
                return;
              }
              Api.deleteStory(s.id).then(function () {
                toast("已删除");
                renderReview();
              }).catch(function (err) {
                toast("操作失败：" + err.message);
              });
            }, true));
            row.appendChild(actions);
            pubCard.appendChild(row);
          });
        }
        box.appendChild(pubCard);
      });
    }).catch(function (err) {
      box.innerHTML = "";
      box.appendChild(el("p", "mgmt-empty", "读取失败：" + err.message));
    });
  }

  // ---------- 标签页 ----------
  function switchTab(name) {
    var tabs = document.querySelectorAll(".mgmt-tab");
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute("data-tab") === name) {
        tabs[i].classList.add("is-active");
      } else {
        tabs[i].classList.remove("is-active");
      }
    }
    $("tab-stories").classList.toggle("is-hidden", name !== "stories");
    $("tab-saves").classList.toggle("is-hidden", name !== "saves");
    $("tab-chars").classList.toggle("is-hidden", name !== "chars");
    $("tab-review").classList.toggle("is-hidden", name !== "review");
    if (name === "review") {
      renderReview();
    }
  }

  // ---------- 事件与初始化 ----------
  function bindEvents() {
    $("btnLogin").addEventListener("click", tryLogin);
    $("loginPass").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        tryLogin();
      }
    });
    $("btnLogout").addEventListener("click", logout);

    var tabs = document.querySelectorAll(".mgmt-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener("click", function () {
        switchTab(this.getAttribute("data-tab"));
      });
    }

    $("saveStorySelect").addEventListener("change", renderSaves);
    $("btnClearAllSaves").addEventListener("click", clearAllSaves);
    $("btnRefreshReview").addEventListener("click", renderReview);
  }

  function renderAll() {
    renderStories();
    renderDrafts();
    populateStorySelect();
    renderSaves();
    renderCharacters();
    renderReview();
  }

  function init() {
    if (window.AssetCheck) {
      AssetCheck.verify("--wtg-admin-css-version", "5", "admin.css", "后台样式");
    }
    bindEvents();
    checkServer().then(function () {
      if (isAuthed()) {
        showDashboard();
      } else {
        showLogin();
      }
    });
  }

  init();
})();

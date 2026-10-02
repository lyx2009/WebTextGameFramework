/* ==========================================================================
   api.js
   发布与审核服务的前端调用封装

   职责：封装与 server.js 提供的 REST 接口的通信，供 index.html / edit.html /
   admin.html 共用。所有方法都返回 Promise；当站点以纯静态方式部署（没有后端）
   时，请求会失败并被调用方降级处理，不影响原有本地功能。

   接口与 server.js 一一对应，详见 server.js 顶部注释。
   ========================================================================== */

window.Api = (function () {
  "use strict";

  var TOKEN_KEY = "wtg2_api_token";
  var BASE_KEY = "wtg2_api_base";
  var TIMEOUT_MS = 8000;

  /**
   * 解析后端地址。默认使用同源（推荐：由 nginx 把 /api/ 反向代理到后端端口），
   * 也支持显式指定后端地址，按优先级：
   *   1. 全局变量：<script>window.WTG_API_BASE = "http://host:8090";</script>
   *   2. meta 标签：<meta name="wtg-api-base" content="http://host:8090">
   *   3. 地址栏参数：任意页面加 ?api=http://host:8090（会记住；用 ?api= 可清除）
   */
  function resolveBase() {
    if (window.WTG_API_BASE) {
      return String(window.WTG_API_BASE).replace(/\/+$/, "");
    }

    var meta = document.querySelector('meta[name="wtg-api-base"]');
    if (meta && meta.getAttribute("content")) {
      return meta.getAttribute("content").trim().replace(/\/+$/, "");
    }

    try {
      var params = new URLSearchParams(window.location.search);
      if (params.has("api")) {
        var fromQuery = (params.get("api") || "").trim();
        if (fromQuery) {
          localStorage.setItem(BASE_KEY, fromQuery);
          return fromQuery.replace(/\/+$/, "");
        }
        localStorage.removeItem(BASE_KEY);
        return "";
      }
      var saved = localStorage.getItem(BASE_KEY);
      if (saved) {
        return saved.trim().replace(/\/+$/, "");
      }
    } catch (e) {
      // 忽略
    }

    return ""; // 同源
  }

  var BASE = resolveBase();

  // HTTPS 页面请求 HTTP 接口会被浏览器按混合内容拦截，这里给出明确提示
  if (BASE && window.location.protocol === "https:" && BASE.indexOf("http://") === 0) {
    console.warn("[webtxtgame] 页面为 HTTPS，但 API 地址是 HTTP：" + BASE +
      "，浏览器会拦截该请求。建议改由 nginx 反向代理 /api/ 到后端（同源访问）。");
  }

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      // 忽略
    }
  }

  function request(method, url, body, withAuth) {
    var headers = {};
    var options = { method: method, headers: headers, cache: "no-store" };
    if (body !== undefined && body !== null) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    if (withAuth) {
      var token = getToken();
      if (token) {
        headers["Authorization"] = "Bearer " + token;
      }
    }
    // 纯静态部署时后端不存在，加超时以免界面长时间等待
    if (typeof AbortController === "function") {
      var controller = new AbortController();
      options.signal = controller.signal;
      setTimeout(function () {
        controller.abort();
      }, TIMEOUT_MS);
    }
    return fetch(BASE + url, options).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (!res.ok) {
          var message = (data && data.error) ? data.error : ("请求失败（HTTP " + res.status + "）");
          if (res.status === 404 && url.indexOf("/api/") === 0) {
            message = "后端接口不存在（HTTP 404）：请确认已运行 node server.js，并在 nginx 中把 /api/ 反向代理到该服务";
          } else if (res.status === 502 || res.status === 503 || res.status === 504) {
            message = "后端服务无响应（HTTP " + res.status + "）：请确认 node server.js 正在运行";
          }
          throw new Error(message);
        }
        return data;
      });
    });
  }

  var availability = null;

  /**
   * 检测后端是否可用。
   * 结果会被缓存以避免重复请求；force 为 true 时强制重新检测。
   */
  function available(force) {
    if (!force && availability !== null) {
      return Promise.resolve(availability);
    }
    return request("GET", "/api/health").then(function () {
      availability = true;
      return true;
    }).catch(function () {
      availability = false;
      return false;
    });
  }

  function login(username, password) {
    return request("POST", "/api/auth/login", { username: username, password: password })
      .then(function (data) {
        setToken(data.token);
        return data;
      });
  }

  function logout() {
    return request("POST", "/api/auth/logout", {}, true).catch(function () {
      // 后端不可用时也要清掉本地 token
    }).then(function () {
      setToken("");
    });
  }

  function isLoggedIn() {
    return !!getToken();
  }

  /** 已发布故事列表（公开）。 */
  function listStories() {
    return request("GET", "/api/stories").then(function (data) {
      return data.stories || [];
    });
  }

  /** 已发布对话集合（公开），形如 { storyId: { dialogueId: entry } }。 */
  function listDialogues() {
    return request("GET", "/api/dialogs").then(function (data) {
      return data.dialogues || {};
    });
  }

  /** 提交故事或对话，进入待审核队列（公开）。 */
  function submit(kind, payload, note) {
    return request("POST", "/api/submissions", { kind: kind, payload: payload, note: note || "" });
  }

  /** 待审核列表（需管理员）。 */
  function listSubmissions() {
    return request("GET", "/api/admin/submissions", null, true).then(function (data) {
      return data.submissions || [];
    });
  }

  function approve(id) {
    return request("POST", "/api/admin/submissions/" + encodeURIComponent(id) + "/approve", {}, true);
  }

  function reject(id) {
    return request("POST", "/api/admin/submissions/" + encodeURIComponent(id) + "/reject", {}, true);
  }

  function deleteStory(id) {
    return request("DELETE", "/api/admin/stories/" + encodeURIComponent(id), null, true);
  }

  return {
    available: available,
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    listStories: listStories,
    listDialogues: listDialogues,
    submit: submit,
    listSubmissions: listSubmissions,
    approve: approve,
    reject: reject,
    deleteStory: deleteStory
  };
})();

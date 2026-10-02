#!/usr/bin/env node
/* ==========================================================================
   server.js
   文字冒险合集 · 发布与审核服务

   作用：
   1. 静态托管整个站点（index.html / edit.html / admin.html / src / rules.json 等）。
   2. 提供投稿与审核 API：任何人可提交故事或对话（进入待审核队列），
      管理员登录后审核通过，才会写入已发布目录并对游戏生效。

   依赖：仅使用 Node 内置模块，无需 npm install。
   启动：node server.js            默认端口 8090，可用 PORT 环境变量覆盖
   账号：默认 admin / 123456@      可用 ADMIN_USER / ADMIN_PASS 环境变量覆盖

   目录：
   storage/pending/   待审核投稿（每项一个 JSON 文件）
   storage/stories/   已发布故事（按故事 id 命名）
   storage/dialogs/   已发布对话（按故事 id 聚合）

   API 一览：
   GET    /api/health                          健康检查
   POST   /api/auth/login                      登录，返回 token
   POST   /api/auth/logout                     注销
   GET    /api/stories                         已发布故事列表（公开）
   GET    /api/stories/<id>                    单个已发布故事（公开）
   GET    /api/dialogs                         已发布对话集合（公开）
   POST   /api/submissions                     提交故事或对话（公开，进入待审核）
   GET    /api/admin/submissions               待审核列表（需管理员）
   POST   /api/admin/submissions/<id>/approve  审核通过并发布（需管理员）
   POST   /api/admin/submissions/<id>/reject   审核驳回并丢弃（需管理员）
   DELETE /api/admin/stories/<id>              删除已发布故事（需管理员）
   ========================================================================== */

"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var ROOT = __dirname;
var STORAGE = path.join(ROOT, "storage");
var DIR_PENDING = path.join(STORAGE, "pending");
var DIR_STORIES = path.join(STORAGE, "stories");
var DIR_DIALOGS = path.join(STORAGE, "dialogs");

var PORT = parseInt(process.env.PORT || "8090", 10);
var ADMIN_USER = process.env.ADMIN_USER || "admin";
var ADMIN_PASS = process.env.ADMIN_PASS || "123456@";
var TOKEN_TTL = 8 * 60 * 60 * 1000;
var MAX_BODY = 2 * 1024 * 1024;
var SUBMIT_LIMIT_PER_HOUR = 20;

var tokens = new Map();
var submitLog = new Map();

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

// ---------- 基础工具 ----------
function ensureDirs() {
  [DIR_PENDING, DIR_STORIES, DIR_DIALOGS].forEach(function (dir) {
    fs.mkdirSync(dir, { recursive: true });
  });
}

function readJsonFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir).filter(function (f) {
      return f.slice(-5) === ".json";
    });
  } catch (e) {
    return [];
  }
}

function makeId(prefix) {
  return prefix + "_" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
}

function safeId(value) {
  return String(value == null ? "" : value).replace(/[^A-Za-z0-9_\-]/g, "").slice(0, 64);
}

function sendJson(res, status, data) {
  var body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
  });
  res.end(body);
}

function readBody(req, cb) {
  var chunks = [];
  var size = 0;
  var done = false;
  req.on("data", function (chunk) {
    if (done) {
      return;
    }
    size += chunk.length;
    if (size > MAX_BODY) {
      done = true;
      cb(new Error("请求体过大"));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", function () {
    if (done) {
      return;
    }
    done = true;
    if (!chunks.length) {
      cb(null, {});
      return;
    }
    try {
      cb(null, JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch (e) {
      cb(new Error("请求体不是合法 JSON"));
    }
  });
  req.on("error", function (err) {
    if (!done) {
      done = true;
      cb(err);
    }
  });
}

// ---------- 登录态 ----------
function issueToken() {
  var token = crypto.randomBytes(24).toString("hex");
  tokens.set(token, Date.now() + TOKEN_TTL);
  return token;
}

function isAdmin(req) {
  var header = req.headers["authorization"] || "";
  var matched = /^Bearer\s+(.+)$/i.exec(header);
  if (!matched) {
    return false;
  }
  var expiry = tokens.get(matched[1]);
  if (!expiry || expiry < Date.now()) {
    tokens.delete(matched[1]);
    return false;
  }
  return true;
}

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function allowSubmit(ip) {
  var now = Date.now();
  var list = (submitLog.get(ip) || []).filter(function (t) {
    return now - t < 3600000;
  });
  if (list.length >= SUBMIT_LIMIT_PER_HOUR) {
    submitLog.set(ip, list);
    return false;
  }
  list.push(now);
  submitLog.set(ip, list);
  return true;
}

// ---------- 投稿校验 ----------
function validateSubmission(kind, payload) {
  if (kind === "story") {
    if (!payload || typeof payload !== "object") {
      return "缺少故事内容";
    }
    if (!payload.id || !payload.title) {
      return "故事缺少 id 或 title";
    }
    if (!Array.isArray(payload.chapters) || !payload.chapters.length) {
      return "故事缺少 chapters";
    }
    return null;
  }
  if (kind === "dialog") {
    if (!payload || typeof payload !== "object") {
      return "缺少对话内容";
    }
    if (!payload.storyId) {
      return "对话缺少 storyId";
    }
    if (!payload.dialogues || typeof payload.dialogues !== "object") {
      return "对话缺少 dialogues";
    }
    return null;
  }
  return "不支持的投稿类型";
}

function summarize(kind, payload) {
  if (kind === "story") {
    return (payload.title || payload.id) + " · " + payload.chapters.length + " 章";
  }
  var ids = Object.keys(payload.dialogues || {});
  return (payload.storyId || "") + " · " + ids.length + " 段对话";
}

// ---------- 业务处理 ----------
function publishSubmission(item) {
  if (item.kind === "story") {
    var storyId = safeId(item.payload.id);
    writeJsonFile(path.join(DIR_STORIES, storyId + ".json"), item.payload);
    return storyId;
  }
  var target = safeId(item.payload.storyId);
  var file = path.join(DIR_DIALOGS, target + ".json");
  var existing = readJsonFile(file, { storyId: target, dialogues: {} });
  existing.storyId = target;
  existing.dialogues = existing.dialogues || {};
  Object.keys(item.payload.dialogues).forEach(function (key) {
    existing.dialogues[key] = item.payload.dialogues[key];
  });
  writeJsonFile(file, existing);
  return target;
}

function listPublishedStories() {
  return listJsonFiles(DIR_STORIES).map(function (name) {
    var story = readJsonFile(path.join(DIR_STORIES, name), null);
    if (!story) {
      return null;
    }
    return {
      id: story.id,
      title: story.title,
      subtitle: story.subtitle || "",
      description: story.description || "",
      theme: story.theme || "",
      characters: Array.isArray(story.characters) ? story.characters.length : 0,
      chapters: Array.isArray(story.chapters) ? story.chapters.length : 0,
      story: story
    };
  }).filter(Boolean);
}

function listPublishedDialogues() {
  var out = {};
  listJsonFiles(DIR_DIALOGS).forEach(function (name) {
    var data = readJsonFile(path.join(DIR_DIALOGS, name), null);
    if (data && data.storyId && data.dialogues) {
      out[data.storyId] = data.dialogues;
    }
  });
  return out;
}

function listPending() {
  return listJsonFiles(DIR_PENDING).map(function (name) {
    var item = readJsonFile(path.join(DIR_PENDING, name), null);
    if (!item) {
      return null;
    }
    return {
      id: item.id,
      kind: item.kind,
      submittedAt: item.submittedAt,
      note: item.note || "",
      summary: item.summary || ""
    };
  }).filter(Boolean).sort(function (a, b) {
    return (b.submittedAt || 0) - (a.submittedAt || 0);
  });
}

// ---------- API 路由 ----------
function handleApi(req, res, pathname, query) {
  var method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (pathname === "/api/health" && method === "GET") {
    return sendJson(res, 200, { ok: true, service: "webtxtgame", time: Date.now() });
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    return readBody(req, function (err, body) {
      if (err) {
        return sendJson(res, 400, { error: err.message });
      }
      if (body.username === ADMIN_USER && body.password === ADMIN_PASS) {
        return sendJson(res, 200, { token: issueToken(), expiresIn: TOKEN_TTL });
      }
      return sendJson(res, 401, { error: "账号或密码错误" });
    });
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    var header = req.headers["authorization"] || "";
    var matched = /^Bearer\s+(.+)$/i.exec(header);
    if (matched) {
      tokens.delete(matched[1]);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === "/api/stories" && method === "GET") {
    return sendJson(res, 200, { stories: listPublishedStories() });
  }

  if (pathname.indexOf("/api/stories/") === 0 && method === "GET") {
    var wantedId = safeId(pathname.slice("/api/stories/".length));
    var story = readJsonFile(path.join(DIR_STORIES, wantedId + ".json"), null);
    if (!story) {
      return sendJson(res, 404, { error: "故事不存在" });
    }
    return sendJson(res, 200, { story: story });
  }

  if (pathname === "/api/dialogs" && method === "GET") {
    return sendJson(res, 200, { dialogues: listPublishedDialogues() });
  }

  if (pathname === "/api/submissions" && method === "POST") {
    if (!allowSubmit(clientIp(req))) {
      return sendJson(res, 429, { error: "提交过于频繁，请稍后再试" });
    }
    return readBody(req, function (err, body) {
      if (err) {
        return sendJson(res, 400, { error: err.message });
      }
      var kind = body.kind;
      var invalid = validateSubmission(kind, body.payload);
      if (invalid) {
        return sendJson(res, 400, { error: invalid });
      }
      var item = {
        id: makeId("sub"),
        kind: kind,
        submittedAt: Date.now(),
        status: "pending",
        note: String(body.note || "").slice(0, 500),
        summary: summarize(kind, body.payload),
        payload: body.payload
      };
      writeJsonFile(path.join(DIR_PENDING, item.id + ".json"), item);
      return sendJson(res, 201, { id: item.id, status: "pending", message: "已提交，等待管理员审核" });
    });
  }

  if (pathname === "/api/admin/submissions" && method === "GET") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "未登录或登录已过期" });
    }
    return sendJson(res, 200, { submissions: listPending() });
  }

  var approveMatch = /^\/api\/admin\/submissions\/([^/]+)\/(approve|reject)$/.exec(pathname);
  if (approveMatch && method === "POST") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "未登录或登录已过期" });
    }
    var submissionId = safeId(approveMatch[1]);
    var action = approveMatch[2];
    var filePath = path.join(DIR_PENDING, submissionId + ".json");
    var pendingItem = readJsonFile(filePath, null);
    if (!pendingItem) {
      return sendJson(res, 404, { error: "投稿不存在或已被处理" });
    }
    if (action === "approve") {
      var publishedId;
      try {
        publishedId = publishSubmission(pendingItem);
      } catch (e) {
        return sendJson(res, 500, { error: "发布失败：" + e.message });
      }
      fs.unlinkSync(filePath);
      return sendJson(res, 200, { ok: true, published: publishedId });
    }
    fs.unlinkSync(filePath);
    return sendJson(res, 200, { ok: true, rejected: submissionId });
  }

  var deleteMatch = /^\/api\/admin\/stories\/([^/]+)$/.exec(pathname);
  if (deleteMatch && method === "DELETE") {
    if (!isAdmin(req)) {
      return sendJson(res, 401, { error: "未登录或登录已过期" });
    }
    var deleteId = safeId(deleteMatch[1]);
    var target = path.join(DIR_STORIES, deleteId + ".json");
    if (!fs.existsSync(target)) {
      return sendJson(res, 404, { error: "故事不存在" });
    }
    fs.unlinkSync(target);
    return sendJson(res, 200, { ok: true, deleted: deleteId });
  }

  return sendJson(res, 404, { error: "接口不存在" });
}

// ---------- 静态资源 ----------
function serveStatic(req, res, pathname) {
  var relative = decodeURIComponent(pathname);
  if (relative === "/") {
    relative = "/index.html";
  }

  var normalized = path.normalize(relative).replace(/^([/\\])+/, "");
  var filePath = path.join(ROOT, normalized);

  if (filePath.indexOf(ROOT) !== 0) {
    return sendJson(res, 403, { error: "禁止访问" });
  }
  // 投稿与发布数据不通过静态方式暴露
  if (filePath.indexOf(STORAGE) === 0) {
    return sendJson(res, 403, { error: "禁止访问" });
  }

  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
      return;
    }
    var ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- 启动 ----------
ensureDirs();

var server = http.createServer(function (req, res) {
  var parsed = new URL(req.url, "http://localhost");
  var pathname = parsed.pathname;

  if (pathname.indexOf("/api/") === 0) {
    try {
      handleApi(req, res, pathname, parsed.searchParams);
    } catch (e) {
      sendJson(res, 500, { error: "服务内部错误：" + e.message });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "不支持的请求方法" });
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, function () {
  console.log("[webtxtgame] 服务已启动: http://localhost:" + PORT);
  console.log("[webtxtgame] 静态目录: " + ROOT);
  console.log("[webtxtgame] 投稿目录: " + DIR_PENDING);
  console.log("[webtxtgame] 管理员账号: " + ADMIN_USER);
});

// 端口占用等错误：给出可执行的排查提示，避免直接抛出未捕获异常
server.on("error", function (err) {
  if (err && err.code === "EADDRINUSE") {
    console.error("[webtxtgame] 启动失败：端口 " + PORT + " 已被占用（EADDRINUSE）。");
    console.error("[webtxtgame] 通常说明已经有一个 server.js 在运行，先确认它是否就是你要的服务：");
    console.error("            curl -i http://127.0.0.1:" + PORT + "/api/health");
    console.error("            若返回 {\"ok\":true,...} 则服务已在运行，无需重复启动。");
    console.error("[webtxtgame] 查看并结束占用进程：");
    console.error("            ss -lptn 'sport = :" + PORT + "'        # 或 lsof -i :" + PORT);
    console.error("            kill <PID>                              # 或 pkill -f server.js");
    console.error("[webtxtgame] 或者换一个端口启动（同时要改 nginx 的 proxy_pass）：");
    console.error("            PORT=8090 node server.js");
    process.exit(1);
  }
  if (err && err.code === "EACCES") {
    console.error("[webtxtgame] 启动失败：没有权限绑定端口 " + PORT + "（1024 以下端口通常需要 root）。");
    process.exit(1);
  }
  console.error("[webtxtgame] 服务错误：" + (err && err.message ? err.message : String(err)));
  process.exit(1);
});

// 优雅退出：重启服务时先释放端口，避免出现端口未及时释放的情况
["SIGINT", "SIGTERM"].forEach(function (signal) {
  process.on(signal, function () {
    console.log("[webtxtgame] 收到 " + signal + "，正在关闭服务…");
    server.close(function () {
      process.exit(0);
    });
    // 兜底：2 秒后强制退出
    setTimeout(function () {
      process.exit(0);
    }, 2000);
  });
});

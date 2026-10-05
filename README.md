# 文字冒险合集 · 多故事 Web 环境

一个纯前端（HTML + CSS + JavaScript）的互动文字冒险合集，支持多个故事，无需构建工具，直接用浏览器打开 `index.html` 即可运行。 
项目体验地址: https://game.lyxsmcs.top/index.html 

## 快速开始

1. 用浏览器直接打开 `index.html`（推荐现代浏览器：Chrome / Edge / Safari / Firefox）。
2. 若想本地起服务，可在项目根目录执行：

   ```bash
   python -m http.server 8000
   # 或
   npx serve .
   ```

   然后访问 `http://localhost:8000`。

3. 部署到 Nginx：参考根目录的 `nginx.conf`，将 `root` 改为部署目录后放入 `conf.d/` 或 `sites-enabled/` 即可。

## 目录结构

```
WebTextGame/
├── index.html                     # 主文件（页面骨架、主题注册、故事选择）
├── edit.html                      # 故事编辑工具（独立页面）
├── admin.html                     # 管理后台（独立页面）
├── rules.json                     # 故事文件编写规则（可下载）
├── dialog.json                    # 对话数据（按角色标识区分，可下载）
├── nginx.conf                     # Nginx 静态站点部署配置
├── nginx-api-proxy.conf           # 反向代理片段（粘贴到服务域名的 server 块）
├── server.js                      # 发布/审核后端服务（Node，无第三方依赖）
├── README.md                      # 本说明
├── storage/                       # 投稿与发布数据（由 server.js 读写）
│   ├── pending/                   # 待审核投稿
│   ├── stories/                   # 已发布故事
│   ├── dialogs/                   # 已发布对话
│   └── README.md                  # 说明
├── saves/                         # 导出的存档 JSON 文件（按用户名命名）
│   └── README.md                  # 存档说明
└── src/
    ├── css/
    │   ├── base.css               # 基础样式与默认主题变量
    │   ├── components.css         # 组件样式与移动端适配
    │   ├── editor.css             # 故事编辑工具样式
    │   ├── admin.css              # 管理后台样式
    │   └── themes/                # 主题目录
    │       ├── test-theme.css     # 测试主题 · 晨雾
    │       ├── ocean-theme.css    # 主题「深海」
    │       ├── night-theme.css    # 主题「星夜」
    │       ├── dusk-theme.css     # 主题「暮色」
    │       ├── forest-theme.css   # 主题「翡翠」
    │       └── README.md          # 主题扩展说明
    ├── js/
    │   ├── data/
    │   │   ├── chapters.js        # 故事注册表（StoryRegistry）
    │   │   └── stories/           # 各故事数据
    │   │       ├── dawn-realm.js  # 故事：晨曦秘境
    │   │       └── deep-echo.js   # 故事：深海回响
    │   ├── theme.js               # 主题管理
    │   ├── chapter.js             # 章节引擎（按故事隔离自动存档）
    │   ├── save.js                # 手动存档管理（故事 + 用户名 + 档位）
    │   ├── api.js                 # 发布/审核接口封装（后端不可用时自动降级）
    │   ├── render.js              # 画布贴图绘制
    │   ├── editor.js              # 故事编辑工具逻辑
    │   ├── admin.js               # 管理后台逻辑
    │   └── main.js                # 应用装配与界面交互
    └── img/
        ├── icons/                 # 图标素材
        ├── textures/              # 纹理/贴图素材
        └── README.md              # 素材分类说明
```

## 核心能力

- **多故事系统**：进入后先显示「故事选择」画面，可挑选并加载不同故事；每个故事独立。
- **不同故事不同主题**：每个故事通过 `theme` 字段绑定一个页面主题，选择故事时自动切换。
- **存档隔离**：自动存档与手动存档均按「故事」隔离，不同故事、不同用户名之间互不串档。
- **章节系统**：多章节、多场景、选项分支、条件选项（`require` 标记）、通关解锁。
- **人物系统**：角色人设（姓名/身份/性格/简介）+ 好感度 + 攻略目标；游戏内「人物」面板查看进度与攻略状态。
- **对话系统**：对话统一写入 `dialog.json`，通过角色标识区分说话人；场景或选项可通过 `dialogue` 字段触发对话。
- **手动存档**：独立存档按钮，按「故事 + 用户名」隔离，每个用户名 10 个档位，可覆盖；精确到每一段话 / 每一个选择点。
- **贴图绘制**：`src/js/render.js` 在 `<canvas>` 上程序化绘制晨光、森林、星夜、洞穴、星湖、深海、深渊等场景贴图，配色随主题联动。
- **移动端适配**：响应式布局、安全区适配、高清屏（DPR）画布渲染、触控友好的按钮。

## 如何扩展

### 新增故事

1. 在 `src/js/data/stories/` 下新增一个 JS 文件，例如 `my-story.js`：

   ```js
   window.StoryRegistry.register({
     id: "my-story",
     title: "我的故事",
     subtitle: "副标题",
     description: "故事简介",
     theme: "test-theme",   // 绑定主题 id
     chapters: [ /* 章节数据 */ ]
   });
   ```

2. 在 `index.html` 底部追加一行脚本：

   ```html
   <script src="src/js/data/stories/my-story.js"></script>
   ```

3. 若要为新故事使用专属主题，参考下方「新增主题」，并把 `theme` 字段指向新主题 id。

### 新增主题

1. 复制 `src/css/themes/test-theme.css` 为新文件（例如 `night-theme.css`）。
2. 修改 `[data-theme="..."]` 的选择器与变量值。
3. 在 `index.html` 的 `head` 中追加一行：

   ```html
   <link rel="stylesheet" href="src/css/themes/night-theme.css"
         data-theme-file="night-theme"
         data-theme-name="星夜"
         data-theme-desc="星夜风格的示例主题。"
         data-theme-swatch="#2c3a5c">
   ```

   主题面板会自动列出并支持切换。详细说明见 `src/css/themes/README.md`。

### 新增章节或场景

在对应故事文件（`src/js/data/stories/*.js`）的 `chapters` 数组中追加数据即可，结构约定见 `src/js/data/chapters.js` 顶部注释。

### 新增贴图种类

在 `src/js/render.js` 的 `paint()` 中新增一个 `kind` 分支，然后在场景的 `texture.kind` 中引用。

## 自制故事（编辑器）

项目内置了一个可视化故事编辑工具 `edit.html`，可通过 `index.html` 顶部的「编辑器」按钮或故事选择页的「打开编辑器」进入。它支持：

- 编辑故事信息（标题、副标题、简介、主题）。
- 新增 / 删除 / 拖拽排序章节、场景与选项（触屏可用上移 / 下移按钮）。
- 创建分支：为场景添加选项，并可「新建分支」一键生成选项 + 目标场景。
- 设置每个场景的说话人、正文、贴图、无选项时跳转，以及选项的跳转 / 设置标记 / 需要标记。
- 草稿保存到浏览器 localStorage，可随时载入。
- **故事库**：自动汇总内置与自定义故事，可一键「载入」到编辑器继续编辑，或「预览」在游戏内试玩。
- **流程图编辑器（默认视图）**：以节点-连线的形式可视化章节与场景流程；**手机上自动改为自上而下的单列排版**。支持拖动节点、平移/缩放画布、切换章节；点击节点可**直接编辑**该场景的正文、说话人、跳转与选项（含标记/好感度条件），以及查看并关联对话；拖动节点底部圆点可**创建分支连线**，工具栏可**新增场景**，也可删除场景。工具栏「使用说明」提供每个功能的通俗解释。导入的故事/对话会自动转换为流程图。
- **自定义图片**：可为**人物**上传图片（人物面板显示头像）；可为人物添加**立绘**（按情绪区分，如「普通/开心/生气」各一张，完全可选）；可为**故事**上传剧情背景图、为单个**场景**上传背景图（优先于剧情背景）。上传时自动等比压缩，避免撑爆浏览器存储。
- **编写指南**：点击顶部「编写指南」查看故事文件格式说明与示例（入口已预留）。
- 导出为 JSON（供 `index.html` 的故事选择页「导入故事」直接游玩）或 JS 文件（供放入 `src/js/data/stories/` 使用）。

在 `index.html` 故事选择页点击「导入故事」选择编辑器导出的 JSON 文件，即可把自制故事加入游戏并游玩；自定义故事卡片右上角可删除。

## 管理后台

管理后台位于 `admin.html`，可通过 `index.html` 顶部的「后台」按钮进入。默认账号 `admin`，密码 `123456@`。

- **故事管理**：列出内置与自定义故事，支持预览、导出，自定义故事可删除（同时清理其存档）；并可管理编辑器草稿。
- **存档管理**：按故事查看自动存档与各用户的手动槽位，支持删除单个槽位、某用户某故事的存档，或清空全部存档。

> 说明：由于项目为纯静态页面，后台登录为前端校验，不构成真实的安全边界。故事、存档与草稿均保存在浏览器 localStorage 中。

## 编写规则与主题

- 故事文件编写规则已整理为 `rules.json`（含字段说明、枚举值、人物/对话结构、语义与完整示例），可在 `index.html` 顶部或 `edit.html` 顶部的「规则文档」下载。
- 对话数据统一整理为 `dialog.json`（按「故事 id -> 对话 id」组织，行内 `speaker` 用角色 id 区分角色），可在两个页面的「对话文档」下载。
- 内置 5 个主题：测试主题 · 晨雾、深海、星夜、暮色、翡翠；可在任意页面右上角「主题」处切换。

## 发布与审核（后端服务）

项目自带一个只依赖 Node 内置模块的后端 `server.js`，用于把投稿存到服务器并做上线审核：

1. 启动服务：`node server.js`（默认端口 8090；可用 `PORT`、`ADMIN_USER`、`ADMIN_PASS` 环境变量覆盖端口与账号）。
2. 作者在 `edit.html` 中编辑故事或对话，点击「提交故事审核」/「提交对话审核」，内容写入 `storage/pending/`。
3. 管理员登录 `admin.html`，切到「审核发布」标签页，查看摘要后选择「通过并发布」或「驳回」。
4. 通过后故事写入 `storage/stories/`、对话合并进 `storage/dialogs/`；游戏通过 `/api/stories` 与 `/api/dialogs` 读取，玩家刷新即可看到，无需改动任何源码。
5. 编辑器内也可以直接新建 / 编辑对话（说话人填角色 id 或「旁白」），同样走审核流程。

部署方式：

- **纯静态**：只部署 `nginx.conf`。发布/审核功能不可用，编辑器仍可「导出 JSON」交给玩家导入。
- **静态 + 后端**：运行 `node server.js`（默认 8090）。`nginx.conf` 已配置把 `/api/` 反向代理到后端端口，并屏蔽 `storage/` 目录的直接访问（投稿数据不应对外暴露）。网页端口与后端端口分别由 `listen` 与 `proxy_pass` 控制，见下文「网页与后端分端口部署」。

接口清单、投稿数据结构见 `rules.json` 的 `publish` 字段，以及 `storage/README.md`。

### 提交审核报 404 / 502 怎么办

一条命令先判断：

```bash
curl -i https://你的域名/api/health
```

| 返回 | 含义 | 处理 |
| --- | --- | --- |
| `{"ok":true,...}` | 后端正常 | 无需处理 |
| **404** | `/api/` 没被转发到后端，请求被当成静态文件了 | 部署最新的 `nginx.conf`（含 `location /api/`），执行 `nginx -t && systemctl reload nginx` |
| **502 / 503 / 504** | 反向代理已配置，但后端没起来 | 运行 `node server.js`，并确认端口与 `proxy_pass` 一致 |
| **401** | 登录态过期 | 重新登录后台 |

常见原因：

- 站点部署在**纯静态托管**（如 Cloudflare Pages、对象存储）上，环境中没有常驻 Node 进程，`/api/*` 必然 404。此时发布/审核不可用，编辑器可改用「导出 JSON」/「导出对话 JSON」，由管理员手动放入仓库。
- 只更新了网页文件，**没有更新并重载 `nginx.conf`**，因此 `/api/` 仍然走静态目录。
- 域名前有 Cloudflare：确认没有开启会拦截 API 的规则；排查完成后清一次缓存，避免 404 被短暂缓存。

编辑器顶部会显示后端连接状态（「后端：已连接 / 未连接」），未连接时提交会直接给出提示，不会产生无意义的请求。

### 启动时报 EADDRINUSE（端口被占用）

表示该端口已经有进程在监听。典型情况是**后端默认端口与网页端口撞车**（例如网页用 nginx 占了 8089）。后端默认端口为 8090，与网页分端口部署即可。

先确认占用者是不是你要的服务：

```bash
curl -i http://127.0.0.1:8090/api/health
```

- 返回 `{"ok":true,...}`：服务其实已经在运行，不需要重复启动（此时直接去测域名即可）。
- 连接被拒绝：端口被别的程序占用，查看并结束它：

```bash
ss -lptn 'sport = :8090'      # 或 lsof -i :8090
kill <PID>                    # 或 pkill -f server.js
```

也可以换个端口启动，同时把 `nginx.conf` 的 `proxy_pass` 改成同一端口后重载 nginx：

```bash
PORT=8091 node server.js
```

`server.js` 已针对该情况做了处理：会打印上述排查提示并以退出码 1 结束（不再抛出未捕获异常）；收到 `SIGINT` / `SIGTERM` 时会先释放端口再退出，便于重启。若用宝塔面板等工具托管，注意面板里的「Node 项目」可能已经拉起了一个实例，重复启动就会报此错。

### 网页与后端分端口部署（例如网页 8089、后端 8090）

联动方式就是**同源反向代理**：前端固定请求 `/api/...`，由 nginx 把它转发到后端端口。前端代码不需要任何改动。

1. 后端监听 8090（默认值）：
   ```bash
   node server.js          # 监听 8090
   ```
2. `nginx.conf` 两处对应关系：
   ```nginx
   listen 8089;                                  # 网页端口
   location /api/ { proxy_pass http://127.0.0.1:8090; }   # 后端端口
   ```
3. 重载并验证：
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   curl -i http://127.0.0.1:8089/api/health      # 走网页端口，应返回 {"ok":true,...}
   ```

如果确实无法在 nginx 里做代理（例如网页由别的静态服务直接对外），也可以让前端直接指向后端地址，三种方式任选其一：

```html
<!-- 方式一：任意页面地址栏加参数（会记住，?api= 可清除） -->
https://game.lyxsmcs.top/edit.html?api=http://127.0.0.1:8090
```
```html
<!-- 方式二：在页面 <head> 里加 meta -->
<meta name="wtg-api-base" content="http://your-host:8090">
```
```html
<!-- 方式三：在本项目脚本之前定义全局变量 -->
<script>window.WTG_API_BASE = "http://your-host:8090";</script>
```

> 注意：**HTTPS 页面请求 HTTP 接口会被浏览器按「混合内容」拦截**。若网页是 `https://`，后端也必须是 `https://`（或走同源反向代理）。因此推荐优先使用上面的 nginx 代理方式。

### 改了 nginx.conf 却仍然 404？

典型症状：域名访问 `/api/health` 返回 **nginx 的 404 页面**（页面底部写着 `nginx`），而后端日志显示服务已启动、监听 8090。

原因：本仓库的 `nginx.conf` 是一个 **`listen 8089` 的独立 server 块**。如果域名经 Cloudflare / 宝塔面板走的是 **80 或 443** 上的另一个站点配置，那么请求根本不会进入这份配置，`/api/` 依旧按静态文件处理 → 404。此时 Cloudflare 只是透传（响应头 `cf-cache-status: DYNAMIC`），404 来自源站 nginx。

先分清是哪种情况：

```bash
curl -I https://你的域名/index.html     # 网页
curl -I https://你的域名/api/health     # 接口
```

| 结果 | 含义 | 处理 |
| --- | --- | --- |
| index.html `200`、api/health `404` | 域名站点能服务文件，只是缺 `/api/` 代理 | 把 `nginx-api-proxy.conf` 的片段粘进**服务该域名的**那个 server 块 |
| 两者都 `404` | 该 server 块的 `root` 不对 | 把 `root` 指向项目目录，如 `/www/wwwroot/game.lyxsmcs.top` |

查看究竟是哪份配置在服务该域名（需要 root）：

```bash
nginx -T 2>/dev/null | grep -nE 'server_name|listen |root |location |proxy_pass'
```

宝塔面板：网站 → 你的域名 → 设置 → 配置文件，把项目根目录下 `nginx-api-proxy.conf` 里的两个 `location` 片段粘贴进去，保存并重载即可。片段用了 `location ^~ /api/`，可避免被站点里其它正则 location（如 `.js`/`.css` 规则）抢走。

## 移动端适配

三个页面（`index.html` / `edit.html` / `admin.html`）均按手机分辨率做了适配：

- **视口与安全区**：`viewport-fit=cover`，四周使用 `env(safe-area-inset-*)`，兼顾刘海屏与横屏。
- **触控目标**：`@media (pointer: coarse)` 下按钮、标签页、列表项等最小高度 ≥ 44px，并启用 `touch-action: manipulation` 去掉双击缩放延迟。
- **输入框字号**：手机上输入框统一 16px，避免 iOS Safari 聚焦时自动放大页面。
- **弹窗**：限制最大高度（88–90dvh，带 `vh` 回退）并内部滚动，防止内容超出屏幕后无法操作。
- **工具栏**：游戏页头部允许换行；编辑器与后台的按钮 / 标签栏在窄屏改为单行横向滚动，保持顶栏紧凑、不占屏。
- **贴图高度**：小屏下调画布高度（`clamp()` 配合 `vh`），把屏幕留给正文阅读。
- **文字**：正文行高 1.85、字号 1rem；`text-size-adjust: 100%` 防止横竖屏切换时字号跳变；`img/canvas/iframe/svg` 限制 `max-width: 100%` 避免撑破布局。

## 更新部署与缓存

本项目是手写静态资源、没有构建期的文件指纹，因此采用「版本号 + 协商缓存 + 自检」三重策略：

- 三个页面的 CSS、JS 链接都带 `?v=` 版本号；**修改已有静态资源后请递增该版本号**（`?v=6` → `?v=7`）。
- 样式文件里带一个版本标记（例如 `--wtg-editor-css-version: 7`）；页面脚本通过 `src/js/asset-check.js` 比对，
  一旦发现样式是旧缓存，会在页面顶部弹出红色提示，并尝试用带时间戳的新地址重新加载样式表。
- `nginx.conf` 对 HTML 发送 `no-store`（完全不缓存），对 `css/js/json` 发送 `no-cache, must-revalidate`（内容未变返回 304）。

### CDN（Cloudflare）必须配合的设置

`?v=` 能否绕过缓存，取决于 CDN 的缓存键是否包含查询字符串。若「本地正常、线上依旧是旧样式」，先查这三项：

| 设置项 | 必须是 | 否则会怎样 |
| --- | --- | --- |
| 缓存级别 Caching Level | **Standard** | 选 Ignore Query String / No Query String 时，`?v=6` 与 `?v=7` 会命中同一个缓存条目，新版本永远取不到 |
| Cache Everything 页面规则 | 不要覆盖 `/src/`，或给 `/src/*` 设 Cache Level = Bypass | 边缘会按自己的 TTL 长期返回旧文件 |
| 部署后操作 | 执行一次 **Purge Everything** | 已缓存的旧文件会一直生效 |

### 一条命令判断线上给的是新文件还是旧文件

```bash
curl -sI https://你的域名/src/js/editor.js | grep -iE 'cf-cache-status|cache-control|age'
curl -s  https://你的域名/src/js/editor.js | grep -c renderFlowChoices   # 返回 0 说明拿到的是旧文件
```

### 接口返回 502 / 401

- `/api/...` 返回 **502 / 503 / 504**：反向代理已生效，但 Node 后端没跑起来或端口不一致。
  执行 `node server.js`（默认 8090），并用 `curl -i http://127.0.0.1:8090/api/health` 确认返回 `{"ok":true,...}`。
- **401**：管理后台登录态过期，重新登录即可。

## 存档系统

游戏提供两套进度保存方式，均按「故事」隔离：

- **自动存档（继续游戏）**：推进剧情时自动写入 `localStorage`（键 `wtg2_save_<故事id>`），供标题画面的「继续游戏」快速恢复。
- **手动存档（存档 / 读档）**：独立存档按钮，按「故事 + 用户名」隔离、每个用户名 10 个档位，可覆盖；精确保存到当前章节 + 当前场景（即每一段话、每一个选择点）。数据保存在 `localStorage`（键 `wtg2_slots_<故事id>_<用户名>`）。

手动存档面板还支持：

- **输入 / 选择用户名**：输入框 + 已存在用户名快捷选择。
- **导出存档**：下载 `<用户名>.json` 文件（内含故事 id），可整理到 `saves/` 目录长期保存与迁移。
- **导入存档**：读取 `saves/` 目录中的 JSON 文件恢复某故事下某用户的全部档位。

旧版本（`wtg_` 前缀）的测试存档会在新版首次运行时自动清除。详见 `saves/README.md`。

### 贡献者 
- Deepseek Harness(V4 Pro & Vision) 
- Yuxiang(LYX_114514) 
- 知足常乐
- 扫码也支付不了
- ~_^

### 开源协议
遵循GPL3协议
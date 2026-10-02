# storage 目录说明

本目录由后端服务 `server.js` 读写，用于存放投稿与审核数据。**不要通过静态方式对外暴露**（`server.js` 已禁止访问本目录；若使用 nginx 直接托管静态文件，请确认不会把 `storage/` 暴露到公网，建议改为只把 `/api/` 反向代理到 Node 服务）。

```
storage/
├── pending/     待审核投稿（每项一个 JSON 文件，审核后即删除）
├── stories/     已发布故事（按故事 id 命名，游戏从这里加载）
└── dialogs/     已发布对话（按故事 id 聚合，游戏从这里加载）
```

## 投稿文件格式（pending/\<id\>.json）

```json
{
  "id": "sub_xxx",
  "kind": "story",
  "submittedAt": 1700000000000,
  "status": "pending",
  "note": "投稿人留言",
  "summary": "故事标题 · 3 章",
  "payload": { }
}
```

- `kind` 为 `story` 时，`payload` 是一个完整的故事对象（见 `rules.json`）。
- `kind` 为 `dialog` 时，`payload` 形如 `{ "storyId": "dawn-realm", "dialogues": { "对话id": { ... } } }`。

## 审核流程

1. 任何人在 `edit.html` 中点击「提交审核」，内容写入 `pending/`。
2. 管理员在 `admin.html` 的「审核」标签页中查看并选择通过或驳回。
3. 通过后：故事写入 `stories/`，对话合并进 `dialogs/`；驳回则直接删除该投稿文件。
4. 游戏（`index.html`）会通过 `/api/stories` 与 `/api/dialogs` 读取已发布内容。

## 备份

直接备份整个 `storage/` 目录即可；数据均为可读的 JSON 文本文件。

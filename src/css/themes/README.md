# 主题扩展说明

本目录是主题系统的扩展位。每个主题是一个独立的 CSS 文件，通过覆盖 CSS 变量来改变界面配色与画布贴图调色板。

## 新增一个主题

1. 复制 `test-theme.css`，命名为新主题（例如 `ocean-theme.css`）。
2. 将文件内的选择器 `[data-theme="test-theme"]` 改为 `[data-theme="ocean-theme"]`。
3. 修改需要覆盖的变量值。
4. 在项目根目录 `index.html` 的 `head` 中追加一行 `link`：

   ```html
   <link rel="stylesheet" href="src/css/themes/ocean-theme.css"
         data-theme-file="ocean-theme"
         data-theme-name="海洋主题"
         data-theme-desc="深邃海洋风格的示例主题。"
         data-theme-swatch="#4aa3c7">
   ```

主题系统（`src/js/theme.js`）会自动扫描带 `data-theme-file` 的 `link` 标签并生成切换列表，无需改动任何 JavaScript。

## 可覆盖的变量

| 变量 | 用途 |
| --- | --- |
| `--bg` / `--bg-soft` | 页面背景 |
| `--panel` / `--panel-2` | 卡片与面板 |
| `--text` / `--text-muted` | 文字颜色 |
| `--accent` / `--accent-strong` / `--accent-contrast` | 强调色 |
| `--border` | 边框颜色 |
| `--shadow` | 阴影 |
| `--radius` | 圆角半径 |
| `--sky-top` / `--sky-mid` / `--sky-bottom` | 画布天空渐变 |
| `--ground` | 画布地面颜色 |
| `--decor-a` / `--decor-b` | 画布远近景装饰 |
| `--glow` | 画布高光/点缀 |

完整默认值见 `src/css/base.css` 的 `:root`。

/* ==========================================================================
   theme.js
   主题管理模块
   职责：
   1. 扫描 index.html 中带 data-theme-file 属性的 link 标签，自动构建主题列表。
   2. 切换主题时，通过设置 <html> 上的 data-theme 属性来启用对应主题的 CSS 变量。
   3. 将用户选择持久化到 localStorage，并在切换后通知界面刷新画布贴图。

   主题系统本身是"预留扩展位"：新增主题不需要修改本文件，
   只需新增主题 CSS 文件并在 index.html 追加一行 link。
   ========================================================================== */

window.ThemeManager = (function () {
  var STORAGE_KEY = "wtg2_theme";
  var themes = [];
  var current = null;

  /**
   * 初始化主题系统：扫描 link 标签，恢复用户上次选择的主题。
   */
  function init() {
    themes = [];
    var links = document.querySelectorAll("link[data-theme-file]");

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      themes.push({
        id: link.getAttribute("data-theme-file"),
        name: link.getAttribute("data-theme-name") || link.getAttribute("data-theme-file"),
        desc: link.getAttribute("data-theme-desc") || "",
        swatch: link.getAttribute("data-theme-swatch") || ""
      });
    }

    var saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      saved = null;
    }

    var initial = (saved && themeExists(saved)) ? saved : (themes.length ? themes[0].id : null);
    apply(initial);
  }

  /** 判断某个主题 id 是否存在。 */
  function themeExists(id) {
    for (var i = 0; i < themes.length; i++) {
      if (themes[i].id === id) {
        return true;
      }
    }
    return false;
  }

  /** 应用指定主题并持久化。 */
  function apply(id) {
    current = id;
    if (id) {
      document.documentElement.setAttribute("data-theme", id);
    }
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (e) {
      // 忽略隐私模式下的写入失败
    }
    // 通知界面主题已变化（用于重新绘制画布贴图）
    if (window.App && typeof window.App.onThemeChanged === "function") {
      window.App.onThemeChanged();
    }
  }

  /** 返回主题列表（供切换面板渲染）。 */
  function list() {
    return themes;
  }

  /** 返回当前主题 id。 */
  function getCurrent() {
    return current;
  }

  return {
    init: init,
    apply: apply,
    list: list,
    getCurrent: getCurrent,
    themeExists: themeExists
  };
})();

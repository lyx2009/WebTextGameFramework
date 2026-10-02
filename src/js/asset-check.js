/* ==========================================================================
   asset-check.js
   静态资源缓存自检

   用途：线上环境如果启用了 CDN（例如 Cloudflare）或浏览器缓存，可能出现
   「HTML 已经是新版本，但 CSS 仍是旧缓存」的情况，表现为样式错乱、控件错位。
   本模块通过对比 CSS 里的版本标记判断样式是否过期：
   - 过期时用带时间戳的新地址重新加载样式表（尽力自动修复）；
   - 同时在页面顶部显示醒目提示，说明需要强刷或在 CDN 清除缓存。

   用法（在页面脚本中调用，期望值需与 CSS 里的版本标记一致）：
     AssetCheck.verify("--wtg-editor-css-version", "7", "editor.css", "编辑器样式");
   ========================================================================== */

window.AssetCheck = (function () {
  "use strict";

  function styleVersion(varName) {
    try {
      return (getComputedStyle(document.documentElement).getPropertyValue(varName) || "").trim();
    } catch (e) {
      return "";
    }
  }

  /** 用带唯一时间戳的地址重新加载指定样式表，尝试绕过缓存。 */
  function reloadStyleSheet(fileText) {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (href.indexOf(fileText) === -1) {
        continue;
      }
      var fresh = document.createElement("link");
      fresh.rel = "stylesheet";
      fresh.href = href.split("?")[0] + "?bust=" + Date.now();
      links[i].parentNode.insertBefore(fresh, links[i].nextSibling);
      return true;
    }
    return false;
  }

  /** 顶部提示条：故意使用内联样式，保证样式表本身出错时也能正常显示。 */
  function showBanner(message) {
    if (document.getElementById("assetStaleBanner")) {
      return;
    }
    var bar = document.createElement("div");
    bar.id = "assetStaleBanner";
    bar.setAttribute("style", [
      "position:fixed",
      "left:0",
      "right:0",
      "top:0",
      "z-index:2147483647",
      "background:#c0392b",
      "color:#ffffff",
      "padding:10px 14px",
      "font:13px/1.6 system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
      "text-align:center",
      "box-shadow:0 2px 10px rgba(0,0,0,.3)",
      "cursor:pointer"
    ].join(";"));
    bar.textContent = message;
    bar.addEventListener("click", function () {
      bar.remove();
    });
    document.body.appendChild(bar);
  }

  /**
   * 校验样式版本。
   * @param {string} varName  CSS 变量名
   * @param {string} expected 期望值（与 CSS 中一致）
   * @param {string} fileText 样式文件名，用于重新加载
   * @param {string} label    中文名称，用于提示文案
   * @returns {boolean} 样式是否已是最新
   */
  function verify(varName, expected, fileText, label) {
    var actual = styleVersion(varName);
    if (actual === expected) {
      return true;
    }
    reloadStyleSheet(fileText);
    showBanner("检测到「" + (label || fileText) + "」是旧缓存（期望 v" + expected +
      "，实际 " + (actual || "读取不到") + "）。已尝试自动重新加载；若界面仍不正确，请强制刷新" +
      "（电脑 Ctrl+F5，手机清除站点数据），并在 CDN（如 Cloudflare）执行一次「清除缓存」。点击本提示可关闭。");
    return false;
  }

  return { verify: verify };
})();

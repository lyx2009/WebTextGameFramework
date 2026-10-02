/* ==========================================================================
   render.js
   画布贴图绘制模块
   职责：在 <canvas> 上按场景的 texture.kind 绘制程序化贴图（天空、山峦、树影、
   星夜、洞穴等）。调色板从当前主题的 CSS 变量读取，因此切换主题后画面配色会
   随之变化，实现"贴图 + 主题"联动。

   支持的 texture.kind：
   - "dawn"    晨光（暖色天空、太阳、山影、雾气）
   - "forest"  森林（层叠树影、地面）
   - "night"   星夜（星空、月亮、山丘）
   - "cave"    洞穴（暗色背景、钟乳石、微光）
   - "lake"    星湖（天空、湖面倒影、水波）
   - 默认      渐变天空 + 光晕 + 暗角
   ========================================================================== */

window.TextureRenderer = (function () {

  /**
   * 从当前主题的 CSS 变量读取画布调色板。
   * 变量定义在 base.css 的 :root 与各主题文件的 [data-theme="..."] 中。
   */
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);

    function v(name, fallback) {
      var value = cs.getPropertyValue(name).trim();
      return value || fallback;
    }

    return {
      skyTop: v("--sky-top", "#0b1020"),
      skyMid: v("--sky-mid", "#1a2440"),
      skyBottom: v("--sky-bottom", "#2c3a5c"),
      ground: v("--ground", "#1a2030"),
      decorA: v("--decor-a", "#2c3a5c"),
      decorB: v("--decor-b", "#16202f"),
      glow: v("--glow", "#6ea8fe")
    };
  }

  /** 简单的可复现伪随机数，保证同一场景每次绘制的星空位置一致。 */
  function seededRandom(seed) {
    var s = seed % 2147483647;
    if (s <= 0) {
      s += 2147483646;
    }
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /** 线性渐变简写。 */
  function verticalGradient(ctx, w, h, top, mid, bottom) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bottom);
    return g;
  }

  /** 绘制天空底色。 */
  function drawSky(ctx, w, h, p) {
    ctx.fillStyle = verticalGradient(ctx, w, h, p.skyTop, p.skyMid, p.skyBottom);
    ctx.fillRect(0, 0, w, h);
  }

  /** 在天空上叠加柔和光晕。 */
  function drawGlow(ctx, w, h, p, x, y, radius) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, p.glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** 绘制层叠的山影 / 山丘。 */
  function drawMountains(ctx, w, h, p, color, baseY, amp, seed) {
    var rnd = seededRandom(seed);
    ctx.beginPath();
    ctx.moveTo(0, h);
    var step = w / 8;
    for (var x = 0; x <= w; x += step) {
      var y = baseY - rnd() * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** 绘制一棵简化松树剪影。 */
  function drawTree(ctx, x, baseY, scale, color) {
    var h = 120 * scale;
    var w = 46 * scale;
    ctx.fillStyle = color;
    // 树干
    ctx.fillRect(x - 3 * scale, baseY - h * 0.18, 6 * scale, h * 0.18);
    // 三层树冠
    var layers = 3;
    for (var i = 0; i < layers; i++) {
      var lw = w * (1 - i * 0.28);
      var lh = h * 0.42;
      var topY = baseY - h * 0.18 - lh * (i + 1) + lh * 0.35;
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x - lw / 2, topY + lh);
      ctx.lineTo(x + lw / 2, topY + lh);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** 绘制星空。 */
  function drawStars(ctx, w, h, p, count, seed) {
    var rnd = seededRandom(seed);
    for (var i = 0; i < count; i++) {
      var x = rnd() * w;
      var y = rnd() * h * 0.6;
      var r = 0.6 + rnd() * 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.glow;
      ctx.globalAlpha = 0.4 + rnd() * 0.6;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** 绘制月亮或太阳（圆形发光体）。 */
  function drawOrb(ctx, x, y, r, fill, glow) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, fill);
    g.addColorStop(0.45, glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** 绘制水平雾气带。 */
  function drawMist(ctx, w, h, p, y, alpha) {
    var g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255," + alpha + ")");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 40, w, 80);
  }

  /** 绘制湖面倒影（湖景贴图下半部）。 */
  function drawLake(ctx, w, h, p) {
    var lakeTop = h * 0.58;
    // 湖面主体
    var g = ctx.createLinearGradient(0, lakeTop, 0, h);
    g.addColorStop(0, p.skyBottom);
    g.addColorStop(1, p.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, lakeTop, w, h - lakeTop);
    // 水波横线
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    for (var i = 0; i < 8; i++) {
      var y = lakeTop + 12 + i * 18;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y - 4);
      ctx.stroke();
    }
  }

  /** 绘制洞穴钟乳石。 */
  function drawCave(ctx, w, h, p) {
    ctx.fillStyle = p.decorB;
    for (var i = 0; i < 9; i++) {
      var x = (i + 0.2) * (w / 9);
      var len = 30 + (i % 3) * 26;
      var half = 16 + (i % 4) * 8;
      ctx.beginPath();
      ctx.moveTo(x - half, 0);
      ctx.lineTo(x + half, 0);
      ctx.lineTo(x, len);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** 绘制统一的暗角，增强氛围。 */
  function drawVignette(ctx, w, h) {
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** 绘制从上方射下的光柱（深海 / 水下氛围）。 */
  function drawLightRays(ctx, w, h, p, count, seed) {
    var rnd = seededRandom(seed);
    for (var i = 0; i < count; i++) {
      var x = rnd() * w;
      var width = 20 + rnd() * 50;
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + width, 0);
      ctx.lineTo(x + width * 0.4, h);
      ctx.lineTo(x - width * 0.4, h);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  /** 绘制上升的气泡（深海 / 水下氛围）。 */
  function drawBubbles(ctx, w, h, p, count, seed) {
    var rnd = seededRandom(seed);
    for (var i = 0; i < count; i++) {
      var x = rnd() * w;
      var y = h - rnd() * h;
      var r = 1 + rnd() * 4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** 根据 texture.kind 分派绘制。 */
  function paint(ctx, w, h, texture, p) {
    var kind = (texture && texture.kind) ? texture.kind : "default";

    drawSky(ctx, w, h, p);

    if (kind === "dawn") {
      drawOrb(ctx, w * 0.5, h * 0.46, Math.min(w, h) * 0.13, "#fff6df", p.glow);
      drawMountains(ctx, w, h, p, p.decorA, h * 0.7, h * 0.12, 11);
      drawMountains(ctx, w, h, p, p.decorB, h * 0.82, h * 0.1, 27);
      drawMist(ctx, w, h, p, h * 0.66, 0.16);
      drawGlow(ctx, w, h, p, w * 0.5, h * 0.5, Math.max(w, h) * 0.6);
    } else if (kind === "forest") {
      drawGlow(ctx, w, h, p, w * 0.3, h * 0.35, w * 0.6);
      drawMountains(ctx, w, h, p, p.decorA, h * 0.68, h * 0.1, 5);
      drawTree(ctx, w * 0.16, h * 0.88, 1.5, p.decorB);
      drawTree(ctx, w * 0.36, h * 0.9, 1.15, p.decorA);
      drawTree(ctx, w * 0.58, h * 0.88, 1.55, p.decorB);
      drawTree(ctx, w * 0.78, h * 0.9, 1.1, p.decorA);
      drawTree(ctx, w * 0.94, h * 0.88, 1.4, p.decorB);
      ctx.fillStyle = p.ground;
      ctx.fillRect(0, h * 0.88, w, h * 0.12);
      drawMist(ctx, w, h, p, h * 0.72, 0.12);
    } else if (kind === "night") {
      drawStars(ctx, w, h, p, 90, 42);
      drawOrb(ctx, w * 0.78, h * 0.24, Math.min(w, h) * 0.07, "#f4f1e8", p.glow);
      drawMountains(ctx, w, h, p, p.decorB, h * 0.8, h * 0.12, 19);
    } else if (kind === "cave") {
      drawCave(ctx, w, h, p);
      drawGlow(ctx, w, h, p, w * 0.5, h * 0.8, Math.min(w, h) * 0.5);
      drawMountains(ctx, w, h, p, p.decorB, h * 0.86, h * 0.08, 33);
    } else if (kind === "lake") {
      drawStars(ctx, w, h, p, 70, 7);
      drawMountains(ctx, w, h, p, p.decorA, h * 0.5, h * 0.08, 13);
      drawLake(ctx, w, h, p);
      drawGlow(ctx, w, h, p, w * 0.5, h * 0.4, Math.min(w, h) * 0.4);
    } else if (kind === "ocean") {
      drawLightRays(ctx, w, h, p, 5, 21);
      drawBubbles(ctx, w, h, p, 40, 9);
      drawGlow(ctx, w, h, p, w * 0.5, h * 0.6, Math.min(w, h) * 0.6);
      drawMountains(ctx, w, h, p, p.decorB, h * 0.86, h * 0.1, 15);
      drawMountains(ctx, w, h, p, p.ground, h * 0.94, h * 0.05, 29);
    } else if (kind === "abyss") {
      drawBubbles(ctx, w, h, p, 26, 17);
      drawGlow(ctx, w, h, p, w * 0.5, h * 0.5, Math.min(w, h) * 0.4);
      drawMountains(ctx, w, h, p, p.decorB, h * 0.9, h * 0.08, 41);
    } else {
      drawGlow(ctx, w, h, p, w * 0.5, h * 0.45, Math.max(w, h) * 0.55);
    }

    drawVignette(ctx, w, h);
  }

  /** 自定义背景图缓存（键为图片 data URL）。 */
  var imageCache = {};

  /** 以「填满画布」的方式绘制图片，保持比例、居中裁切。 */
  function drawCoverImage(ctx, img, w, h) {
    var scale = Math.max(w / img.width, h / img.height);
    var dw = img.width * scale;
    var dh = img.height * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  /**
   * 对外入口：将贴图绘制到指定画布。
   * 会自动处理设备像素比（DPR），保证高清屏下画面清晰。
   * 若 texture.image 提供了自定义背景图（data URL），优先绘制该图片。
   */
  function render(canvas, texture) {
    if (!canvas) {
      return;
    }
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width || 320;
    var h = canvas.clientHeight || canvas.height || 200;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    var ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var palette = readPalette();
    var customImage = texture && texture.image;

    if (customImage) {
      var cached = imageCache[customImage];
      if (cached && cached.complete && cached.naturalWidth) {
        drawCoverImage(ctx, cached, w, h);
        drawVignette(ctx, w, h);
        return;
      }
      // 图片还没加载好：先画程序化贴图占位，加载完成后自动重绘
      paint(ctx, w, h, texture, palette);
      if (!cached) {
        var img = new Image();
        img.onload = function () {
          imageCache[customImage] = img;
          render(canvas, texture);
        };
        img.src = customImage;
        imageCache[customImage] = img;
      }
      return;
    }

    paint(ctx, w, h, texture, palette);
  }

  return {
    render: render,
    readPalette: readPalette
  };
})();

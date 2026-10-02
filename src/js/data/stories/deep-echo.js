/* ==========================================================================
   data/stories/deep-echo.js
   故事二：深海回响（深海主题）
   说明：调用 StoryRegistry.register 注册本故事，用于测试多故事系统。
   ========================================================================== */

window.StoryRegistry.register({
  id: "deep-echo",
  title: "深海回响",
  subtitle: "科幻悬疑",
  description: "在深海观测站追踪一段来自 3800 米深渊的求救信号。",
  theme: "ocean-theme",

  characters: [
    { id: "chief", name: "陈默", role: "前站长", personality: "坚定而孤独", description: "海渊六号的前站长，七年前失踪，只留下一段循环的求救信号。", affinity: 0, target: 2 }
  ],

  chapters: [
    {
      id: "de1",
      title: "第一章 · 沉没的观测站",
      subtitle: "海水封住了每一扇窗",
      startScene: "de1_s1",
      scenes: {
        "de1_s1": {
          speaker: "系统日志",
          text: "你在深海观测站「海渊七号」的走廊里醒来。应急灯每隔几秒闪烁一次，把蓝色的舱壁照得忽明忽暗。\n舷窗外没有天空，只有一层压着一层的黑暗，和偶尔游过的一两点荧光。",
          texture: { kind: "ocean" },
          choices: [
            { text: "查看控制台日志", next: "de1_s2" },
            { text: "走向舷窗观察", next: "de1_s3" }
          ]
        },

        "de1_s2": {
          speaker: "控制台",
          text: "日志显示：三小时前，站内声呐收到一段来自 3800 米深处的低频信号。它每隔 47 秒重复一次，像心跳，又像有人在敲击金属。\n系统无法识别其来源。",
          texture: { kind: "ocean" },
          choices: [
            { text: "播放这段信号", next: "de1_s4", set: "playedSignal" },
            { text: "先查看生命维持数据", next: "de1_s3" }
          ]
        },

        "de1_s3": {
          speaker: "旁白",
          text: "你贴着舷窗向外看。探照灯扫过的光柱里，无数细小的浮游生物像雪一样落下。更远处，一个红色光点有规律地明灭。\n那是观测浮标——它不该在这个深度。",
          texture: { kind: "ocean" },
          choices: [
            { text: "记下浮标坐标", next: "de1_s4", set: "notedBuoy" },
            { text: "返回控制台", next: "de1_s2" }
          ]
        },

        "de1_s4": {
          speaker: "广播",
          text: "「请注意：外部压力异常，主舱将于 60 分钟后失压。请全体人员前往核心舱，准备启动深潜协议。」\n喇叭里的声音平稳得近乎冷漠。",
          texture: { kind: "cave" },
          next: "__chapterEnd__"
        }
      }
    },

    {
      id: "de2",
      title: "第二章 · 深渊信号",
      subtitle: "它一直在重复同一句话",
      startScene: "de2_s1",
      scenes: {
        "de2_s1": {
          speaker: "旁白",
          text: "核心舱里，解码器正把那段信号拆成一串坐标，和一段被海水泡得沙哑的人声。\n屏幕上的坐标指向观测站正下方——3800 米，一个地图上没有标注的地方。",
          texture: { kind: "abyss" },
          choices: [
            { text: "增强人声，仔细听", next: "de2_s2" },
            { text: "定位坐标的精确位置", next: "de2_s3" }
          ]
        },

        "de2_s2": {
          speaker: "信号",
          text: "「我在……下面……等……太久……了……」\n人声断断续续，混杂着水流声。你听出那是七年使用的旧编码格式——上一任站长失踪前用的正是这套系统。",
          texture: { kind: "abyss" },
          choices: [
            { text: "回应这段信号", next: "de2_s4", set: "replied", affinity: { chief: 1 } },
            { text: "先别回应，继续记录", next: "de2_s3" }
          ]
        },

        "de2_s3": {
          speaker: "旁白",
          text: "你在储物柜里找到一套还能用的深潜服，和两枚照明弹。坐标被标进了导航仪。\n下潜舱的门在你面前缓缓打开，一股冰冷的金属气味涌了出来。",
          texture: { kind: "cave" },
          choices: [
            { text: "穿上深潜服，准备下潜", next: "de2_s4", set: "hasSuit" },
            { text: "再检查一遍装备", next: "de2_s4" }
          ]
        },

        "de2_s4": {
          speaker: "旁白",
          text: "下潜舱开始缓缓下降，四周的光被海水一层层滤掉，最后只剩下仪表盘幽绿的光。\n外面的黑暗像活物一样，贴着舷窗注视着你。",
          texture: { kind: "abyss" },
          next: "__chapterEnd__"
        }
      }
    },

    {
      id: "de3",
      title: "第三章 · 回声之源",
      subtitle: "你终于知道那是谁的声音",
      startScene: "de3_s1",
      scenes: {
        "de3_s1": {
          speaker: "旁白",
          text: "3800 米。下潜舱平稳落地，扬起的泥沙在探照灯里翻滚，像一场不会散去的雪。\n导航仪显示，信号源就在前方 200 米。",
          texture: { kind: "abyss" },
          choices: [
            { text: "打开探照灯，走过去", next: "de3_s2" },
            { text: "关闭引擎，靠惯性漂行", next: "de3_s2" }
          ]
        },

        "de3_s2": {
          speaker: "旁白",
          text: "一座倾斜的金属残骸出现在光柱尽头，半埋在海底。那是「海渊六号」——七年前失踪的上一座观测站。\n信号，正是从它被封死的舱门里传出来的。",
          texture: { kind: "abyss" },
          choices: [
            { text: "靠近残骸的舱门", next: "de3_s3" },
            { text: "先保持距离，用仪器扫描", next: "de3_s3", set: "scanned" }
          ]
        },

        "de3_s3": {
          speaker: "信号",
          text: "这一次，声音清晰得可怕。你终于听清了那段循环了七年的求救信号。",
          texture: { kind: "ocean" },
          dialogue: "chief_signal",
          choices: [
            { text: "回应他：收到", next: "de3_s4", affinity: { chief: 1 } },
            { text: "沉默地收起录音", next: "de3_s4", affinity: { chief: 1 } }
          ]
        },

        "de3_s4": {
          speaker: "旁白",
          text: "你带着那段录音返回下潜舱。上升途中，黑暗一寸寸退去，海面投下的光像一道缓缓打开的门。\n回声结束了。而海面之上，有人在等你把坐标带回去。",
          texture: { kind: "ocean" },
          next: "__chapterEnd__"
        }
      }
    }
  ]
});

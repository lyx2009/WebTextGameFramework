/* ==========================================================================
   data/stories/dawn-realm.js
   故事一：晨曦秘境（晨雾主题）
   说明：调用 StoryRegistry.register 注册本故事。
   ========================================================================== */

window.StoryRegistry.register({
  id: "dawn-realm",
  title: "晨曦秘境",
  subtitle: "互动文字冒险",
  description: "穿过雾林与星湖，寻找传说中第一缕晨光的源头。",
  theme: "test-theme",

  characters: [
    { id: "lin", name: "林晚", role: "雾之引路人", personality: "温柔而疏离", description: "雾林中的少女，似乎一直在等待某位旅人。", affinity: 0, target: 3 },
    { id: "zhou", name: "阿舟", role: "星湖渡者", personality: "寡言而神秘", description: "星湖之畔披斗篷的人，只出谜题，很少抬头。", affinity: 0, target: 3 }
  ],

  chapters: [
    {
      id: "ch1",
      title: "第一章 · 雾林入口",
      subtitle: "迷雾深处，有一束光在等待",
      startScene: "ch1_s1",
      scenes: {
        "ch1_s1": {
          speaker: "旁白",
          text: "你在一阵潮湿的草木气息中醒来。四周是灰白色的雾，像一层没有边际的纱，把远方的山影都吞没了。\n脚下只有一条被露水打湿的小径，一直伸向雾的深处。",
          texture: { kind: "forest" },
          choices: [
            { text: "沿着小径，走进雾林", next: "ch1_s2" },
            { text: "先观察四周的地形", next: "ch1_s3" }
          ]
        },

        "ch1_s2": {
          speaker: "旁白",
          text: "雾在你脚边缓缓让开，又在你身后合拢。走了很久，你发现树干上每隔一段距离就有一道浅浅的刻痕，像是有人刻意留下的路标。\n刻痕指向林子的更深处。",
          texture: { kind: "forest" },
          choices: [
            { text: "沿着刻痕继续深入", next: "ch1_s4", set: "followedMarks", affinity: { lin: 1 } },
            { text: "留在原地观察刻痕", next: "ch1_s3" }
          ]
        },

        "ch1_s3": {
          speaker: "旁白",
          text: "你蹲下身，拨开湿漉漉的蕨叶。地面上的脚印已经模糊，但你能分辨出它们和你一样，是从同一个方向走来的。\n不远处，一块爬满青苔的石碑半埋在土里，上面刻着三个字——「晨雾径」。",
          texture: { kind: "forest" },
          choices: [
            { text: "拂去石碑上的青苔", next: "ch1_s4", set: "cleanedStele" },
            { text: "记住石碑的位置，继续前进", next: "ch1_s4" }
          ]
        },

        "ch1_s4": {
          speaker: "雾中的声音",
          text: "「你终于到了。」一个低沉的声音从雾里传来，分不清是男是女。\n「想找到晨曦的源头，先越过前面的星湖。那里会有人替你指路——如果你答得上他的问题。」",
          texture: { kind: "forest" },
          dialogue: "lin_intro",
          next: "__chapterEnd__"
        }
      }
    },

    {
      id: "ch2",
      title: "第二章 · 星湖之畔",
      subtitle: "湖水倒映着天空，也倒映着来路",
      startScene: "ch2_s1",
      scenes: {
        "ch2_s1": {
          speaker: "旁白",
          text: "雾气在湖畔忽然散尽。湖面平静得像一面巨大的镜子，倒映出整片夜空，星星一颗一颗，仿佛伸手就能捞起。\n湖边坐着一个披着斗篷的人影，正用一根木棍搅动湖水。",
          texture: { kind: "lake" },
          choices: [
            { text: "上前询问晨曦的线索", next: "ch2_s2" },
            { text: "先绕到湖边捡起发光的石子", next: "ch2_s3", set: "hasStone", affinity: { zhou: 1 } }
          ]
        },

        "ch2_s2": {
          speaker: "披斗篷的人",
          text: "他没有抬头，只淡淡地说：「问题只有一题——湖里有多少颗星星？」\n你朝湖面望去，星光随着水波轻轻晃动，似乎每一秒都在变化。",
          texture: { kind: "lake" },
          choices: [
            { text: "「无数颗。」", next: "ch2_s4", affinity: { zhou: -1 } },
            { text: "「只有一颗——是倒影。」", next: "ch2_s5", affinity: { zhou: 2 } },
            { text: "出示你在湖边捡到的石子", next: "ch2_s6", require: "hasStone", affinity: { zhou: 2 } },
            { text: "与渡者套近乎", next: "ch2_s5", requireAffinity: { zhou: 1 }, affinity: { zhou: 1 } }
          ]
        },

        "ch2_s3": {
          speaker: "旁白",
          text: "你弯下腰，从浅水里拾起一颗温热的石子。它通体透明，内部仿佛困着一小片流动的晨光。\n披斗篷的人似乎察觉到了什么，微微偏过头来。",
          texture: { kind: "lake" },
          next: "ch2_s2"
        },

        "ch2_s4": {
          speaker: "披斗篷的人",
          text: "「错了。你看的只是水面，不是天空。」他摇了摇头，木棍在湖面划出一道长长的波纹。\n你隐约觉得错过了什么。",
          texture: { kind: "lake" },
          next: "__chapterEnd__"
        },

        "ch2_s5": {
          speaker: "披斗篷的人",
          text: "「答对了。天空只有一颗星会真正落进湖里——那就是晨曦。」他站起身，从斗篷下取出一枚铜镜递给你。\n「穿过湖对岸的山洞，用它照向最暗的地方。」",
          texture: { kind: "lake" },
          next: "__chapterEnd__"
        },

        "ch2_s6": {
          speaker: "披斗篷的人",
          text: "他看见你掌心的石子，终于抬起头。\n「你带了湖底的晨光石。答案其实不在我嘴里，而在你手里——把镜子照向最暗处，光会替你开门。」\n他取出一枚铜镜递给你。",
          texture: { kind: "lake" },
          next: "__chapterEnd__"
        }
      }
    },

    {
      id: "ch3",
      title: "第三章 · 晨曦之门",
      subtitle: "最暗的地方，往往藏着最初的光",
      startScene: "ch3_s1",
      scenes: {
        "ch3_s1": {
          speaker: "旁白",
          text: "山洞的入口像一张沉默的嘴。越往里走，光越稀薄，最后连自己的呼吸声都被黑暗吞没。\n你握紧那枚铜镜——如果斗篷人没有骗你的话，它该在这里派上用场。",
          texture: { kind: "cave" },
          choices: [
            { text: "举起铜镜，照向最暗处", next: "ch3_s2" },
            { text: "摸黑继续向前走", next: "ch3_s3" }
          ]
        },

        "ch3_s2": {
          speaker: "旁白",
          text: "铜镜忽然变得滚烫，一道金色的光从镜面涌出，撞向洞壁。石壁像水一样化开，露出后面一座寂静的石门。\n门缝里，透出你从未见过的、温柔得不像话的晨光。",
          texture: { kind: "dawn" },
          choices: [
            { text: "推开石门", next: "ch3_s4" },
            { text: "在门前停留片刻", next: "ch3_s4" }
          ]
        },

        "ch3_s3": {
          speaker: "旁白",
          text: "你在黑暗里摸索了很久，指尖触到一块冰凉的金属。那是铜镜——不知何时，它自己亮了起来，替你照见了前方的石门。\n原来光一直在你手中。",
          texture: { kind: "dawn" },
          next: "ch3_s4"
        },

        "ch3_s4": {
          speaker: "旁白",
          text: "石门缓缓开启。第一缕晨曦落在你肩上，轻得像一句迟到了很久的问候。\n雾散了，湖亮了，来时的路在身后铺成一条金色的河。\n你没有看见什么宝藏，只是忽然明白——那束光，从来都不在别处。",
          texture: { kind: "dawn" },
          dialogue: "lin_farewell",
          next: "__chapterEnd__"
        }
      }
    }
  ]
});

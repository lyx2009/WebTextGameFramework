/* ==========================================================================
   data/chapters.js
   故事注册表（StoryRegistry）
   职责：集中管理多个故事的定义，供故事选择界面与章节引擎使用。

   新增故事方式：在 data/stories/ 目录下新增一个 JS 文件，调用
   window.StoryRegistry.register({ ... }) 即可，无需改动其它代码。

   故事对象结构：
   {
     id:          唯一标识（用于存档隔离与主题映射）,
     title:       标题,
     subtitle:    副标题（标题画面小字）,
     description: 简介（故事选择界面展示）,
     theme:       该故事默认使用的主题 id（对应 index.html 中 data-theme-file）,
     chapters:    [ 章节数组，结构与之前版本一致 ]
   }

   章节结构约定：
   - chapters[]       章节数组
     - id             章节唯一标识
     - title          章节标题
     - subtitle       章节副标题（用于章节列表）
     - startScene     进入该章节时的起始场景 id
     - scenes{}       以场景 id 为键的场景对象
       - speaker      说话人
       - text         正文文本（支持 \n 换行）
       - texture      画布贴图配置 { kind: ... }
       - next         无选项时的下一场景 id（"__chapterEnd__" 表示章节结束）
       - choices[]    选项数组
         - text       选项文案
         - next       跳转的场景 id
         - set        可选，点击后写入的标记（条件分支）
         - require    可选，需要已持有的标记才会显示该选项
   ========================================================================== */

window.StoryRegistry = (function () {
  var stories = [];

  function register(story) {
    if (!story || !story.id) {
      return;
    }
    for (var i = 0; i < stories.length; i++) {
      if (stories[i].id === story.id) {
        stories[i] = story;
        return;
      }
    }
    stories.push(story);
  }

  function get(id) {
    for (var i = 0; i < stories.length; i++) {
      if (stories[i].id === id) {
        return stories[i];
      }
    }
    return null;
  }

  function list() {
    return stories;
  }

  function remove(id) {
    for (var i = 0; i < stories.length; i++) {
      if (stories[i].id === id) {
        stories.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  return {
    register: register,
    get: get,
    list: list,
    remove: remove
  };
})();

// ==========================================
// dsh-theme-aurora — 客户端半边（免构建单文件 client bundle）
//
// dsh 客户端模块系统的既定契约：执行 bundle 仅注册工厂
//（window.__ModuleLoader__.load({ id, factory })），模块体副作用在工厂
// 物化时运行；factory 收到的 require 由模块表应答。本文件直接作为
// client bundle 提供（package.json exports["./client"]），无需构建步骤。
//
// 本插件无开关：加载即启用，卸载即还原。职责只有三件：
//   1. 令牌覆盖层：ctx.theme.overrideTokens 把极夜玻璃调色板叠在当前
//      主题之上。覆盖层与 light/dark/system 偏好通道正交——不注册主题
//      id、不读写主题偏好，卸载时覆盖层随纤维回收自动还原；
//   2. 深色渲染基调断言：ui-layout 的 ThemePresenter 每次发布都按偏好
//      重写 color-scheme 与 body[data-ds-dark-theme] 暗色基底；极光是
//      单套极夜色，需要暗色基底兜底未覆盖的令牌，故在每次 theme/change
//      后（内置插件先注册监听，本监听器运行于 presenter 之后）把两者
//      重新断言为 dark——只改呈现，不碰偏好；
//   3. 结构层视觉：内联样式表（STRUCTURE_CSS，含 shiki 令牌、画布层
//      层叠与柔焦）+ 闭包化的 WebGL 渲染器（createAuroraRenderer）。
//      样式与渲染器均随 bundle 到达，无静态资源路由、无 index.html
//      注入、无 window 全局控制器；代价是客户端 bundle 加载前可能
//      闪现默认主题。
// ==========================================
window.__ModuleLoader__.load({
  id: 'dsh-theme-aurora',
  factory: () => {
    'use strict'
    /** 令牌覆盖层 source 标识（动态包门面会改钉为包 id，此处为直装插件路径）。 */
    const SOURCE = 'aurora'

    /** 激活标记：html 属性门控 STRUCTURE_CSS 结构层；style 标签携带同名标记便于定位。 */
    const MARK = 'data-dsh-aurora'

    /** ui-layout ThemePresenter 按偏好维护的暗色基底属性（呈现层，只读其契约）。 */
    const DARK_ATTRIBUTE = 'data-ds-dark-theme'

    /**
     * 极夜玻璃调色板：令牌名 → 单套色值。面板为半透明深绿玻璃，让
     * 渲染器的 WebGL 极光背景从内容之下透出；品牌强调色为氧 557nm 极光绿。
     */
    const PALETTE = {
      /* 背景：分层玻璃。bg-base 会被外壳的多个全高容器
         （AppFrame、centerCol、会话骨架）嵌套叠刷，任一非零 alpha 都会
         复合成黑色遮罩盖住画布层，故取全透明；整页压暗由 body 单独
         刷一层夜纱承担（见 STRUCTURE_CSS，body 只刷一次、不嵌套、
         无复合问题），面板可读性由 layer-1/2/3 及上方玻璃层承担 */
      '--dsw-alias-bg-base': 'rgba(2, 7, 10, 0)',
      '--dsw-alias-bg-layer-1': 'rgba(6, 12, 14, 0.42)',
      '--dsw-alias-bg-layer-2': 'rgba(8, 15, 18, 0.55)',
      '--dsw-alias-bg-layer-3': 'rgba(10, 18, 22, 0.66)',
      '--dsw-alias-bg-mask-1': 'rgba(0, 0, 0, 0.5)',
      '--dsw-alias-bg-mask-2': 'rgba(0, 0, 0, 0.24)',
      '--dsw-alias-bg-mask-3': 'rgba(0, 0, 0, 0.55)',
      '--dsw-alias-bg-mask-photo': 'rgba(0, 0, 0, 0.88)',
      '--dsw-alias-bg-mask-drop': 'rgba(4, 10, 13, 0.55)',
      '--dsw-alias-bg-module-platform': 'rgba(7, 14, 17, 0.55)',
      '--dsw-alias-bg-multi-select': 'rgba(10, 18, 22, 0.5)',
      '--dsw-alias-bg-overlay': 'rgba(12, 20, 24, 0.72)',
      '--dsw-alias-bg-skeleton': 'rgba(255, 255, 255, 0.06)',

      /* 描边：极光绿微光线，随层级加深 */
      '--dsw-alias-border-inverted2': 'rgba(255, 255, 255, 0.10)',
      '--dsw-alias-border-inverted': 'rgba(255, 255, 255, 0.08)',
      '--dsw-alias-border-l1': 'rgba(140, 220, 190, 0.09)',
      '--dsw-alias-border-l2-darkmode-thin': 'rgba(140, 220, 190, 0.10)',
      '--dsw-alias-border-l2': 'rgba(140, 220, 190, 0.14)',
      '--dsw-alias-border-l3': 'rgba(140, 220, 190, 0.19)',
      '--dsw-alias-border-l4': 'rgba(140, 220, 190, 0.26)',

      /* 品牌：氧 557nm 极光绿（前景文字取深夜绿，保证绿底上的对比度） */
      '--dsw-alias-brand-primary-invert': 'rgb(4, 20, 14)',
      '--dsw-alias-brand-primary-new-colorprimary-new-color': 'rgb(110, 231, 183)',
      '--dsw-alias-brand-primary': 'rgb(52, 211, 153)',
      '--dsw-alias-brand-text': 'rgb(110, 231, 183)',

      /* 按钮 */
      '--dsw-alias-button-contrast-fill': 'rgb(226, 240, 234)',
      '--dsw-alias-button-elevated-fill': 'rgba(12, 20, 24, 0.85)',
      '--dsw-alias-button-floating-fill': 'rgba(10, 17, 21, 0.78)',
      '--dsw-alias-button-floating-hover': 'rgba(16, 26, 31, 0.85)',
      '--dsw-alias-button-ghost-active-border': 'rgb(120, 148, 138)',
      '--dsw-alias-button-ghost-active-fill': 'rgba(255, 255, 255, 0.10)',
      '--dsw-alias-button-ghost-active-hover': 'rgba(255, 255, 255, 0.16)',
      '--dsw-alias-button-info-fill': 'rgb(52, 211, 153)',
      '--dsw-alias-button-info-hover': 'rgb(110, 231, 183)',
      '--dsw-alias-button-primary-dimmed': 'rgba(52, 211, 153, 0.22)',
      '--dsw-alias-button-primary-fill': 'rgb(52, 211, 153)',
      '--dsw-alias-button-primary-hover': 'rgb(110, 231, 183)',
      '--dsw-alias-button-tool-bar-fill-invisible': 'rgba(12, 20, 24, 0.4)',
      '--dsw-alias-button-tool-bar-fill': 'rgba(20, 30, 35, 0.55)',
      '--dsw-alias-button-tool-bar-hover': 'rgba(28, 42, 48, 0.68)',

      /* 交互态：白色叠层提亮，强调态染极光绿 */
      '--dsw-alias-interactive-bg-active': 'rgba(255, 255, 255, 0.14)',
      '--dsw-alias-interactive-bg-hover-accent': 'rgba(52, 211, 153, 0.18)',
      '--dsw-alias-interactive-bg-hover-danger': 'rgba(242, 90, 90, 0.16)',
      '--dsw-alias-interactive-bg-hover-solid': 'rgba(255, 255, 255, 0.10)',
      '--dsw-alias-interactive-bg-hover': 'rgba(255, 255, 255, 0.07)',

      /* 文字：青白冷调梯度 */
      '--dsw-alias-label-caption': 'rgb(104, 128, 118)',
      '--dsw-alias-label-dimmed': 'rgb(84, 110, 100)',
      '--dsw-alias-label-primary-bluish': 'rgb(134, 239, 172)',
      '--dsw-alias-label-primary-dimmed': 'rgb(196, 216, 206)',
      '--dsw-alias-label-primary-foreground': 'rgb(4, 20, 14)',
      '--dsw-alias-label-primary-inverted': 'rgb(4, 20, 14)',
      '--dsw-alias-label-primary': 'rgb(226, 240, 234)',
      '--dsw-alias-label-secondary': 'rgb(172, 196, 186)',
      '--dsw-alias-label-tertiary': 'rgb(120, 148, 138)',

      /* Markdown：代码块近乎不透明的极夜底，选中段染极光绿 */
      '--dsw-alias-markdown-citation': 'rgba(12, 20, 25, 0.6)',
      '--dsw-alias-markdown-code-block-banner': 'rgba(8, 14, 18, 0.72)',
      '--dsw-alias-markdown-code-block': 'rgba(3, 7, 10, 0.84)',
      '--dsw-alias-markdown-code-segment-selected': 'rgba(52, 211, 153, 0.22)',
      '--dsw-alias-markdown-code-segment-unselected': 'rgba(3, 7, 10, 0.55)',
      '--dsw-alias-markdown-inline-code': 'rgba(255, 255, 255, 0.08)',
      '--dsw-alias-markdown-placeholder': 'rgba(255, 255, 255, 0.07)',
      '--dsw-alias-markdown-tag': 'rgba(255, 255, 255, 0.10)',

      /* 滚动条 */
      '--dsw-alias-scrollbar-bg-l1': 'rgba(140, 220, 190, 0.22)',
      '--dsw-alias-scrollbar-bg-l2': 'rgba(140, 220, 190, 0.26)',
      '--dsw-alias-scrollbar-hover-l1': 'rgba(140, 220, 190, 0.38)',
      '--dsw-alias-scrollbar-hover-l2': 'rgba(140, 220, 190, 0.46)',

      /* 状态色：业务主色与成功色染极光绿，其余保持语义色相、按暗底提亮 */
      '--dsw-alias-state-business-primary': 'rgb(52, 211, 153)',
      '--dsw-alias-state-business-tertiary': 'rgba(52, 211, 153, 0.16)',
      '--dsw-alias-state-error-primary': 'rgb(242, 90, 90)',
      '--dsw-alias-state-error-secondary': 'rgb(248, 122, 122)',
      '--dsw-alias-state-success-primary': 'rgb(74, 222, 128)',
      '--dsw-alias-state-success-secondary': 'rgb(110, 231, 183)',
      '--dsw-alias-state-success-tertiary': 'rgba(34, 197, 94, 0.16)',
      '--dsw-alias-state-warn-label': 'rgb(221, 160, 41)',
      '--dsw-alias-state-warn-primary': 'rgb(245, 178, 11)',
      '--dsw-alias-state-warn-secondary': 'rgb(251, 196, 34)',
      '--dsw-alias-state-warn-tertiary': 'rgba(245, 178, 11, 0.16)',

      /* 浮层：高不透明度保证可读性 */
      '--dsw-alias-toast-bg': 'rgba(12, 20, 24, 0.92)',
      '--dsw-alias-tooltip-bg': 'rgba(14, 23, 28, 0.94)',

      /* 专项表面 */
      '--dsw-specific-bubble-highlight': 'rgba(52, 211, 153, 0.15)',
      '--dsw-specific-bubble': 'rgba(10, 18, 22, 0.58)',
      '--dsw-specific-input-major': 'rgba(3, 7, 10, 0.66)',
      '--dsw-specific-login-input': 'rgba(3, 7, 10, 0.66)',
      '--dsw-specific-menu': 'rgba(8, 14, 18, 0.88)',
      '--dsw-specific-selector': 'rgba(10, 18, 22, 0.7)',
      '--dsw-specific-sidebar-fill': 'rgba(5, 9, 12, 0.52)',
      '--dsw-specific-sidebar-nav-item-active-accent': 'rgba(52, 211, 153, 0.20)',
      '--dsw-specific-sidebar-nav-item-active': 'rgba(255, 255, 255, 0.10)',
      '--dsw-specific-sidebar-nav-item-hover': 'rgba(255, 255, 255, 0.07)',
      '--dsw-specific-tip': 'rgba(12, 20, 24, 0.9)',
    }

    /**
     * overrideTokens 契约要求每令牌给出 { light, dark } 双表（裸字符串会抛
     * 教学性错误）；极光为单套极夜色，两档填同一值，使浅色/深色/跟随系统
     * 任一档下覆盖层渲染一致。
     */
    const TOKENS = Object.fromEntries(
      Object.entries(PALETTE).map(([name, value]) => [name, { light: value, dark: value }]),
    )

    /** 结构层样式（层叠模型详见注释）。 */
    const STRUCTURE_CSS = `/* ==========================================
   dsh 极光主题 — 结构层样式
   极夜玻璃调色板（--dsw-* 令牌覆写）由客户端半边经
   ctx.theme.overrideTokens 进入令牌覆盖层，以 body 内联变量的形式
   生效并随卸载还原；本样式表只承载令牌契约之外的结构与呈现：
   shiki 暗色高亮、极夜底色、画布层与柔焦。
   全部规则由 html[data-dsh-aurora] 门控，卸载摘除该属性即还原。

   层叠模型（不依赖任何官方内部节点）：
     html 背景（最底层兜底）
       → #dsh-aurora-layer（z-index:-1：自带底色 + 柔焦的画布层）
         → body（门控下整页刷一层夜纱压暗画布）与全部应用内容
           （含 body 下的弹层 portal）
   应用外壳的多个全高容器（AppFrame、centerCol、会话骨架）会嵌套叠刷
   --dsw-alias-bg-base，任一非零 alpha 都会复合成黑色遮罩盖住画布层，
   故该令牌取全透明（见 src/client/index.js）；整页压暗改由 body 单独
   承担——body 只刷一次、不参与嵌套，无复合问题。弹层/菜单/Toast 的
   排序语义不受影响。
   ========================================== */

/* 深色渲染基调 + shiki 暗色代码高亮（极光色谱：青绿底、天蓝关键字、
   翠绿字符串、紫罗兰函数）。
   color-scheme 供首屏（ThemePresenter 内联覆写之前）生效；客户端半边
   随后把内联 color-scheme 断言为 dark，两者一致。 */
html[data-dsh-aurora] {
  color-scheme: dark;
  --shiki-foreground: rgb(196, 226, 214);
  --shiki-background: rgba(3, 7, 10, 0.84);
  --shiki-token-constant: #67e8f9;
  --shiki-token-string: #86efac;
  --shiki-token-comment: #5b7a6e;
  --shiki-token-keyword: #7dd3fc;
  --shiki-token-parameter: #5eead4;
  --shiki-token-function: #c4b5fd;
  --shiki-token-string-expression: #a7f3d0;
  --shiki-token-punctuation: #9fb8ad;
  --shiki-token-link: #6ee7b7;
}

/* 页面最底层兜底：画布层尚未创建（渲染器未启动）时透出纯黑极夜 */
html[data-dsh-aurora] {
  background: #02070a;
}

/* 整页压暗夜纱：bg-base 令牌取全透明后（见 src/client/index.js 调色板
   注释），画布层在面板之间零压暗裸透，文字可读性不足。这里让 body
   整页刷一层固定透明度的夜纱——body 只刷一次、不参与嵌套，不会像
   外壳全高容器叠刷 bg-base 那样复合成厚重遮罩；画布层均匀压暗透出，
   面板可读性仍由 layer-1/2/3 及上方玻璃层承担 */
html[data-dsh-aurora] body {
  background: rgba(2, 6, 8, 0.45);
}

/* Windows 桌面端专属修正：外壳 AppFrame 在 [data-windows-titlebar] 下给全窗
   容器 .frame 刷 background: var(--dsw-specific-sidebar-fill)，本意是给圆角
   内容区当窗口底色——官方主题该令牌近乎不透明，无感；极光的 sidebar-fill
   是 rgba(5,9,12,0.52) 半透明，等于在 z-index:-1 的极光画布上再盖一层
   52% 压暗，桌面端整窗因此比 Web 端暗（Web 端无该属性，规则不命中）。
   这里只摘除该容器背景：侧边栏自身填充、顶部标题栏条带（.frame::before）
   均不受影响。Web/macOS 端无 [data-windows-titlebar]，本规则为空操作。
   注意：.frame 经 CSS Modules 编译为哈希类名，只能按类名子串 '_frame'
   匹配（兼容'哈希_名'与'_名_哈希'两种编译格式）；若 dsh 升级后桌面端
   复现整窗偏暗，优先检查本规则是否仍命中。 */
html[data-dsh-aurora][data-windows-titlebar] #root [class*='_frame'] {
  background: transparent !important;
}
/* 极光画布层：fixed 负层级沉到全部内容之下，不拦截指针；
   自带降级底色（WebGL 失败时渲染器只移除画布，层保留，纯黑极夜透出）；
   柔焦以 filter 施加在画布层自身，无需在任何应用容器上开 backdrop-filter；
   inset 外扩 24px 吃掉 blur 在视口边缘的虚化过渡带 */
#dsh-aurora-layer {
  position: fixed;
  inset: -24px;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: #02070a;
  filter: blur(10px);
}

#dsh-aurora-canvas {
  display: block;
  width: 100%;
  height: 100%;
}`

    // ==========================================
    // dsh 极光主题 WebGL 渲染器（分层幕帘 ray-march：18 层水平薄层 +
    // 三角噪声帘纹 + 银河星野 + 月亮 + 雪原反射）。固定参数、无任何
    // 可调节项与交互，仅保留缓慢自动漂移。渲染分辨率为
    // 0.5 x devicePixelRatio(上限 2)
    // 倍窗口尺寸，半分辨率渲染兼顾性能与清晰度。
    // 本脚本自建全屏画布层（z-index:-1，沉到全部内容之下，层叠模型见
    // STRUCTURE_CSS）；画布层自带降级底色，WebGL 不可用或着色器编译失败时
    // 只移除画布，层保留，透出纯黑极夜。
    // 渲染器不自动启动：工厂返回 { start, stop } 控制器，
    // 由客户端半边按主题激活状态启停，重复 start/stop 幂等。
    // ==========================================
    function createAuroraRenderer() {
      'use strict'

      // ===== 1. 着色器源码 =====
      // 顶点着色器：全屏三角形
      var AU_VERT = [
        'attribute vec2 aPos;',
        'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
      ].join('\n')

      // 片元着色器：固定相机望向地平线略上方并缓慢摇摆；极光为 18 层
      // 水平薄层 ray-march，帘纹用三角噪声，颜色按高度分层（低层氧 557nm
      // 绿 → 青 → 高层氮紫红）；背景含银河带、两层星点、月亮与月晕，
      // 地平线以下为带极光反光的雪原
      var AU_FRAG = [
        'precision highp float;',
        'uniform vec2  uRes;',
        'uniform float uTime;',
        'uniform float uIntensity;',
        '',
        'float hash21(vec2 p){ p=fract(p*vec2(0.1031,0.1030)); p+=dot(p,p.yx+33.33); return fract((p.x+p.y)*p.x); }',
        'float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.zyx+31.32); return fract((p.x+p.y)*p.z); }',
        'vec3 hash33(vec3 p){',
        '  p = fract(p*vec3(0.1031,0.1030,0.0973));',
        '  p += dot(p, p.yxz+33.33);',
        '  return fract((p.xxy+p.yxx)*p.zyx);',
        '}',
        'float vnoise2(vec2 p){',
        '  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
        '  return mix(mix(hash21(i), hash21(i+vec2(1,0)), f.x),',
        '             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);',
        '}',
        'float tri(float x){ return abs(fract(x)-0.5)*2.0; }',
        'float trinoise(vec2 p){',
        '  float s = 0.0;',
        '  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);',
        '  s += tri(p.x*0.5 + tri(p.y*0.25))*0.55; p = m*p;',
        '  s += tri(p.x*0.5 + tri(p.y*0.25))*0.30; p = m*p;',
        '  s += tri(p.x*0.5 + tri(p.y*0.25))*0.15;',
        '  return s;',
        '}',
        'vec3 stars(vec3 d, float scale, float density, float seed){',
        '  vec3 p = d*scale + seed;',
        '  vec3 id = floor(p);',
        '  vec3 f  = fract(p)-0.5;',
        '  float h = hash13(id);',
        '  if(h < density){',
        '    vec3 off = (hash33(id+seed)-0.5)*0.8;',
        '    float dd = length(f-off);',
        '    return exp(-dd*dd*200.0) *',
        '           mix(vec3(0.65,0.75,1.0), vec3(1.0,0.85,0.6), hash13(id+3.7)) *',
        '           (0.4+1.6*hash13(id+9.1));',
        '  }',
        '  return vec3(0.0);',
        '}',
        'vec3 auroraColor(float h){',
        '  vec3 c = mix(vec3(0.15,1.0,0.35), vec3(0.1,0.8,0.7), smoothstep(0.0,0.4,h));',
        '  c = mix(c, vec3(0.45,0.25,0.9), smoothstep(0.35,0.75,h));',
        '  c = mix(c, vec3(0.9,0.2,0.35), smoothstep(0.7,1.0,h));',
        '  return c;',
        '}',
        'void main(){',
        '  vec2 uv = (gl_FragCoord.xy*2.0 - uRes)/uRes.y;',
        '',
        '  float yaw = sin(uTime*0.05)*0.25;',
        '  float pitch = 0.28 + sin(uTime*0.037)*0.05;',
        '  float zoom = 1.8;',
        '  float cy=cos(yaw), sy=sin(yaw), cx=cos(pitch), sx=sin(pitch);',
        '  vec3 fwd = vec3(sy*cx, sx, -cy*cx);',
        '  vec3 right = normalize(cross(fwd, vec3(0,1,0)));',
        '  vec3 up = cross(right, fwd);',
        '  vec3 rd = normalize(fwd*zoom + right*uv.x + up*uv.y);',
        '',
        '  vec3 col = vec3(0.004,0.008,0.018);',
        '  float band = exp(-pow(dot(rd, normalize(vec3(0.4,0.75,0.5))),2.0)*7.0);',
        '  col += band*vec3(0.03,0.045,0.08);',
        '  col += stars(rd, 22.0, 0.09,  0.0)*1.4;',
        '  col += stars(rd, 50.0, 0.08, 13.0)*0.7;',
        '',
        '  vec3 moonDir = normalize(vec3(0.55, 0.42, -0.6));',
        '  float mdot = dot(rd, moonDir);',
        '  col += pow(max(mdot,0.0), 3000.0)*vec3(1.0,0.98,0.9)*3.0;',
        '  col += pow(max(mdot,0.0), 60.0)*vec3(0.5,0.55,0.65)*0.15;',
        '',
        '  if(rd.y > 0.005){',
        '    vec3 acc = vec3(0.0);',
        '    float T = 1.0;',
        '    for(int i=0; i<18; i++){',
        '      float hi = float(i)/17.0;',
        '      float H = mix(1.2, 5.5, hi);',
        '      float t = H / rd.y;',
        '      vec2 p = rd.xz * t;',
        '      float wave = sin(p.x*0.18 + uTime*0.35) * 0.8',
        '                 + sin(p.x*0.05 - uTime*0.13) * 1.6;',
        '      vec2 q = vec2(p.x*0.35 + wave, p.y*0.06 - uTime*0.45);',
        '      float n = trinoise(q);',
        '      float curtain = pow(smoothstep(0.35, 0.9, n), 2.0);',
        '      float fade = smoothstep(0.0, 1.5, t) * exp(-t*0.09);',
        '      float em = curtain * fade * (1.0 - hi*0.45);',
        '      acc += auroraColor(hi) * em * T * 0.16;',
        '      T *= 1.0 - em*0.22;',
        '    }',
        '    col += acc * uIntensity;',
        '  }',
        '',
        '  float hor = smoothstep(0.005, -0.01, rd.y);',
        '  float snowN = vnoise2(rd.xz/max(-rd.y,0.02)*2.0);',
        '  vec3 ground = vec3(0.010,0.016,0.028) * (0.7+0.3*snowN);',
        '  ground += vec3(0.05,0.22,0.10) * uIntensity * 0.12 * exp(rd.y*18.0);',
        '  col = mix(col, ground, hor);',
        '',
        '  col *= 1.0 - 0.20*dot(uv*0.7, uv*0.7);',
        '  col = 1.0 - exp(-col * 1.2);',
        '  col = pow(col, vec3(1.0/2.2));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')

      // ===== 2. 固定渲染参数（预览默认值固化，不提供任何可调节项） =====
      var AU_INTENSITY = 1.2                         // 极光强度
      var AU_WIND = 0.7                              // 风速（模拟时间流速倍率）
      var AU_FRAME_MS = 1000 / 30                    // 帧间隔上限：限制 30fps 降低 GPU 常驻开销（dt 按真实流逝时间计算，漂移速度不受影响）

      // ===== 3. 运行时状态（纯数据对象） =====
      var au = { running: false, raf: null, canvas: null, gl: null, U: null, simT: 0, prevT: 0, ready: false, failed: false }

      // ===== 4. 画布层挂载 =====
      // 自建全屏固定层（负层级沉底，不依赖任何官方内部节点）；层的几何、层级、
      // 降级底色与柔焦全部由 STRUCTURE_CSS 承载，此处只建节点、不染指样式。
      function mountLayer() {
        var existing = document.getElementById('dsh-aurora-layer')
        if (existing) {
          return document.getElementById('dsh-aurora-canvas')
        }
        var layer = document.createElement('div')
        layer.id = 'dsh-aurora-layer'
        layer.setAttribute('aria-hidden', 'true')
        var canvas = document.createElement('canvas')
        canvas.id = 'dsh-aurora-canvas'
        layer.appendChild(canvas)
        document.body.prepend(layer)
        return canvas
      }

      // 剥离块注释：部分 ANGLE 驱动对含非 ASCII 字符的着色器注释会编译失败
      function stripComments(src) {
        return src.replace(/\/\*[\s\S]*?\*\//g, '')
      }

      // ===== 5. 初始化与分辨率 =====
      // 初始化极光渲染器：编译链接着色器、建立全屏三角形、解析 uniform 位置、
      // 绑定窗口缩放；WebGL 不可用或着色器编译失败时静默降级返回 false
      function initAurora() {
        if (au.ready || au.failed) {
          return au.ready
        }
        var canvas = mountLayer()
        var gl = canvas ? canvas.getContext('webgl', { antialias: false, alpha: false }) : null
        if (!canvas || !gl) {
          au.failed = true
          return false
        }
        try {
          // 编译单个着色器，编译失败时抛出异常
          var compile = function (type, src) {
            var s = gl.createShader(type)
            gl.shaderSource(s, stripComments(src))
            gl.compileShader(s)
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
              throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed')
            }
            return s
          }
          var prog = gl.createProgram()
          gl.attachShader(prog, compile(gl.VERTEX_SHADER, AU_VERT))
          gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, AU_FRAG))
          gl.linkProgram(prog)
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(prog) || 'program link failed')
          }
          gl.useProgram(prog)
          // 全屏三角形顶点缓冲
          var buf = gl.createBuffer()
          gl.bindBuffer(gl.ARRAY_BUFFER, buf)
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
          var locPos = gl.getAttribLocation(prog, 'aPos')
          gl.enableVertexAttribArray(locPos)
          gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0)
          // 解析全部 uniform 位置
          var U = {}
          var names = ['uRes', 'uTime', 'uIntensity']
          for (var i = 0; i < names.length; i++) {
            U[names[i]] = gl.getUniformLocation(prog, names[i])
          }
          au.canvas = canvas
          au.gl = gl
          au.U = U
          au.ready = true
          // 渲染分辨率跟随系统屏幕分辨率，窗口缩放时同步
          window.addEventListener('resize', resizeAurora)
        } catch (e) {
          au.failed = true
          return false
        }
        return true
      }

      // 同步渲染分辨率：0.5 倍渲染比例再乘 devicePixelRatio（上限 2），
      // 半分辨率渲染缓解 GPU 压力；画布显示尺寸由 CSS 撑满全屏，浏览器负责放大
      function resizeAurora() {
        if (!au.ready) {
          return
        }
        var scale = 0.5 * Math.min(window.devicePixelRatio || 1, 2)
        var w = Math.max(1, Math.floor(scale * window.innerWidth))
        var h = Math.max(1, Math.floor(scale * window.innerHeight))
        if (au.canvas.width !== w || au.canvas.height !== h) {
          au.canvas.width = w
          au.canvas.height = h
          au.gl.viewport(0, 0, w, h)
        }
      }

      // ===== 6. 帧渲染与循环 =====
      // 绘制当前帧：上传 uniform 并渲染
      function drawAuroraFrame() {
        var gl = au.gl
        var U = au.U
        gl.uniform2f(U.uRes, au.canvas.width, au.canvas.height)
        gl.uniform1f(U.uTime, au.simT)
        gl.uniform1f(U.uIntensity, AU_INTENSITY)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }

      // 渲染循环：按风速推进模拟时间，每帧先同步分辨率再绘制；
      // now 为 requestAnimationFrame 时间戳（毫秒）
      function tickAurora(now) {
        if (!au.running) {
          return
        }
        au.raf = requestAnimationFrame(tickAurora)
        // 30fps 限速：未到帧间隔直接跳帧，仅跳渲染不跳计时
        if (now - au.prevT < AU_FRAME_MS) {
          return
        }
        resizeAurora()
        var dt = Math.min((now - au.prevT) / 1000, 0.1)
        au.prevT = now
        au.simT += dt * AU_WIND
        drawAuroraFrame()
      }

      // ===== 7. 启动与停止 =====
      // 启动极光渲染：初始化 WebGL 并开始 RAF 循环；
      // 系统要求减少动态时仅渲染一帧静态画面
      function startAurora() {
        if (!initAurora()) {
          // WebGL 不可用：只移除画布（alpha:false 的空白画布为不透明纯黑），
          // 画布层保留，其自带的降级底色透出纯黑极夜
          var failed = document.getElementById('dsh-aurora-canvas')
          if (failed) {
            failed.remove()
          }
          return
        }
        resizeAurora()
        // 减少动态效果：静态渲染一帧即可，不启动循环
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          au.simT = 0
          drawAuroraFrame()
          return
        }
        if (au.running) {
          return
        }
        au.running = true
        au.prevT = performance.now()
        au.raf = requestAnimationFrame(tickAurora)
      }

      // ===== 8. 停止与控制器导出 =====
      // 停止极光渲染：取消 RAF 循环、解绑缩放监听、销毁 GL 上下文并移除画布层；
      // 重置初始化标记，下次 start 重新建层与编译着色器（failed 标记保留，
      // WebGL 不可用的环境不会无谓重试）
      function stopAurora() {
        au.running = false
        if (au.raf !== null) {
          cancelAnimationFrame(au.raf)
          au.raf = null
        }
        window.removeEventListener('resize', resizeAurora)
        if (au.gl !== null) {
          var lose = au.gl.getExtension('WEBGL_lose_context')
          if (lose) {
            lose.loseContext()
          }
        }
        var layer = document.getElementById('dsh-aurora-layer')
        if (layer) {
          layer.remove()
        }
        au.canvas = null
        au.gl = null
        au.U = null
        au.ready = false
      }

      return { start: startAurora, stop: stopAurora }
    }

    /**
     * 客户端插件体：叠令牌覆盖层、断言深色渲染基调、挂载结构层样式与
     * WebGL 渲染器，卸载时全部还原。
     * @param {import('@deepseek-ai/cordis').Context} ctx - 客户端 cordis 上下文。
     */
    function apply(ctx) {
      let disposed = false

      // 1. 令牌覆盖层：叠在当前主题之上，卸载随纤维回收自动移除并还原
      ctx.effect(() => ctx.theme.overrideTokens(SOURCE, TOKENS), 'theme-aurora: token overlay')

      // 2. 深色渲染基调：ThemePresenter 每次发布按偏好重写 color-scheme 与
      //    暗色基底属性，本监听器运行于其后重新断言为 dark（只改呈现）。
      //    已覆盖令牌之外的基底令牌需要暗色基底兜底，否则浅色偏好下露浅色底
      const assertDarkChrome = () => {
        if (disposed) return
        document.documentElement.style.colorScheme = 'dark'
        document.body.setAttribute(DARK_ATTRIBUTE, '')
      }
      assertDarkChrome()
      ctx.on('theme/change', assertDarkChrome)

      // 3. 结构层：html 门控属性 + 内联样式表 + WebGL 渲染器。
      //    渲染器为模块内闭包，无全局控制器、无脚本加载竞态
      document.documentElement.setAttribute(MARK, '')
      const style = document.createElement('style')
      style.setAttribute(MARK, '')
      style.textContent = STRUCTURE_CSS
      document.head.appendChild(style)
      const renderer = createAuroraRenderer()
      renderer.start()

      // 卸载回收：还原渲染基调到当前偏好解析结果，摘除全部 DOM 痕迹。
      // disposed 先于覆盖层移除置位，使移除发布的 theme/change 不再触发断言；
      // 无论纤维内各 effect 的处置顺序如何，最终状态都收敛到偏好本真值
      ctx.effect(() => () => {
        disposed = true
        const scheme = ctx.theme.getTheme().active.colorScheme
        document.documentElement.style.colorScheme = scheme
        if (scheme === 'dark') document.body.setAttribute(DARK_ATTRIBUTE, '')
        else document.body.removeAttribute(DARK_ATTRIBUTE)
        document.documentElement.removeAttribute(MARK)
        style.remove()
        renderer.stop()
      }, 'theme-aurora: teardown')
    }

    /** 客户端半边依赖的服务（与 package.json dsh.client.inject 的包一一对应）。 */
    const inject = ['theme']

    return { inject, apply }
  },
})

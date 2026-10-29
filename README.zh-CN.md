# dsh-theme-aurora

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Version](https://img.shields.io/badge/version-0.2.0-green)

[English](README.md) | 中文

DeepSeek Harness（dsh）Web UI 的极光主题插件：以 WebGL 分层幕帘极光作为应用背景，包含星空、银河、月亮与雪原地平线，配合极夜深绿玻璃面板。无开关：插件加载即启用，禁用或卸载插件即无残留还原默认主题。

## 特性

- **WebGL 分层幕帘极光背景**：片元着色器对 18 层水平薄层进行 ray-march，以三角噪声形成帘纹，按高度渐变色，并绘制银河星野、月亮与带极夜反光的雪原；画面缓慢自动漂移，无交互干扰
- **极夜玻璃面板**：半透明深绿令牌覆写配合柔焦背景，让极光从内容之下柔和透出，品牌强调色改为极光氧绿
- **令牌覆盖层、加载即启用**：调色板经主题服务的令牌覆盖层（`ctx.theme.overrideTokens`）叠在当前主题之上，与浅色/深色/跟随系统偏好通道正交——不读写外观偏好，卸载插件即自动还原；样式与渲染器全部内联于 client bundle，无服务端路由、无 index.html 注入、无全局变量
- **性能友好且优雅降级**：半分辨率渲染、30fps 限速、遵循系统减少动态偏好，WebGL 不可用时透出纯黑极夜底色

## 安装

本插件为纯浏览器侧呈现，无任何 Host 侧服务依赖。

要求 dsh ≥ 0.1.0-rc.7（该版本起主题服务提供令牌覆盖层 `ctx.theme.overrideTokens`）。

```bash
dsh plugin --profile web add <path-to-this-package>
```

## 使用

没有设置开关：插件加载即启用极光主题。

- **关闭**：禁用或卸载插件（`dsh plugin --profile web remove dsh-theme-aurora`），令牌覆盖层随之回收，DOM 痕迹全部摘除，你原有的外观偏好（浅色 / 深色 / 跟随系统）原样恢复
- **外观设置**：浅色/深色/跟随系统偏好仍可自由切换，极光调色板在任一档下渲染一致

## 工作原理

### 整体架构

主题为纯浏览器侧呈现：Host 半边只提供稳定插件名与启停日志（bundle 加载器会导入每一行的 Node 半边），全部视觉逻辑位于单个免构建 client bundle 中：

| 部分       | 位置 | 职责 |
|------------|------|------|
| Host 半边  | `src/index.js` | 最小 Host 实现，导出稳定插件名并记录启停日志 |
| 令牌覆盖层 | `PALETTE` / `TOKENS`（`src/client/index.js`） | 经 `ctx.theme.overrideTokens` 把极夜玻璃调色板叠在当前主题之上 |
| 结构层     | `STRUCTURE_CSS`（内联样式表） | `html[data-dsh-aurora]` 门控的画布层（自带柔焦与降级底色）、body 整页压暗夜纱与 shiki 令牌 |
| 渲染器     | `createAuroraRenderer()`（内联） | 分层幕帘极光 WebGL 渲染器，工厂返回 `{ start, stop }` 闭包控制器 |

### 门控机制

主题的结构层视觉由 `html` 元素上的 `data-dsh-aurora` 属性门控：属性存在时画布层、柔焦与 shiki 令牌生效，移除后完整还原，无残留。

- 样式表与渲染器全部内联于 client bundle，随客户端插件加载到达——无静态资源路由、无 index.html 注入、无 `window` 全局控制器；代价是 bundle 加载前可能短暂闪现默认主题
- 调色板不在 CSS 中：客户端经 `ctx.theme.overrideTokens('aurora', tokens)` 把令牌叠成覆盖层，由主题运行时以 body 内联变量写入并折叠进每次 `theme/change` 快照。覆盖层与浅色/深色/跟随系统偏好通道正交——不注册主题 id、不读写偏好——卸载插件时覆盖层自动回收
- 极光为单套极夜色、在任一偏好档下渲染一致，客户端在每次 `theme/change` 后断言深色渲染基调（内联 `color-scheme: dark` 与暗色基底属性）——只写呈现、不碰持久化偏好——卸载时按偏好解析结果还原
- 渲染器为模块内闭包，客户端激活时 start；卸载时 stop（取消 RAF、销毁 GL 上下文、移除画布层）

### 极光渲染器（`createAuroraRenderer`，内联于 `src/client/index.js`）

渲染器为每个像素构造相机光线，并完全在片元着色器中求值极光、天空与地面。它采用解析式分层体积近似，而非完整大气物理模拟，因此无需贴图或外部资源即可独立运行。

**相机与自动漂移。** 固定相机望向地平线略上方，缩放系数为 1.8；缓慢的正弦偏航与俯仰变化形成轻柔漂移，没有鼠标交互或可调参数。

**分层幕帘。** 在地平线上方，着色器对高度 1.2 至 5.5 场景单位的 18 层水平薄层进行 ray-march。每层将相机光线与所在平面求交，用两组缓慢波形扰动交点坐标，再通过三角噪声形成竖向帘纹：

- 平滑阈值与平方衰减塑造帘幕轮廓，随距离变化的衰减让地平线保持柔和
- 发光按从前到后的顺序累积，并以透射率衰减后方薄层，形成层叠纵深
- 高度同时影响发光强度与颜色：低层由氧线启发的绿色过渡到青色，高层再转为紫色与氮线启发的红色
- 固定强度 `1.2` 与风速/时间倍率 `0.7`，让背景保持足够克制，不抢夺应用内容的可读性

**天空、月亮与雪原。** 幕帘后方由指数衰减的银河带和两层哈希星点构成天空；方向性月亮项生成明亮月盘与宽阔月晕。地平线以下，值噪声雪面与绿色极光反光组成安静的地面。最终颜色经过暗角、指数色调映射与 gamma 校正输出。

**性能与回收。** 性能策略如下：

- 渲染分辨率为 `0.5 x devicePixelRatio`（上限 2）倍窗口尺寸，半分辨率渲染兼顾性能与清晰度，由浏览器放大撑满全屏
- RAF 循环限速 30fps，只跳渲染不跳计时，漂移速度不受影响
- 系统开启减少动态偏好时仅渲染一帧静态画面，不启动循环
- WebGL 不可用或着色器编译失败时只移除画布，画布层保留，其自带的纯黑极夜降级底色透出
- stop 时取消 RAF、主动 `loseContext` 销毁 GL 上下文并移除画布层，不留痕迹

### 极夜玻璃调色板（`PALETTE` 令牌覆盖层 + `STRUCTURE_CSS` 结构样式）

调色板以令牌覆盖层的形式覆写 Web UI 的 `--dsw-*` 设计令牌（经 `ctx.theme.overrideTokens` 叠放，每令牌对浅/深两档给出同值）；内联样式表 `STRUCTURE_CSS` 中的结构规则由 `html[data-dsh-aurora]` 门控：

- 画布层 `z-index: -1` 沉到 body 与全部应用内容之下——不接触任何官方挂载节点，弹层/菜单/Toast 的排序语义不受影响；画布层自带降级底色与 `filter: blur(10px)` 柔焦，半透明面板透过它看到柔焦极光
- 背景令牌改为分层半透明玻璃，越靠上的层（菜单、弹层、Toast）越不透明，保证可读性；其中 `--dsw-alias-bg-base` 取全透明——应用外壳的多个全高容器会嵌套叠刷它，任一非零 alpha 都会复合成暗色遮罩盖住画布层；整页压暗改由 body 单独刷一层固定透明度的夜纱承担，避免嵌套复合
- 品牌与交互强调色改为极光绿（`rgb(52, 211, 153)`），文字为青白冷调梯度
- shiki 暗色代码高亮使用同一组绿、青、紫色谱，代码块采用近乎不透明的极夜底
- Windows 标题栏专属规则移除外壳 frame 的额外半透明填充，避免桌面窗口被重复压暗，同时保留侧边栏与标题栏条带

## 项目结构

```
.
├── cordis.patch.yml      # bundle patch：声明插件 id 与名称
├── package.json          # exports、dsh.bundle / dsh.client 清单
└── src
    ├── index.js          # Host 半边（稳定名称 + 启停日志）
    └── client
        └── index.js      # 客户端半边（免构建单文件 bundle：调色板 + 结构层样式 + WebGL 渲染器）
```

## 许可证

[MIT](./LICENSE)

# dsh-theme-aurora

[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Version](https://img.shields.io/badge/version-0.2.0-green)

English | [中文](README.zh-CN.md)

An aurora theme plugin for the DeepSeek Harness (dsh) Web UI: a WebGL layered-curtain aurora with a star field, moon and snowy horizon as the application background, paired with a polar-night glass panel palette. There is no toggle: the theme is enabled while the plugin is installed, and disabling or removing the plugin restores the default theme without residue.

## Features

- **WebGL layered-curtain aurora background**: eighteen horizontal layers are ray-marched in the fragment shader, with triangular-noise curtains, height-dependent color, a galactic star field, moonlight and a reflective snowy horizon; the scene drifts slowly without interaction
- **Polar-night glass panels**: translucent dark-green token overrides and a soft-focused background let the aurora show through gently behind the content; the brand accent becomes oxygen-green
- **Token override layer, always on**: the palette stacks onto the active theme through the theme service's token override layer (`ctx.theme.overrideTokens`), orthogonal to the light/dark/system preference — the plugin never reads or writes the appearance preference, and unloading retracts the layer automatically; the stylesheet and renderer are inlined into the client bundle — no server routes, no index.html injection, no globals
- **Performance-friendly with graceful degradation**: half-resolution rendering, a 30fps cap, support for the system reduced-motion preference, and a pure-black polar-night fallback when WebGL is unavailable

## Installation

The theme is purely browser-side and has no host-side service dependencies.

Requires dsh ≥ 0.1.0-rc.7 (the release that introduced the theme service's token override layer, `ctx.theme.overrideTokens`).

```bash
dsh plugin --profile web add <path-to-this-package>
```

## Usage

There is no settings toggle: the aurora theme is enabled as soon as the plugin loads.

- **Turn off**: disable or remove the plugin (`dsh plugin --profile web remove dsh-theme-aurora`); the token override layer is retracted and every DOM trace is removed, restoring your previous appearance (light / dark / follow system) exactly as it was
- **Appearance setting**: the light/dark/system preference remains yours to change; the aurora palette renders identically on top of any of them

## How It Works

### Overall Architecture

The theme is purely browser-side: the host side only provides the stable plugin name and lifecycle logging (the bundle loader imports every row's node half), and all visual logic lives in a single build-free client bundle:

| Part        | Location | Responsibility |
|-------------|----------|----------------|
| Host side   | `src/index.js` | Minimal host implementation; exports the stable plugin name and logs lifecycle transitions |
| Token layer | `PALETTE` / `TOKENS` (`src/client/index.js`) | Stacks the polar-night glass palette over the active theme through `ctx.theme.overrideTokens` |
| Structure   | `STRUCTURE_CSS` (inlined stylesheet) | Canvas layer (built-in soft focus and fallback backdrop), page-wide body dimming veil and shiki tokens gated by `html[data-dsh-aurora]` |
| Renderer    | `createAuroraRenderer()` (inlined) | Layered-curtain aurora WebGL renderer; the factory returns a closure-based `{ start, stop }` controller |

### Gating

All structural visuals are gated by the `data-dsh-aurora` attribute on the `html` element: while the attribute is present the canvas layer, soft focus and shiki tokens apply; removing it restores everything, leaving no residue.

- The stylesheet and renderer are inlined into the client bundle and arrive with the client plugin — no static asset routes, no index.html injection, no `window` global controller; the trade-off is a possible brief flash of the default theme before the bundle loads
- The palette does not live in CSS: the client stacks it through `ctx.theme.overrideTokens('aurora', tokens)`, and the theme runtime writes the tokens as inline variables on `body`, folded into every `theme/change` snapshot. The layer is orthogonal to the light/dark/system preference — the plugin never registers a theme id nor reads/writes the preference — and unloading the plugin retracts the layer automatically
- Because the aurora palette is a single polar-night scheme rendered under any preference, the client asserts a dark rendering baseline (inline `color-scheme: dark` and the dark base palette attribute) after every `theme/change` — a presentation-only write that never touches the stored preference — and restores the preference-resolved baseline on unload
- The renderer is a module-local closure; the client starts it on activation and stops it (RAF cancel + GL context destruction + canvas removal) on unload

### The Aurora Renderer (`createAuroraRenderer`, inlined in `src/client/index.js`)

For each pixel, the renderer constructs a camera ray and evaluates the aurora, sky and ground entirely within the fragment shader. It uses an analytic layered volume approximation rather than a full atmospheric simulation, keeping the scene self-contained with no textures or external assets.

**Camera and automatic drift.** The fixed camera looks slightly above the horizon with a zoom factor of 1.8. Slow sinusoidal yaw and pitch motion provide gentle drift; there are no pointer controls or tunable settings.

**Layered curtains.** Above the horizon, the shader marches eighteen thin horizontal layers at heights from 1.2 to 5.5 scene units. Each layer intersects the camera ray with its plane, distorts the resulting coordinates with two slow waves, and evaluates triangular noise to form vertical curtain filaments:

- A smooth threshold and squared falloff shape each curtain; distance-dependent fade keeps the horizon soft
- Emission accumulates front-to-back with a transmittance term, so nearer layers attenuate the layers behind them
- Height controls both emission strength and color: oxygen-inspired green at the lower edge transitions through teal to violet and nitrogen-inspired red at higher altitudes
- Fixed intensity `1.2` and wind/time scale `0.7` keep the background subdued enough for application content

**Sky, moon and snow.** Behind the curtains, an exponential galactic band and two layers of hashed stars fill the sky. A directional moon term adds a bright disk and a broad halo. Below the horizon, value-noise snow and a green aurora reflection form a quiet ground plane. The final color receives a vignette, exponential tone mapping and gamma correction.

**Performance and cleanup.** Performance strategy:

- The render resolution is `0.5 x devicePixelRatio` (capped at 2) times the window size — half-resolution rendering balances performance and clarity, with the browser upscaling to fullscreen
- The RAF loop is capped at 30fps; it skips rendering but not timing, so the drift speed is unaffected
- When the system reduced-motion preference is on, only a single static frame is rendered and the loop never starts
- If WebGL is unavailable or shader compilation fails, only the canvas is removed; the layer stays and its own pure-black polar-night fallback backdrop shows through
- On stop, the RAF is cancelled, the GL context is proactively destroyed via `loseContext`, and the canvas layer is removed without a trace

### The Polar-Night Glass Palette (`PALETTE` token override layer + `STRUCTURE_CSS`)

The palette is delivered as a token override layer over the Web UI's `--dsw-*` design tokens (stacked via `ctx.theme.overrideTokens`, each token supplying the same value for both palette modes); the structural rules in the inlined `STRUCTURE_CSS` stylesheet are gated by `html[data-dsh-aurora]`:

- The canvas layer sits at `z-index: -1`, sunk below the body and all app content — no official mount node is touched, and overlay/menu/toast ordering is unaffected; the layer carries its own fallback backdrop and a `filter: blur(10px)` soft focus, so translucent panels see a soft-focused aurora
- Background tokens become layered translucent glass; higher layers (menus, popovers, toasts) are more opaque to preserve readability. `--dsw-alias-bg-base` is fully transparent: several full-height app-shell containers paint it in nested stacks, and any non-zero alpha would compound into a dark scrim over the canvas; page-wide dimming is instead carried by a single fixed-alpha night veil painted once on body
- Brand and interactive accents become aurora green (`rgb(52, 211, 153)`), with a cool cyan-white text gradient
- Shiki dark code-highlighting tokens use the same green, cyan and violet spectrum; code blocks use a nearly opaque polar-night base
- A Windows-titlebar-specific rule removes the shell frame's extra translucent fill, preventing the desktop window from being dimmed twice while leaving the sidebar and titlebar strip intact

## Project Structure

```
.
├── cordis.patch.yml      # bundle patch: declares the plugin id and name
├── package.json          # exports, dsh.bundle / dsh.client manifest
└── src
    ├── index.js          # host side (stable name + lifecycle logging)
    └── client
        └── index.js      # client side (build-free single-file bundle: palette + structure CSS + WebGL renderer)
```

## License

[MIT](./LICENSE)

# infinity-config

Typed, validated configuration for charts and interface components.

Each component declares its settings once: a closed set of types (text, number, bool, enum, colour, font, alignment, format, json and
a few composites), defaults, and how much each change costs (style, layout or data). The core resolves a saved configuration through
a fixed cascade, from built in defaults through theme tokens, page defaults, visual overrides and per-series rules, to the props a
renderer draws. Every resolved value can explain where it came from, every saved configuration validates with paths and fix hints, and
every component publishes a JSON Schema, so people, settings panels and AI agents all edit the same thing safely.

## Packages

| Package | What it does |
|---|---|
| `@infinity/config-core` | Declarations, shared setting groups, the resolver, validation, the inspector (`explain`), JSON Schema export, series and row helpers. No React, no DOM. |
| `@infinity/config-react` | `Visual` (resolve and render a registered component), `ChromeFrame` (title, card, empty and error states) and a generated `SettingsPanel`. React 18 or 19. |

## Rules the core enforces

- Colours are theme tokens, never raw hex, and each colour is checked for contrast by its role (text, mark or decoration).
- Overrides are sparse and keyed by path, so a reorder or a new default never moves a saved setting.
- Renderers receive resolved values only, never the token map.

## Build from source

```bash
npm install
npm run typecheck --workspaces
npm test --workspaces
npm run build --workspaces
```

The packages are not on npm yet.

## Licence

MIT. See `LICENSE`.

# @infinity/config-core

A small, renderer independent settings engine for visuals and interface components. A component declares its properties once. The same declaration drives defaults, validation, patches, JSON Schema, explanations and a generated settings panel. The package has no runtime dependencies.

The cascade has six layers: L0 built in defaults, L1 workspace theme tokens, L2 report or interface defaults, L3 visual overrides, L4 per-series rules and L5 guarded raw renderer props. Saved documents are sparse maps of property paths. Reset deletes a path so lower layers become visible again.

```ts
import { defineComponent, chrome, resolve } from '@infinity/config-core';
const card = defineComponent({
  name: 'card', version: '1.0.0', kind: 'visual', groups: [chrome()],
  props: {}, series: {}, variants: {},
});
const document = { component: 'card', version: '1.0.0', overrides: {
  'chrome.title.text': 'Revenue',
} };
const result = resolve(card, { tokens: { '--card': '#FFFFFF' },
  overrides: document.overrides }, { scheme: 'light' });
console.log(result.props['chrome.title.text']);
```

Call `validate` before saving, `applyPatch` for atomic edits, and `explain` to show why a property has its value. `registerMigration` and `migrate` keep older documents usable. `toJSONSchema` exports draft 2020-12 schemas. Run `npm run schemas` to write schemas for registered components in the UI kit.

`applyPatch` uses `DEFAULT_POLICY.rawNoteRequired: false`; pass `policy: { rawNoteRequired: true }` to require a note for each raw write. Notes are saved as `rawNote` and limited to 280 characters.

`matchRow(rule, row)` evaluates a `match` value rule against one row and returns the first matching `{ tone, badge }`. Row rules may read only `row` fields. `paletteFor(props, key, domain)` assigns a resolved identity colour to a row value, using the same palette order and stable key setting as series. It returns `{ colour, dashed, dash? }`. The resolver supplies `colour.paletteValues` and `colour.dash` in `resolved.props`; pass those props directly to `paletteFor`. Renderers receive these resolved values and no token map.

Use `layout()` for shared layout settings on stack, row, grid and section components. It declares the seven `layout.*` keys. `layout.gap` is saved as `s-0` through `s-8` and resolves to the matching theme spacing value, such as `16px` for `s-4` in the default theme. Components can hide unused keys through declaration overrides. `chrome()` also declares `chrome.header`, with `card` as the default and `none` for layout blocks that supply their own structure. The `card` default is implicit in resolved props so existing visual outputs remain stable; an override of `none` is explicit.

Use `value()` and `delta()` for shared metric settings. They declare `value.format`, `value.font`, `value.size`, `value.align`, `delta.show`, `delta.kind`, `delta.decimals`, `delta.polarity` and `delta.label`; `delta.decimals` defaults to 1 and accepts 0 through 4. A component can change a member default or hide it through declaration overrides while retaining the shared path.

Text declarations can set `required: true` and `minLength`. Validation reports `required` for a missing or blank required override and `min_length` for shorter trimmed text, with a path and fix. JSON shapes can declare a discriminated union with `oneOf` branches and a `discriminator` key. Each branch gives its discriminator value as an enum and lists its required fields. Validation selects one branch and reports nested paths; the JSON Schema keeps `oneOf` and the discriminator annotation. A list can use a JSON item declaration with the same shape. `tone()` declares the shared neutral, accent, success, warning, danger and info choices. Set `allowAccent: true` for unconditional accent or a path-only 4a condition such as `{ path: 'button.kind', equals: 'go' }` to permit it only when resolved props satisfy that condition; the JSON Schema carries conditional gates in `x-allow-accent`.

Series normally come from the value roles in data, or from columns for a table with no roles. A categorical component can declare `data: { shape: 'categorical', seriesFrom: 'category' }` to make distinct category members the series in data order. Each member uses its string value as its id and label. Saved series rules can then match a member by id or label, and the renderer receives its resolved palette colour, dash and rule overrides.

Series rules resolve `axis` per series, with `y` as the default for components with a value axis. A rule may use `y2` only when the component declares `axis('y2')`. A rule may set `type` only when the component declares that mark in `seriesTypes`, for example `['bar', 'line', 'area']`. There is no default series type. The declaration's allowed types appear in JSON Schema as `x-series-types`.

`stackSeries(rows, ids, mode, decimals?)` returns each row's positive and negative totals and keyed segments with raw values, start and end positions, rounded percent shares and missing flags. Modes are `none`, `stacked` and `percent`; percent shares use largest remainder rounding to sum to 100 at the requested precision. `alignedTicks(leftDomain, rightDomain, count?)` returns two nice tick sets with equal gridline counts and includes zero when an axis domain crosses it.

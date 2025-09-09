# Chisel

> A **chisel** is a [wedged](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Wedge "Wedge") [hand tool](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Hand_tool "Hand tool") *or a snippet* with a characteristically shaped cutting edge of [blade](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Blade "Blade") on its end for [carving](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Carving "Carving") or cutting a hard material (e.g. [wood](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Woodworking "Woodworking"), [stone](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Lapidary "Lapidary"), or *[Obsidian](https://obsidian.md/)*)

## Snippets Manager

Get all your css snippets into editable markdown file in your vault. **The snippet code is in the first css code block of the note.** Any note can be a snippet, to activate it, add `chisel: true` in frontmatter.

```md
---
chisel: true
---

```css
body {
    text-shadow: 0px 0px 2px color-mix(in oklab, currentColor 12%, transparent);
    filter: blur(0.2px);
}
````

#### CSSClasses support

Hook on the allready available *“cssclasses”* frontmatter to load specific snippets for the active note. *Key can be changed in setting.*

## Helper class

Dynamic body class to help with the making of snippets.

```css
/* Dynamically loaded */
body {
  .chisel-editing,
  .chisel-reading,
  .chisel-note,
  .chisel-base,
  .chisel-canva,
  .chisel-webviewer
}
```

## Abstraction Layers

Opionated simplified css management. Activated, layout will change, and those variables will be accessible.

### Typography

| Description | CSS Variable | Frontmatter Key | Example |
| --- | --- | --- | --- |
| Font Ratio | `--font-ratio` | `chisel-font-ratio` | `1.25` |
| Font Density | `--font-density` | `chisel-font-density` | `1.2` |
| Font Text | `--font-text` | `chisel-font-text` | `'Inter', sans-serif` |
| Font Feature | `--font-feature` | `chisel-font-feature` | `'liga', 'kern'` |
| Font Variation | `--font-variation` | `chisel-font-variation` | `'wght' 400` |
| Font Weight | `--font-weight` | `chisel-font-weight` | `400` |
| Bold Weight | `--bold-weight` | `chisel-bold-weight` | `700` |
| Font Header | `--font-header` | `chisel-font-header` | `'Merriweather', serif` |
| Font Header Feature | `--font-header-feature` | `chisel-font-header-feature` | `'liga'` |
| Font Header Variation | `--font-header-variation` | `chisel-font-header-variation` | `'wght' 600` |
| Font Header Letter Spacing | `--font-header-letter-spacing` | `chisel-font-header-letter-spacing` | `-0.02em` |
| Font Header Style | `--font-header-style` | `chisel-font-header-style` | `normal` |
| Font Header Weight | `--font-header-weight` | `chisel-font-header-weight` | `600` |
| Font Monospace | `--font-monospace` | `chisel-font-monospace` | `'Fira Code', monospace` |
| Font Monospace Feature | `--font-monospace-feature` | `chisel-font-monospace-feature` | `'liga'` |
| Font Monospace Variation | `--font-monospace-variation` | `chisel-font-monospace-variation` | `'wght' 400` |
| Font Interface | `--font-interface` | `chisel-font-interface` | `'System-UI', sans-serif` |
| Font Interface Feature | `--font-interface-feature` | `chisel-font-interface-feature` | `'liga'` |
| Font Interface Variation | `--font-interface-variation` | `chisel-font-interface-variation` | `'wght' 400` |

### Color

#### Light Theme

| Description | CSS Variable | Frontmatter Key | Example |
| --- | --- | --- | --- |
| Light Foreground | `--light-color-foreground` | `chisel-light-color-foreground` | `#1a1a1a` |
| Light Background | `--light-color-background` | `chisel-light-color-background` | `#ffffff` |
| Light Red | `--light-color-red` | `chisel-light-color-red` | `#dc3545` |
| Light Orange | `--light-color-orange` | `chisel-light-color-orange` | `#fd7e14` |
| Light Yellow | `--light-color-yellow` | `chisel-light-color-yellow` | `#ffc107` |
| Light Green | `--light-color-green` | `chisel-light-color-green` | `#28a745` |
| Light Cyan | `--light-color-cyan` | `chisel-light-color-cyan` | `#17a2b8` |
| Light Blue | `--light-color-blue` | `chisel-light-color-blue` | `#007bff` |
| Light Purple | `--light-color-purple` | `chisel-light-color-purple` | `#6f42c1` |
| Light Pink | `--light-color-pink` | `chisel-light-color-pink` | `#e83e8c` |
| Light Accent | `--light-accent-color` | `chisel-light-accent-color` | `#007bff` |
| Light Bold | `--light-bold-color` | `chisel-light-bold-color` | `#000000` |
| Light Italic | `--light-italic-color` | `chisel-light-italic-color` | `#495057` |

#### Dark Theme

| Description | CSS Variable | Frontmatter Key | Example |
| --- | --- | --- | --- |
| Dark Foreground | `--dark-color-foreground` | `chisel-dark-color-foreground` | `#ffffff` |
| Dark Background | `--dark-color-background` | `chisel-dark-color-background` | `#1a1a1a` |
| Dark Red | `--dark-color-red` | `chisel-dark-color-red` | `#ff6b6b` |
| Dark Orange | `--dark-color-orange` | `chisel-dark-color-orange` | `#ffa726` |
| Dark Yellow | `--dark-color-yellow` | `chisel-dark-color-yellow` | `#ffeb3b` |
| Dark Green | `--dark-color-green` | `chisel-dark-color-green` | `#66bb6a` |
| Dark Cyan | `--dark-color-cyan` | `chisel-dark-color-cyan` | `#4dd0e1` |
| Dark Blue | `--dark-color-blue` | `chisel-dark-color-blue` | `#42a5f5` |
| Dark Purple | `--dark-color-purple` | `chisel-dark-color-purple` | `#ab47bc` |
| Dark Pink | `--dark-color-pink` | `chisel-dark-color-pink` | `#ec407a` |
| Dark Accent | `--dark-accent-color` | `chisel-dark-accent-color` | `#42a5f5` |
| Dark Bold | `--dark-bold-color` | `chisel-dark-bold-color` | `#ffffff` |
| Dark Italic | `--dark-italic-color` | `chisel-dark-italic-color` | `#adb5bd` |

### Vertical Rhythm

| Description | CSS Variable | Frontmatter Key | Example |
| --- | --- | --- | --- |
| Single | `--chisel-single` | `chisel-single` | `1.5rem` |
| Global | `--chisel-global` | `chisel-global` | `1.2` |

## Frontmatter override

**Override** css variable in frontmatter with the suffix “chisel-“

```yml
chisel: true # that snippet note is globally active
snippets: [snippet, filename, list]
# Snippets to load that are mirrored to cssclasses

# Translate css variables
chisel-light-background-color: red
```

into

```css
body.chisel {
  —-light-background-color: red !important;
}
```

## Example
### Mono inspired theme
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');
body {
    --light-color-foreground: #100f0f;
    --light-color-background: #fffcf0;
    --light-color-red: #af3029;
    --light-color-orange: #bc5215;
    --light-color-yellow: #ad8301;
    --light-color-green: #66800b;
    --light-color-cyan: #142625;
    --light-color-blue: #205ea6;
    --light-color-purple: #5e409d;
    --light-color-pink: #a02f6f;
    /* Dark */
    --dark-color-foreground: #fffcf0;
    --dark-color-background: #100f0f;

    --color-accent: var(--color-foreground);
    --font-monospace: var(--color-foreground);
    --bold-color: var(--color-foreground);
    --italic-color: var(--color-foreground);

    --font-text: "Space Mono";
    --font-header: "Inter";
    --font-monospace: "Space Mono";
    --font-interface: "Space Mono";

    --font-density: 1.5;
    --bold-weight: 700;
    --font-header-feature: "liga", "calt", "case", "kern";
    --font-header-variation: "";
    --font-header-weight: 900;
    --font-header-line-height: 1em;
    --font-header-letter-spacing: -0.07em;
}
```

### Basic Ink blurry text for being easy on the eyes
```css
body {
    text-shadow: 0px 0px 2px color-mix(in oklab, currentColor 12%, transparent);
    filter: blur(0.2px);
}
```

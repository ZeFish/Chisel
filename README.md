# Chisel

> A **chisel** is a [wedged](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Wedge "Wedge") [hand tool](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Hand_tool "Hand tool") *or a snippet* with a characteristically shaped cutting edge of [blade](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Blade "Blade") on its end for [carving](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Carving "Carving") or cutting a hard material (e.g. [wood](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Woodworking "Woodworking"), [stone](https://en.wikipedia.org/api/rest_v1/page/mobile-html/Lapidary "Lapidary"), or *[Obsidian](https://obsidian.md/)*)


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
``\\`
```

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

#### Typography

Added font-header to pair font

```css
body {
	--font-ratio: 1.333;
	--font-density: 1.7;
	/* Vertical rythm is based on that number */

	/* Support Google Fonts */
	--font-text: "Forrest";
	--font-feature: "";
	--font-variation: "wght" 400;
	--font-weight: 400;
	--font-bold-weight: 500;

  /* Heading has their own font */
	--font-header: "Bright Morning";
	--font-header-feature: "";
	--font-header-variation: "wght" 500;
	--font-header-letter-spacing: 0em;
	--font-header-style: none;
	--font-header-weight: 800;

	--font-monospace: "MonoStein Pro Var";
	--font-monospace-feature: "salt";
	--font-monospace-variation: "";

	--font-interface: "MonoStein Pro Var";
	--font-interface-feature: "salt";
	--font-interface-variation: "";
}
```

#### Color

**Everything** is optional

```css
body {
	--light-color-foreground: #222;
	--light-color-background: #ffffff;

	--light-color-red: #b33a2a;
	--light-color-orange: #bc5215;
	--light-color-yellow: #cc8815;
	--light-color-green: #66800b;
	--light-color-cyan: #82a1b2;
	--light-color-blue: #438199;
	--light-color-purple: #5e409d;
	--light-color-pink: #a02f6f;

	--light-accent-color: var(--color-yellow);
	--light-bold-color: var(--color-red);
	--light-italic-color: var(--color-blue);

	/* Dark */
	--dark-color-foreground: oklch(0.7721 0.0228 96.47);
	--dark-color-background: oklch(0.2308 0.0023 67.73);

	--dark-color-red: #d14d41;
	--dark-color-orange: #da702c;
	--dark-color-yellow: #cc8815;
	--dark-color-green: #879a39;
	--dark-color-cyan: #3aa99f;
	--dark-color-blue: #4385be;
	--dark-color-purple: #9a462b;
	--dark-color-pink: #a8431b;

	--dark-accent-color: var(--color-yellow);
	--dark-bold-color: var(--color-red);
	--dark-italic-color: var(--color-blue);
}
```

#### Vertical rythm

```css
body {
  __chisel-single: 2rlh;
  Chisel-global: 1rlh;
}
```

#### Frontmatter override

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

# Text-Generator

```yml
It is a long established fact
that a reader will be distracted
by the readable content of a page
when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using 'Content here, content here', making it look like readable English. Many desktop publishing packages and web page editors now use Lorem Ipsum as their default model text, and a search for 'lorem ipsum' will uncover many web sites still in their infancy. Various versions have evolved over the years, sometimes by accident, sometimes on purpose (injected humour and the like).

```

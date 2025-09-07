
# Chisel for Obsidian

Chisel is an Obsidian plugin that allows you to customize the appearance of your notes using CSS. It provides a powerful set of features to style your notes based on their frontmatter properties.

## Features

- **CSS Themes:** Apply a CSS theme to a note by specifying the theme name in the `chisel` frontmatter property.
- **Custom CSS Properties:** Define custom CSS variables directly in the frontmatter of your notes.
- **CSS Snippets:** Automatically load CSS snippets from multiple notes that have the `chisel-autoload: true` frontmatter property. The snippets are loaded in alphabetical order.
- **Body Classes:** Chisel adds various CSS classes to the `<body>` element based on the context, allowing you to write more specific CSS rules.


## Usage

### CSS Themes

To apply a CSS theme to a note, you first need to create a "theme note". A theme note is a regular Markdown note that contains a CSS code block. The name of the note will be the name of your theme.

For example, to create a theme named `my-theme`, you would create a new note named `my-theme.md` with the following content:

````markdown
---
cssclasses: []
---

```css
/* Your CSS rules go here */
body {
  background-color: #f0f0f0;
}
```
````

Then, in any other note, you can apply this theme by adding the `chisel` frontmatter property:

```yaml
---
chisel: my-theme
---

This note will have a light gray background.
```



### Custom CSS Properties

You can define custom CSS variables directly in the frontmatter of your notes. Any frontmatter property that starts with `chisel-` will be converted into a CSS variable.

For example, if you have the following frontmatter:

```yaml
---
chisel-font-size: 16px
chisel-text-color: #333
---
```

Chisel will generate the following CSS rules and apply them to the `<body>` element:

```css
body {
  --font-size: 16px;
  --text-color: #333;
}
```

You can then use these variables in your CSS themes or snippets:

```css
body {
  font-size: var(--font-size);
  color: var(--text-color);
}
```

### Available Custom Properties

Chisel provides an abstract layer of CSS variables that you can customize in your theme files or directly through `chisel-` prefixed frontmatter properties. These variables allow for fine-grained control over various aspects of your note's appearance:

```css
    --light-color-background: #fffcf0;
    --light-color-foreground: #100f0f;
    /* Accent system */
    --light-color-red: #af3029; /* warning, highlight */
    --light-color-orange: #bc5215; /* attention blocks */
    --light-color-yellow: #ad8301; /* vintage punchcard yellow */
    --light-color-green: #66800b; /* success, approval */
    --light-color-cyan: #24837b; /* teal-y terminal feel */
    --light-color-blue: #205ea6; /* link, info */
    --light-color-purple: #5e409d; /* utility, label tags */
    --light-color-pink: #a02f6f; /* softer */

    --dark-color-background: oklch(0.2228 0.0025 67.7); /* dark terminal feel */
    --dark-color-foreground: oklch(0.8174 0.0149 98.3);

    /* Accent system */
    --dark-color-red: #d14d41;
    --dark-color-orange: #da702c;
    --dark-color-yellow: #ad8301;
    --dark-color-green: #879a39;
    --dark-color-cyan: #24837b;
    --dark-color-blue: #4385be;
    --dark-color-purple: #8b7ec8;
    --dark-color-pink: #ce5d97;

    /* Code and UI extras */
    --accent-color: var(--color-blue);
    --bold-color: var(--color-red);
    --italic-color: var(--color-green);

    --font-density: 1.5;
    --font-ratio: 1.333;

    --margin: 2;

    --font-text: "Söhne Mono", "Oktah Round Variable";
    --font-weight: 400;
    --bold-weight: 400;
    --font-feature: "liga", "clig", "kern", "calt", "zero", "ss05";
    --font-variation: "";

    --font-header: "Inter Variable";
    --font-header-weight: 400;
    --font-header-letter-spacing: -0.025em;
    --font-header-line-height: 1.3em;
    --font-header-feature: "";
    --font-header-variation: "";

    --font-monospace: "MonoLisa";
    --font-mono-feature: "";
    --font-mono-variation: "";

    --font-interface: "Söhne Mono";
```

### CSS Snippets

CSS snippets are a way to automatically load CSS from multiple notes. This is useful for creating a library of reusable CSS snippets that you can use across your vault.

To create a CSS snippet, create a new note with the `chisel-autoload: true` frontmatter property. The note must contain a CSS code block. You can have as many of these notes as you want.

For example:

````markdown
---
chisel-autoload: true
---

```css
.my-custom-class {
  font-weight: bold;
}
```
````

Chisel will automatically find all the notes with `chisel-autoload: true` and load their CSS content. The CSS from all the snippets is combined into a single block and loaded in alphabetical order of the note paths. This allows you to create a modular and maintainable CSS system for your vault.

### Body Classes

Chisel adds the following CSS classes to the `<body>` element based on the context:

- `cssclass-{name}`: Applied for each class listed in the `cssclasses` frontmatter property.
- `chisel-note`: Applied when viewing any markdown note.
- `chisel-reading`: Applied when in reading (preview) mode.
- `chisel-editing`: Applied when in editing (source) mode.
- `chisel-canvas`: Applied when viewing a canvas.
- `chisel-base`: Applied when viewing a base.
- `chisel-empty`: Applied when the active pane is empty.
- `chisel-webviewer`: Applied when viewing a web page.

You can use these classes to write more specific CSS rules. For example, to change the background color only in reading mode, you could use the following CSS:

```css
body.chisel-reading {
  background-color: #f0f0f0;
}
```





## Settings

- **Enable Typography Classes:** Toggle the application of `chisel-typography` class to the body.
- **Enable Color Classes:** Toggle the application of `chisel-color` class to the body.
- **Enable Rhythm Classes:** Toggle the application of `chisel-rhythm` class to the body.



## Installation

1.  Open Obsidian's settings.
2.  Go to "Community plugins" and disable "Safe mode".
3.  Click "Browse" and search for "Chisel".
4.  Click "Install" and then "Enable".

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or a pull request on the [GitHub repository](https://github.com/your-username/chisel-obsidian).

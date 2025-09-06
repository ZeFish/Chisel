
# Chisel for Obsidian

Chisel is an Obsidian plugin that allows you to customize the appearance of your notes using CSS. It provides a powerful set of features to style your notes based on their frontmatter properties.

## Features

- **CSS Themes:** Apply a CSS theme to a note by specifying the theme name in the `chisel` frontmatter property.
- **Custom CSS Properties:** Define custom CSS variables directly in the frontmatter of your notes.
- **CSS Snippets:** Automatically load CSS snippets from notes that have the `chisel-autoload: true` frontmatter property.
- **Body Classes:** Chisel adds various CSS classes to the `<body>` element based on the context, allowing you to write more specific CSS rules.
- **Default Theme:** Set a default theme that will be applied to all notes that don't have a specific theme.

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

You can also organize your theme notes in a specific folder. To do so, you need to set the "Theme note path" in the Chisel settings.

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

### CSS Snippets

CSS snippets are a way to automatically load CSS from multiple notes. This is useful for creating a library of reusable CSS snippets that you can use across your vault.

To create a CSS snippet, create a new note with the `chisel-autoload: true` frontmatter property. The note must contain a CSS code block.

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

Chisel will automatically find all the notes with `chisel-autoload: true` and load their CSS content. This allows you to create a modular and maintainable CSS system for your vault.

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

### Default Theme

You can set a default theme in the Chisel settings. This theme will be applied to all notes that don't have a specific theme defined in their frontmatter.

## Settings

- **Frontmatter property:** The name of the frontmatter property to link to a CSS theme note. The default is `chisel`.
- **Theme note path:** The base path where your theme notes are stored. If empty, it will search the entire vault.
- **Default theme:** The default theme to apply if no theme is specified in the note's frontmatter.

## Installation

1.  Open Obsidian's settings.
2.  Go to "Community plugins" and disable "Safe mode".
3.  Click "Browse" and search for "Chisel".
4.  Click "Install" and then "Enable".

## Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or a pull request on the [GitHub repository](https://github.com/your-username/chisel-obsidian).

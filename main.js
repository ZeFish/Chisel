"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");

// Settings interface
const DEFAULT_SETTINGS = {
  frontmatterProperty: "cssclasses",
  enableTypography: false,
  enableColor: false,
  enableRhythm: false,
};

class ChiselPlugin extends obsidian_1.Plugin {
  constructor() {
    super(...arguments);
    this.currentFile = null;
    this.appliedClasses = new Set();
    this.appliedSnippetViewClasses = new Set();
    this.styleElement = null;
    this.chiselNoteStyleElement = null;
    this.defaultThemeStyleElement = null;
    this.currentMode = null;
    this.autoloadedSnippets = new Map();
    this.concatenatedAutoloadCss = "";
  }

  async onload() {
    document.body.classList.add("chisel");
    await this.loadSettings();

    // Add settings tab
    this.addSettingTab(new ChiselSettingTab(this.app, this));

    // Update classes when active note changes
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.updateBodyClasses();
        this.updateModeClasses();
      }),
    );

    // Update classes when frontmatter changes
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && file === activeFile) {
          this.updateBodyClasses();
        }
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (this.autoloadedSnippets.has(file.path) || this.hasAutoloadFlag(fm)) {
          this.updateAutoloadedSnippets();
        }
      }),
    );

    // Also listen for frontmatter resolve events
    this.registerEvent(
      this.app.metadataCache.on("resolve", (file) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && file === activeFile) {
          this.updateBodyClasses();
        }
        this.updateAutoloadedSnippets();
      }),
    );

    // Update classes when mode changes
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.updateModeClasses();
      }),
    );

    this.updateModeClasses();
    setTimeout(() => this.updateBodyClasses(), 100);

    this.addCommand({
      id: "open-chisel-cheatsheet-modal",
      name: "Open Frontmatter Cheatsheet",
      callback: () => {
        new ChiselCheatsheetModal(this.app).open();
      },
    });
  }

  onunload() {
    document.body.classList.remove("chisel");
    this.cleanup();
    this.clearModeClasses();
  }

  cleanup() {
    this.clearAllClasses();
    this.clearSnippetViewClasses();
    this.clearCustomProperties();
    this.clearChiselNoteStyle();
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // Migration: ensure frontmatterProperty uses the new key "cssclasses"
    if (!this.settings.frontmatterProperty || 
        this.settings.frontmatterProperty === "chisel" ||
        this.settings.frontmatterProperty === "snippets") {
      this.settings.frontmatterProperty = "cssclasses";
      try { await this.saveSettings(); } catch (e) {}
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async updateBodyClasses() {
    const activeFile = this.app.workspace.getActiveFile();

    // Only cleanup if the active file has changed or is null
    if (activeFile !== this.currentFile || activeFile === null) {
      this.cleanup();
      this.currentFile = activeFile;
    }

    if (!activeFile) {
      this.currentFile = null;
      return;
    }

    this.currentFile = activeFile;
    const meta = this.app.metadataCache.getFileCache(activeFile);

    this.cleanup();

    // Apply global settings classes regardless of frontmatter
    if (this.settings.enableTypography) {
      document.body.classList.add("chisel-typography");
      this.addClassToViews("chisel-typography");
      this.appliedClasses.add("chisel-typography");
    }
    if (this.settings.enableColor) {
      document.body.classList.add("chisel-color");
      this.addClassToViews("chisel-color");
      this.appliedClasses.add("chisel-color");
    }
    if (this.settings.enableRhythm) {
      document.body.classList.add("chisel-rhythm");
      this.addClassToViews("chisel-rhythm");
      this.appliedClasses.add("chisel-rhythm");
    }

    if (!meta?.frontmatter) return;

    // Handle cssClasses
    const cssclasses =
      meta.frontmatter.cssclasses || meta.frontmatter.cssClasses;
    if (cssclasses) {
      const classList = Array.isArray(cssclasses) ? cssclasses : [cssclasses];
      classList.forEach((cls) => {
        if (typeof cls === "string" && cls.trim().length > 0) {
          const className = "cssclass-" + cls.trim();
          document.body.classList.add(className);
          this.appliedClasses.add(className);
        }
      });
    }

    // Also add snippet names as classes to active markdown view containers
    const snippetProp = meta.frontmatter[this.settings.frontmatterProperty];
    let snippetNames = [];
    if (typeof snippetProp === "string" && snippetProp.trim().length > 0) {
      snippetNames = [snippetProp.trim()];
    } else if (Array.isArray(snippetProp)) {
      snippetNames = snippetProp
        .filter((s) => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (snippetNames.length > 0) {
      const activeLeaf = document.querySelector(
        ".mod-root .workspace-leaf.mod-active .workspace-leaf-content",
      );
      if (activeLeaf) {
        const viewEls = activeLeaf.querySelectorAll(
          ".markdown-source-view, .markdown-preview-view",
        );
        snippetNames.forEach((name) => {
          const slug = name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_\-\s]/g, "")
            .replace(/\s+/g, "-");
          if (slug.length > 0) {
            viewEls.forEach((el) => el.classList.add(slug));
            this.appliedSnippetViewClasses.add(slug);
          }
        });
      }
    }

    const chiselNoteName = snippetProp;
    if (chiselNoteName && (typeof chiselNoteName === 'string' || Array.isArray(chiselNoteName))) {
      await this.applyChiselNote(chiselNoteName);
    }
    this.applyCustomProperties(meta.frontmatter);
  }

  clearAllClasses() {
    this.appliedClasses.forEach((className) => {
      document.body.classList.remove(className);
    });
    this.appliedClasses.clear();
  }

  clearSnippetViewClasses() {
    if (!this.appliedSnippetViewClasses || this.appliedSnippetViewClasses.size === 0) return;
    const activeLeaf = document.querySelector(
      ".mod-root .workspace-leaf.mod-active .workspace-leaf-content",
    );
    if (!activeLeaf) {
      this.appliedSnippetViewClasses.clear();
      return;
    }
    const viewEls = activeLeaf.querySelectorAll(
      ".markdown-source-view, .markdown-preview-view",
    );
    this.appliedSnippetViewClasses.forEach((cls) => {
      viewEls.forEach((el) => el.classList.remove(cls));
    });
    this.appliedSnippetViewClasses.clear();
  }

  addClassToViews(className) {
    const activeLeaf = document.querySelector(
      ".mod-root .workspace-leaf.mod-active .workspace-leaf-content",
    );
    if (!activeLeaf) return;
    const viewEls = activeLeaf.querySelectorAll(
      ".markdown-source-view, .markdown-preview-view",
    );
    viewEls.forEach((el) => el.classList.add(className));
    this.appliedSnippetViewClasses.add(className);
  }

  clearModeViewClasses() {
    const activeLeaf = document.querySelector(
      ".mod-root .workspace-leaf.mod-active .workspace-leaf-content",
    );
    if (!activeLeaf) return;
    const viewEls = activeLeaf.querySelectorAll(
      ".markdown-source-view, .markdown-preview-view",
    );
    const modeClasses = [
      "chisel-reading",
      "chisel-editing",
      "chisel-canvas",
      "chisel-empty",
      "chisel-base",
      "chisel-webviewer",
      "chisel-note",
    ];
    modeClasses.forEach((className) => {
      viewEls.forEach((el) => el.classList.remove(className));
      if (this.appliedSnippetViewClasses) {
        this.appliedSnippetViewClasses.delete(className);
      }
    });
  }

  applyCustomProperties(frontmatter) {
    const chiselProps = {};
    const fontProperties = new Set();

    for (const [key, value] of Object.entries(frontmatter)) {
      if (key.startsWith("chisel-") && key !== "chisel") {
        const cssVarName = "--" + key.substring(7);
        chiselProps[cssVarName] = value;
        const fontKeys = [
          "font-text",
          "font-header",
          "font-monospace",
          "font-interface",
        ];
        if (fontKeys.includes(cssVarName.substring(2))) {
          const fontNames = value
            .split(",")
            .map((font) => font.trim().replace(/['"]/g, ""));
          fontNames.forEach((font) => fontProperties.add(font));
        }
      }
    }

    if (Object.keys(chiselProps).length > 0) {
      this.styleElement = document.getElementById("chisel-custom-props");
      if (!this.styleElement) {
        this.styleElement = document.createElement("style");
        this.styleElement.id = "chisel-custom-props";
        const lastStyleTag = document.head.querySelector("style:last-of-type");
        if (lastStyleTag) {
          lastStyleTag.after(this.styleElement);
        } else {
          document.head.appendChild(this.styleElement);
        }
      }
      const googleFontsImports = Array.from(fontProperties)
        .map((font) => {
          const fontUrl = font.replace(/\s+/g, "+");
          return `@import url('https://fonts.googleapis.com/css2?family=${fontUrl}&display=swap');`;
        })
        .join("\n");
      const cssVars = Object.entries(chiselProps)
        .map(([prop, value]) => {
          const formattedValue =
            typeof value === "string" && value.includes(" ")
              ? "'" + value + "'"
              : value;
          return `  ${prop}: ${formattedValue} !important;`;
        })
        .join("\n");
      this.styleElement.textContent = [
        googleFontsImports,
        `html body {\n${cssVars}\n}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  clearCustomProperties() {
    const styleElement = document.getElementById("chisel-custom-props");
    if (styleElement) {
      styleElement.remove();
    }
    this.styleElement = null;
  }

  async applyChiselNote(chiselNoteName) {
    this.clearChiselNoteStyle(); // Always clear previous style before applying new ones

    if (
      !chiselNoteName ||
      (Array.isArray(chiselNoteName) && chiselNoteName.length === 0)
    ) {
      return;
    }

    // Handle boolean values (common mistake in frontmatter)
    if (typeof chiselNoteName === 'boolean') {
      return;
    }

    // Convert to array of strings, filtering out non-strings
    let noteNames;
    if (Array.isArray(chiselNoteName)) {
      noteNames = chiselNoteName
        .filter(name => typeof name === 'string' && name.trim().length > 0)
        .map(name => name.trim());
    } else if (typeof chiselNoteName === 'string') {
      noteNames = [chiselNoteName.trim()];
    } else {
      return;
    }

    if (noteNames.length === 0) {
      return;
    }

    const files = this.app.vault.getMarkdownFiles();
    let allCssContent = "";

    for (const name of noteNames) {
      const cssFile = files.find((file) => file.basename === name);

      if (!cssFile) {
        continue; // Continue to the next snippet if one is not found
      }

      const noteContent = await this.app.vault.cachedRead(cssFile);
      const codeBlockRegex = /```css\b[^\n]*\n([\s\S]*?)```/gi;
      const matches = [...noteContent.matchAll(codeBlockRegex)];
      const cssContent = matches.map(match => match[1]).join('\n');

      if (cssContent && cssContent.trim().length > 0) {
        allCssContent += cssContent + "\n";
      }
    }

    if (allCssContent) {
      this.chiselNoteStyleElement =
        document.getElementById("chisel-note-style");
      if (!this.chiselNoteStyleElement) {
        this.chiselNoteStyleElement = document.createElement("style");
        this.chiselNoteStyleElement.id = "chisel-note-style";
        document.head.appendChild(this.chiselNoteStyleElement);
      }
      this.chiselNoteStyleElement.textContent = allCssContent;
    }
  }

  clearChiselNoteStyle() {
    const styleElement = document.getElementById("chisel-note-style");
    if (styleElement) {
      styleElement.remove();
    }
    this.chiselNoteStyleElement = null;
  }

  hasAutoloadFlag(frontmatter) {
    if (!frontmatter) return false;
    // Only the "chisel" frontmatter flag enables autoload
    return Boolean(frontmatter["chisel"]);
  }

  async updateAutoloadedSnippets() {
    const autoloadStyleId = "chisel-autoload-styles";
    let autoloadStyleEl = document.getElementById(autoloadStyleId);

    const files = this.app.vault.getMarkdownFiles();
    const autoloadFiles = files
      .filter((file) => {
        const meta = this.app.metadataCache.getFileCache(file);
        return this.hasAutoloadFlag(meta?.frontmatter);
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    if (autoloadFiles.length === 0) {
      if (autoloadStyleEl) {
        autoloadStyleEl.remove();
      }
      this.autoloadedSnippets.clear();
      return;
    }

    let allCssContent = "";
    for (const file of autoloadFiles) {
      const noteContent = await this.app.vault.cachedRead(file);
      const codeBlockRegex = /```css\b[^\n]*\n([\s\S]*?)```/gi;
      const matches = [...noteContent.matchAll(codeBlockRegex)];
      const cssContent = matches.map(match => match[1]).join('\n');
      if (cssContent && cssContent.trim().length > 0) {
        allCssContent += cssContent + "\n";
        this.autoloadedSnippets.set(file.path, cssContent);
      }
    }

    if (allCssContent === this.concatenatedAutoloadCss) {
      return;
    }

    this.concatenatedAutoloadCss = allCssContent;

    if (!autoloadStyleEl) {
      autoloadStyleEl = document.createElement("style");
      autoloadStyleEl.id = autoloadStyleId;
      document.head.appendChild(autoloadStyleEl);
    }
    autoloadStyleEl.textContent = allCssContent;
  }

  updateModeClasses() {
    setTimeout(() => {
      const body = document.body;
      this.clearModeClasses();
      this.clearModeViewClasses();
      const leafContentEl = document.querySelector(
        ".mod-root .workspace-leaf.mod-active .workspace-leaf-content",
      );
      if (!leafContentEl) return;

      let newMode = null;
      const dataType = leafContentEl.getAttribute("data-type");
      switch (dataType) {
        case "markdown":
          body.classList.add("chisel-note");
          this.addClassToViews("chisel-note");
          const dataMode = leafContentEl.getAttribute("data-mode");
          if (dataMode === "preview") {
            newMode = "reading";
            body.classList.add("chisel-reading");
            this.addClassToViews("chisel-reading");
          } else if (dataMode === "source") {
            newMode = "editing";
            body.classList.add("chisel-editing");
            this.addClassToViews("chisel-editing");
          }
          break;
        case "canvas":
          newMode = "canvas";
          body.classList.add("chisel-canvas");
          this.addClassToViews("chisel-canvas");
          break;
        case "empty":
          newMode = "empty";
          body.classList.add("chisel-empty");
          this.addClassToViews("chisel-empty");
          break;
        case "webviewer":
          newMode = "webviewer";
          body.classList.add("chisel-webviewer");
          this.addClassToViews("chisel-webviewer");
          break;
        case "bases":
          newMode = "base";
          body.classList.add("chisel-base");
          this.addClassToViews("chisel-base");
          break;
      }
      this.currentMode = newMode;
    }, 100);
  }

  clearModeClasses() {
    const modeClasses = [
      "chisel-reading",
      "chisel-editing",
      "chisel-canvas",
      "chisel-empty",
      "chisel-base",
      "chisel-webviewer",
      "chisel-note",
    ];
    modeClasses.forEach((className) => {
      document.body.classList.remove(className);
      this.appliedClasses.delete(className);
    });
  }
}

class ChiselSettingTab extends obsidian_1.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Chisel Settings" });

    containerEl.createEl("h2", { text: "Body Class Toggles" });

    new obsidian_1.Setting(containerEl)
      .setName("Enable Typography Classes")
      .setDesc(
        "Toggle the application of 'chisel-typography' class to the body.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTypography)
          .onChange(async (value) => {
            this.plugin.settings.enableTypography = value;
            await this.plugin.saveSettings();
            setTimeout(() => this.plugin.updateBodyClasses(), 0); // Update classes immediately
          }),
      );

    new obsidian_1.Setting(containerEl)
      .setName("Enable Color Classes")
      .setDesc("Toggle the application of 'chisel-color' class to the body.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableColor)
          .onChange(async (value) => {
            this.plugin.settings.enableColor = value;
            await this.plugin.saveSettings();
            setTimeout(() => this.plugin.updateBodyClasses(), 0); // Update classes immediately
          }),
      );

    new obsidian_1.Setting(containerEl)
      .setName("Enable Rhythm Classes")
      .setDesc("Toggle the application of 'chisel-rhythm' class to the body.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableRhythm)
          .onChange(async (value) => {
            this.plugin.settings.enableRhythm = value;
            await this.plugin.saveSettings();
            setTimeout(() => this.plugin.updateBodyClasses(), 0); // Update classes immediately
          }),
      );

    // Snippets frontmatter key setting
    new obsidian_1.Setting(containerEl)
      .setName("Frontmatter key for snippets")
      .setDesc(
        "Change which frontmatter property lists CSS notes (default: 'cssclasses'). For example, 'snippets' or 'themes'.",
      )
      .addText((text) =>
        text
          .setPlaceholder("cssclasses")
          .setValue(this.plugin.settings.frontmatterProperty || "snippets")
          .onChange(async (value) => {
            const v = (value || "").trim() || "cssclasses";
            this.plugin.settings.frontmatterProperty = v;
            await this.plugin.saveSettings();
            setTimeout(() => this.plugin.updateBodyClasses(), 0);
          }),
      );

    // Documentation Section
    containerEl.createEl("h2", { text: "Body Class Documentation" });
    const docEl = containerEl.createEl("div");
    docEl.innerHTML = `
            <p>The plugin adds the following CSS classes to the <code>&lt;body&gt;</code> element based on the context:</p>
            <ul>
                <li><code>cssclass-<b>{name}</b></code>: Applied for each class listed in the <code>cssclasses</code> frontmatter property.</li>
                <li><code>chisel-note</code>: Applied when viewing any markdown note.</li>
                <li><code>chisel-reading</code>: Applied when in reading (preview) mode.</li>
                <li><code>chisel-editing</code>: Applied when in editing (source) mode.</li>
                <li><code>chisel-canvas</code>: Applied when viewing a canvas.</li>
                <li><code>chisel-base</code>: Applied when viewing a base.</li>
                <li><code>chisel-empty</code>: Applied when the active pane is empty.</li>
                <li><code>chisel-webviewer</code>: Applied when viewing a web page.</li>
            </ul>
        `;
  }
}

class ChiselCheatsheetModal extends obsidian_1.Modal {
  constructor(app) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Chisel Frontmatter Cheatsheet" });

    contentEl.createEl("p", {
      text: "The following `chisel-` prefixed frontmatter properties can be used to customize your notes:",
    });

    const ul = contentEl.createEl("ul");

    ul.createEl("li", {
      text: "`chisel-font-text`: Sets the font for body text. Example: `chisel-font-text: 'Inter', sans-serif`",
    });
    ul.createEl("li", {
      text: "`chisel-font-header`: Sets the font for headings. Example: `chisel-font-header: 'Merriweather', serif`",
    });
    ul.createEl("li", {
      text: "`chisel-font-monospace`: Sets the font for monospace text (e.g., code blocks). Example: `chisel-font-monospace: 'Fira Code', monospace`",
    });
    ul.createEl("li", {
      text: "`chisel-font-interface`: Sets the font for the Obsidian UI. Example: `chisel-font-interface: 'System-UI', sans-serif`",
    });

    contentEl.createEl("p", {
      text: "Any other frontmatter property starting with `chisel-` (e.g., `chisel-my-custom-property: value`) will be converted into a CSS variable `--my-custom-property: value` and applied to the `body` element. You can then use this CSS variable in your custom CSS snippets.",
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

module.exports = ChiselPlugin;

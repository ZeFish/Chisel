"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");

// Settings interface
const DEFAULT_SETTINGS = {
  frontmatterProperty: "chisel",
  enableTypography: false,
  enableColor: false,
  enableRhythm: false,
};

class ChiselPlugin extends obsidian_1.Plugin {
  constructor() {
    super(...arguments);
    this.currentFile = null;
    this.appliedClasses = new Set();
    this.styleElement = null;
    this.chiselNoteStyleElement = null;
    this.defaultThemeStyleElement = null;
    this.currentMode = null;
    this.autoloadedSnippets = new Map();
    this.concatenatedAutoloadCss = "";
  }

  async onload() {
    setTimeout(() => document.body.classList.add("chisel"), 0);
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
        if (
          this.autoloadedSnippets.has(file.path) ||
          this.app.metadataCache.getFileCache(file)?.frontmatter?.[
            "chisel-autoload"
          ]
        ) {
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
    this.clearCustomProperties();
    this.clearChiselNoteStyle();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async updateBodyClasses() {
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile) {
      this.cleanup();
      this.currentFile = null;
      return;
    }

    this.currentFile = activeFile;
    const meta = this.app.metadataCache.getFileCache(activeFile);

    this.cleanup();

    // Apply global settings classes regardless of frontmatter
    if (this.settings.enableTypography) {
      document.body.classList.add("chisel-typography");
      this.appliedClasses.add("chisel-typography");
    }
    if (this.settings.enableColor) {
      document.body.classList.add("chisel-color");
      this.appliedClasses.add("chisel-color");
    }
    if (this.settings.enableRhythm) {
      document.body.classList.add("chisel-rhythm");
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

    await this.applyChiselNote(
      meta.frontmatter[this.settings.frontmatterProperty],
    );
    this.applyCustomProperties(meta.frontmatter);
  }

  clearAllClasses() {
    this.appliedClasses.forEach((className) => {
      document.body.classList.remove(className);
    });
    this.appliedClasses.clear();
  }

  applyCustomProperties(frontmatter) {
    const chiselProps = {};
    const fontProperties = new Set();

    for (const [key, value] of Object.entries(frontmatter)) {
      if (key.startsWith("chisel-") && key !== "chisel-autoload") {
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
              ? `'${value}'`
              : value;
          return `  ${prop}: ${formattedValue} !important;`;
        })
        .join("\n");
      this.styleElement.textContent = [
        googleFontsImports,
        `html body {
${cssVars}
}`,
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
    if (!chiselNoteName || typeof chiselNoteName !== "string") {
      this.clearChiselNoteStyle(); // Clear note-specific style if no theme is specified
      return;
    }

    const files = this.app.vault.getMarkdownFiles();
    const cssFile = files.find((file) => {
      const isCorrectFile = file.basename === chiselNoteName;
      return isCorrectFile;
    });

    if (!cssFile) {
      console.warn(
        `Chisel: Note "${chiselNoteName}" not found`,
      );
      return;
    }

    const noteContent = await this.app.vault.cachedRead(cssFile);
    const codeBlockRegex = /^```css\n([\s\S]*?)\n```/m;
    const match = noteContent.match(codeBlockRegex);
    const cssContent = match ? match[1] : null;

    if (cssContent) {
      this.chiselNoteStyleElement =
        document.getElementById("chisel-note-style");
      if (!this.chiselNoteStyleElement) {
        this.chiselNoteStyleElement = document.createElement("style");
        this.chiselNoteStyleElement.id = "chisel-note-style";
        document.head.appendChild(this.chiselNoteStyleElement);
      }
      this.chiselNoteStyleElement.textContent = cssContent;
    }
  }

  clearChiselNoteStyle() {
    const styleElement = document.getElementById("chisel-note-style");
    if (styleElement) {
      styleElement.remove();
    }
    this.chiselNoteStyleElement = null;
  }

  

  async updateAutoloadedSnippets() {
    const autoloadStyleId = "chisel-autoload-styles";
    let autoloadStyleEl = document.getElementById(autoloadStyleId);

    const files = this.app.vault.getMarkdownFiles();
    const autoloadFiles = files.filter((file) => {
      const meta = this.app.metadataCache.getFileCache(file);
      return meta?.frontmatter?.["chisel-autoload"];
    }).sort((a, b) => a.path.localeCompare(b.path));

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
      const codeBlockRegex = /^```css\n([\s\S]*?)\n```/m;
      const match = noteContent.match(codeBlockRegex);
      const cssContent = match ? match[1] : null;
      if (cssContent) {
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
      const leafContentEl = document.querySelector(
        ".mod-root .workspace-leaf.mod-active .workspace-leaf-content",
      );
      if (!leafContentEl) return;

      let newMode = null;
      const dataType = leafContentEl.getAttribute("data-type");
      switch (dataType) {
        case "markdown":
          body.classList.add("chisel-note");
          this.appliedClasses.add("chisel-note");
          const dataMode = leafContentEl.getAttribute("data-mode");
          if (dataMode === "preview") {
            newMode = "reading";
            body.classList.add("chisel-reading");
            this.appliedClasses.add("chisel-reading");
          } else if (dataMode === "source") {
            newMode = "editing";
            body.classList.add("chisel-editing");
            this.appliedClasses.add("chisel-editing");
          }
          break;
        case "canvas":
          newMode = "canvas";
          body.classList.add("chisel-canvas");
          this.appliedClasses.add("chisel-canvas");
          break;
        case "empty":
          newMode = "empty";
          body.classList.add("chisel-empty");
          this.appliedClasses.add("chisel-empty");
          break;
        case "webviewer":
          newMode = "webviewer";
          body.classList.add("chisel-webviewer");
          this.appliedClasses.add("chisel-webviewer");
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

    // Documentation Section
    containerEl.createEl("h2", { text: "Body Class Documentation" });
    const docEl = containerEl.createEl("div");
    docEl.innerHTML = `
            <p>The plugin adds the following CSS classes to the <code><body></code> element based on the context:</p>
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

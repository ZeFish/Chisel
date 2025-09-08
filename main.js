"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");

// Settings interface
const DEFAULT_SETTINGS = {
  frontmatterProperty: "cssclasses",
  enableTypography: false,
  enableColor: false,
  enableRhythm: false,
  startupSnapshot: {
    cssClasses: [],
    snippetNames: [],
  },
};

class ChiselPlugin extends obsidian_1.Plugin {
  constructor() {
    super(...arguments);
    this.currentFile = null;
    this.appliedClasses = new Set();
    this.appliedSnippetViewClasses = new Set();
    this.hasAppliedStartupSnapshot = false;
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
        if (
          this.autoloadedSnippets.has(file.path) ||
          this.hasAutoloadFlag(fm)
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
        // Try applying startup snapshot if still idle and not yet applied
        if (!this.hasAppliedStartupSnapshot) this.applyStartupSnapshotIfIdle();
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
    // If no file is open on startup, apply last saved snapshot of classes/snippets
    setTimeout(() => this.applyStartupSnapshotIfIdle(), 300);
    // Also attempt once the workspace layout is ready
    // (ensures vault files are available)
    if (this.app?.workspace?.onLayoutReady) {
      this.app.workspace.onLayoutReady(() => this.applyStartupSnapshotIfIdle());
    } else {
      // Fallback for older Obsidian versions
      this.app.workspace.on("layout-ready", () =>
        this.applyStartupSnapshotIfIdle(),
      );
    }

    this.updateAutoloadedSnippets();

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
    if (
      !this.settings.frontmatterProperty ||
      this.settings.frontmatterProperty === "chisel" ||
      this.settings.frontmatterProperty === "snippets"
    ) {
      this.settings.frontmatterProperty = "cssclasses";
      try {
        await this.saveSettings();
      } catch (e) {}
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async updateBodyClasses() {
    const activeFile = this.app.workspace.getActiveFile();

    const newClasses = new Set();

    // Global settings classes
    if (this.settings.enableTypography) newClasses.add("chisel-typography");
    if (this.settings.enableColor) newClasses.add("chisel-color");
    if (this.settings.enableRhythm) newClasses.add("chisel-rhythm");

    if (activeFile) {
        // Frontmatter classes
        const meta = this.app.metadataCache.getFileCache(activeFile);
        if (meta?.frontmatter) {
          const cssclasses = 
            meta.frontmatter.cssclasses || meta.frontmatter.cssClasses;
          if (cssclasses) {
            const classList = Array.isArray(cssclasses) ? cssclasses : [cssclasses];
            classList.forEach((cls) => {
              if (typeof cls === "string" && cls.trim().length > 0) {
                newClasses.add("cssclass-" + cls.trim());
              }
            });
          }
        }
    }

    // Diff and update classes
    const classesToAdd = [...newClasses].filter(
      (cls) => !this.appliedClasses.has(cls),
    );
    const classesToRemove = [...this.appliedClasses].filter(
      (cls) => !newClasses.has(cls),
    );

    classesToAdd.forEach((cls) => document.body.classList.add(cls));
    classesToRemove.forEach((cls) => document.body.classList.remove(cls));

    this.appliedClasses = newClasses;

    if (activeFile) {
        // Handle snippets and other properties
        const meta = this.app.metadataCache.getFileCache(activeFile);
        this.updateSnippetsAndProperties(meta);
    }
  }

  async updateSnippetsAndProperties(meta) {
    if (!meta?.frontmatter) return;

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

    // Save snapshot for startup when no file is open
    try {
      this.settings.startupSnapshot = {
        cssClasses: this.appliedClasses
          ? Array.from(this.appliedClasses).map((c) =>
              c.replace("cssclass-", ""),
            )
          : [],
        snippetNames: snippetNames,
      };
      await this.saveSettings();
    } catch (e) {}

    this.clearSnippetViewClasses();
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
    if (
      chiselNoteName &&
      (typeof chiselNoteName === "string" || Array.isArray(chiselNoteName))
    ) {
      await this.applyChiselNote(chiselNoteName);
    } else {
      this.clearChiselNoteStyle();
    }
    this.clearCustomProperties();
    this.applyCustomProperties(meta.frontmatter);
  }

  clearAllClasses() {
    this.appliedClasses.forEach((className) => {
      document.body.classList.remove(className);
    });
    this.appliedClasses.clear();
  }

  clearSnippetViewClasses() {
    if (
      !this.appliedSnippetViewClasses ||
      this.appliedSnippetViewClasses.size === 0
    )
      return;
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

  async applyStartupSnapshotIfIdle() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) return;
    if (this.hasAppliedStartupSnapshot) return;

    const snap = this.settings?.startupSnapshot;
    if (!snap) return;

    // Wait until vault files are available
    const files = this.app.vault.getMarkdownFiles();
    if (!files || files.length === 0) {
      setTimeout(() => this.applyStartupSnapshotIfIdle(), 300);
      return;
    }

    // Apply saved cssclasses to body
    if (Array.isArray(snap.cssClasses)) {
      snap.cssClasses.forEach((cls) => {
        if (typeof cls === "string" && cls.trim().length > 0) {
          const className = "cssclass-" + cls.trim();
          document.body.classList.add(className);
          this.appliedClasses.add(className);
        }
      });
    }

    // Apply saved snippets by reloading their CSS
    if (Array.isArray(snap.snippetNames) && snap.snippetNames.length > 0) {
      await this.applyChiselNote(snap.snippetNames);
    }

    // Also explicitly update autoloaded snippets
    await this.updateAutoloadedSnippets();

    this.hasAppliedStartupSnapshot = true;

    // Apply global settings classes
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
    if (typeof chiselNoteName === "boolean") {
      return;
    }

    // Convert to array of strings, filtering out non-strings
    let noteNames;
    if (Array.isArray(chiselNoteName)) {
      noteNames = chiselNoteName
        .filter((name) => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim());
    } else if (typeof chiselNoteName === "string") {
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
      const cssContent = matches.map((match) => match[1]).join("\n");

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
      const cssContent = matches.map((match) => match[1]).join("\n");
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
    containerEl.createEl("h1", { text: "Chisel" });

    new obsidian_1.Setting(containerEl)
      .setName("Typography Abstraction")
      .setDesc(
        "Toggle the application of 'chisel-typography' class to the body.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTypography)
          .onChange(async (value) => {
            this.plugin.settings.enableTypography = value;
            await this.plugin.saveSettings();
            this.plugin.updateBodyClasses();
          }),
      );

    if (this.plugin.settings.enableTypography) {
      const typographyDetails = containerEl.createEl("details");
      const typographySummary = typographyDetails.createEl("summary");
      typographySummary.setText("Variables");
      const typographyContent = typographyDetails.createEl("div");
      const typographyCss = typographyContent.createEl("textarea");
      typographyCss.value = `
--font-ratio: 1.333;
--font-density: 1.7;
--font-text: "Forrest";
--font-feature: "";
--font-variation: "wght" 400;
--font-weight: 400;
--bold-weight: 500;
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
      `;
      const typographyFm = typographyContent.createEl("textarea");
      typographyFm.value = `
chisel-font-ratio: 1.333
chisel-font-density: 1.7
chisel-font-text: Forrest
chisel-font-feature: ''
chisel-font-variation: 'wght' 400
chisel-font-weight: 400
chisel-bold-weight: 500
chisel-font-header: Bright Morning
chisel-font-header-feature: ''
chisel-font-header-variation: 'wght' 500
chisel-font-header-letter-spacing: 0em
chisel-font-header-style: none
chisel-font-header-weight: 800
chisel-font-monospace: MonoStein Pro Var
chisel-font-monospace-feature: salt
chisel-font-monospace-variation: ''
chisel-font-interface: MonoStein Pro Var
chisel-font-interface-feature: salt
chisel-font-interface-variation: ''
      `;
    }

    new obsidian_1.Setting(containerEl)
      .setName("Color Abstraction")
      .setDesc("Toggle the application of 'chisel-color' class to the body.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableColor)
          .onChange(async (value) => {
            this.plugin.settings.enableColor = value;
            await this.plugin.saveSettings();
            this.plugin.updateBodyClasses();
          }),
      );

    if (this.plugin.settings.enableColor) {
      const colorDetails = containerEl.createEl("details");
      const colorSummary = colorDetails.createEl("summary");
      colorSummary.setText("Variables");
      const colorContent = colorDetails.createEl("div");
      const colorCss = colorContent.createEl("textarea");
      colorCss.value = `
--light-color-foreground:   #222;
--light-color-background:   #ffffff;
--light-color-red:           #b33a2a;
--light-color-orange:     #bc5215;
--light-color-yellow: #cc8815;
--light-color-green: #66800b;
--light-color-cyan: #82a1b2;
--light-color-blue: #438199;
--light-color-purple: #5e409d;
--light-color-pink: #a02f6f;
--light-accent-color: var(--color-yellow);
--light-bold-color: var(--color-red);
--light-italic-color: var(--color-blue);
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
      `;
      const colorFm = colorContent.createEl("textarea");
      colorFm.value = `
chisel-light-color-foreground:   #222
chisel-light-color-background:   #ffffff
chisel-light-color-red:           #b33a2a
chisel-light-color-orange:     #bc5215
chisel-light-color-yellow: #cc8815
chisel-light-color-green: #66800b
chisel-light-color-cyan: #82a1b2
chisel-light-color-blue: #438199
chisel-light-color-purple: #5e409d
chisel-light-color-pink: #a02f6f
chisel-light-accent-color: var(--color-yellow) 
chisel-light-bold-color: var(--color-red) 
chisel-light-italic-color: var(--color-blue) 
chisel-dark-color-foreground: oklch(0.7721 0.0228 96.47)
chisel-dark-color-background: oklch(0.2308 0.0023 67.73)
chisel-dark-color-red: #d14d41
chisel-dark-color-orange: #da702c
chisel-dark-color-yellow: #cc8815
chisel-dark-color-green: #879a39
chisel-dark-color-cyan: #3aa99f
chisel-dark-color-blue: #4385be
chisel-dark-color-purple: #9a462b
chisel-dark-color-pink: #a8431b
chisel-dark-accent-color: var(--color-yellow)
chisel-dark-bold-color: var(--color-red)
chisel-dark-italic-color: var(--color-blue)
      `;
    }

    new obsidian_1.Setting(containerEl)
      .setName("Vertical Rhythm Abstraction")
      .setDesc("Toggle the application of 'chisel-rhythm' class to the body.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableRhythm)
          .onChange(async (value) => {
            this.plugin.settings.enableRhythm = value;
            await this.plugin.saveSettings();
            this.plugin.updateBodyClasses();
          }),
      );

    if (this.plugin.settings.enableRhythm) {
      const rhythmDetails = containerEl.createEl("details");
      const rhythmSummary = rhythmDetails.createEl("summary");
      rhythmSummary.setText("Variables");
      const rhythmContent = rhythmDetails.createEl("div");
      const rhythmCss = rhythmContent.createEl("textarea");
      rhythmCss.value = `
--chisel-single: 2rlh
--chisel-global: 1rlh
      `;
      const rhythmFm = rhythmContent.createEl("textarea");
      rhythmFm.value = `
chisel-single: 2rlh
chisel-global: 1rlh
      `;
    }

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
            this.plugin.updateBodyClasses();
          }),
      );

    // Documentation Section
    const docEl = containerEl.createEl("div");
    const docContent = `
- cssclass-{name}: Applied for each class listed in the cssclasses frontmatter property.
- chisel-note: Applied when viewing any markdown note.
- chisel-reading: Applied when in reading (preview) mode.
- chisel-editing: Applied when in editing (source) mode.
- chisel-canvas: Applied when viewing a canvas.
- chisel-base: Applied when viewing a base.
- chisel-empty: Applied when the active pane is empty.
- chisel-webviewer: Applied when viewing a web page.
    `;
    docEl.innerHTML = `
            <p>The plugin adds the following CSS classes to the <code>&lt;body&gt;</code> element based on the context:</p>
        `;
    const textarea = docEl.createEl("textarea", { text: docContent });
    textarea.style.width = "100%";
    textarea.style.height = "150px";
    textarea.readOnly = true;
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

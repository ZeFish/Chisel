"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");

// Settings interface
const DEFAULT_SETTINGS = {
  snippets_local: "cssclasses",
  snippets_global: "chisel",
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
    this.appliedClasses = new Set();
    this.appliedSnippetViewClasses = new Set();
    this.hasAppliedStartupSnapshot = false;
    this.styleElement = null;
    this.chiselNoteStyleElement = null;
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
    setTimeout(() => this.applyStartupSnapshotIfIdle(), 100);
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
    this.addCommand({
      id: "open-chisel-cheatsheet-modal",
      name: "Open Cheatsheet",
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
          const classList = Array.isArray(cssclasses)
            ? cssclasses
            : [cssclasses];
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

    // Collect snippet names from both global and local properties
    let snippetNames = [];

    // Check global snippets property (default: "chisel")
    const globalSnippetProp = meta.frontmatter[this.settings.snippets_global];
    if (
      typeof globalSnippetProp === "string" &&
      globalSnippetProp.trim().length > 0
    ) {
      snippetNames.push(globalSnippetProp.trim());
    } else if (Array.isArray(globalSnippetProp)) {
      snippetNames = snippetNames.concat(
        globalSnippetProp
          .filter((s) => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }

    // Check local snippets property (default: "cssclasses")
    const localSnippetProp = meta.frontmatter[this.settings.snippets_local];
    if (
      typeof localSnippetProp === "string" &&
      localSnippetProp.trim().length > 0
    ) {
      snippetNames.push(localSnippetProp.trim());
    } else if (Array.isArray(localSnippetProp)) {
      snippetNames = snippetNames.concat(
        localSnippetProp
          .filter((s) => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }

    // Remove duplicates
    snippetNames = [...new Set(snippetNames)];

    // Also add snippet names as classes to active markdown view containers

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

    if (snippetNames.length > 0) {
      await this.applyChiselNote(snippetNames);
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
      setTimeout(() => this.applyStartupSnapshotIfIdle(), 100);
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
    return Boolean(frontmatter[this.settings.snippets_global]);
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
    containerEl.createEl("h2", { text: "Abstraction Layer" });
    const typographySetting = new obsidian_1.Setting(containerEl)
      .setName("Typography")
      .setDesc("")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTypography)
          .onChange(async (value) => {
            this.plugin.settings.enableTypography = value;
            await this.plugin.saveSettings();
            this.plugin.updateBodyClasses();
            this.display();
          }),
      );

    const colorSetting = new obsidian_1.Setting(containerEl)
      .setName("Color")
      .setDesc("")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableColor)
          .onChange(async (value) => {
            this.plugin.settings.enableColor = value;
            await this.plugin.saveSettings();
            this.plugin.updateBodyClasses();
            this.display();
          }),
      );

    const rhythmSetting = new obsidian_1.Setting(containerEl)
      .setName("Vertical Rhythm")
      .setDesc("")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableRhythm)
          .onChange(async (value) => {
            this.plugin.settings.enableRhythm = value;
            await this.plugin.saveSettings();
            this.plugin.updateBodyClasses();
            this.display();
          }),
      );

    containerEl.createEl("h2", { text: "Frontmatter" });

    new obsidian_1.Setting(containerEl)
      .setName("Global")
      .setDesc("Key used to globally load snippets.")
      .addText((text) =>
        text
          .setPlaceholder("chisel")
          .setValue(this.plugin.settings.snippets_global)
          .onChange(async (value) => {
            this.plugin.settings.snippets_global = value;
            await this.plugin.saveSettings();
          }),
      );

    new obsidian_1.Setting(containerEl)
      .setName("Local")
      .setDesc("Key used to load locally snippets.")
      .addText((text) =>
        text
          .setPlaceholder("cssclasses")
          .setValue(this.plugin.settings.snippets_local)
          .onChange(async (value) => {
            const v = (value || "").trim();
            this.plugin.settings.snippets_local = v;
            await this.plugin.saveSettings();
            this.plugin.updateBodyClasses();
          }),
      );
    containerEl.createEl("h2", { text: "Documentation" });

    const cssClassesSection = containerEl.createEl("details");
    const cssClassesSummary = cssClassesSection.createEl("summary");
    cssClassesSummary.setText("CSS Classes");
    const cssClassesContent = cssClassesSection.createEl("div");
    cssClassesContent.style.padding = "10px";
    cssClassesContent.style.marginBottom = "20px";

    const introEl = cssClassesContent.createEl("p");
    introEl.innerHTML = `The plugin adds the following CSS classes to the <code>&lt;body&gt;</code> element based on the context:`;
    introEl.style.marginBottom = "15px";

    const cssClasses = [
      {
        class: "cssclass-{name}",
        desc: "Dynamic class for frontmatter",
        context:
          "Applied for each class listed in the cssclasses frontmatter property",
        example: "cssclass-my-style, cssclass-fancy-layout",
      },
      {
        class: "chisel-note",
        desc: "Markdown note context",
        context: "Applied when viewing any markdown note",
        example: "Always present when viewing .md files",
      },
      {
        class: "chisel-reading",
        desc: "Reading mode",
        context: "Applied when in reading (preview) mode",
        example: "When viewing rendered markdown content",
      },
      {
        class: "chisel-editing",
        desc: "Editing mode",
        context: "Applied when in editing (source) mode",
        example: "When editing raw markdown content",
      },
      {
        class: "chisel-canvas",
        desc: "Canvas view",
        context: "Applied when viewing a canvas",
        example: "When working with Obsidian Canvas files",
      },
      {
        class: "chisel-base",
        desc: "Base view",
        context: "Applied when viewing a base",
        example: "When viewing database/base files",
      },
      {
        class: "chisel-empty",
        desc: "Empty pane",
        context: "Applied when the active pane is empty",
        example: "No file is currently open",
      },
      {
        class: "chisel-webviewer",
        desc: "Web page view",
        context: "Applied when viewing a web page",
        example: "When using web browser view in Obsidian",
      },
    ];

    cssClasses.forEach(({ class: className, desc, context, example }) => {
      const classDiv = cssClassesContent.createEl("div");
      classDiv.style.marginBottom = "12px";
      classDiv.style.padding = "8px";
      classDiv.style.backgroundColor = "var(--background-secondary)";
      classDiv.style.borderRadius = "4px";

      const titleEl = classDiv.createEl("strong");
      titleEl.setText(desc);

      const classNameEl = classDiv.createEl("span");
      classNameEl.style.marginLeft = "8px";
      classNameEl.style.padding = "2px 6px";
      classNameEl.style.backgroundColor = "var(--background-modifier-border)";
      classNameEl.style.borderRadius = "3px";
      classNameEl.style.fontFamily = "monospace";
      classNameEl.style.fontSize = "0.85em";
      classNameEl.setText(className);

      const detailsEl = classDiv.createEl("div");
      detailsEl.style.marginTop = "6px";
      detailsEl.style.fontSize = "0.9em";

      const contextEl = detailsEl.createEl("div");
      contextEl.style.color = "var(--text-muted)";
      contextEl.setText(context);

      const exampleEl = detailsEl.createEl("div");
      exampleEl.style.fontStyle = "italic";
      exampleEl.style.fontSize = "0.85em";
      exampleEl.style.color = "var(--text-faint)";
      exampleEl.style.marginTop = "2px";
      exampleEl.setText(`Example: ${example}`);
    });

    const typographySection = containerEl.createEl("details");
    const typographySummary = typographySection.createEl("summary");
    typographySummary.setText("Typography");
    const typographyContent = typographySection.createEl("div");
    typographyContent.style.padding = "10px";

    const typographyIntroEl = typographyContent.createEl("p");
    typographyIntroEl.innerHTML = `Customize typography settings including fonts, weights, ratios, and text styling. These variables control how text appears throughout your notes:`;
    typographyIntroEl.style.marginBottom = "15px";

    const typographyVars = [
      {
        desc: "Font Ratio",
        css: "--font-ratio",
        fm: "chisel-font-ratio",
        example: "1.25",
        explanation:
          "Scale ratio between text sizes (paragraphs vs headings). Higher values create more dramatic size differences.",
      },
      {
        desc: "Font Density",
        css: "--font-density",
        fm: "chisel-font-density",
        example: "1.2",
        explanation:
          "Line height multiplier that affects text spacing and vertical rhythm. Higher values create more space between lines.",
      },
      {
        desc: "Font Text",
        css: "--font-text",
        fm: "chisel-font-text",
        example: "'Inter', sans-serif",
        explanation: "Primary font for body text content.",
      },
      {
        desc: "Font Feature",
        css: "--font-feature",
        fm: "chisel-font-feature",
        example: "'liga', 'kern'",
        explanation:
          "OpenType font features for body text. Common values: 'liga' (ligatures), 'kern' (kerning), 'onum' (old-style numerals).",
      },
      {
        desc: "Font Variation",
        css: "--font-variation",
        fm: "chisel-font-variation",
        example: "'wght' 400",
        explanation:
          "Variable font settings for body text. Format: 'axis' value (e.g., 'wght' for weight, 'wdth' for width).",
      },
      {
        desc: "Font Weight",
        css: "--font-weight",
        fm: "chisel-font-weight",
        example: "400",
        explanation:
          "Default weight for body text. 400 = normal, 300 = light, 500 = medium.",
      },
      {
        desc: "Bold Weight",
        css: "--bold-weight",
        fm: "chisel-bold-weight",
        example: "700",
        explanation:
          "Weight used for bold text. Should be heavier than font-weight for proper contrast.",
      },
      {
        desc: "Font Header",
        css: "--font-header",
        fm: "chisel-font-header",
        example: "'Merriweather', serif",
        explanation: "Font family used for all headings (H1-H6).",
      },
      {
        desc: "Font Header Feature",
        css: "--font-header-feature",
        fm: "chisel-font-header-feature",
        example: "'liga'",
        explanation: "OpenType features specifically for headings.",
      },
      {
        desc: "Font Header Variation",
        css: "--font-header-variation",
        fm: "chisel-font-header-variation",
        example: "'wght' 600",
        explanation: "Variable font settings for headings.",
      },
      {
        desc: "Font Header Letter Spacing",
        css: "--font-header-letter-spacing",
        fm: "chisel-font-header-letter-spacing",
        example: "-0.02em",
        explanation:
          "Space between letters in headings. Negative values tighten, positive values loosen.",
      },
      {
        desc: "Font Header Style",
        css: "--font-header-style",
        fm: "chisel-font-header-style",
        example: "normal",
        explanation: "Style for headings: normal, italic, or oblique.",
      },
      {
        desc: "Font Header Weight",
        css: "--font-header-weight",
        fm: "chisel-font-header-weight",
        example: "600",
        explanation:
          "Weight for headings. Usually heavier than body text for hierarchy.",
      },
      {
        desc: "Font Monospace",
        css: "--font-monospace",
        fm: "chisel-font-monospace",
        example: "'Fira Code', monospace",
        explanation: "Font for code blocks and inline code.",
      },
      {
        desc: "Font Monospace Feature",
        css: "--font-monospace-feature",
        fm: "chisel-font-monospace-feature",
        example: "'liga'",
        explanation:
          "OpenType features for code font. 'liga' enables coding ligatures (e.g., -> becomes →).",
      },
      {
        desc: "Font Monospace Variation",
        css: "--font-monospace-variation",
        fm: "chisel-font-monospace-variation",
        example: "'wght' 400",
        explanation: "Variable font settings for monospace text.",
      },
      {
        desc: "Font Interface",
        css: "--font-interface",
        fm: "chisel-font-interface",
        example: "'System-UI', sans-serif",
        explanation: "Font for Obsidian's user interface elements.",
      },
      {
        desc: "Font Interface Feature",
        css: "--font-interface-feature",
        fm: "chisel-font-interface-feature",
        example: "'liga'",
        explanation: "OpenType features for interface text.",
      },
      {
        desc: "Font Interface Variation",
        css: "--font-interface-variation",
        fm: "chisel-font-interface-variation",
        example: "'wght' 400",
        explanation: "Variable font settings for interface text.",
      },
    ];

    typographyVars.forEach(({ desc, css, fm, example, explanation }) => {
      const varDiv = typographyContent.createEl("div");
      varDiv.style.marginBottom = "12px";
      varDiv.style.padding = "8px";
      varDiv.style.backgroundColor = "var(--background-secondary)";
      varDiv.style.borderRadius = "4px";

      const titleEl = varDiv.createEl("strong");
      titleEl.setText(desc);

      if (explanation) {
        const explanationEl = varDiv.createEl("div");
        explanationEl.style.marginTop = "4px";
        explanationEl.style.fontSize = "0.9em";
        explanationEl.style.color = "var(--text-muted)";
        explanationEl.style.fontStyle = "italic";
        explanationEl.setText(explanation);
      }

      const detailsEl = varDiv.createEl("div");
      detailsEl.style.marginTop = "6px";
      detailsEl.style.fontSize = "0.85em";
      detailsEl.style.fontFamily = "monospace";
      detailsEl.style.color = "var(--text-faint)";

      detailsEl.createEl("div").setText(`CSS: ${css}`);
      detailsEl.createEl("div").setText(`Frontmatter: ${fm}`);
      detailsEl.createEl("div").setText(`Example: ${example}`);
    });

    const colorSection = containerEl.createEl("details");
    const colorSummary = colorSection.createEl("summary");
    colorSummary.setText("Color");
    const colorContent = colorSection.createEl("div");
    colorContent.style.padding = "10px";

    const colorIntroEl = colorContent.createEl("p");
    colorIntroEl.innerHTML = `Define custom colors for both light and dark themes. These variables allow you to override default colors with your preferred palette:`;
    colorIntroEl.style.marginBottom = "15px";

    const colorVars = [
      {
        desc: "Light Foreground",
        css: "--light-color-foreground",
        fm: "chisel-light-color-foreground",
        example: "#1a1a1a",
        explanation: "Main text color in light theme.",
      },
      {
        desc: "Light Background",
        css: "--light-color-background",
        fm: "chisel-light-color-background",
        example: "#ffffff",
        explanation: "Main background color in light theme.",
      },
      {
        desc: "Light Red",
        css: "--light-color-red",
        fm: "chisel-light-color-red",
        example: "#dc3545",
        explanation:
          "Red accent color for light theme (errors, warnings, highlights).",
      },
      {
        desc: "Light Orange",
        css: "--light-color-orange",
        fm: "chisel-light-color-orange",
        example: "#fd7e14",
        explanation: "Orange accent color for light theme.",
      },
      {
        desc: "Light Yellow",
        css: "--light-color-yellow",
        fm: "chisel-light-color-yellow",
        example: "#ffc107",
        explanation: "Yellow accent color for light theme (highlights, tags).",
      },
      {
        desc: "Light Green",
        css: "--light-color-green",
        fm: "chisel-light-color-green",
        example: "#28a745",
        explanation:
          "Green accent color for light theme (success, confirmations).",
      },
      {
        desc: "Light Cyan",
        css: "--light-color-cyan",
        fm: "chisel-light-color-cyan",
        example: "#17a2b8",
        explanation: "Cyan accent color for light theme.",
      },
      {
        desc: "Light Blue",
        css: "--light-color-blue",
        fm: "chisel-light-color-blue",
        example: "#007bff",
        explanation: "Blue accent color for light theme (links, info).",
      },
      {
        desc: "Light Purple",
        css: "--light-color-purple",
        fm: "chisel-light-color-purple",
        example: "#6f42c1",
        explanation: "Purple accent color for light theme.",
      },
      {
        desc: "Light Pink",
        css: "--light-color-pink",
        fm: "chisel-light-color-pink",
        example: "#e83e8c",
        explanation: "Pink accent color for light theme.",
      },
      {
        desc: "Light Accent",
        css: "--light-accent-color",
        fm: "chisel-light-accent-color",
        example: "#007bff",
        explanation:
          "Primary accent color for interactive elements in light theme.",
      },
      {
        desc: "Light Bold",
        css: "--light-bold-color",
        fm: "chisel-light-bold-color",
        example: "#000000",
        explanation: "Color for bold text in light theme.",
      },
      {
        desc: "Light Italic",
        css: "--light-italic-color",
        fm: "chisel-light-italic-color",
        example: "#495057",
        explanation: "Color for italic text in light theme.",
      },
      {
        desc: "Dark Foreground",
        css: "--dark-color-foreground",
        fm: "chisel-dark-color-foreground",
        example: "#ffffff",
        explanation: "Main text color in dark theme.",
      },
      {
        desc: "Dark Background",
        css: "--dark-color-background",
        fm: "chisel-dark-color-background",
        example: "#1a1a1a",
        explanation: "Main background color in dark theme.",
      },
      {
        desc: "Dark Red",
        css: "--dark-color-red",
        fm: "chisel-dark-color-red",
        example: "#ff6b6b",
        explanation:
          "Red accent color for dark theme (errors, warnings, highlights).",
      },
      {
        desc: "Dark Orange",
        css: "--dark-color-orange",
        fm: "chisel-dark-color-orange",
        example: "#ffa726",
        explanation: "Orange accent color for dark theme.",
      },
      {
        desc: "Dark Yellow",
        css: "--dark-color-yellow",
        fm: "chisel-dark-color-yellow",
        example: "#ffeb3b",
        explanation: "Yellow accent color for dark theme (highlights, tags).",
      },
      {
        desc: "Dark Green",
        css: "--dark-color-green",
        fm: "chisel-dark-color-green",
        example: "#66bb6a",
        explanation:
          "Green accent color for dark theme (success, confirmations).",
      },
      {
        desc: "Dark Cyan",
        css: "--dark-color-cyan",
        fm: "chisel-dark-color-cyan",
        example: "#4dd0e1",
        explanation: "Cyan accent color for dark theme.",
      },
      {
        desc: "Dark Blue",
        css: "--dark-color-blue",
        fm: "chisel-dark-color-blue",
        example: "#42a5f5",
        explanation: "Blue accent color for dark theme (links, info).",
      },
      {
        desc: "Dark Purple",
        css: "--dark-color-purple",
        fm: "chisel-dark-color-purple",
        example: "#ab47bc",
        explanation: "Purple accent color for dark theme.",
      },
      {
        desc: "Dark Pink",
        css: "--dark-color-pink",
        fm: "chisel-dark-color-pink",
        example: "#ec407a",
        explanation: "Pink accent color for dark theme.",
      },
      {
        desc: "Dark Accent",
        css: "--dark-accent-color",
        fm: "chisel-dark-accent-color",
        example: "#42a5f5",
        explanation:
          "Primary accent color for interactive elements in dark theme.",
      },
      {
        desc: "Dark Bold",
        css: "--dark-bold-color",
        fm: "chisel-dark-bold-color",
        example: "#ffffff",
        explanation: "Color for bold text in dark theme.",
      },
      {
        desc: "Dark Italic",
        css: "--dark-italic-color",
        fm: "chisel-dark-italic-color",
        example: "#adb5bd",
        explanation: "Color for italic text in dark theme.",
      },
    ];

    colorVars.forEach(({ desc, css, fm, example, explanation }) => {
      const varDiv = colorContent.createEl("div");
      varDiv.style.marginBottom = "12px";
      varDiv.style.padding = "8px";
      varDiv.style.backgroundColor = "var(--background-secondary)";
      varDiv.style.borderRadius = "4px";

      const titleEl = varDiv.createEl("strong");
      titleEl.setText(desc);

      // Add color preview for color variables
      const colorPreview = varDiv.createEl("span");
      colorPreview.style.display = "inline-block";
      colorPreview.style.width = "16px";
      colorPreview.style.height = "16px";
      colorPreview.style.backgroundColor = example;
      colorPreview.style.marginLeft = "8px";
      colorPreview.style.border = "1px solid var(--background-modifier-border)";
      colorPreview.style.borderRadius = "2px";

      if (explanation) {
        const explanationEl = varDiv.createEl("div");
        explanationEl.style.marginTop = "4px";
        explanationEl.style.fontSize = "0.9em";
        explanationEl.style.color = "var(--text-muted)";
        explanationEl.style.fontStyle = "italic";
        explanationEl.setText(explanation);
      }

      const detailsEl = varDiv.createEl("div");
      detailsEl.style.marginTop = "6px";
      detailsEl.style.fontSize = "0.85em";
      detailsEl.style.fontFamily = "monospace";
      detailsEl.style.color = "var(--text-faint)";

      detailsEl.createEl("div").setText(`CSS: ${css}`);
      detailsEl.createEl("div").setText(`Frontmatter: ${fm}`);
      detailsEl.createEl("div").setText(`Example: ${example}`);
    });

    const rhythmSection = containerEl.createEl("details");
    const rhythmSummary = rhythmSection.createEl("summary");
    rhythmSummary.setText("Vertical Rhythm");
    const rhythmContent = rhythmSection.createEl("div");
    rhythmContent.style.padding = "10px";

    const rhythmIntroEl = rhythmContent.createEl("p");
    rhythmIntroEl.innerHTML = `Control spacing and proportions throughout your notes with these rhythm variables. They help create consistent vertical spacing:`;
    rhythmIntroEl.style.marginBottom = "15px";

    const rhythmVars = [
      {
        desc: "Single",
        css: "--chisel-single",
        fm: "chisel-single",
        example: "1.5rem",
        explanation:
          "Base spacing unit for vertical rhythm. Used as the foundation for all spacing calculations (margins, padding, line heights).",
      },
      {
        desc: "Global",
        css: "--chisel-global",
        fm: "chisel-global",
        example: "1.2",
        explanation:
          "Global rhythm multiplier that scales all spacing proportionally. Works with font-density to maintain consistent vertical rhythm.",
      },
    ];

    rhythmVars.forEach(({ desc, css, fm, example, explanation }) => {
      const varDiv = rhythmContent.createEl("div");
      varDiv.style.marginBottom = "12px";
      varDiv.style.padding = "8px";
      varDiv.style.backgroundColor = "var(--background-secondary)";
      varDiv.style.borderRadius = "4px";

      const titleEl = varDiv.createEl("strong");
      titleEl.setText(desc);

      if (explanation) {
        const explanationEl = varDiv.createEl("div");
        explanationEl.style.marginTop = "4px";
        explanationEl.style.fontSize = "0.9em";
        explanationEl.style.color = "var(--text-muted)";
        explanationEl.style.fontStyle = "italic";
        explanationEl.setText(explanation);
      }

      const detailsEl = varDiv.createEl("div");
      detailsEl.style.marginTop = "6px";
      detailsEl.style.fontSize = "0.85em";
      detailsEl.style.fontFamily = "monospace";
      detailsEl.style.color = "var(--text-faint)";

      detailsEl.createEl("div").setText(`CSS: ${css}`);
      detailsEl.createEl("div").setText(`Frontmatter: ${fm}`);
      detailsEl.createEl("div").setText(`Example: ${example}`);
    });
  }
}

class ChiselCheatsheetModal extends obsidian_1.Modal {
  constructor(app) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Chisel  Cheatsheet" });

    const codeContainer = contentEl.createEl("div");
    codeContainer.style.padding = "10px";
    codeContainer.style.backgroundColor = "var(--background-secondary)";
    codeContainer.style.borderRadius = "4px";
    codeContainer.style.marginBottom = "20px";

    const codeExample = codeContainer.createEl("pre");
    codeExample.style.fontSize = "0.8em";
    codeExample.style.overflow = "auto";
    codeExample.style.whiteSpace = "pre";
    codeExample.style.lineHeight = "1.4";
    codeExample.style.fontFamily = "monospace";
    codeExample.style.userSelect = "text";
    codeExample.style.cursor = "text";
    codeExample.textContent = `---
# SNIPPETS
cssclasses: [my-snippet, another-snippet]           # Local snippets (adds CSS classes)
chisel: [global-snippet, base-styles]               # Global snippets (auto-loaded CSS)

# TYPOGRAPHY
chisel-font-ratio: 1.25                             # Scale ratio between text sizes
chisel-font-density: 1.2                            # Line height multiplier, affects vertical rhythm
chisel-font-text: "'Inter', sans-serif"               # Body text font
chisel-font-header: "'Merriweather', serif"           # Headings font (H1-H6)
chisel-font-monospace: "'Fira Code', mono"            # Code blocks and inline code font
chisel-font-interface: "'System-UI', sans"           # Obsidian UI font
chisel-font-feature: "'liga', 'kern'"                 # OpenType features for body text
chisel-font-variation: "'wght' 400"                  # Variable font settings for body text
chisel-font-weight: 400                              # Default weight for body text
chisel-bold-weight: 700                              # Weight for bold text
chisel-font-header-feature: "'liga'"                  # OpenType features for headings
chisel-font-header-variation: "'wght' 600"           # Variable font settings for headings
chisel-font-header-letter-spacing: "-0.02em"         # Letter spacing for headings
chisel-font-header-style: normal                     # Style for headings (normal, italic)
chisel-font-header-weight: 600                       # Weight for headings
chisel-font-monospace-feature: "'liga'"               # Code font features (enables ligatures)
chisel-font-monospace-variation: "'wght' 400"        # Variable font settings for code
chisel-font-interface-feature: "'liga'"               # OpenType features for UI text
chisel-font-interface-variation: "'wght' 400"         # Variable font settings for UI

# COLORS - LIGHT THEME
chisel-light-color-foreground: "#1a1a1a"             # Main text color
chisel-light-color-background: "#ffffff"             # Main background color
chisel-light-color-red: "#dc3545"                   # Red accent (errors, warnings)
chisel-light-color-orange: "#fd7e14"                # Orange accent
chisel-light-color-yellow: "#ffc107"                # Yellow accent (highlights, tags)
chisel-light-color-green: "#28a745"                 # Green accent (success)
chisel-light-color-cyan: "#17a2b8"                  # Cyan accent
chisel-light-color-blue: "#007bff"                  # Blue accent (links, info)
chisel-light-color-purple: "#6f42c1"                # Purple accent
chisel-light-color-pink: "#e83e8c"                  # Pink accent
chisel-light-accent-color: "#007bff"                # Primary accent for interactive elements
chisel-light-bold-color: "#000000"                  # Bold text color
chisel-light-italic-color: "#495057"                # Italic text color

# COLORS - DARK THEME
chisel-dark-color-foreground: "#ffffff"              # Main text color
chisel-dark-color-background: "#1a1a1a"              # Main background color
chisel-dark-color-red: "#ff6b6b"                    # Red accent (errors, warnings)
chisel-dark-color-orange: "#ffa726"                 # Orange accent
chisel-dark-color-yellow: "#ffeb3b"                 # Yellow accent (highlights, tags)
chisel-dark-color-green: "#66bb6a"                  # Green accent (success)
chisel-dark-color-cyan: "#4dd0e1"                   # Cyan accent
chisel-dark-color-blue: "#42a5f5"                   # Blue accent (links, info)
chisel-dark-color-purple: "#ab47bc"                 # Purple accent
chisel-dark-color-pink: "#ec407a"                   # Pink accent
chisel-dark-accent-color: "#42a5f5"                 # Primary accent for interactive elements
chisel-dark-bold-color: "#ffffff"                   # Bold text color
chisel-dark-italic-color: "#adb5bd"                 # Italic text color

# VERTICAL RHYTHM
chisel-single: "1.5rem"                              # Base spacing unit for vertical rhythm
chisel-global: 1.2                                  # Global rhythm multiplier

# CUSTOM VARIABLES
# Any property starting with 'chisel-' becomes a CSS variable
# Example: chisel-my-color: "#ff0000" creates --my-color: #ff0000
chisel-custom-property: "value"                      # Becomes --custom-property: value
---`;
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

module.exports = ChiselPlugin;

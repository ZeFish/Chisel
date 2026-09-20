"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/features/live/index.js
var require_live = __commonJS({
  "src/features/live/index.js"(exports2, module2) {
    "use strict";
    var { Plugin: Plugin2, PluginSettingTab: PluginSettingTab2, Setting } = require("obsidian");
    var DEFAULT_SETTINGS = {
      baseURL: "https://example.com/",
      noPermalinkSuffix: "n/",
      showRibbon: true
    };
    var LiveFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.live) plugin.settings.live = { ...DEFAULT_SETTINGS };
        this.settings = plugin.settings.live;
        this.ribbonIcon = null;
      }
      async load() {
        this.updateRibbon();
        this.plugin.addCommand({
          id: "open-public-note",
          name: "Open public note",
          callback: () => {
            this.openPublicNote();
          }
        });
      }
      updateRibbon() {
        if (this.settings.showRibbon) {
          if (!this.ribbonIcon) {
            this.ribbonIcon = this.plugin.addRibbonIcon(
              "link",
              "Open public note",
              () => {
                this.openPublicNote();
              }
            );
          }
        } else {
          if (this.ribbonIcon) {
            this.ribbonIcon.remove();
            this.ribbonIcon = null;
          }
        }
      }
      slugify(str) {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-");
      }
      openPublicNote() {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          const fileCache = this.app.metadataCache.getFileCache(activeFile);
          const frontmatter = fileCache?.frontmatter;
          const permalink = frontmatter?.permalink;
          let publicURL;
          if (permalink) {
            const slug = this.slugify(permalink);
            publicURL = `${this.settings.baseURL}${slug}`;
          } else {
            const slug = this.slugify(activeFile.basename);
            publicURL = `${this.settings.baseURL}${this.settings.noPermalinkSuffix}${slug}`;
          }
          window.open(publicURL, "_blank");
        }
      }
    };
    var LiveSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.live) this.plugin.settings.live = {
          baseURL: "https://francisfontaine.com/",
          noPermalinkSuffix: "n/",
          showRibbon: true
        };
        this.settings = this.plugin.settings.live;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Live Settings" });
        new Setting(containerEl).setName("Show ribbon icon").addToggle(
          (toggle) => toggle.setValue(this.settings.showRibbon).onChange(async (value) => {
            this.settings.showRibbon = value;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof LiveFeature2).updateRibbon();
          })
        );
        new Setting(containerEl).setName("Base URL").setDesc("The base URL for your public notes.").addText(
          (text) => text.setPlaceholder("https://example.com/notes/").setValue(this.settings.baseURL).onChange(async (value) => {
            this.settings.baseURL = value;
            await this.plugin.saveSettings();
          })
        );
        new Setting(containerEl).setName("No permalink suffix").setDesc("The suffix to add to the URL when there is no permalink frontmatter.").addText(
          (text) => text.setPlaceholder("n/").setValue(this.settings.noPermalinkSuffix).onChange(async (value) => {
            this.settings.noPermalinkSuffix = value;
            await this.plugin.saveSettings();
          })
        );
      }
    };
    module2.exports = { LiveFeature: LiveFeature2, LiveSettingTab: LiveSettingTab2 };
  }
});

// src/features/echo/parser.js
var require_parser = __commonJS({
  "src/features/echo/parser.js"(exports2, module2) {
    "use strict";
    var DEFAULT_SEPARATOR = "h6";
    function extractDate(basename) {
      const clean = basename.split(" ")[0].trim();
      let m = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      m = clean.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      m = clean.match(/^(\d{2})(\d{2})(\d{2})$/);
      if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
      return null;
    }
    function parseNote(content, date, sourceFile, separator = DEFAULT_SEPARATOR) {
      const entries = [];
      const lines = content.split("\n");
      const levelMap = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
      const level = levelMap[separator];
      if (!level) return entries;
      const hashes = "#".repeat(level);
      const headingPrefix = new RegExp(`^${hashes}\\s+(.+)`);
      const timeRe = /\b(\d{1,2}:\d{2})\b/;
      const tagRe = /#([\w/-]+)/;
      let currentEntry = null;
      let contentLines = [];
      const flushEntry = () => {
        if (currentEntry) {
          currentEntry.content = contentLines.join("\n").trim();
          entries.push(currentEntry);
          currentEntry = null;
          contentLines = [];
        }
      };
      for (const line of lines) {
        const headMatch = line.match(headingPrefix);
        if (headMatch) {
          const rest = headMatch[1].trim();
          const tagMatch = rest.match(tagRe);
          if (!tagMatch) {
            flushEntry();
            continue;
          }
          flushEntry();
          const timeMatch = rest.match(timeRe);
          currentEntry = {
            date,
            time: timeMatch ? timeMatch[1] : "",
            tag: tagMatch[1],
            content: "",
            sourceFile,
            heading: line.trim()
          };
        } else if (currentEntry) {
          contentLines.push(line);
        }
      }
      flushEntry();
      return entries;
    }
    function formatTimestamp(date, time) {
      const compact = date.replace(/-/g, "").slice(2);
      return time ? `${compact}-${time}` : compact;
    }
    function buildObsidianLink(vaultName, sourceFile) {
      const file = encodeURIComponent(sourceFile.replace(/\.md$/, ""));
      return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${file}`;
    }
    module2.exports = { parseNote, formatTimestamp, buildObsidianLink, extractDate, DEFAULT_SEPARATOR };
  }
});

// src/features/echo/index.js
var require_echo = __commonJS({
  "src/features/echo/index.js"(exports2, module2) {
    "use strict";
    var { Plugin: Plugin2, PluginSettingTab: PluginSettingTab2, Setting, Notice } = require("obsidian");
    var {
      parseNote,
      formatTimestamp,
      buildObsidianLink,
      extractDate,
      DEFAULT_SEPARATOR
    } = require_parser();
    var DEFAULT_BLOCK_OPTIONS = {
      tag: null,
      separator: DEFAULT_SEPARATOR,
      show_tag: false,
      show_time: true,
      date_format: "compact",
      sort: "desc",
      limit: 0
    };
    function parseBlockOptions(source) {
      const opts = { ...DEFAULT_BLOCK_OPTIONS };
      for (const line of source.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        let value = trimmed.slice(colonIdx + 1).trim();
        if (key in opts) {
          if (key === "tag") value = value.replace(/^#+/, "");
          if (value === "true") opts[key] = true;
          else if (value === "false") opts[key] = false;
          else if (!isNaN(Number(value)) && value !== "") opts[key] = Number(value);
          else opts[key] = value;
        }
      }
      return opts;
    }
    function normalizePath(raw) {
      return raw.trim().replace(/^\/+|\/+$/g, "");
    }
    function isInLogPath(file, logPaths) {
      for (const p of logPaths) {
        if (p === "") return true;
        if (file.path.startsWith(p + "/") || file.path.includes("/" + p + "/"))
          return true;
      }
      return false;
    }
    var EchoFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.echo) plugin.settings.echo = { logPaths: [""] };
        this.settings = plugin.settings.echo;
      }
      async load() {
        this.plugin.registerMarkdownCodeBlockProcessor(
          "echo",
          async (source, el, ctx) => {
            try {
              await this.renderEchoBlock(source, el, ctx);
            } catch (err) {
              el.createEl("p", {
                text: `Echo error: ${err.message}`,
                cls: "echo-error"
              });
              console.error("[Echo]", err);
            }
          }
        );
      }
      async renderEchoBlock(source, el, ctx) {
        const opts = parseBlockOptions(source);
        if (!opts.tag) {
          el.createEl("p", {
            text: "Echo: please specify a tag. e.g.  tag: work",
            cls: "echo-empty"
          });
          return;
        }
        const logPaths = (this.settings.logPaths || [""]).map(normalizePath);
        const allFiles = this.app.vault.getMarkdownFiles();
        const candidates = allFiles.filter((f) => isInLogPath(f, logPaths));
        let entries = [];
        for (const file of candidates) {
          const date = extractDate(file.basename);
          if (!date) continue;
          const content = await this.app.vault.read(file);
          const parsed = parseNote(content, date, file.path, opts.separator);
          const matching = parsed.filter(
            (e) => e.tag === opts.tag || e.tag.startsWith(opts.tag + "/")
          );
          entries.push(...matching);
        }
        entries.sort((a, b) => {
          const aKey = `${a.date}${a.time}`;
          const bKey = `${b.date}${b.time}`;
          return opts.sort === "asc" ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
        });
        if (opts.limit > 0) entries = entries.slice(0, opts.limit);
        const container = el.createEl("div", { cls: "echo-feed" });
        if (entries.length === 0) {
          container.createEl("p", {
            text: `No entries found for #${opts.tag}.`,
            cls: "echo-empty"
          });
          return;
        }
        const vaultName = this.app.vault.getName();
        for (const entry of entries) {
          this.renderEntry(container, entry, opts, vaultName);
        }
      }
      renderEntry(container, entry, opts, vaultName) {
        const entryEl = container.createEl("div", { cls: "echo-entry" });
        if (opts.show_time) {
          const timestamp = opts.date_format === "compact" ? formatTimestamp(entry.date, entry.time) : entry.time ? `${entry.date} \xB7 ${entry.time}` : entry.date;
          const link = buildObsidianLink(vaultName, entry.sourceFile);
          const tsEl = entryEl.createEl("a", {
            text: timestamp,
            cls: "echo-timestamp",
            href: link
          });
          const isChild = entry.tag !== opts.tag;
          if (opts.show_tag || isChild) {
            tsEl.createEl("span", { text: ` #${entry.tag}`, cls: "echo-tag" });
          }
        }
        const contentEl = entryEl.createEl("div", { cls: "echo-content" });
        if (entry.content) {
          try {
            const { MarkdownRenderer } = require("obsidian");
            MarkdownRenderer.render(
              this.app,
              entry.content,
              contentEl,
              entry.sourceFile,
              this.plugin
            );
          } catch {
            contentEl.createEl("p", { text: entry.content });
          }
        }
      }
    };
    var EchoSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.echo) this.plugin.settings.echo = { logPaths: [""] };
        this.settings = this.plugin.settings.echo;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Echo" });
        containerEl.createEl("p", {
          text: "Echo searches for specific tags within these log folders to generate dynamic feeds.",
          cls: "setting-item-description"
        });
        const listContainer = containerEl.createEl("div", {
          cls: "echo-paths-list"
        });
        this.renderPathsList(listContainer);
        new Setting(containerEl).setName("Add log folder").setDesc("Add a folder to scan for log entries.").addButton(
          (btn) => btn.setButtonText("+ Add folder").setCta().onClick(async () => {
            if (!this.settings.logPaths)
              this.settings.logPaths = [];
            this.settings.logPaths.push("");
            await this.plugin.saveSettings();
            this.display();
          })
        );
        containerEl.createEl("h3", { text: "Example usage" });
        const code = "```echo\ntag: work\nlimit: 5\nsort: desc\n```";
        containerEl.createEl("pre").createEl("code", { text: code });
      }
      renderPathsList(container) {
        container.empty();
        const paths = this.settings.logPaths || [];
        if (paths.length === 0) {
          container.createEl("p", {
            text: "Scanning all folders (empty path).",
            cls: "setting-item-description"
          });
          return;
        }
        paths.forEach((p, i) => {
          new Setting(container).setName(`Folder ${i + 1}`).setDesc(p === "" ? "Leave empty to scan entire vault" : "Folder path").addText(
            (text) => text.setPlaceholder("e.g. Logs or Journal").setValue(p).onChange(async (value) => {
              this.settings.logPaths[i] = value;
              await this.plugin.saveSettings();
            })
          ).addButton(
            (btn) => btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
              this.settings.logPaths.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            })
          );
        });
      }
    };
    module2.exports = { EchoFeature: EchoFeature2, EchoSettingTab: EchoSettingTab2 };
  }
});

// src/features/hollow/index.js
var require_hollow = __commonJS({
  "src/features/hollow/index.js"(exports2, module2) {
    "use strict";
    var {
      Plugin: Plugin2,
      PluginSettingTab: PluginSettingTab2,
      Modal,
      Notice,
      Setting
    } = require("obsidian");
    var DEFAULT_SETTINGS = {
      excludePaths: [],
      showRibbon: true
    };
    function normalizePath(raw) {
      return raw.trim().replace(/^\/+|\/+$/g, "");
    }
    function isExcluded(file, excludePaths) {
      for (const p of excludePaths) {
        if (!p) continue;
        if (file.path.startsWith(p + "/") || file.path.includes("/" + p + "/"))
          return true;
      }
      return false;
    }
    function stripFrontmatter(content) {
      if (!content.startsWith("---")) return content.trim();
      const end = content.indexOf("\n---", 3);
      if (end === -1) return content.trim();
      return content.slice(end + 4).trim();
    }
    function isHollow(content) {
      return stripFrontmatter(content) === "";
    }
    var HollowFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!this.plugin.settings.hollow)
          this.plugin.settings.hollow = DEFAULT_SETTINGS;
        this.settings = this.plugin.settings.hollow;
        this.ribbonIcon = null;
      }
      async load() {
        this.updateRibbon();
        this.plugin.addCommand({
          id: "find-hollow-notes",
          name: "Find hollow notes",
          callback: () => new HollowModal(this.app, this.settings).open()
        });
      }
      updateRibbon() {
        if (this.settings.showRibbon) {
          if (!this.ribbonIcon) {
            this.ribbonIcon = this.plugin.addRibbonIcon(
              "ghost",
              "Find hollow notes",
              () => {
                new HollowModal(this.app, this.settings).open();
              }
            );
          }
        } else {
          if (this.ribbonIcon) {
            this.ribbonIcon.remove();
            this.ribbonIcon = null;
          }
        }
      }
    };
    var HollowModal = class extends Modal {
      constructor(app, settings) {
        super(app);
        this.settings = settings;
        this.files = [];
      }
      async onOpen() {
        const { contentEl } = this;
        contentEl.addClass("hollow-modal");
        contentEl.createEl("p", {
          text: "Scanning vault\u2026",
          cls: "hollow-scanning"
        });
        this.files = await this.findHollowFiles();
        contentEl.empty();
        const header = contentEl.createEl("div", { cls: "hollow-header" });
        header.createEl("h2", { text: "Hollow notes" });
        this.countEl = header.createEl("p", {
          text: this.countText(),
          cls: "hollow-count"
        });
        if (this.files.length === 0) return;
        let armed = false;
        new Setting(contentEl).setName("Delete all").setDesc("Sends all hollow notes to the system trash.").addButton((btn) => {
          btn.setButtonText("Delete all").setWarning().onClick(async () => {
            if (!armed) {
              armed = true;
              btn.setButtonText("Confirm \u2014 delete all?");
              return;
            }
            await this.deleteAll();
          });
        });
        this.listEl = contentEl.createEl("div", { cls: "hollow-list" });
        for (const file of this.files) {
          this.renderRow(file);
        }
      }
      renderRow(file) {
        const row = this.listEl.createEl("div", { cls: "hollow-row" });
        const info = row.createEl("div", { cls: "hollow-info" });
        info.createEl("span", { text: file.basename, cls: "hollow-name" });
        info.createEl("span", {
          text: file.parent?.path || "/",
          cls: "hollow-path"
        });
        const actions = row.createEl("div", { cls: "hollow-actions" });
        const openBtn = actions.createEl("button", {
          text: "Open",
          cls: "hollow-btn"
        });
        openBtn.addEventListener("click", () => {
          this.app.workspace.getLeaf().openFile(file);
          this.close();
        });
        const delBtn = actions.createEl("button", {
          text: "Delete",
          cls: "hollow-btn hollow-btn-danger"
        });
        delBtn.addEventListener("click", async () => {
          await this.app.vault.trash(file, true);
          row.remove();
          this.files.splice(this.files.indexOf(file), 1);
          this.countEl.setText(this.countText());
          new Notice(`Deleted "${file.basename}"`);
        });
      }
      async deleteAll() {
        const count = this.files.length;
        for (const file of [...this.files]) {
          await this.app.vault.trash(file, true);
        }
        new Notice(`Deleted ${count} hollow note${count === 1 ? "" : "s"}.`);
        this.close();
      }
      async findHollowFiles() {
        const excludePaths = this.settings.excludePaths.map(normalizePath);
        const allFiles = this.app.vault.getMarkdownFiles();
        const hollow = [];
        for (const file of allFiles) {
          if (isExcluded(file, excludePaths)) continue;
          const content = await this.app.vault.read(file);
          if (isHollow(content)) hollow.push(file);
        }
        hollow.sort((a, b) => a.path.localeCompare(b.path));
        return hollow;
      }
      countText() {
        const n = this.files.length;
        return n === 0 ? "No hollow notes found." : `${n} note${n === 1 ? "" : "s"} with no body content.`;
      }
      onClose() {
        this.contentEl.empty();
      }
    };
    var HollowSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.hollow)
          this.plugin.settings.hollow = DEFAULT_SETTINGS;
        this.settings = this.plugin.settings.hollow;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Hollow" });
        new Setting(containerEl).setName("Show ribbon icon").addToggle(
          (toggle) => toggle.setValue(this.settings.showRibbon).onChange(async (value) => {
            this.settings.showRibbon = value;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof HollowFeature2).updateRibbon();
          })
        );
        containerEl.createEl("h3", { text: "Excluded folders" });
        containerEl.createEl("p", {
          text: "Hollow will skip notes inside these folders. Matches the folder name anywhere in the path.",
          cls: "setting-item-description"
        });
        const listContainer = containerEl.createEl("div", {
          cls: "hollow-paths-list"
        });
        this.renderExcludeList(listContainer);
        new Setting(containerEl).setName("Add folder").setDesc("Add a folder to exclude from the scan.").addButton(
          (btn) => btn.setButtonText("+ Add folder").setCta().onClick(async () => {
            if (!this.settings.excludePaths) this.settings.excludePaths = [];
            this.settings.excludePaths.push("");
            await this.plugin.saveSettings();
            this.display();
          })
        );
      }
      renderExcludeList(container) {
        container.empty();
        const paths = this.settings?.excludePaths || [];
        if (paths.length === 0) {
          container.createEl("p", {
            text: "No folders excluded.",
            cls: "hollow-scanning"
          });
          return;
        }
        paths.forEach((p, i) => {
          new Setting(container).setName(`Folder ${i + 1}`).setDesc(p === "" ? "Enter a folder name" : p).addText(
            (text) => text.setPlaceholder("e.g. Templates  or  Archive/Old").setValue(p).onChange(async (value) => {
              this.settings.excludePaths[i] = value;
              await this.plugin.saveSettings();
            })
          ).addButton(
            (btn) => btn.setIcon("trash").setTooltip("Remove").onClick(async () => {
              this.settings.excludePaths.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            })
          );
        });
      }
    };
    module2.exports = { HollowFeature: HollowFeature2, HollowSettingTab: HollowSettingTab2 };
  }
});

// src/features/bases-feed/index.js
var require_bases_feed = __commonJS({
  "src/features/bases-feed/index.js"(exports2, module2) {
    "use strict";
    var { BasesView, MarkdownRenderer, Setting, Notice } = require("obsidian");
    var VIEW_ID = "atelier-feed";
    var DEFAULT_SETTINGS = {
      // How many entries to render at once (feeds can be huge — cap for perf).
      maxItems: 50,
      // Character budget for each card's markdown preview (0 = full note).
      previewChars: 600,
      // Show the first image embed / cover property as a card banner.
      showCovers: true
    };
    var FeedBasesView = class extends BasesView {
      constructor(controller, containerEl, settings) {
        super(controller);
        // Required by BasesView — the type ID this instance reports.
        __publicField(this, "type", VIEW_ID);
        this.feedContainerEl = containerEl;
        this.settings = settings;
        this.renderToken = 0;
      }
      onload() {
        this.feedContainerEl.addClass("atelier-feed");
        this._render();
      }
      onunload() {
        this.renderToken++;
        this.feedContainerEl.removeClass("atelier-feed");
        this.feedContainerEl.empty();
      }
      // Called every time the query result / filters / config change.
      onDataUpdated() {
        this._render();
      }
      _render() {
        const token = ++this.renderToken;
        const root = this.feedContainerEl;
        if (!root) return;
        root.empty();
        if (!this.data) return;
        const entries = this.data?.data ?? [];
        if (entries.length === 0) {
          root.createDiv({ cls: "atelier-feed-empty", text: "Aucune note dans ce feed." });
          return;
        }
        const maxItems = this._option("maxItems", this.settings.maxItems);
        const previewChars = this._option("previewChars", this.settings.previewChars);
        const showCovers = this._option("showCovers", this.settings.showCovers);
        const shown = entries.slice(0, maxItems);
        for (const entry of shown) {
          this._renderCard(root, entry, { previewChars, showCovers, token });
        }
        if (entries.length > shown.length) {
          root.createDiv({
            cls: "atelier-feed-more",
            text: `+ ${entries.length - shown.length} note(s) de plus \u2014 affine le filtre ou augmente la limite.`
          });
        }
      }
      _option(key, fallback) {
        try {
          const v = this.config?.get?.(key);
          return v === void 0 || v === null ? fallback : v;
        } catch {
          return fallback;
        }
      }
      _renderCard(root, entry, { previewChars, showCovers, token }) {
        const file = entry.file;
        if (!file) return;
        const card = root.createDiv({ cls: "atelier-feed-card" });
        const header = card.createDiv({ cls: "atelier-feed-card-header" });
        header.createDiv({ cls: "atelier-feed-title", text: file.basename });
        const mtime = file.stat?.mtime;
        if (mtime) {
          header.createDiv({
            cls: "atelier-feed-date",
            text: this._formatDate(mtime)
          });
        }
        card.addEventListener("click", (evt) => {
          if (evt.target.closest("a")) return;
          this.app.workspace.getLeaf(evt.metaKey || evt.ctrlKey ? "tab" : false).openFile(file);
        });
        const body = card.createDiv({ cls: "atelier-feed-body" });
        this.app.vault.cachedRead(file).then((raw) => {
          if (token !== this.renderToken) return;
          let content = this._stripFrontmatter(raw);
          if (showCovers) {
            const cover = this._extractCover(content, entry);
            if (cover) {
              const img = body.createEl("img", { cls: "atelier-feed-cover" });
              img.src = cover;
            }
          }
          if (previewChars > 0 && content.length > previewChars) {
            content = content.slice(0, previewChars).trimEnd() + "\u2026";
          }
          MarkdownRenderer.render(this.app, content, body, file.path, this).catch(() => {
            body.setText(content);
          });
        });
      }
      _stripFrontmatter(text) {
        if (text.startsWith("---")) {
          const end = text.indexOf("\n---", 3);
          if (end !== -1) {
            const after = text.indexOf("\n", end + 1);
            return after !== -1 ? text.slice(after + 1) : "";
          }
        }
        return text;
      }
      _extractCover(content, entry) {
        for (const key of ["cover", "image", "banner"]) {
          try {
            const v = entry.getValue?.(`note.${key}`);
            const s = v?.toString?.();
            if (s && /^https?:\/\//.test(s)) return s;
          } catch {
          }
        }
        const m = content.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
        return m ? m[1] : null;
      }
      _formatDate(ms) {
        const d = new Date(ms);
        const now = /* @__PURE__ */ new Date();
        const diffDays = Math.floor((now - d) / 864e5);
        if (diffDays === 0) return "Aujourd'hui";
        if (diffDays === 1) return "Hier";
        if (diffDays < 7) return `Il y a ${diffDays} jours`;
        return d.toLocaleDateString(void 0, { day: "numeric", month: "short", year: "numeric" });
      }
    };
    var BasesFeedFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.basesFeed) plugin.settings.basesFeed = { ...DEFAULT_SETTINGS };
        this.settings = plugin.settings.basesFeed;
        this.styleEl = null;
      }
      async load() {
        if (typeof this.plugin.registerBasesView !== "function") {
          console.warn("[Atelier] registerBasesView unavailable \u2014 Obsidian \u2265 1.10 required for the Feed view.");
          return;
        }
        this._injectStyles();
        this.plugin.registerBasesView(VIEW_ID, {
          name: "Feed",
          icon: "rss",
          factory: (controller, containerEl) => new FeedBasesView(controller, containerEl, this.settings),
          // Per-base options surfaced in the Bases toolbar config menu.
          options: () => [
            { type: "slider", key: "maxItems", displayName: "Max entries", default: this.settings.maxItems, min: 5, max: 200, step: 5 },
            { type: "slider", key: "previewChars", displayName: "Preview length (chars, 0 = full)", default: this.settings.previewChars, min: 0, max: 2e3, step: 100 },
            { type: "toggle", key: "showCovers", displayName: "Show cover images", default: this.settings.showCovers }
          ]
        });
      }
      async unload() {
        if (this.styleEl) {
          this.styleEl.remove();
          this.styleEl = null;
        }
      }
      _injectStyles() {
        if (this.styleEl) return;
        const el = document.createElement("style");
        el.id = "atelier-feed-styles";
        el.textContent = `
      .atelier-feed {
        overflow-y: auto;
        height: 100%;
        padding: var(--size-4-4, 1rem);
        display: flex;
        flex-direction: column;
        gap: var(--size-4-4, 1rem);
        max-width: 42rem;
        margin: 0 auto;
      }
      .atelier-feed-card {
        border: 1px solid var(--color-border, var(--background-modifier-border));
        border-radius: var(--radius-m, 8px);
        padding: var(--size-4-4, 1rem);
        background: var(--color-surface, var(--background-secondary));
        cursor: pointer;
        transition: border-color 120ms ease, transform 120ms ease;
      }
      .atelier-feed-card:hover {
        border-color: var(--color-accent, var(--interactive-accent));
      }
      .atelier-feed-card-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: var(--size-4-2, 0.5rem);
      }
      .atelier-feed-title {
        font-weight: var(--bold-weight, 600);
        color: var(--color-header, var(--color-foreground, var(--text-normal)));
      }
      .atelier-feed-date {
        font-size: var(--font-ui-smaller, 0.8em);
        color: var(--color-muted, var(--text-muted));
        white-space: nowrap;
      }
      .atelier-feed-body {
        color: var(--color-foreground, var(--text-normal));
        font-size: var(--font-ui-small, 0.9em);
        margin-block: var(--space) !important;
      }
      .atelier-feed-body > :first-child { margin-top: 0; }
      .atelier-feed-body > :last-child { margin-bottom: 0; }
      .atelier-feed-cover {
        width: 100%;
        border-radius: var(--radius-s, 4px);
        margin-bottom: var(--size-4-2, 0.5rem);
        object-fit: cover;
        max-height: 12rem;
      }
      .atelier-feed-empty, .atelier-feed-more {
        color: var(--color-muted, var(--text-muted));
        text-align: center;
        padding: var(--size-4-4, 1rem);
        font-size: var(--font-ui-small, 0.9em);
      }
    `;
        document.head.appendChild(el);
        this.styleEl = el;
      }
    };
    var BasesFeedSettingTab2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.basesFeed) plugin.settings.basesFeed = { ...DEFAULT_SETTINGS };
        this.settings = plugin.settings.basesFeed;
      }
      display() {
        const { containerEl } = this;
        containerEl.createEl("h2", { text: "Feed (Bases view)" });
        containerEl.createEl("p", {
          text: "Defaults for the custom Feed view. Each .base can override these in its toolbar.",
          cls: "setting-item-description"
        });
        new Setting(containerEl).setName("Max entries").setDesc("How many notes to render in the feed at once.").addText(
          (t) => t.setValue(String(this.settings.maxItems)).onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 0) {
              this.settings.maxItems = n;
              await this.plugin.saveSettings();
            }
          })
        );
        new Setting(containerEl).setName("Preview length").setDesc("Characters of each note to preview. 0 = render the full note.").addText(
          (t) => t.setValue(String(this.settings.previewChars)).onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0) {
              this.settings.previewChars = n;
              await this.plugin.saveSettings();
            }
          })
        );
        new Setting(containerEl).setName("Show cover images").setDesc("Display the first image embed (or cover/image property) as a banner.").addToggle(
          (tog) => tog.setValue(this.settings.showCovers).onChange(async (v) => {
            this.settings.showCovers = v;
            await this.plugin.saveSettings();
          })
        );
      }
    };
    module2.exports = { BasesFeedFeature: BasesFeedFeature2, BasesFeedSettingTab: BasesFeedSettingTab2 };
  }
});

// src/constants.js
var require_constants = __commonJS({
  "src/constants.js"(exports2, module2) {
    "use strict";
    function descWithLinks(text, links = []) {
      const frag = document.createDocumentFragment();
      const parts = text.split("\xA7");
      parts.forEach((part, i) => {
        if (part) frag.appendText(part);
        if (i < links.length) {
          const link = links[i];
          const a = frag.createEl("a", { text: link.text, href: link.href });
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
          a.style.color = "var(--link-color, var(--interactive-accent))";
          a.style.textDecoration = "underline";
          a.style.textUnderlineOffset = "2px";
        }
      });
      return frag;
    }
    module2.exports = {
      descWithLinks
    };
  }
});

// src/features/system-tray/tray-manager.js
var require_tray_manager = __commonJS({
  "src/features/system-tray/tray-manager.js"(exports2, module2) {
    "use strict";
    var remote = require("@electron/remote");
    var path = require("path");
    var LOG_PREFIX = "obsidian-tray";
    var TRAY_ICON_FILENAME = "trayTemplate.png";
    var ACTION_DAILY_NOTE = "Daily Note";
    var ACTION_OPEN = "Open Obsidian";
    var ACTION_CLOSE = "Close Vault";
    var log = (message) => console.log(`${LOG_PREFIX}: ${message}`);
    var TrayManager = class {
      constructor(app, settings, pluginPath, callbacks) {
        this.app = app;
        this.settings = settings;
        this.pluginPath = pluginPath;
        this.callbacks = callbacks;
        this.tray = null;
      }
      destroyTray() {
        if (this.tray) {
          this.tray.destroy();
          this.tray = null;
        }
      }
      replaceVaultName(str) {
        return str.replace(/{{vault}}/g, this.app.vault.getName());
      }
      createTrayIcon() {
        this.destroyTray();
        log("creating tray icon");
        const iconPath = path.join(this.pluginPath, TRAY_ICON_FILENAME);
        const obsidianIcon = remote.nativeImage.createFromPath(iconPath);
        obsidianIcon.setTemplateImage(true);
        log(
          `icon size: ${obsidianIcon.getSize().width}x${obsidianIcon.getSize().height}`
        );
        const contextMenu = remote.Menu.buildFromTemplate([
          {
            type: "normal",
            label: ACTION_DAILY_NOTE,
            click: this.callbacks.onDailyNote
          },
          { type: "normal", label: ACTION_OPEN, click: this.callbacks.onOpen },
          { type: "separator" },
          { label: ACTION_CLOSE, click: this.callbacks.onClose }
        ]);
        this.tray = new remote.Tray(obsidianIcon);
        this.tray.setContextMenu(contextMenu);
        this.tray.on("click", () => {
          if (process.platform === "darwin") {
            this.tray.popUpContextMenu();
          } else {
            this.callbacks.onToggle();
          }
        });
      }
    };
    module2.exports = { TrayManager };
  }
});

// src/features/system-tray/index.js
var require_system_tray = __commonJS({
  "src/features/system-tray/index.js"(exports2, module2) {
    "use strict";
    var obsidian = require("obsidian");
    var { PluginSettingTab: PluginSettingTab2, Setting, Platform } = obsidian;
    var { descWithLinks } = require_constants();
    var path = null;
    var remote = null;
    if (Platform.isDesktop) {
      try {
        path = require("path");
        remote = require("@electron/remote");
      } catch (e) {
        console.error("Atelier: Failed to load @electron/remote", e);
      }
    }
    var DEFAULT_SETTINGS = {
      enabled: true,
      hideOnLaunch: false,
      trayIconTooltip: "{{vault}} | Obsidian"
    };
    function getElectronWindow() {
      if (!Platform.isDesktop || !remote) return null;
      try {
        return remote.getCurrentWindow();
      } catch {
        return null;
      }
    }
    var SystemTrayFeature2 = class {
      constructor(app, plugin) {
        __publicField(this, "handleBeforeUnload", (event) => {
          if (this.isAppQuitting) return;
          if (Platform.isDesktop && remote) {
            remote.getCurrentWindow().hide();
          }
          event.stopImmediatePropagation();
          event.returnValue = false;
        });
        __publicField(this, "handleWindowClose", (event) => {
          if (this.isAppQuitting) return;
          event.preventDefault();
        });
        this.app = app;
        this.plugin = plugin;
        plugin.settings.systemTray = {
          ...DEFAULT_SETTINGS,
          ...plugin.settings.systemTray || {}
        };
        this.settings = plugin.settings.systemTray;
        this.vaultWindows = /* @__PURE__ */ new Set();
        this.maximizedWindows = /* @__PURE__ */ new Set();
        this.isAppQuitting = false;
      }
      getPluginAbsPath() {
        const basePath = this.app.vault.adapter.getBasePath();
        return path.join(basePath, this.plugin.manifest.dir);
      }
      async load() {
        if (!Platform.isDesktop || !remote) return;
        this.observeWindows();
        if (this.settings.enabled !== false) {
          if (window._atelierTray && typeof window._atelierTray.destroy === "function") {
            try {
              window._atelierTray.destroy();
            } catch (e) {
            }
          }
          this.setupTrayManager();
          if (this.trayManager) {
            try {
              this.trayManager.createTrayIcon();
              window._atelierTray = this.trayManager.tray;
            } catch (e) {
              console.error("Atelier: Failed to create tray icon", e);
            }
          }
        }
        if (this.settings.enabled !== false) {
          this.setupBackgroundPersistence();
        }
        if (this.settings.hideOnLaunch && !window._atelierHideOnLaunchDone) {
          window._atelierHideOnLaunchDone = true;
          let shouldHide = true;
          try {
            const loginSettings = remote.app.getLoginItemSettings();
            shouldHide = loginSettings.wasOpenedAsHidden || loginSettings.wasOpenedAtLogin;
          } catch (e) {
          }
          if (shouldHide) {
            this.app.workspace.onLayoutReady(() => {
              setTimeout(() => this.hideWindows(), 500);
            });
          }
        }
      }
      setupTrayManager() {
        if (!Platform.isDesktop || !remote) return;
        try {
          const { TrayManager } = require_tray_manager();
          this.trayManager = new TrayManager(
            this.app,
            this.settings,
            this.getPluginAbsPath(),
            {
              onDailyNote: () => {
                this.showWindows();
                this.app.commands.executeCommandById("daily-notes");
              },
              onOpen: () => this.showWindows(),
              onToggle: () => this.toggleWindows(false),
              onClose: () => {
                this.teardownBackgroundPersistence();
                const vaultWindows = this.getWindows();
                const allWindows = remote.BrowserWindow.getAllWindows();
                if (allWindows.length === vaultWindows.length) {
                  remote.app.quit();
                } else {
                  vaultWindows.forEach((win) => win.destroy());
                }
              }
            }
          );
        } catch (e) {
          console.error("Atelier: Failed to initialize TrayManager", e);
        }
      }
      async unload() {
        if (!Platform.isDesktop) return;
        this.teardownBackgroundPersistence();
        if (this.trayManager) {
          this.trayManager.destroyTray();
        }
        window._atelierTray = null;
      }
      setupBackgroundPersistence() {
        if (!Platform.isDesktop || !remote) return;
        this.teardownBackgroundPersistence();
        const win = getElectronWindow();
        if (!win) return;
        const self = this;
        this._layoutChangeRef = this.app.workspace.on("layout-change", () => {
          const workspace = self.app.workspace;
          let rootLeaves = [];
          workspace.iterateAllLeaves((l) => {
            let p = l.parent;
            while (p) {
              if (p === workspace.rootSplit) {
                rootLeaves.push(l);
                break;
              }
              p = p.parent;
            }
          });
          if (rootLeaves.length === 0 || rootLeaves.length === 1 && rootLeaves[0].view.getViewType() === "empty") {
            self.hideWindows();
          }
        });
        this.interceptWindowClose();
        this._beforeQuitHandler = () => {
          this.isAppQuitting = true;
        };
        remote.app.on("before-quit", this._beforeQuitHandler);
        if (process.platform === "darwin") {
          this._activateHandler = () => this.showWindows();
          remote.app.on("activate", this._activateHandler);
          this._openUrlHandler = (event) => {
            this.showWindows();
          };
          remote.app.on("open-url", this._openUrlHandler);
        }
      }
      teardownBackgroundPersistence() {
        if (Platform.isDesktop && remote) {
          if (this._beforeQuitHandler) {
            remote.app.removeListener("before-quit", this._beforeQuitHandler);
            this._beforeQuitHandler = null;
          }
          if (this._activateHandler) {
            remote.app.removeListener("activate", this._activateHandler);
            this._activateHandler = null;
          }
          if (this._openUrlHandler) {
            remote.app.removeListener("open-url", this._openUrlHandler);
            this._openUrlHandler = null;
          }
        }
        if (this._layoutChangeRef) {
          this.app.workspace.offref(this._layoutChangeRef);
          this._layoutChangeRef = null;
        }
        this.allowWindowClose();
      }
      getWindows() {
        return [...this.vaultWindows];
      }
      observeWindows() {
        if (!Platform.isDesktop || !remote) return;
        const onWindowCreation = (win) => {
          this.vaultWindows.add(win);
          win.on("close", () => {
            if (win !== remote.getCurrentWindow()) this.vaultWindows.delete(win);
          });
          win.on("focus", () => {
            if (!win.isVisible()) win.show();
          });
          if (win.isMaximized()) this.maximizedWindows.add(win);
          win.on("maximize", () => this.maximizedWindows.add(win));
          win.on("unmaximize", () => this.maximizedWindows.delete(win));
        };
        onWindowCreation(remote.getCurrentWindow());
        remote.getCurrentWindow().webContents.on("did-create-window", onWindowCreation);
      }
      showWindows() {
        this.getWindows().forEach((win) => {
          if (this.maximizedWindows.has(win)) {
            win.maximize();
            win.focus();
          } else {
            win.show();
          }
        });
      }
      hideWindows() {
        this.getWindows().forEach((win) => {
          if (win.isFocused()) win.blur();
          win.hide();
        });
      }
      toggleWindows(checkForFocus = true) {
        const openWindows = this.getWindows().some((win) => {
          return (!checkForFocus || win.isFocused()) && win.isVisible();
        });
        if (openWindows) {
          this.hideWindows();
        } else {
          this.showWindows();
        }
      }
      interceptWindowClose() {
        if (!Platform.isDesktop || !remote) return;
        window.addEventListener("beforeunload", this.handleBeforeUnload, true);
        const win = getElectronWindow();
        if (win) win.on("close", this.handleWindowClose);
      }
      allowWindowClose() {
        window.removeEventListener("beforeunload", this.handleBeforeUnload, true);
        const win = getElectronWindow();
        if (win) win.removeListener("close", this.handleWindowClose);
      }
    };
    var SystemTraySettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settings = this.plugin.settings.systemTray;
      }
      getFeature() {
        return this.plugin.features.find((f) => f instanceof SystemTrayFeature2);
      }
      async save() {
        this.plugin.settings.systemTray = this.settings;
        await this.plugin.saveSettings();
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "System Tray" });
        const desc = containerEl.createEl("p", {
          text: "Keeps Obsidian running silently in the background when you close the main window. Instead of quitting, Obsidian hides to the system tray so your notes and sync tasks remain active. ",
          cls: "setting-item-description"
        });
        desc.createEl("a", {
          text: "View System Tray Manual",
          href: "https://stnd.build/3-archives/obsidian-plugin#9-system-tray"
        });
        if (!Platform.isDesktop) {
          containerEl.createEl("p", {
            text: "System tray features are only available on desktop (Windows, macOS, Linux).",
            cls: "mod-warning"
          });
          return;
        }
        new Setting(containerEl).setName("System Tray").setDesc(descWithLinks(
          "Intercept the window close event and minimize Obsidian to the system tray instead of quitting. A tray icon lets you restore or fully quit at any time. \xA7 for platform-specific behavior.",
          [{ text: "See System Tray guide", href: "https://stnd.build/3-archives/obsidian-plugin#9-system-tray" }]
        )).addToggle(
          (toggle) => toggle.setValue(this.settings.enabled !== false).onChange(async (v) => {
            this.settings.enabled = v;
            await this.save();
            const feature = this.getFeature();
            if (v) {
              feature.setupTrayManager();
              if (feature.trayManager) {
                try {
                  feature.trayManager.createTrayIcon();
                } catch (e) {
                }
              }
              feature.setupBackgroundPersistence();
            } else {
              feature.teardownBackgroundPersistence();
              if (feature.trayManager) feature.trayManager.destroyTray();
            }
          })
        );
        new Setting(containerEl).setName("Hide on launch").setDesc(descWithLinks(
          "Launch Obsidian directly to the tray without showing the main window. \xA7 for the login item setup guide.",
          [{ text: "See startup guide", href: "https://stnd.build/3-archives/obsidian-plugin#9-system-tray" }]
        )).addToggle(
          (toggle) => toggle.setValue(this.settings.hideOnLaunch || false).onChange(async (v) => {
            this.settings.hideOnLaunch = v;
            await this.save();
          })
        );
      }
    };
    module2.exports = { SystemTrayFeature: SystemTrayFeature2, SystemTraySettingTab: SystemTraySettingTab2 };
  }
});

// src/ui/folder-suggest.js
var require_folder_suggest = __commonJS({
  "src/ui/folder-suggest.js"(exports2, module2) {
    "use strict";
    var { AbstractInputSuggest, TFolder } = require("obsidian");
    var FolderSuggest = class extends AbstractInputSuggest {
      constructor(app, inputEl, options = {}) {
        super(app, inputEl);
        this.app = app;
        this.inputEl = inputEl;
        this.multiselect = !!options.multiselect;
      }
      getSuggestions(query) {
        let folderQuery = query;
        if (this.multiselect) {
          const parts = query.split(",");
          folderQuery = parts[parts.length - 1];
        }
        const searchVal = folderQuery.trim().toLowerCase();
        const folders = [];
        const files = this.app.vault.getAllLoadedFiles();
        for (const file of files) {
          if (file instanceof TFolder && file.path !== "/" && file.path.toLowerCase().includes(searchVal)) {
            folders.push(file.path);
          }
        }
        return folders.sort().slice(0, 100);
      }
      renderSuggestion(value, el) {
        el.setText(value);
      }
      selectSuggestion(value) {
        if (this.multiselect) {
          const parts = this.inputEl.value.split(",");
          parts[parts.length - 1] = " " + value;
          this.inputEl.value = parts.join(",").trim();
        } else {
          this.inputEl.value = value;
        }
        this.inputEl.dispatchEvent(new Event("input"));
      }
    };
    module2.exports = { FolderSuggest };
  }
});

// src/features/media-manager/index.js
var require_media_manager = __commonJS({
  "src/features/media-manager/index.js"(exports2, module2) {
    "use strict";
    var { TFile, PluginSettingTab: PluginSettingTab2, Setting, Notice, TextComponent, ButtonComponent, Platform } = require("obsidian");
    var { descWithLinks } = require_constants();
    var VaultAuditFeature = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!this.plugin.settings.mediaManager) {
          this.plugin.settings.mediaManager = {
            enableSmartRename: true,
            onlyOnPasteOrDrop: true,
            enableOnMobile: false,
            aggressiveLinkFix: false,
            mediaFolder: "Kernel/attachments",
            timestampFormat: "YYMMDD_HHmm",
            timestampRegex: "^\\d{6}_\\d{4}_",
            excludeFolders: []
          };
        }
        this.settings = this.plugin.settings.mediaManager;
        if (this.settings.onlyOnPasteOrDrop === void 0) {
          this.settings.onlyOnPasteOrDrop = true;
        }
        if (this.settings.enableOnMobile === void 0) {
          this.settings.enableOnMobile = false;
        }
        if (this.settings.aggressiveLinkFix === void 0) {
          this.settings.aggressiveLinkFix = false;
        }
        this.plugin.vaultAudit = this;
        this.lastPasteOrDropTime = 0;
      }
      async load() {
        this.plugin.registerEvent(
          this.app.workspace.on("editor-paste", () => {
            this.lastPasteOrDropTime = Date.now();
          })
        );
        this.plugin.registerEvent(
          this.app.workspace.on("editor-drop", () => {
            this.lastPasteOrDropTime = Date.now();
          })
        );
        this.plugin.registerEvent(
          this.app.vault.on("create", (file) => {
            if (file instanceof TFile) {
              this.handleNewFile(file);
            }
          })
        );
      }
      async handleNewFile(file) {
        if (!this.settings.enableSmartRename) return;
        if (Platform.isMobile && !this.settings.enableOnMobile) {
          return;
        }
        if (!this.isMediaFile(file)) return;
        if (this.settings.onlyOnPasteOrDrop) {
          const elapsed = Date.now() - (this.lastPasteOrDropTime || 0);
          if (elapsed > 4e3) {
            return;
          }
        }
        if (this.settings.excludeFolders) {
          let excludeList = [];
          if (Array.isArray(this.settings.excludeFolders)) {
            excludeList = this.settings.excludeFolders;
          } else if (typeof this.settings.excludeFolders === "string") {
            excludeList = this.settings.excludeFolders.split(",");
          }
          const normalizedList = excludeList.map((f) => String(f).trim().replace(/^\/+/, "").replace(/\/+$/, "")).filter((f) => f.length > 0);
          const isExcluded = normalizedList.some((folder) => {
            return file.path.startsWith(folder + "/");
          });
          if (isExcluded) {
            console.log(`[Standard] M\xE9dia ignor\xE9 car dans un dossier exclu : ${file.path}`);
            return;
          }
        }
        setTimeout(async () => {
          const currentFile = this.app.vault.getAbstractFileByPath(file.path);
          if (!currentFile || !(currentFile instanceof TFile)) return;
          await this.processMediaRenameAndMove(currentFile);
        }, 1500);
      }
      isMediaFile(file) {
        const ext = file.extension.toLowerCase();
        const mediaExtensions = [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "webp",
          "svg",
          "avif",
          "bmp",
          "mp4",
          "webm",
          "mov",
          "ogv",
          "mp3",
          "wav",
          "m4a",
          "ogg",
          "flac",
          "pdf"
        ];
        return mediaExtensions.includes(ext);
      }
      hasTimestamp(filename) {
        if (this.settings && this.settings.timestampRegex) {
          try {
            const userRegex = new RegExp(this.settings.timestampRegex);
            if (userRegex.test(filename)) return true;
          } catch (e) {
            console.error("[Standard] Invalid timestampRegex:", e);
          }
        }
        const patterns = [
          /^\d{6}_\d{4}_/,
          // YYMMDD_HHmm_ (ex: 260619_0929_)
          /^\d{4}_\d{4}_/,
          // YYYY_MMDD_ (ex: 2019_0310_)
          /^\d{4}_\d{2}_\d{2}_/,
          // YYYY_MM_DD_ (ex: 2019_03_10_)
          /^\d{4}-\d{2}-\d{2}/,
          // YYYY-MM-DD (ex: 2019-03-10)
          /^\d{6}\s*-\s*/,
          // YYMMDD - (ex: 240221 - )
          /^\d{8}\s*-\s*/,
          // YYYYMMDD - (ex: 20240221 - )
          /^\d{6}_/,
          // YYMMDD_ (ex: 240309_)
          /^\d{8}_/,
          // YYYYMMDD_ (ex: 20240309_)
          /^\d{6}-\d{6}/,
          // YYMMDD-HHMMSS
          /^\d{13}/,
          // Milliseconds timestamp (ex: 1552472446693)
          /^(?:mvimg|img|screenshot|received|lrm_export)[-_\s]?\d+/i
          // Common photo/screenshot prefixes followed by numbers
        ];
        return patterns.some((pattern) => pattern.test(filename));
      }
      async processMediaRenameAndMove(file) {
        const targetFolder = this.settings.mediaFolder || "Kernel/attachments";
        const alreadyTimestamped = this.hasTimestamp(file.name);
        const isInTargetFolder = file.parent?.path === targetFolder;
        if (alreadyTimestamped && isInTargetFolder) {
          return;
        }
        const folderExists = this.app.vault.getAbstractFileByPath(targetFolder);
        if (!folderExists) {
          await this.app.vault.createFolder(targetFolder);
        }
        const oldName = file.name;
        let newName = file.name;
        if (!alreadyTimestamped) {
          const timestamp = this.getTimestamp(this.settings.timestampFormat);
          newName = `${timestamp}_${file.name}`;
        }
        const ext = file.extension;
        const baseName = newName.substring(0, newName.length - ext.length - 1);
        const uniquePath = await this.getUniquePath(targetFolder, baseName, ext);
        try {
          await this.app.fileManager.renameFile(file, uniquePath);
          new Notice(`Managed media: ${file.name} -> ${uniquePath.split("/").pop()}`);
          if (this.settings.aggressiveLinkFix) {
            setTimeout(async () => {
              await this.fixUnresolvedLinksForRename(oldName, uniquePath);
            }, 1e3);
          }
        } catch (err) {
          console.error("[Standard] \xC9chec du renommage/d\xE9placement de pi\xE8ce jointe:", err);
          new Notice("Error managing media");
        }
      }
      getTimestamp(format) {
        const now = /* @__PURE__ */ new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const hh = String(now.getHours()).padStart(2, "0");
        const min = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        if (format === "YYMMDD_HHmm") {
          return `${yy}${mm}${dd}_${hh}${min}`;
        } else if (format === "YYYYMMDDHHmmss") {
          return `${now.getFullYear()}${mm}${dd}${hh}${min}${ss}`;
        } else if (format === "ms") {
          return String(now.getTime());
        }
        return `${yy}${mm}${dd}_${hh}${min}`;
      }
      async getUniquePath(folder, baseName, ext) {
        let targetPath = `${folder}/${baseName}.${ext}`;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(targetPath)) {
          targetPath = `${folder}/${baseName}_${counter}.${ext}`;
          counter++;
        }
        return targetPath;
      }
      // ─── Logique de l'Auditeur du Coffre ───────────────────────────────────────
      async performAudit() {
        const notes = this.app.vault.getMarkdownFiles();
        const allFiles = this.app.vault.getFiles();
        const brokenEmbeds = [];
        const brokenLinks = [];
        const referencedPaths = /* @__PURE__ */ new Set();
        let noteIndex = 0;
        for (const note of notes) {
          noteIndex++;
          if (noteIndex % 100 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          const cache = this.app.metadataCache.getFileCache(note);
          if (!cache) continue;
          if (cache.embeds) {
            for (const embed of cache.embeds) {
              const dest = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
              if (dest) {
                referencedPaths.add(dest.path);
              } else {
                if (/^https?:\/\//i.test(embed.link)) continue;
                const isMedia = this.isMediaLink(embed.link);
                brokenEmbeds.push({
                  file: note,
                  link: embed.link,
                  original: embed.original,
                  isMedia,
                  line: embed.position?.start?.line ?? 0,
                  startOffset: embed.position?.start?.offset ?? 0,
                  endOffset: embed.position?.end?.offset ?? 0
                });
              }
            }
          }
          if (cache.links) {
            for (const link of cache.links) {
              const dest = this.app.metadataCache.getFirstLinkpathDest(link.link, note.path);
              if (dest) {
                referencedPaths.add(dest.path);
              } else {
                if (/^https?:\/\//i.test(link.link)) continue;
                brokenLinks.push({
                  file: note,
                  link: link.link,
                  original: link.original,
                  line: link.position?.start?.line ?? 0,
                  startOffset: link.position?.start?.offset ?? 0,
                  endOffset: link.position?.end?.offset ?? 0
                });
              }
            }
          }
        }
        let entryIndex = 0;
        for (const [sourcePath, links] of Object.entries(this.app.metadataCache.resolvedLinks)) {
          entryIndex++;
          if (entryIndex % 500 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          for (const destPath of Object.keys(links)) {
            referencedPaths.add(destPath);
          }
        }
        const orphanedMedia = [];
        let fileIndex = 0;
        for (const file of allFiles) {
          fileIndex++;
          if (fileIndex % 1e3 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          if (this.isMediaFile(file)) {
            if (!referencedPaths.has(file.path)) {
              orphanedMedia.push(file);
            }
          }
        }
        return {
          brokenEmbeds,
          brokenLinks,
          orphanedMedia
        };
      }
      isMediaLink(linkPath) {
        const ext = (linkPath.split(".").pop() || "").toLowerCase();
        const mediaExtensions = [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "webp",
          "svg",
          "avif",
          "bmp",
          "mp4",
          "webm",
          "mov",
          "ogv",
          "mp3",
          "wav",
          "m4a",
          "ogg",
          "flac",
          "pdf"
        ];
        return mediaExtensions.includes(ext);
      }
      // ─── Actions de réparation ────────────────────────────────────────────────
      // Chercher des fichiers candidats ayant le même nom de fichier dans le coffre
      async findCandidates(missingLink) {
        const allFiles = this.app.vault.getFiles();
        const cleanLink = missingLink.split("/").pop().toLowerCase();
        return allFiles.filter((file) => {
          return file.name.toLowerCase() === cleanLink;
        });
      }
      async resolveBrokenEmbed(item, candidatePath) {
        const file = item.file;
        const content = await this.app.vault.read(file);
        const original = item.original;
        const candidateFile = this.app.vault.getAbstractFileByPath(candidatePath);
        if (!candidateFile) return false;
        const newLink = `![[${candidateFile.path}]]`;
        if (item.startOffset !== void 0 && item.endOffset !== void 0) {
          const before = content.substring(0, item.startOffset);
          const after = content.substring(item.endOffset);
          await this.app.vault.modify(file, before + newLink + after);
          return true;
        }
        const newContent = content.replace(original, newLink);
        await this.app.vault.modify(file, newContent);
        return true;
      }
      async removeBrokenReference(item) {
        const file = item.file;
        const content = await this.app.vault.read(file);
        const original = item.original;
        if (item.startOffset !== void 0 && item.endOffset !== void 0) {
          const before = content.substring(0, item.startOffset);
          const after = content.substring(item.endOffset);
          await this.app.vault.modify(file, before + after);
          return true;
        }
        const newContent = content.replace(original, "");
        await this.app.vault.modify(file, newContent);
        return true;
      }
      async createMissingNote(item) {
        const linkPath = item.link;
        const activeFile = item.file;
        let notePath = linkPath;
        if (!notePath.endsWith(".md")) {
          notePath += ".md";
        }
        try {
          const folderPath = notePath.includes("/") ? notePath.substring(0, notePath.lastIndexOf("/")) : "";
          if (folderPath) {
            const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
            if (!folderExists) {
              await this.app.vault.createFolder(folderPath);
            }
          }
          await this.app.vault.create(
            notePath,
            `# ${linkPath.split("/").pop()}

Note cr\xE9\xE9e automatiquement pour r\xE9soudre un lien bris\xE9 depuis [[${activeFile.basename}]].
`
          );
          return true;
        } catch (err) {
          console.error("[Standard] \xC9chec de la cr\xE9ation de la note manquante:", err);
          return false;
        }
      }
      async removeBrokenLink(item) {
        const file = item.file;
        const content = await this.app.vault.read(file);
        const original = item.original;
        let plainText = item.link;
        if (original.includes("|")) {
          const match = original.match(/\|([^\]]+)\]\]/);
          if (match) plainText = match[1];
        } else {
          const match = original.match(/\[\[([^\]]+)\]\]/);
          if (match) plainText = match[1];
        }
        if (item.startOffset !== void 0 && item.endOffset !== void 0) {
          const before = content.substring(0, item.startOffset);
          const after = content.substring(item.endOffset);
          await this.app.vault.modify(file, before + plainText + after);
          return true;
        }
        const newContent = content.replace(original, plainText);
        await this.app.vault.modify(file, newContent);
        return true;
      }
      async deleteOrphan(file) {
        if (!(file instanceof TFile)) return false;
        await this.app.vault.delete(file);
        return true;
      }
      async fixDoubleTimestamps() {
        const audit = await this.performAudit();
        const { brokenEmbeds, orphanedMedia } = audit;
        let resolvedCount = 0;
        const brokenMap = /* @__PURE__ */ new Map();
        for (const item of brokenEmbeds) {
          const fileName = item.link.split("/").pop().toLowerCase();
          brokenMap.set(fileName, item);
        }
        for (const orphan of orphanedMedia) {
          const match = orphan.name.match(/^(\d{6}_\d{4}_)(.*)/);
          if (!match) continue;
          const targetName = match[2];
          const targetNameLower = targetName.toLowerCase();
          if (brokenMap.has(targetNameLower)) {
            const targetPath = `${orphan.parent.path}/${targetName}`;
            try {
              await this.app.fileManager.renameFile(orphan, targetPath);
              resolvedCount++;
            } catch (err) {
              console.error(`[Standard] \xC9chec du renommage d'horodatage pour ${orphan.name}:`, err);
            }
          }
        }
        return resolvedCount;
      }
      async fixUnresolvedLinksForRename(oldName, newPath) {
        const newName = newPath.split("/").pop();
        const unresolved = this.app.metadataCache.unresolvedLinks;
        for (const [sourcePath, links] of Object.entries(unresolved)) {
          let matchKey = null;
          for (const link of Object.keys(links)) {
            const linkClean = link.split("/").pop();
            if (linkClean === oldName) {
              matchKey = link;
              break;
            }
          }
          if (matchKey) {
            const noteFile = this.app.vault.getAbstractFileByPath(sourcePath);
            if (noteFile && noteFile instanceof TFile) {
              console.log(`[Standard] R\xE9paration automatique du lien vers ${oldName} dans ${sourcePath}`);
              let content = await this.app.vault.read(noteFile);
              const escapedLink = matchKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
              const wikiRegex = new RegExp(`\\[\\[(${escapedLink})(\\|[^\\]]+)?\\]\\]`, "g");
              content = content.replace(wikiRegex, (match, p1, p2) => {
                return `[[${newName}${p2 || ""}]]`;
              });
              const urlEncodedLink = encodeURIComponent(matchKey).replace(/%2F/g, "/");
              const escapedUrlLink = urlEncodedLink.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
              const mdRegex = new RegExp(`\\[([^\\]]*)\\]\\((${escapedLink}|${escapedUrlLink})\\)`, "g");
              content = content.replace(mdRegex, (match, p1, p2) => {
                const encodedNewName = encodeURIComponent(newName).replace(/%2F/g, "/");
                return `[${p1}](${encodedNewName})`;
              });
              await this.app.vault.modify(noteFile, content);
            }
          }
        }
      }
    };
    var MediaManagerSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.mediaManager) {
          this.plugin.settings.mediaManager = {
            enableSmartRename: true,
            onlyOnPasteOrDrop: true,
            enableOnMobile: false,
            aggressiveLinkFix: false,
            mediaFolder: "Kernel/attachments",
            timestampFormat: "YYMMDD_HHmm",
            timestampRegex: "^\\d{6}_\\d{4}_",
            excludeFolders: []
          };
        }
        this.settings = this.plugin.settings.mediaManager;
        if (this.settings.onlyOnPasteOrDrop === void 0) {
          this.settings.onlyOnPasteOrDrop = true;
        }
        if (this.settings.enableOnMobile === void 0) {
          this.settings.enableOnMobile = false;
        }
        if (this.settings.aggressiveLinkFix === void 0) {
          this.settings.aggressiveLinkFix = false;
        }
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Media Manager" });
        const desc = containerEl.createEl("p", {
          text: "Automatically renames and moves pasted or dropped media assets to keep your vault organized. ",
          cls: "setting-item-description"
        });
        desc.createEl("a", {
          text: "View Media Manager Manual",
          href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager"
        });
        new Setting(containerEl).setName("Smart rename attachments").setDesc(descWithLinks(
          "Intercepts newly pasted or dropped media, generates a unique timestamp prefix, and moves them to the configured folder. \xA7 for the naming format.",
          [{ text: "See Media Manager guide", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
        )).addToggle(
          (toggle) => toggle.setValue(this.settings.enableSmartRename || false).onChange(async (value) => {
            this.settings.enableSmartRename = value;
            await this.plugin.saveSettings();
          })
        );
        new Setting(containerEl).setName("Only on paste or drop").setDesc("Only intercept media when actively pasted or dropped into an open note editor. Prevents conflicts with Obsidian Sync and bulk note imports.").addToggle(
          (toggle) => toggle.setValue(this.settings.onlyOnPasteOrDrop ?? true).onChange(async (value) => {
            this.settings.onlyOnPasteOrDrop = value;
            await this.plugin.saveSettings();
          })
        );
        new Setting(containerEl).setName("Enable on mobile devices").setDesc("Allow auto-renaming attachments on mobile. Keep OFF to prevent Obsidian Sync from generating file collisions and broken links on mobile.").addToggle(
          (toggle) => toggle.setValue(this.settings.enableOnMobile || false).onChange(async (value) => {
            this.settings.enableOnMobile = value;
            await this.plugin.saveSettings();
          })
        );
        new Setting(containerEl).setName("Aggressive link repair").setDesc("Scans unresolved links and rewrites note files following a rename. Obsidian natively updates links on rename; keep disabled unless troubleshooting external link issues.").addToggle(
          (toggle) => toggle.setValue(this.settings.aggressiveLinkFix || false).onChange(async (value) => {
            this.settings.aggressiveLinkFix = value;
            await this.plugin.saveSettings();
          })
        );
        new Setting(containerEl).setName("Storage folder").setDesc(descWithLinks(
          "Vault folder where all managed media files are moved after rename. \xA7 for recommended folder structures.",
          [{ text: "View setup guide", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
        )).addText((text) => {
          text.setPlaceholder("Kernel/attachments").setValue(this.settings.mediaFolder || "Kernel/attachments").onChange(async (value) => {
            this.settings.mediaFolder = value.trim();
            await this.plugin.saveSettings();
          });
          const { FolderSuggest } = require_folder_suggest();
          new FolderSuggest(this.app, text.inputEl);
        });
        const excludesSection = containerEl.createEl("div");
        excludesSection.style.cssText = "background: var(--background-secondary); border: 1px solid var(--background-modifier-border);border-radius: 10px; padding: 16px 20px 8px; margin: 16px 0;";
        excludesSection.createEl("h3", { text: "Excluded folders" }).style.cssText = "margin: 0 0 6px; font-size: var(--font-ui-medium);";
        excludesSection.createEl("p", {
          text: "Ignore new media created in these folders.",
          cls: "setting-item-description"
        }).style.marginBottom = "12px";
        let rawExcludes = this.settings.excludeFolders;
        if (typeof rawExcludes === "string") {
          this.settings.excludeFolders = rawExcludes.split(",").map((s) => s.trim()).filter(Boolean);
        } else if (!Array.isArray(this.settings.excludeFolders)) {
          this.settings.excludeFolders = [];
        }
        const excludes = this.settings.excludeFolders;
        const excludesListContainer = excludesSection.createEl("div");
        excludesListContainer.style.marginBottom = "8px";
        const renderExcludeRow = (folderPath, idx) => {
          const rowEl = excludesListContainer.createEl("div");
          rowEl.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;";
          const textComp = new TextComponent(rowEl);
          textComp.setPlaceholder("e.g., Archive");
          textComp.setValue(folderPath);
          textComp.inputEl.style.flex = "1";
          textComp.onChange(async (val) => {
            excludes[idx] = val.trim();
            await this.plugin.saveSettings();
          });
          const { FolderSuggest } = require_folder_suggest();
          new FolderSuggest(this.app, textComp.inputEl);
          new ButtonComponent(rowEl).setIcon("trash").setWarning().setTooltip("Delete this exclusion").onClick(async () => {
            excludes.splice(idx, 1);
            await this.plugin.saveSettings();
            this.display();
          });
        };
        excludes.forEach((folderPath, idx) => {
          renderExcludeRow(folderPath, idx);
        });
        const addExclusionRow = excludesSection.createEl("div");
        addExclusionRow.style.cssText = "display:flex;justify-content:flex-end;padding-top:4px;border-top:1px solid var(--background-modifier-border);margin-top:4px;";
        new ButtonComponent(addExclusionRow).setButtonText("+ Add an exclusion").onClick(async () => {
          excludes.push("");
          await this.plugin.saveSettings();
          this.display();
        });
        new Setting(containerEl).setName("Timestamp format").setDesc(descWithLinks(
          "Format used to prefix media filenames. \xA7 for a comparison of all available formats.",
          [{ text: "See timestamp formats", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
        )).addDropdown(
          (dropdown) => dropdown.addOption("YYMMDD_HHmm", "YYMMDD_HHmm (e.g., 260619_0904)").addOption("YYYYMMDDHHmmss", "YYYYMMDDHHmmss").addOption("ms", "Timestamp milliseconds").setValue(this.settings.timestampFormat || "YYMMDD_HHmm").onChange(async (value) => {
            this.settings.timestampFormat = value;
            await this.plugin.saveSettings();
          })
        );
        new Setting(containerEl).setName("Timestamp exclusion regex").setDesc(descWithLinks(
          "A regular expression used to detect if a file already carries a timestamp, preventing double-prefixing. \xA7 for regex syntax help.",
          [{ text: "View exclusion docs", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
        )).addText(
          (text) => text.setPlaceholder("^\\d{6}_\\d{4}_").setValue(this.settings.timestampRegex || "^\\d{6}_\\d{4}_").onChange(async (value) => {
            this.settings.timestampRegex = value.trim();
            await this.plugin.saveSettings();
          })
        );
      }
    };
    module2.exports = { VaultAuditFeature, MediaManagerFeature: VaultAuditFeature, MediaManagerSettingTab: MediaManagerSettingTab2 };
  }
});

// src/features/eink/index.js
var require_eink = __commonJS({
  "src/features/eink/index.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab: PluginSettingTab2, Setting } = require("obsidian");
    var DEFAULT_SETTINGS = {
      mode: "auto",
      // auto, always, never
      interceptVolume: true,
      interceptPageKeys: true,
      interceptArrows: false,
      scrollDistance: 85,
      // Percentage of view height to scroll
      disableSmoothScroll: true,
      // Disable smooth scroll by default for e-ink
      volUpAction: "scroll-up",
      // Actions: scroll-up, history-back, none
      volDownAction: "scroll-down",
      // Actions: scroll-down, history-forward, none
      fontWeight: "normal",
      // light, normal, medium, bold
      fontFamily: "Fraunces",
      // Active font family for text, header and interface
      bookModeEnabled: true
    };
    var EinkFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        this.isActive = false;
        if (this.plugin.settings.eink && this.plugin.settings.eink.mode === void 0) {
          if (this.plugin.settings.eink.themeEnabled !== void 0) {
            this.plugin.settings.eink.mode = this.plugin.settings.eink.themeEnabled;
          } else if (this.plugin.settings.eink.enabled === false) {
            this.plugin.settings.eink.mode = "never";
          }
        }
        this.settings = {
          ...DEFAULT_SETTINGS,
          ...this.plugin.settings.eink || {}
        };
        this.plugin.settings.eink = this.settings;
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
      }
      async load() {
        this.updateState();
      }
      async unload() {
        this.disableEinkMode();
      }
      updateState() {
        const shouldEnable = this.settings.mode === "always" || this.settings.mode === "auto" && this.isEinkDevice();
        if (shouldEnable) {
          this.enableEinkMode();
        } else {
          this.disableEinkMode();
        }
      }
      enableEinkMode() {
        if (!this.isActive) {
          this.registerEvents();
          this.isActive = true;
        }
        document.body.classList.add("stnd-eink-active");
        let fontValue = this.settings.fontFamily || "Fraunces";
        if (fontValue !== "var(--font-default)" && !fontValue.startsWith('"')) {
          fontValue = `"${fontValue}"`;
        }
        document.body.style.setProperty("--font-text", fontValue, "important");
        document.body.style.setProperty("--font-header", fontValue, "important");
        document.body.style.setProperty("--font-interface", fontValue, "important");
        if (this.settings.fontFamily === "Fraunces") {
          document.body.classList.add("garden_eink_font_face");
        } else {
          document.body.classList.remove("garden_eink_font_face");
        }
        if (this.settings.bookModeEnabled) {
          document.body.classList.add("garden_eink_book");
        } else {
          document.body.classList.remove("garden_eink_book");
        }
        document.body.classList.remove(
          "garden_eink_font_weight_light",
          "garden_eink_font_weight_normal",
          "garden_eink_font_weight_medium",
          "garden_eink_font_weight_bold"
        );
        document.body.classList.add(`garden_eink_font_weight_${this.settings.fontWeight || "normal"}`);
      }
      disableEinkMode() {
        if (this.isActive) {
          this.unregisterEvents();
          this.isActive = false;
        }
        document.body.classList.remove(
          "stnd-eink-active",
          "garden_eink_font_face",
          "garden_eink_book",
          "garden_eink_font_weight_light",
          "garden_eink_font_weight_normal",
          "garden_eink_font_weight_medium",
          "garden_eink_font_weight_bold"
        );
        document.body.style.removeProperty("--font-text");
        document.body.style.removeProperty("--font-header");
        document.body.style.removeProperty("--font-interface");
      }
      registerEvents() {
        this.unregisterEvents();
        window.addEventListener("keydown", this.handleKeyDown, { capture: true });
        window.addEventListener("keyup", this.handleKeyUp, { capture: true });
        console.log("Atelier: E-ink support enabled.");
      }
      unregisterEvents() {
        window.removeEventListener("keydown", this.handleKeyDown, { capture: true });
        window.removeEventListener("keyup", this.handleKeyUp, { capture: true });
        console.log("Atelier: E-ink support disabled.");
      }
      handleKeyDown(event) {
        if (!this.isActive) return;
        const key = event.key;
        const isVolumeKey = key === "VolumeUp" || key === "VolumeDown";
        const isPageKey = key === "PageUp" || key === "PageDown";
        const isArrowKey = key === "ArrowUp" || key === "ArrowDown";
        if (!isVolumeKey) {
          const activeEl = document.activeElement;
          const isEditing = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.contentEditable === "true" || activeEl.classList.contains("cm-content"));
          if (isEditing) return;
        }
        let action = null;
        if (isVolumeKey && this.settings.interceptVolume) {
          action = key === "VolumeUp" ? this.settings.volUpAction : this.settings.volDownAction;
        } else if (isPageKey && this.settings.interceptPageKeys) {
          action = key === "PageUp" ? this.settings.volUpAction : this.settings.volDownAction;
        } else if (isArrowKey && this.settings.interceptArrows) {
          action = key === "ArrowUp" ? this.settings.volUpAction : this.settings.volDownAction;
        }
        if (action && action !== "none") {
          event.preventDefault();
          event.stopPropagation();
          this.executeAction(action);
        }
      }
      handleKeyUp(event) {
        if (!this.isActive) return;
        const key = event.key;
        if ((key === "VolumeUp" || key === "VolumeDown") && this.settings.interceptVolume) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
      executeAction(action) {
        if (action === "scroll-up" || action === "scroll-down") {
          this.scrollActiveView(action === "scroll-up" ? -1 : 1);
        } else if (action === "history-back") {
          this.app.commands.executeCommandById("app:go-back");
        } else if (action === "history-forward") {
          this.app.commands.executeCommandById("app:go-forward");
        }
      }
      scrollActiveView(direction) {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf) return;
        const view = activeLeaf.view;
        if (!view) return;
        const container = view.containerEl;
        if (!container) return;
        const scroller = container.querySelector(".cm-scroller, .markdown-preview-view, .view-content");
        if (!scroller) return;
        const viewHeight = scroller.clientHeight || window.innerHeight;
        const scrollAmount = viewHeight * (this.settings.scrollDistance / 100);
        scroller.scrollBy({
          top: direction * scrollAmount,
          behavior: this.settings.disableSmoothScroll ? "auto" : "smooth"
        });
      }
      getDeviceModel() {
        const ua = navigator.userAgent;
        const match = ua.match(/\bAndroid\s+\d+;\s+([^;)]+)/);
        if (match && match[1]) {
          return match[1].split(" Build/")[0].trim();
        }
        return null;
      }
      isEinkDevice() {
        const obsidian = require("obsidian");
        if (!obsidian.Platform.isAndroidApp) return false;
        const ua = navigator.userAgent.toLowerCase();
        const model = (this.getDeviceModel() || "").toLowerCase();
        return ua.includes("onyx") || ua.includes("boox") || model.includes("note") || model.includes("nova") || model.includes("poke") || model.includes("leaf") || model.includes("page") || model.includes("palma") || model.includes("max") || ua.includes("eink") || ua.includes("ereader");
      }
    };
    var EinkSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.eink) {
          this.plugin.settings.eink = { ...DEFAULT_SETTINGS };
        }
        this.settings = this.plugin.settings.eink;
      }
      getFeature() {
        return this.plugin.features.find((f) => f instanceof EinkFeature2);
      }
      async save() {
        this.plugin.settings.eink = this.settings;
        await this.plugin.saveSettings();
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "E-ink / Boox Settings" });
        const feature = this.getFeature();
        if (!feature) {
          const noticeEl = containerEl.createEl("div", {
            cls: "callout"
          });
          noticeEl.dataset.callout = "warning";
          noticeEl.style.marginBottom = "20px";
          const titleEl = noticeEl.createEl("div", { cls: "callout-title" });
          titleEl.createEl("div", { cls: "callout-title-inner", text: "Restart / Reload Required" });
          const contentEl = noticeEl.createEl("div", { cls: "callout-content" });
          contentEl.createEl("p", {
            text: "Please reload the plugin or restart Obsidian to initialize the E-ink support features."
          });
          return;
        }
        const isEink = feature.isEinkDevice();
        const model = feature.getDeviceModel();
        if (isEink) {
          const calloutEl = containerEl.createEl("div", {
            cls: "callout"
          });
          calloutEl.dataset.callout = "info";
          calloutEl.style.marginBottom = "20px";
          const titleEl = calloutEl.createEl("div", {
            cls: "callout-title"
          });
          titleEl.createEl("div", {
            cls: "callout-title-inner",
            text: "E-ink Tablet Detected"
          });
          const contentEl = calloutEl.createEl("div", {
            cls: "callout-content"
          });
          contentEl.createEl("p", {
            text: `Model detected: ${model || "Onyx Boox"}. For optimal button navigation, configure your device's physical buttons to 'Volume' mode in Obsidian's optimization settings on your e-reader.`
          });
        } else {
          const infoEl = containerEl.createEl("p", {
            cls: "setting-item-description"
          });
          if (model) {
            infoEl.setText(`Current device: ${model} (Not identified as a specific E-ink device).`);
          } else {
            infoEl.setText("Current device: Desktop or standard web browser.");
          }
          infoEl.style.fontStyle = "italic";
          infoEl.style.marginBottom = "20px";
        }
        new Setting(containerEl).setName("Enable E-ink mode").setDesc("Apply E-ink high-contrast rendering, disable animations, and enable physical navigation button support.").addDropdown(
          (dropdown) => dropdown.addOption("auto", "Auto (on detected e-reader)").addOption("always", "Always active").addOption("never", "Disabled").setValue(this.settings.mode).onChange(async (value) => {
            this.settings.mode = value;
            await this.save();
            this.getFeature().updateState();
          })
        );
        containerEl.createEl("h3", { text: "Physical Buttons & Scrolling" });
        new Setting(containerEl).setName("Intercept volume keys").setDesc("Map Volume Up and Volume Down (recommended on Onyx Boox configured in volume button mode).").addToggle(
          (toggle) => toggle.setValue(this.settings.interceptVolume).onChange(async (value) => {
            this.settings.interceptVolume = value;
            await this.save();
          })
        );
        new Setting(containerEl).setName("Intercept page keys").setDesc("Map Page Up and Page Down.").addToggle(
          (toggle) => toggle.setValue(this.settings.interceptPageKeys).onChange(async (value) => {
            this.settings.interceptPageKeys = value;
            await this.save();
          })
        );
        new Setting(containerEl).setName("Intercept arrow keys").setDesc("Map ArrowUp and ArrowDown (only when not editing text).").addToggle(
          (toggle) => toggle.setValue(this.settings.interceptArrows).onChange(async (value) => {
            this.settings.interceptArrows = value;
            await this.save();
          })
        );
        new Setting(containerEl).setName("Prev / Volume Up action").setDesc("Action triggered when pressing the previous page or volume up key.").addDropdown(
          (dropdown) => dropdown.addOption("scroll-up", "Scroll Up").addOption("history-back", "Previous Note (History)").addOption("none", "None").setValue(this.settings.volUpAction).onChange(async (value) => {
            this.settings.volUpAction = value;
            await this.save();
          })
        );
        new Setting(containerEl).setName("Next / Volume Down action").setDesc("Action triggered when pressing the next page or volume down key.").addDropdown(
          (dropdown) => dropdown.addOption("scroll-down", "Scroll Down").addOption("history-forward", "Next Note (History)").addOption("none", "None").setValue(this.settings.volDownAction).onChange(async (value) => {
            this.settings.volDownAction = value;
            await this.save();
          })
        );
        new Setting(containerEl).setName("Scroll distance").setDesc("Percentage of the screen height to scroll per action.").addSlider(
          (slider) => slider.setLimits(10, 100, 5).setValue(this.settings.scrollDistance).setDynamicTooltip().onChange(async (value) => {
            this.settings.scrollDistance = value;
            await this.save();
          })
        );
        new Setting(containerEl).setName("Instant scroll").setDesc("Disable smooth scrolling transitions to eliminate ghosting and flickering on E-ink screens.").addToggle(
          (toggle) => toggle.setValue(this.settings.disableSmoothScroll).onChange(async (value) => {
            this.settings.disableSmoothScroll = value;
            await this.save();
          })
        );
        containerEl.createEl("h3", { text: "E-ink Typography & Layout" });
        new Setting(containerEl).setName("E-ink font family").setDesc("Choose the active font family for text, headers, and UI interface in E-ink mode.").addDropdown(
          (dropdown) => dropdown.addOption("Fraunces", "Fraunces (Serif)").addOption("Futura Now", "Futura Now (Geometric Sans)").addOption("MonoLisa", "MonoLisa (Monospace)").addOption("Atkinson Hyperlegible Next", "Atkinson Hyperlegible Next (Hyperlegible Sans)").addOption("Atkinson Hyperlegible Mono", "Atkinson Hyperlegible Mono (Hyperlegible Mono)").addOption("Berkeley Mono", "Berkeley Mono (Tech Monospace)").addOption("EB Garamond", "EB Garamond (Classic Serif)").addOption("Forrest", "Forrest (Warm Sans)").addOption("Helvetica Now", "Helvetica Now (Neo-Grotesque)").addOption("IBM Plex Sans", "IBM Plex Sans (Industrial Sans)").addOption("IBM Plex Serif", "IBM Plex Serif (Industrial Serif)").addOption("Inter", "Inter (Modern UI)").addOption("var(--font-default)", "System Default").setValue(this.settings.fontFamily || "Fraunces").onChange(async (value) => {
            this.settings.fontFamily = value;
            await this.save();
            this.getFeature().updateState();
          })
        );
        new Setting(containerEl).setName("Font weight").setDesc("Choose character weight for screen rendering.").addDropdown(
          (dropdown) => dropdown.addOption("light", "Light").addOption("normal", "Normal").addOption("medium", "Medium").addOption("bold", "Bold").setValue(this.settings.fontWeight).onChange(async (value) => {
            this.settings.fontWeight = value;
            await this.save();
            this.getFeature().updateState();
          })
        );
        new Setting(containerEl).setName("Book Mode").setDesc("Justify text and enable auto-hyphenation in reading view.").addToggle(
          (toggle) => toggle.setValue(this.settings.bookModeEnabled).onChange(async (value) => {
            this.settings.bookModeEnabled = value;
            await this.save();
            this.getFeature().updateState();
          })
        );
      }
    };
    module2.exports = { EinkFeature: EinkFeature2, EinkSettingTab: EinkSettingTab2 };
  }
});

// src/features/scroll-map/index.js
var require_scroll_map = __commonJS({
  "src/features/scroll-map/index.js"(exports2, module2) {
    "use strict";
    var { Plugin: Plugin2, MarkdownView, Setting, PluginSettingTab: PluginSettingTab2 } = require("obsidian");
    var { descWithLinks } = require_constants();
    var DEFAULT_SETTINGS = {
      position: "right",
      scrollbarWidth: 2,
      behavior: "map",
      opacity: 0.25
    };
    var ScrollMapFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.scrollMap)
          plugin.settings.scrollMap = { ...DEFAULT_SETTINGS };
        this.settings = plugin.settings.scrollMap;
        this.scrollIndicator = null;
        this.scrollMapContainer = null;
        this.currentScroller = null;
        this.onScrollHandler = null;
        this.currentLeaf = null;
        this.currentMode = null;
      }
      async load() {
        this.plugin.registerEvent(
          this.app.workspace.on(
            "active-leaf-change",
            this.handleActiveLeafChange.bind(this)
          )
        );
        this.plugin.registerEvent(
          this.app.workspace.on(
            "layout-change",
            this.handleLayoutChange.bind(this)
          )
        );
        this.plugin.registerEvent(
          this.app.workspace.on("resize", this.updateScrollMap.bind(this))
        );
        this.handleActiveLeafChange();
      }
      handleLayoutChange() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        const leaf = activeView?.leaf || null;
        const mode = activeView?.getMode?.() || null;
        if (leaf !== this.currentLeaf || mode !== this.currentMode) {
          this.handleActiveLeafChange();
        } else {
          this.updateScrollMap();
        }
      }
      async unload() {
        this.removeScrollMap();
        if (this.currentScroller && this.onScrollHandler) {
          this.currentScroller.removeEventListener("scroll", this.onScrollHandler);
        }
      }
      removeScrollMap() {
        const existing = document.getElementById("obsidian-scroll-map-container");
        if (existing) {
          existing.remove();
        }
        this.scrollMapContainer = null;
        this.scrollIndicator = null;
      }
      handleActiveLeafChange() {
        if (this.currentScroller && this.onScrollHandler) {
          this.currentScroller.removeEventListener("scroll", this.onScrollHandler);
          this.currentScroller = null;
        }
        this.removeScrollMap();
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
          this.currentLeaf = null;
          this.currentMode = null;
          return;
        }
        this.currentLeaf = activeView.leaf;
        this.currentMode = activeView.getMode?.() || null;
        setTimeout(() => {
          const mode = activeView.getMode?.();
          let scroller;
          if (mode === "preview") {
            scroller = activeView.containerEl.querySelector(".markdown-preview-view") || activeView.containerEl.querySelector(".markdown-preview-scroller");
          } else {
            const editorEl = activeView.editor?.containerEl || activeView.containerEl;
            scroller = editorEl.querySelector(".cm-scroller");
          }
          if (!scroller) {
            scroller = activeView.containerEl.querySelector(".cm-scroller") || activeView.containerEl.querySelector(".markdown-preview-view") || activeView.contentEl;
          }
          if (scroller) {
            this.currentScroller = scroller;
            this.onScrollHandler = () => {
              if (this._ticking) return;
              this._ticking = true;
              requestAnimationFrame(() => {
                this.updateScrollMap();
                this._ticking = false;
              });
            };
            this.currentScroller.addEventListener("scroll", this.onScrollHandler);
            const attemptUpdate = () => {
              if (scroller.scrollHeight === 0 && scroller.clientHeight === 0) {
                setTimeout(attemptUpdate, 500);
              } else {
                this.updateScrollMap();
              }
            };
            attemptUpdate();
          }
        }, 500);
      }
      updateScrollMap() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !this.currentScroller) {
          this.removeScrollMap();
          return;
        }
        const scroller = this.currentScroller;
        const containerEl = scroller.parentElement;
        const scrollHeight = scroller.scrollHeight;
        const clientHeight = scroller.clientHeight;
        const scrollTop = scroller.scrollTop;
        if (scrollHeight <= clientHeight) {
          this.removeScrollMap();
          return;
        }
        const scrollbarWidth = this.settings?.scrollbarWidth || DEFAULT_SETTINGS.scrollbarWidth;
        const position = this.settings?.position || DEFAULT_SETTINGS.position;
        const opacity = this.settings?.opacity || DEFAULT_SETTINGS.opacity;
        const behavior = this.settings?.behavior || DEFAULT_SETTINGS.behavior;
        if (!this.scrollMapContainer || !this.scrollMapContainer.parentElement) {
          this.removeScrollMap();
          this.scrollMapContainer = document.createElement("div");
          this.scrollMapContainer.id = "obsidian-scroll-map-container";
          this.scrollMapContainer.style.position = "absolute";
          this.scrollMapContainer.style.overflow = "hidden";
          this.scrollMapContainer.style.zIndex = "999";
          this.scrollMapContainer.style.backgroundColor = "transparent";
          containerEl.style.position = "relative";
          containerEl.appendChild(this.scrollMapContainer);
        }
        if (position === "right" || position === "left") {
          this.scrollMapContainer.style.width = `${scrollbarWidth}px`;
          this.scrollMapContainer.style.height = "100%";
          this.scrollMapContainer.style.top = "0";
          this.scrollMapContainer.style.bottom = "";
          if (position === "right") {
            this.scrollMapContainer.style.right = "0px";
            this.scrollMapContainer.style.left = "";
          } else {
            this.scrollMapContainer.style.left = "0px";
            this.scrollMapContainer.style.right = "";
          }
        } else {
          this.scrollMapContainer.style.height = `${scrollbarWidth}px`;
          this.scrollMapContainer.style.width = "100%";
          this.scrollMapContainer.style.left = "0";
          this.scrollMapContainer.style.right = "";
          if (position === "top") {
            this.scrollMapContainer.style.top = "0px";
            this.scrollMapContainer.style.bottom = "";
          } else {
            this.scrollMapContainer.style.bottom = "0px";
            this.scrollMapContainer.style.top = "";
          }
        }
        if (!this.scrollIndicator) {
          this.scrollIndicator = document.createElement("div");
          this.scrollIndicator.id = "obsidian-scroll-map-indicator";
          this.scrollIndicator.style.position = "absolute";
          this.scrollIndicator.style.backgroundColor = "var(--color-accent)";
          this.scrollMapContainer.appendChild(this.scrollIndicator);
        }
        this.scrollIndicator.style.opacity = opacity.toString();
        const progress = scrollTop / (scrollHeight - clientHeight) * 100;
        if (behavior === "growth") {
          if (position === "right" || position === "left") {
            this.scrollIndicator.style.width = "100%";
            this.scrollIndicator.style.height = `${progress}%`;
            this.scrollIndicator.style.top = "0";
            this.scrollIndicator.style.left = "0";
          } else {
            this.scrollIndicator.style.height = "100%";
            this.scrollIndicator.style.width = `${progress}%`;
            this.scrollIndicator.style.left = "0";
            this.scrollIndicator.style.top = "0";
          }
        } else {
          const indicatorSize = clientHeight / scrollHeight * 100;
          const indicatorPos = scrollTop / (scrollHeight - clientHeight) * (100 - indicatorSize);
          if (position === "right" || position === "left") {
            this.scrollIndicator.style.width = "100%";
            this.scrollIndicator.style.height = `${indicatorSize}%`;
            this.scrollIndicator.style.top = `${indicatorPos}%`;
            this.scrollIndicator.style.left = "0";
          } else {
            this.scrollIndicator.style.height = "100%";
            this.scrollIndicator.style.width = `${indicatorSize}%`;
            this.scrollIndicator.style.left = `${indicatorPos}%`;
            this.scrollIndicator.style.top = "0";
          }
        }
      }
    };
    var ScrollMapSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.scrollMap)
          this.plugin.settings.scrollMap = { ...DEFAULT_SETTINGS };
        this.settings = this.plugin.settings.scrollMap;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Scroll Map" });
        const desc = containerEl.createEl("p", {
          text: "Renders an interactive outline map next to the editor scrollbar for quick document navigation. ",
          cls: "setting-item-description"
        });
        desc.createEl("a", {
          text: "View Scroll Map Manual",
          href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map"
        });
        new Setting(containerEl).setName("Scroll map position").setDesc(descWithLinks("Where the scroll map indicator appears in the editor. \xA7 for layout tips.", [{ text: "See positioning guide", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }])).addDropdown(
          (dropdown) => dropdown.addOptions({
            right: "Right",
            left: "Left",
            top: "Top",
            bottom: "Bottom"
          }).setValue(this.settings.position || DEFAULT_SETTINGS.position).onChange(async (v) => {
            this.settings.position = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof ScrollMapFeature2).updateScrollMap();
          })
        );
        new Setting(containerEl).setName("Scrollbar width").setDesc(descWithLinks("Visual thickness of the scroll indicator in pixels (1\u201310). \xA7 for visual examples.", [{ text: "See scroll map docs", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }])).addSlider(
          (slider) => slider.setLimits(1, 10, 1).setValue(
            this.settings.scrollbarWidth || DEFAULT_SETTINGS.scrollbarWidth
          ).onChange(async (v) => {
            this.settings.scrollbarWidth = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof ScrollMapFeature2).updateScrollMap();
          })
        );
        new Setting(containerEl).setName("Opacity").setDesc(descWithLinks("Transparency of the indicator (0.1 = nearly invisible, 1 = fully opaque). \xA7 for recommended values.", [{ text: "See scroll map docs", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }])).addSlider(
          (slider) => slider.setLimits(0.1, 1, 0.1).setValue(this.settings.opacity || DEFAULT_SETTINGS.opacity).onChange(async (v) => {
            this.settings.opacity = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof ScrollMapFeature2).updateScrollMap();
          })
        );
        new Setting(containerEl).setName("Scroll map behavior").setDesc(descWithLinks("Map mode shows a positional indicator; Progress mode shows a reading completion gauge. \xA7 for a full comparison.", [{ text: "Compare behaviors", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }])).addDropdown(
          (dropdown) => dropdown.addOptions({
            map: "Map (positional)",
            growth: "Progress (progressive)"
          }).setValue(this.settings.behavior || DEFAULT_SETTINGS.behavior).onChange(async (v) => {
            this.settings.behavior = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof ScrollMapFeature2).updateScrollMap();
          })
        );
      }
    };
    module2.exports = { ScrollMapFeature: ScrollMapFeature2, ScrollMapSettingTab: ScrollMapSettingTab2 };
  }
});

// src/features/snippet-manager/index.js
var require_snippet_manager = __commonJS({
  "src/features/snippet-manager/index.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab: PluginSettingTab2, Setting, Notice, Platform } = require("obsidian");
    var { descWithLinks } = require_constants();
    var DEFAULT_SETTINGS = {
      enabled: true,
      // Notes whose frontmatter has this key become vault-wide stylesheets.
      globalKey: "snippet",
      // CSS loaded from named notes while the matching note is open.
      localKey: "snippets",
      alwaysUseCssClasses: false,
      // Folders to exclude from snippet scanning (ignore VCS and trash by default; Utopie is scanned for fonts on desktop)
      excludeFolders: [".trash", ".git", "node_modules"],
      // Compiled CSS of all global snippets, persisted so it can be injected
      // synchronously at startup — eliminates the flash of unstyled content while
      // the vault loads and files are (re-)read.
      globalCache: "",
      // Signature (paths + mtimes) of the snippet set that produced globalCache.
      // Lets the background rescan skip re-reading files that haven't changed.
      globalSignature: ""
    };
    var SnippetManagerFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.snippets)
          plugin.settings.snippets = { ...DEFAULT_SETTINGS };
        this.settings = plugin.settings.snippets;
        if (!Array.isArray(this.settings.excludeFolders)) {
          this.settings.excludeFolders = [".trash", ".git", "node_modules"];
        } else {
          this.settings.excludeFolders = this.settings.excludeFolders.filter(
            (f) => f !== "Utopie" && f !== "/Utopie"
          );
        }
        this.globalElement = null;
        this.noteElement = null;
        this.lastGlobalCss = null;
        this.lastLocalCss = null;
        this.rescanTimeout = null;
        this.saveTimeout = null;
      }
      getPluginDir() {
        return this.plugin.manifest?.dir || `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
      }
      isFileExcluded(file) {
        if (!file || !file.path) return true;
        let excludeList = this.settings.excludeFolders || ["Utopie"];
        if (typeof excludeList === "string") {
          excludeList = excludeList.split(",");
        }
        const normalizedList = excludeList.map((f) => String(f).trim().replace(/^\/+/, "").replace(/\/+$/, "")).filter((f) => f.length > 0);
        return normalizedList.some((folder) => {
          return file.path === folder || file.path.startsWith(folder + "/");
        });
      }
      async load() {
        this.globalElement = this.ensureStyle("stnd-global");
        this.noteElement = this.ensureStyle("stnd-note");
        if (this.settings.enabled) {
          this.loadCacheFromFile();
        }
        this.plugin.registerEvent(
          this.app.metadataCache.on("changed", (file) => {
            const active = this.app.workspace.getActiveFile();
            if (active) this.applyLocalForFile(active);
            this.scheduleGlobalRescan();
          })
        );
        this.plugin.registerEvent(
          this.app.vault.on("modify", (file) => {
            const active = this.app.workspace.getActiveFile();
            if (active) this.applyLocalForFile(active);
          })
        );
        this.plugin.registerEvent(
          this.app.workspace.on("file-open", (file) => {
            if (file) this.applyLocalForFile(file);
          })
        );
        const onReady = () => {
          const active = this.app.workspace.getActiveFile();
          if (active) this.applyLocalForFile(active);
          this.scheduleGlobalRescan(300);
        };
        if (this.app.workspace.layoutReady) {
          onReady();
        } else {
          this.app.workspace.onLayoutReady(onReady);
        }
      }
      getCachePath() {
        return `${this.getPluginDir()}/cache-global.css`;
      }
      async loadCacheFromFile() {
        const path = this.getCachePath();
        const adapter = this.app.vault.adapter;
        let css = "";
        try {
          if (await adapter.exists(path)) {
            css = await adapter.read(path);
          }
        } catch (e) {
          console.warn("[Standard] Failed to read snippet cache file:", e);
        }
        if (!css && this.settings.globalCache) {
          css = this.settings.globalCache;
        }
        if (css && this.globalElement) {
          const fontDir = `${this.getPluginDir()}/fonts`;
          const fontDirExists = await adapter.exists(fontDir);
          const resolvedCss = css.replace(
            /STND_FONT_URL:([\w.-]+)/g,
            (match, fileName) => {
              if (fontDirExists) {
                return adapter.getResourcePath(`${fontDir}/${fileName}`);
              }
              return "";
            }
          );
          this.globalElement.textContent = resolvedCss;
          this.lastGlobalCss = css;
          if (!this.settings.globalCache) {
            this.settings.globalCache = css;
            this.debouncedSave();
          }
        }
      }
      ensureStyle(id) {
        let el = document.getElementById(id);
        if (!el) {
          el = document.createElement("style");
          el.id = id;
          document.head.appendChild(el);
        }
        return el;
      }
      async unload() {
        if (this.rescanTimeout) clearTimeout(this.rescanTimeout);
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.globalElement?.remove();
        this.noteElement?.remove();
        this.globalElement = null;
        this.noteElement = null;
      }
      fileHasGlobalKey(frontmatter) {
        return Boolean(frontmatter && frontmatter[this.settings.globalKey]);
      }
      // ─── Global (vault-wide) snippets ─────────────────────────────────────────
      scheduleGlobalRescan(delay = 1e3) {
        if (this.rescanTimeout) clearTimeout(this.rescanTimeout);
        this.rescanTimeout = setTimeout(() => this.rescanGlobalSnippets(), delay);
      }
      async rescanGlobalSnippets() {
        if (!this.settings.enabled) {
          if (this.globalElement) this.globalElement.textContent = "";
          this.settings.globalSignature = "";
          return;
        }
        if (Platform.isMobile) {
          if (!this.lastGlobalCss) {
            await this.loadCacheFromFile();
          }
          return;
        }
        const files = this.app.vault.getMarkdownFiles();
        const globalFiles = files.filter((file) => {
          if (this.isFileExcluded(file)) return false;
          const meta = this.app.metadataCache.getFileCache(file);
          return this.fileHasGlobalKey(meta?.frontmatter);
        }).sort((a, b) => a.path.localeCompare(b.path));
        const signature = globalFiles.map((f) => `${f.path}:${f.stat?.mtime ?? 0}`).join("|");
        if (signature === this.settings.globalSignature && this.lastGlobalCss) return;
        let allCss = "";
        for (const file of globalFiles) {
          try {
            const css = await this.extractCssFromFile(file);
            if (css && css.trim()) {
              const processed = await this.offloadFonts(css);
              allCss += processed + "\n";
            }
          } catch (e) {
            console.warn(`[Atelier] Error reading global snippet ${file.path}:`, e);
          }
        }
        this.settings.globalSignature = signature;
        if (allCss !== this.lastGlobalCss || !this.settings.globalCache) {
          this.lastGlobalCss = allCss;
          this.settings.globalCache = allCss;
          const adapter = this.app.vault.adapter;
          const fontDir = `${this.getPluginDir()}/fonts`;
          const fontDirExists = await adapter.exists(fontDir);
          const resolvedCss = allCss.replace(
            /STND_FONT_URL:([\w.-]+)/g,
            (match, fileName) => {
              if (fontDirExists) {
                return adapter.getResourcePath(`${fontDir}/${fileName}`);
              }
              return "";
            }
          );
          if (this.globalElement) this.globalElement.textContent = resolvedCss;
          try {
            await this.app.vault.adapter.write(this.getCachePath(), allCss);
          } catch (e) {
            console.warn("[Standard] Failed to save snippet cache:", e);
          }
        }
        this.debouncedSave();
      }
      async offloadFonts(css) {
        if (Platform.isMobile) {
          return css;
        }
        if (!css.includes("data:font/")) {
          return css;
        }
        const fontDir = `${this.getPluginDir()}/fonts`;
        const adapter = this.app.vault.adapter;
        try {
          if (!await adapter.exists(fontDir)) {
            await adapter.mkdir(fontDir);
          }
        } catch (e) {
          console.error("[Standard] Failed to create font directory:", e);
          return css;
        }
        const dataUriRegex = /url\(['"]?data:(font\/[\w-]+);base64,([a-zA-Z0-9+/=]+)['"]?\)/gi;
        const matches = [...css.matchAll(dataUriRegex)];
        if (matches.length === 0) return css;
        const fontMap = /* @__PURE__ */ new Map();
        const fontDataMap = /* @__PURE__ */ new Map();
        for (const match of matches) {
          const [fullMatch, mimeType, base64Data] = match;
          if (!base64Data || base64Data.length < 100) continue;
          const extension = mimeType.split("/")[1] || "woff2";
          const hash = this.hashString(base64Data);
          const fileName = `font-${hash}.${extension}`;
          fontMap.set(fullMatch, fileName);
          if (!fontDataMap.has(fileName)) {
            fontDataMap.set(fileName, base64Data);
          }
        }
        let saved = 0;
        for (const [fileName, base64Data] of fontDataMap.entries()) {
          const filePath = `${fontDir}/${fileName}`;
          if (!await adapter.exists(filePath)) {
            try {
              const binaryString = atob(base64Data);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
              await adapter.writeBinary(filePath, bytes.buffer);
              saved++;
              if (saved % 10 === 0) await new Promise((r) => setTimeout(r, 0));
            } catch (e) {
              console.warn(`[Standard] Failed to save font ${fileName}:`, e);
            }
          }
        }
        if (saved > 0) console.log(`[Standard] Cached ${saved} new binary fonts.`);
        return css.replace(dataUriRegex, (match) => {
          const fileName = fontMap.get(match);
          return fileName ? `url("STND_FONT_URL:${fileName}")` : match;
        });
      }
      hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
        }
        return Math.abs(hash).toString(36);
      }
      debouncedSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.plugin.saveSettings(), 500);
      }
      // ─── Local (active-note) snippets ─────────────────────────────────────────
      updateLocalForFile(file) {
        const active = this.app.workspace.getActiveFile();
        if (active && active.path === file.path) this.applyLocalForFile(file);
      }
      applyLocalForFile(file) {
        const meta = this.app.metadataCache.getFileCache(file);
        this.updateLocalSnippets(meta?.frontmatter);
      }
      async updateLocalSnippets(frontmatter) {
        if (!this.settings.enabled || !frontmatter) {
          this.clearLocalSnippet();
          return;
        }
        let names = [];
        const keys = [this.settings.localKey];
        if (this.settings.alwaysUseCssClasses && this.settings.localKey !== "cssclasses") {
          keys.push("cssclasses");
        }
        for (const key of keys) {
          const prop = frontmatter[key];
          if (typeof prop === "string" && prop.trim()) {
            names.push(prop.trim());
          } else if (Array.isArray(prop)) {
            names = names.concat(
              prop.filter((s) => typeof s === "string").map((s) => s.trim())
            );
          }
        }
        names = [...new Set(names)].filter(Boolean);
        if (names.length === 0) {
          this.clearLocalSnippet();
          return;
        }
        const files = this.app.vault.getMarkdownFiles();
        let allCss = "";
        for (const name of names) {
          const file = files.find((f) => f.basename === name);
          if (file && !this.isFileExcluded(file)) {
            if (Platform.isMobile && file.stat?.size && file.stat.size > 500 * 1024) {
              console.warn(`[Standard] Snippet local ignor\xE9 sur mobile car trop volumineux : ${file.path}`);
              continue;
            }
            allCss += await this.extractCssFromFile(file) + "\n";
          }
        }
        if (allCss !== this.lastLocalCss) {
          this.lastLocalCss = allCss;
          if (this.noteElement)
            this.noteElement.textContent = allCss.trim() ? allCss : "";
        }
      }
      clearLocalSnippet() {
        this.lastLocalCss = null;
        if (this.noteElement) this.noteElement.textContent = "";
      }
      async extractCssFromFile(file) {
        try {
          const content = await this.app.vault.read(file);
          const regex = /```css\b.*?\n([\s\S]*?)```/gi;
          return [...content.matchAll(regex)].map((m) => m[1]).join("\n");
        } catch (e) {
          console.warn(`[Standard] Erreur lors de la lecture du snippet ${file.path}:`, e);
          return "";
        }
      }
    };
    var SnippetManagerSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.snippets)
          this.plugin.settings.snippets = { ...DEFAULT_SETTINGS };
        this.settings = this.plugin.settings.snippets;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Snippet Manager" });
        const desc = containerEl.createEl("p", {
          text: "Snippet Manager compiles and registers CSS stylesheets written directly inside your markdown notes. It parses CSS code blocks and hot-loads them in real time, bypassing Obsidian's hidden snippets directory. ",
          cls: "setting-item-description"
        });
        desc.createEl("a", {
          text: "View Snippet Manager Manual",
          href: "https://stnd.build/3-archives/obsidian-plugin#4-snippet-manager"
        });
        const enableSetting = new Setting(containerEl).setName("Enable snippets").setDesc(descWithLinks(
          "Master switch for compilation and injection of \xA7 into your workspace.",
          [{ text: "note-based CSS stylesheets", href: "https://stnd.build/3-archives/obsidian-plugin#4-snippet-manager" }]
        ));
        enableSetting.addToggle(
          (toggle) => toggle.setValue(this.settings.enabled).onChange(async (v) => {
            this.settings.enabled = v;
            await this.plugin.saveSettings();
            if (v) {
              const feature = this.getFeature();
              if (feature) {
                feature.lastGlobalCss = null;
                feature.settings.globalSignature = "";
                feature.rescanGlobalSnippets().then(() => {
                  new Notice("Garden: Snippets loaded \u2713");
                });
                const active = this.app.workspace.getActiveFile();
                if (active) feature.applyLocalForFile(active);
              }
            } else {
              this.refreshFeature();
              new Notice("Garden: Snippets disabled");
            }
          })
        );
        const globalKeySetting = new Setting(containerEl).setName("Global snippet key").setDesc(descWithLinks(
          "YAML key identifying notes that serve as vault-wide stylesheets (e.g. `snippet: true`). These styles are \xA7 to prevent a flash of unstyled content at startup.",
          [{ text: "cached locally", href: "https://stnd.build/3-archives/obsidian-plugin#4-snippet-manager" }]
        ));
        globalKeySetting.addText(
          (text) => text.setValue(this.settings.globalKey).onChange(async (v) => {
            this.settings.globalKey = v.trim() || "snippet";
            await this.plugin.saveSettings();
            this.refreshFeature();
          })
        );
        const localKeySetting = new Setting(containerEl).setName("Local snippet key").setDesc(descWithLinks(
          "YAML key listing note names whose CSS loads only while that note is active (e.g. `snippets: [layout-card]`). \xA7 for contextual style patterns.",
          [{ text: "See local snippets guide", href: "https://stnd.build/3-archives/obsidian-plugin#4-snippet-manager" }]
        ));
        localKeySetting.addText(
          (text) => text.setValue(this.settings.localKey).onChange(async (v) => {
            this.settings.localKey = v.trim() || "snippets";
            await this.plugin.saveSettings();
            this.refreshFeature();
          })
        );
        const cssClassesSetting = new Setting(containerEl).setName("Always use 'cssclasses'").setDesc(descWithLinks(
          "Scan the native Obsidian \xA7 property for matching note stylesheets to load contextually.",
          [{ text: "cssclasses", href: "https://stnd.build/3-archives/obsidian-plugin#4-snippet-manager" }]
        ));
        cssClassesSetting.addToggle(
          (toggle) => toggle.setValue(this.settings.alwaysUseCssClasses || false).onChange(async (v) => {
            this.settings.alwaysUseCssClasses = v;
            await this.plugin.saveSettings();
            this.refreshFeature();
          })
        );
        const excludeFoldersSetting = new Setting(containerEl).setName("Excluded folders").setDesc("Comma-separated list of folders to exclude from snippet scanning. Notes in `Utopie/packages/fonts` are scanned on desktop to import custom fonts.").addText(
          (text) => text.setPlaceholder(".trash, .git, node_modules").setValue(
            Array.isArray(this.settings.excludeFolders) ? this.settings.excludeFolders.join(", ") : this.settings.excludeFolders || ""
          ).onChange(async (v) => {
            this.settings.excludeFolders = v.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
            this.refreshFeature();
          })
        );
        const rebuildSetting = new Setting(containerEl).setName("Rebuild global cache").setDesc(descWithLinks(
          "Force a full rescan of all global snippet notes and rebuild the startup cache file. \xA7 if styles aren't loading.",
          [{ text: "Troubleshoot cache issues", href: "https://stnd.build/3-archives/obsidian-plugin#4-snippet-manager" }]
        ));
        rebuildSetting.addButton(
          (btn) => btn.setButtonText("Rebuild now").onClick(async () => {
            const feature = this.getFeature();
            if (feature) {
              feature.lastGlobalCss = null;
              feature.settings.globalCache = "";
              feature.settings.globalSignature = "";
              await feature.rescanGlobalSnippets();
              new Notice("Global snippet cache rebuilt.");
            }
          })
        );
      }
      getFeature() {
        return this.plugin.features.find((f) => f instanceof SnippetManagerFeature2);
      }
      refreshFeature() {
        const feature = this.getFeature();
        if (feature) {
          feature.rescanGlobalSnippets();
          const active = this.app.workspace.getActiveFile();
          if (active) feature.applyLocalForFile(active);
        }
      }
    };
    module2.exports = { SnippetManagerFeature: SnippetManagerFeature2, SnippetManagerSettingTab: SnippetManagerSettingTab2 };
  }
});

// src/features/daily-nav/index.js
var require_daily_nav = __commonJS({
  "src/features/daily-nav/index.js"(exports2, module2) {
    "use strict";
    var { MarkdownView, Setting, PluginSettingTab: PluginSettingTab2 } = require("obsidian");
    var { descWithLinks } = require_constants();
    var DailyNavFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.dailyNav) {
          plugin.settings.dailyNav = { enabled: true, navigationMode: "chronological" };
        }
        this.settings = plugin.settings.dailyNav;
        this.refresh = this.refresh.bind(this);
      }
      async load() {
        this.plugin.registerEvent(this.app.workspace.on("active-leaf-change", this.refresh));
        this.plugin.registerEvent(this.app.workspace.on("layout-change", this.refresh));
        this.plugin.registerEvent(this.app.metadataCache.on("changed", this.refresh));
        this.plugin.registerEvent(this.app.vault.on("create", this.refresh));
        this.plugin.registerEvent(this.app.vault.on("delete", this.refresh));
        this.app.workspace.onLayoutReady(this.refresh);
      }
      async unload() {
        this.cleanupAll();
      }
      cleanupAll() {
        this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
          const view = leaf.view;
          if (view && view._stndDailyNavEl) {
            view._stndDailyNavEl.remove();
            delete view._stndDailyNavEl;
          }
        });
      }
      getDailyNotesConfig() {
        const periodicNotes = this.app.plugins.getPlugin("periodic-notes");
        if (periodicNotes && periodicNotes.settings?.daily?.enabled) {
          const dailySettings = periodicNotes.settings.daily;
          return {
            format: dailySettings.format || "YYYY-MM-DD",
            folder: dailySettings.folder || "",
            template: dailySettings.template || ""
          };
        }
        const dailyNotesPlugin = this.app.internalPlugins.getPluginById("daily-notes");
        if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
          const options = dailyNotesPlugin.instance.options;
          return {
            format: options.format || "YYYY-MM-DD",
            folder: options.folder || "",
            template: options.template || ""
          };
        }
        return {
          format: "YYMMDD",
          // Default in user's vault is YYMMDD
          folder: "Logs",
          // Default folder in user's vault is Logs
          template: ""
        };
      }
      // Find all daily notes in the vault and sort them chronologically
      getSortedDailyNotes(format, folder) {
        const files = this.app.vault.getMarkdownFiles();
        const moment = window.moment;
        const dailyNotes = [];
        for (const file of files) {
          if (folder && !file.path.startsWith(folder)) {
            continue;
          }
          const date = moment(file.basename, format, true);
          if (date.isValid()) {
            dailyNotes.push({
              file,
              date
            });
          }
        }
        return dailyNotes.sort((a, b) => a.date.valueOf() - b.date.valueOf());
      }
      refresh() {
        if (!this.settings.enabled) {
          this.cleanupAll();
          return;
        }
        const { format, folder, template } = this.getDailyNotesConfig();
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
          const view = leaf.view;
          if (!view || !view.file) return;
          const isCurrentViewActive = activeView && activeView.leaf === leaf;
          if (folder && !view.file.path.startsWith(folder)) {
            this.removeNavPill(view);
            return;
          }
          const moment = window.moment;
          const currentDate = moment(view.file.basename, format, true);
          if (!currentDate.isValid()) {
            this.removeNavPill(view);
            return;
          }
          this.renderNavPill(view, currentDate, format, folder, template);
        });
      }
      removeNavPill(view) {
        if (view._stndDailyNavEl) {
          view._stndDailyNavEl.remove();
          delete view._stndDailyNavEl;
        }
      }
      renderNavPill(view, currentDate, format, folder, template) {
        let prevTarget = null;
        let nextTarget = null;
        const moment = window.moment;
        if (this.settings.navigationMode === "chronological") {
          const sortedNotes = this.getSortedDailyNotes(format, folder);
          const currentIndex = sortedNotes.findIndex((dn) => dn.file.path === view.file.path);
          if (currentIndex !== -1) {
            if (currentIndex > 0) {
              prevTarget = { file: sortedNotes[currentIndex - 1].file };
            } else {
              prevTarget = { date: currentDate.clone().subtract(1, "day"), create: true };
            }
            if (currentIndex < sortedNotes.length - 1) {
              nextTarget = { file: sortedNotes[currentIndex + 1].file };
            } else {
              nextTarget = { date: currentDate.clone().add(1, "day"), create: true };
            }
          } else {
            prevTarget = { date: currentDate.clone().subtract(1, "day"), create: true };
            nextTarget = { date: currentDate.clone().add(1, "day"), create: true };
          }
        } else {
          const prevDate = currentDate.clone().subtract(1, "day");
          const nextDate = currentDate.clone().add(1, "day");
          const prevFilename = prevDate.format(format) + ".md";
          const nextFilename = nextDate.format(format) + ".md";
          const prevPath = folder ? `${folder}/${prevFilename}` : prevFilename;
          const nextPath = folder ? `${folder}/${nextFilename}` : nextFilename;
          const prevFile = this.app.vault.getAbstractFileByPath(prevPath);
          const nextFile = this.app.vault.getAbstractFileByPath(nextPath);
          prevTarget = prevFile ? { file: prevFile } : { date: prevDate, create: true };
          nextTarget = nextFile ? { file: nextFile } : { date: nextDate, create: true };
        }
        let containerEl = view._stndDailyNavEl;
        if (!containerEl || !containerEl.isConnected) {
          containerEl = document.createElement("div");
          containerEl.className = "stnd-daily-nav-container";
          view.contentEl.style.position = "relative";
          view.contentEl.appendChild(containerEl);
          view._stndDailyNavEl = containerEl;
        }
        containerEl.empty();
        const pillEl = containerEl.createEl("div", { cls: "stnd-daily-nav-pill" });
        this.createNavButton(pillEl, prevTarget, "prev", format);
        pillEl.createEl("div", { cls: "stnd-daily-nav-divider" });
        this.createNavButton(pillEl, nextTarget, "next", format);
      }
      createNavButton(parentEl, target, direction, format) {
        const moment = window.moment;
        let label = "";
        let btnClass = "stnd-daily-nav-btn";
        let clickHandler;
        if (target.file) {
          const date = moment(target.file.basename, format, true);
          const formattedDate = date.isValid() ? date.format("D MMM") : target.file.basename;
          label = direction === "prev" ? `\u2190 ${formattedDate}` : `${formattedDate} \u2192`;
          btnClass += " stnd-exists";
          clickHandler = () => {
            const leaf = this.app.workspace.getLeaf(false);
            leaf.openFile(target.file);
          };
        } else {
          const formattedDate = target.date.format("D MMM");
          label = direction === "prev" ? `+ ${formattedDate}` : `+ ${formattedDate}`;
          btnClass += " stnd-create";
          clickHandler = () => {
            this.createDailyNoteForDate(target.date, format);
          };
        }
        const button = parentEl.createEl("button", {
          text: label,
          cls: btnClass
        });
        const actionLabel = target.create ? "Cr\xE9er la note" : "Ouvrir la note";
        const dateStr = target.file ? target.file.basename : target.date.format(format);
        button.setAttribute("aria-label", `${actionLabel} pour le ${dateStr}`);
        button.addEventListener("click", (evt) => {
          evt.preventDefault();
          clickHandler();
        });
      }
      async createDailyNoteForDate(date, format) {
        const { folder, template } = this.getDailyNotesConfig();
        const filename = date.format(format) + ".md";
        const path = folder ? `${folder}/${filename}` : filename;
        let file = this.app.vault.getAbstractFileByPath(path);
        if (file) {
          await this.app.workspace.getLeaf(false).openFile(file);
          return;
        }
        if (folder) {
          const folderExists = this.app.vault.getAbstractFileByPath(folder);
          if (!folderExists) {
            await this.app.vault.createFolder(folder);
          }
        }
        let content = "";
        if (template) {
          let templatePath = template;
          if (!templatePath.endsWith(".md")) {
            templatePath += ".md";
          }
          const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
          if (templateFile) {
            content = await this.app.vault.read(templateFile);
            content = this.replaceTemplateVariables(content, date, date.format(format));
          }
        }
        try {
          const newFile = await this.app.vault.create(path, content);
          await this.app.workspace.getLeaf(false).openFile(newFile);
        } catch (err) {
          console.error("Standard: Erreur lors de la cr\xE9ation de la note quotidienne :", err);
        }
      }
      replaceTemplateVariables(content, date, title) {
        let result = content;
        result = result.replace(/\{\{title\}\}/g, title);
        result = result.replace(/\{\{date\}\}/g, date.format("YYYY-MM-DD"));
        const moment = window.moment;
        result = result.replace(/\{\{time\}\}/g, moment().format("HH:mm"));
        const dateRegex = /\{\{date:(.*?)\}\}/g;
        let match;
        while ((match = dateRegex.exec(result)) !== null) {
          const formatStr = match[1];
          result = result.replace(match[0], date.format(formatStr));
        }
        const timeRegex = /\{\{time:(.*?)\}\}/g;
        while ((match = timeRegex.exec(result)) !== null) {
          const formatStr = match[1];
          result = result.replace(match[0], moment().format(formatStr));
        }
        return result;
      }
    };
    var DailyNavSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.dailyNav) {
          this.plugin.settings.dailyNav = { enabled: true, navigationMode: "chronological" };
        }
        this.settings = this.plugin.settings.dailyNav;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Navigation Notes Quotidiennes" });
        const desc = containerEl.createEl("p", {
          text: "Affiche deux boutons flottants au bas de vos notes quotidiennes pour passer facilement \xE0 la note pr\xE9c\xE9dente ou suivante. ",
          cls: "setting-item-description"
        });
        new Setting(containerEl).setName("Activer la navigation").setDesc("Affiche la barre de navigation (pill) au bas des notes quotidiennes.").addToggle(
          (toggle) => toggle.setValue(this.settings.enabled).onChange(async (v) => {
            this.settings.enabled = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof DailyNavFeature2).refresh();
          })
        );
        new Setting(containerEl).setName("Mode de navigation").setDesc(descWithLinks(
          "Chronologique suit l'ordre des notes existantes dans votre coffre. Calendrier suit l'ordre des jours du calendrier.",
          []
        )).addDropdown(
          (dropdown) => dropdown.addOptions({
            chronological: "Chronologique (notes existantes)",
            calendar: "Calendrier (jour par jour)"
          }).setValue(this.settings.navigationMode).onChange(async (v) => {
            this.settings.navigationMode = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof DailyNavFeature2).refresh();
          })
        );
      }
    };
    module2.exports = { DailyNavFeature: DailyNavFeature2, DailyNavSettingTab: DailyNavSettingTab2 };
  }
});

// src/features/seedbeds/index.js
var require_seedbeds = __commonJS({
  "src/features/seedbeds/index.js"(exports2, module2) {
    "use strict";
    var {
      Plugin: Plugin2,
      TFile,
      Setting,
      Notice,
      PluginSettingTab: PluginSettingTab2
    } = require("obsidian");
    var { descWithLinks } = require_constants();
    function toArray(val) {
      if (val == null) return [];
      if (Array.isArray(val)) {
        return val.filter(
          (item) => item !== null && item !== void 0 && String(item).trim() !== ""
        );
      }
      const stringVal = String(val).trim();
      return stringVal !== "" ? [stringVal] : [];
    }
    var SeedbedsFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.seedbeds) plugin.settings.seedbeds = { rules: [] };
        this.settings = plugin.settings.seedbeds;
      }
      async load() {
        this.plugin.registerEvent(
          this.app.vault.on("rename", async (file, oldPath) => {
            if (file instanceof TFile && file.extension === "md")
              await this.applyRules(file);
          })
        );
        this.plugin.registerEvent(
          this.app.vault.on("create", async (file) => {
            if (file instanceof TFile && file.extension === "md")
              await this.applyRules(file);
          })
        );
        this.plugin.addCommand({
          id: "auto-fm-apply-current",
          name: "Apply seedbed rules to current file",
          callback: async () => {
            const file = this.app.workspace.getActiveFile();
            if (file && file.extension === "md") {
              await this.applyRules(file);
              new Notice("Seedbeds: rules applied.");
            } else {
              new Notice("No markdown file active.");
            }
          }
        });
      }
      async applyRules(file) {
        const path = file.path.replace(/\\/g, "/");
        const rules = this.settings?.rules || [];
        const matchingRules = rules.filter(
          (r) => this.isFileInFolder(path, r.folder)
        );
        if (matchingRules.length === 0) return;
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          const newValues = {};
          for (const rule of matchingRules) {
            for (const k in rule.frontmatter) {
              const incoming = rule.frontmatter[k];
              if (Array.isArray(incoming)) {
                const existing = toArray(frontmatter[k]);
                for (const val of incoming)
                  if (!existing.includes(val)) existing.push(val);
                newValues[k] = existing;
              } else {
                if (k === "tags" || k === "tag" || k === "keywords") {
                  const existing = toArray(frontmatter[k]);
                  if (!existing.includes(incoming)) existing.push(incoming);
                  newValues[k] = existing;
                } else {
                  newValues[k] = incoming;
                }
              }
            }
          }
          for (const [key, newValue] of Object.entries(newValues)) {
            frontmatter[key] = newValue;
          }
        });
      }
      isFileInFolder(filePath, folder) {
        if (!folder) return false;
        const normFolder = folder.replace(/^\/+||\/+$/g, "").toLowerCase();
        if (normFolder === "") return false;
        const lastSlash = filePath.lastIndexOf("/");
        const dirPath = lastSlash === -1 ? "" : filePath.substring(0, lastSlash);
        const searchIn = "/" + dirPath.toLowerCase() + "/";
        const searchFor = "/" + normFolder + "/";
        return searchIn.includes(searchFor);
      }
    };
    var SeedbedsSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (!this.plugin.settings.seedbeds) {
          this.plugin.settings.seedbeds = { rules: [] };
        }
        this.settings = this.plugin.settings.seedbeds;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Seedbeds (Auto Frontmatter)" });
        const desc = containerEl.createEl("p", {
          text: "Seedbeds automate metadata hygiene in your vault. When a markdown note is created inside or moved to a target folder, the plugin automatically writes the configured frontmatter properties to its YAML header without overwriting existing keys.",
          cls: "setting-item-description"
        });
        const listContainer = containerEl.createEl("div", {
          cls: "seedbeds-rules-list"
        });
        this.renderRulesList(listContainer);
        new Setting(containerEl).setName("Add new seedbed").setDesc("Create a new rule mapping a folder to a set of default frontmatter properties.").addButton(
          (btn) => btn.setButtonText("+ Add a seedbed").setCta().onClick(async () => {
            if (!this.settings.rules) this.settings.rules = [];
            this.settings.rules.push({ folder: "", frontmatter: {} });
            await this.plugin.saveSettings();
            this.display();
          })
        );
      }
      renderRulesList(container) {
        container.empty();
        const rules = this.settings?.rules || [];
        if (rules.length === 0) {
          container.createEl("p", {
            text: "No rules configured. Click the button above to add your first folder automation rule.",
            cls: "setting-item-description"
          });
          return;
        }
        rules.forEach((rule, i) => {
          const ruleContainer = container.createEl("div", {
            cls: "seedbed-rule-container"
          });
          ruleContainer.style.border = "1px solid var(--background-modifier-border)";
          ruleContainer.style.padding = "16px";
          ruleContainer.style.marginBottom = "24px";
          ruleContainer.style.borderRadius = "8px";
          ruleContainer.style.backgroundColor = "var(--background-secondary)";
          const pathSetting = new Setting(ruleContainer).setName(`Seedbed ${i + 1}: Target Folder`).setDesc("The folder path in your vault (e.g. Projects/Active)");
          pathSetting.addText((text) => {
            text.setPlaceholder("Folder path").setValue(rule.folder).onChange(async (value) => {
              this.settings.rules[i].folder = value.trim();
              await this.plugin.saveSettings();
            });
            const { FolderSuggest } = require_folder_suggest();
            new FolderSuggest(this.app, text.inputEl);
          }).addButton(
            (btn) => btn.setIcon("trash").setWarning().setTooltip("Delete this seedbed").onClick(async () => {
              this.settings.rules.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            })
          );
          ruleContainer.createEl("hr", { cls: "seedbed-divider" });
          const entries = Object.entries(rule.frontmatter || {}).map(([key, value]) => {
            let type = "text";
            if (Array.isArray(value)) type = "list";
            else if (typeof value === "boolean") type = "boolean";
            else if (typeof value === "number") type = "number";
            return { key, value, type };
          });
          const rebuild = async () => {
            rule.frontmatter = {};
            entries.forEach((e) => {
              if (!e.key.trim()) return;
              if (e.type === "list") {
                if (Array.isArray(e.value)) rule.frontmatter[e.key] = e.value;
                else rule.frontmatter[e.key] = String(e.value).split(",").map((s) => s.trim()).filter((s) => s.length > 0);
              } else if (e.type === "number") {
                const num = Number(e.value);
                rule.frontmatter[e.key] = isNaN(num) ? 0 : num;
              } else if (e.type === "boolean") {
                rule.frontmatter[e.key] = !!e.value;
              } else {
                rule.frontmatter[e.key] = String(e.value);
              }
            });
            await this.plugin.saveSettings();
          };
          const renderPropertyRow = (entry) => {
            const propSetting = new Setting(ruleContainer).setClass("seedbed-property-row");
            propSetting.addText((t) => {
              t.setPlaceholder("Key (e.g. status)");
              t.setValue(entry.key);
              t.inputEl.style.width = "120px";
              t.onChange(async (val) => {
                entry.key = val.trim();
                await rebuild();
              });
            });
            propSetting.addDropdown((d) => {
              d.addOption("text", "Text");
              d.addOption("list", "List");
              d.addOption("number", "Number");
              d.addOption("boolean", "Boolean");
              d.setValue(entry.type);
              d.onChange(async (val) => {
                entry.type = val;
                if (val === "list") entry.value = typeof entry.value === "string" ? [entry.value] : [];
                else if (val === "boolean") entry.value = true;
                else if (val === "number") entry.value = 0;
                else entry.value = String(entry.value);
                await rebuild();
                this.display();
              });
            });
            if (entry.type === "boolean") {
              propSetting.addToggle((t) => {
                t.setValue(!!entry.value);
                t.onChange(async (val) => {
                  entry.value = val;
                  await rebuild();
                });
              });
            } else if (entry.type === "number") {
              propSetting.addText((t) => {
                t.inputEl.type = "number";
                t.setPlaceholder("0");
                t.setValue(String(entry.value));
                t.inputEl.style.width = "180px";
                t.onChange(async (val) => {
                  entry.value = Number(val);
                  await rebuild();
                });
              });
            } else if (entry.type === "list") {
              propSetting.addText((t) => {
                t.setPlaceholder("val1, val2");
                t.setValue(Array.isArray(entry.value) ? entry.value.join(", ") : String(entry.value));
                t.inputEl.style.width = "180px";
                t.onChange(async (val) => {
                  entry.value = val.split(",").map((s) => s.trim()).filter(Boolean);
                  await rebuild();
                });
              });
            } else {
              propSetting.addText((t) => {
                t.setPlaceholder("Value");
                t.setValue(String(entry.value));
                t.inputEl.style.width = "180px";
                t.onChange(async (val) => {
                  entry.value = val;
                  await rebuild();
                });
              });
            }
            propSetting.addExtraButton((b) => {
              b.setIcon("cross");
              b.setTooltip("Remove property");
              b.onClick(async () => {
                const idx = entries.indexOf(entry);
                if (idx > -1) {
                  entries.splice(idx, 1);
                  await rebuild();
                  this.display();
                }
              });
            });
            propSetting.settingEl.style.borderTop = "none";
            propSetting.settingEl.style.paddingTop = "0";
          };
          entries.forEach((entry) => {
            renderPropertyRow(entry);
          });
          const btnSetting = new Setting(ruleContainer).settingEl.style.borderTop = "none";
          const btnWrapper = ruleContainer.createEl("div");
          btnWrapper.style.display = "flex";
          btnWrapper.style.justifyContent = "flex-end";
          const addBtn = btnWrapper.createEl("button", { text: "+ Add property" });
          addBtn.onclick = async () => {
            const newEntry = { key: "", value: "", type: "text" };
            entries.push(newEntry);
            await rebuild();
            this.display();
          };
        });
      }
    };
    module2.exports = { SeedbedsFeature: SeedbedsFeature2, SeedbedsSettingTab: SeedbedsSettingTab2 };
  }
});

// src/features/interface-manager/index.js
var require_interface_manager = __commonJS({
  "src/features/interface-manager/index.js"(exports2, module2) {
    "use strict";
    var { PluginSettingTab: PluginSettingTab2, Setting, Notice } = require("obsidian");
    var { descWithLinks } = require_constants();
    var InterfaceManagerFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        if (!plugin.settings.interface) {
          plugin.settings.interface = {
            zen: false,
            truncateFilenames: false,
            autoHideSidebars: false,
            defaultReadingMode: false,
            autoFocusLastLineOnMobile: false
          };
        }
        const s = plugin.settings.interface;
        if (s.zen === void 0) {
          s.zen = !!(s.minimalist || s.autoHideSingleTab || s.autoHideStatusBar);
          delete s.minimalist;
          delete s.autoHideSingleTab;
          delete s.autoHideStatusBar;
        }
        this.settings = plugin.settings.interface;
      }
      async load() {
        this.app.workspace.onLayoutReady(() => {
          this.applySettings();
          if (this.settings.autoHideSidebars) this.setupAutoHideSidebars();
          if (this.settings.zen) this.setupAutoHideSingleTab();
          if (this.settings.zen) this.setupAutoHideStatusBar();
          this.onFileOpen();
        });
        this.plugin.registerEvent(
          this.app.workspace.on("file-open", () => this.onFileOpen())
        );
        this.plugin.registerEvent(
          this.app.metadataCache.on("changed", (file) => {
            this.applySettings();
            if (file && file.path === this._pendingEnforceFile) {
              this._pendingEnforceFile = null;
              this.enforceReadingMode(true);
            }
          })
        );
      }
      // Honor the frontmatter `mode` exactly once when a note becomes active:
      // after a short grace period (so metadata can resolve), or sooner if the
      // metadataCache "changed" event delivers the frontmatter first (see load()).
      onFileOpen() {
        this.applySettings();
        const activeFile = this.app.workspace.getActiveFile();
        this._pendingEnforceFile = activeFile ? activeFile.path : null;
        clearTimeout(this._enforceTimeout);
        this._enforceTimeout = setTimeout(() => {
          if (this._pendingEnforceFile && this.app.workspace.getActiveFile()?.path === this._pendingEnforceFile) {
            this._pendingEnforceFile = null;
            this.enforceReadingMode(true);
          }
        }, 100);
      }
      async unload() {
        clearTimeout(this._enforceTimeout);
        this.teardownAutoHideSidebars();
        this.teardownAutoHideSingleTab();
        this.teardownAutoHideStatusBar();
        if (this._truncateStyle) {
          this._truncateStyle.remove();
          this._truncateStyle = null;
        }
        document.body.classList.remove(
          "stnd-truncate-filenames",
          "stnd-hide-vault-name",
          "stnd-hide-file-nav-header"
        );
      }
      applySettings() {
        document.body.classList.toggle("stnd-hide-vault-name", this.settings.zen);
        document.body.classList.toggle(
          "stnd-hide-file-nav-header",
          this.settings.zen
        );
        this.applyTruncateFilenames();
      }
      // Publish-state classes (stnd-note-published / -public / -unlisted / -private)
      // are owned by the Standard Garden plugin — Atelier does not duplicate them.
      async enforceReadingMode(isOpening = false) {
        const activeView = this.app.workspace.getActiveViewOfType(
          require("obsidian").MarkdownView
        );
        if (!activeView || !activeView.file) return;
        const meta = this.app.metadataCache.getFileCache(activeView.file);
        let mode = meta?.frontmatter?.mode;
        if (!mode && isOpening && this.settings.defaultReadingMode) {
          mode = "read";
        }
        if (!mode) return;
        mode = String(mode).toLowerCase().trim();
        const leaf = activeView.leaf;
        const viewState = leaf.getViewState();
        if (mode === "read") {
          if (viewState.state.mode !== "preview") {
            if (!isOpening && activeView.editor?.hasFocus()) return;
            viewState.state.mode = "preview";
            leaf.setViewState(viewState);
          }
        } else if (mode === "edit" || mode === "source" || mode === "raw") {
          const targetSource = mode === "source" || mode === "raw";
          if (viewState.state.mode !== "source" || viewState.state.source !== targetSource) {
            viewState.state.mode = "source";
            viewState.state.source = targetSource;
            leaf.setViewState(viewState);
            if (isOpening && this.settings.autoFocusLastLineOnMobile && require("obsidian").Platform.isMobile) {
              const editor = activeView.editor;
              if (editor) {
                const lastLine = editor.lastLine();
                const lastLineLength = editor.getLine(lastLine).length;
                editor.setCursor({ line: lastLine, ch: lastLineLength });
                editor.scrollIntoView({ line: lastLine, ch: lastLineLength });
                editor.focus();
              }
            }
          }
        }
      }
      setupAutoHideSidebars() {
        document.body.classList.add("stnd-autohide-sidebars");
        const leftSplit = this.app.workspace.leftSplit;
        const rightSplit = this.app.workspace.rightSplit;
        const leftPanel = document.querySelector(".workspace-split.mod-left-split");
        const rightPanel = document.querySelector(
          ".workspace-split.mod-right-split"
        );
        const collapseCmd = {
          left: "app:toggle-left-sidebar",
          right: "app:toggle-right-sidebar"
        };
        const ribbonEnabled = this.app.vault.getConfig("showRibbon") !== false;
        const hideRibbon = () => {
          if (ribbonEnabled) document.body.classList.add("stnd-ribbon-hidden");
        };
        const showRibbon = () => {
          if (ribbonEnabled) document.body.classList.remove("stnd-ribbon-hidden");
        };
        const hoverOpen = { left: false, right: false };
        const scheduleCollapse = (getSplit, side) => {
          clearTimeout(this._autoHideCollapseTimeout);
          this._autoHideCollapseTimeout = setTimeout(() => {
            if (!hoverOpen[side]) return;
            hoverOpen[side] = false;
            const split = getSplit();
            if (!split || split.collapsed) return;
            if (side === "left") hideRibbon();
            const collapsingClass = `stnd-collapsing-${side}`;
            document.body.classList.add(collapsingClass);
            const panel = side === "left" ? leftPanel : rightPanel;
            const doCollapse = () => {
              document.body.classList.remove(collapsingClass);
              this.app.commands.executeCommandById(collapseCmd[side]);
            };
            const onTransitionEnd = (e) => {
              if (e.target !== panel) return;
              panel.removeEventListener("transitionend", onTransitionEnd);
              clearTimeout(fallback);
              doCollapse();
            };
            panel.addEventListener("transitionend", onTransitionEnd);
            const fallback = setTimeout(() => {
              panel.removeEventListener("transitionend", onTransitionEnd);
              doCollapse();
            }, 1600);
          }, 300);
        };
        const cancelCollapse = () => {
          clearTimeout(this._autoHideCollapseTimeout);
          document.body.classList.remove(
            "stnd-collapsing-left",
            "stnd-collapsing-right"
          );
        };
        const syncLeftClosedClass = () => {
          document.body.classList.toggle(
            "stnd-left-closed",
            !!leftSplit?.collapsed
          );
        };
        this.plugin.registerEvent(
          this.app.workspace.on("layout-change", syncLeftClosedClass)
        );
        syncLeftClosedClass();
        const expandLeft = () => {
          showRibbon();
          if (leftSplit && leftSplit.collapsed) {
            hoverOpen.left = true;
            this.app.commands.executeCommandById(collapseCmd.left);
          }
        };
        const onLeftPanelLeave = () => scheduleCollapse(() => leftSplit, "left");
        const onRightPanelLeave = () => scheduleCollapse(() => rightSplit, "right");
        leftPanel?.addEventListener("mouseleave", onLeftPanelLeave);
        rightPanel?.addEventListener("mouseleave", onRightPanelLeave);
        const leftRibbon = document.querySelector(".workspace-ribbon.mod-left");
        const onRibbonEnter = () => cancelCollapse();
        const onRibbonLeave = () => scheduleCollapse(() => leftSplit, "left");
        leftRibbon?.addEventListener("mouseenter", onRibbonEnter);
        leftRibbon?.addEventListener("mouseleave", onRibbonLeave);
        const makeZone = (side, getSplit, onExpand) => {
          const zone = document.createElement("div");
          zone.className = `stnd-sidebar-zone stnd-sidebar-zone-${side}`;
          let zoneLastX = 0, zoneLastY = 0, zoneLastT = 0;
          let zoneVelocityTimeout = null;
          const tryExpand = () => {
            cancelCollapse();
            const split = getSplit();
            if (split && split.collapsed) {
              hoverOpen[side] = true;
              onExpand ? onExpand() : this.app.commands.executeCommandById(collapseCmd[side]);
            }
          };
          zone.addEventListener("mouseenter", (e) => {
            zoneLastX = e.clientX;
            zoneLastY = e.clientY;
            zoneLastT = performance.now();
          });
          let lastMove = 0;
          zone.addEventListener("mousemove", (e) => {
            const now = performance.now();
            if (now - lastMove < 50) return;
            lastMove = now;
            const dt = now - zoneLastT;
            if (dt <= 0) return;
            const dx = e.clientX - zoneLastX;
            const dy = e.clientY - zoneLastY;
            const velocity = Math.sqrt(dx * dx + dy * dy) / dt;
            zoneLastX = e.clientX;
            zoneLastY = e.clientY;
            zoneLastT = now;
            clearTimeout(zoneVelocityTimeout);
            if (velocity < 0.5) {
              tryExpand();
            } else {
              zoneVelocityTimeout = setTimeout(tryExpand, 120);
            }
          });
          zone.addEventListener("mouseleave", () => {
            clearTimeout(zoneVelocityTimeout);
            scheduleCollapse(getSplit, side);
          });
          this.app.workspace.containerEl.appendChild(zone);
          return zone;
        };
        const leftZone = makeZone("left", () => leftSplit, expandLeft);
        const rightZone = makeZone("right", () => rightSplit);
        const onLeftPanelEnter = cancelCollapse;
        const onRightPanelEnter = cancelCollapse;
        leftPanel?.addEventListener("mouseenter", onLeftPanelEnter);
        rightPanel?.addEventListener("mouseenter", onRightPanelEnter);
        this._autoHideZones = {
          leftZone,
          rightZone,
          leftPanel,
          onLeftPanelLeave,
          onLeftPanelEnter,
          rightPanel,
          onRightPanelLeave,
          onRightPanelEnter,
          leftRibbon,
          onRibbonEnter,
          onRibbonLeave
        };
      }
      teardownAutoHideSidebars() {
        clearTimeout(this._autoHideCollapseTimeout);
        if (this._autoHideZones) {
          const z = this._autoHideZones;
          z.leftZone?.remove();
          z.rightZone?.remove();
          z.leftPanel?.removeEventListener("mouseleave", z.onLeftPanelLeave);
          z.leftPanel?.removeEventListener("mouseenter", z.onLeftPanelEnter);
          z.rightPanel?.removeEventListener("mouseleave", z.onRightPanelLeave);
          z.rightPanel?.removeEventListener("mouseenter", z.onRightPanelEnter);
          z.leftRibbon?.removeEventListener("mouseenter", z.onRibbonEnter);
          z.leftRibbon?.removeEventListener("mouseleave", z.onRibbonLeave);
          this._autoHideZones = null;
        }
        document.body.classList.remove("stnd-autohide-sidebars");
        document.body.classList.remove("stnd-ribbon-hidden");
        document.body.classList.remove("stnd-left-closed");
      }
      setupAutoHideSingleTab() {
        this.teardownAutoHideSingleTab();
        this._singleTabHandler = () => {
          setTimeout(() => {
            const tabs = document.querySelectorAll(
              ".mod-root .workspace-tabs .workspace-tab-header-container .workspace-tab-header"
            );
            document.body.classList.toggle("stnd-single-tab", tabs.length <= 1);
          }, 0);
        };
        this._singleTabHandler();
        this.app.workspace.on("layout-change", this._singleTabHandler);
        this.app.workspace.on("active-leaf-change", this._singleTabHandler);
      }
      teardownAutoHideSingleTab() {
        if (this._singleTabHandler) {
          this.app.workspace.off("layout-change", this._singleTabHandler);
          this.app.workspace.off("active-leaf-change", this._singleTabHandler);
          this._singleTabHandler = null;
        }
        document.body.classList.remove("stnd-single-tab");
      }
      setupAutoHideStatusBar() {
        document.body.classList.add("stnd-autohide-statusbar");
        const statusBar = document.querySelector(".status-bar");
        const show = () => document.body.classList.add("stnd-statusbar-visible");
        const hide = () => document.body.classList.remove("stnd-statusbar-visible");
        const scheduleHide = () => {
          clearTimeout(this._statusBarHideTimeout);
          this._statusBarHideTimeout = setTimeout(hide, 300);
        };
        const cancelHide = () => clearTimeout(this._statusBarHideTimeout);
        const zone = document.createElement("div");
        zone.className = "stnd-statusbar-zone";
        zone.addEventListener("mouseenter", () => {
          cancelHide();
          show();
        });
        zone.addEventListener("mouseleave", scheduleHide);
        this.app.workspace.containerEl.appendChild(zone);
        const onEnter = () => {
          cancelHide();
          show();
        };
        const onLeave = scheduleHide;
        statusBar?.addEventListener("mouseenter", onEnter);
        statusBar?.addEventListener("mouseleave", onLeave);
        this._statusBarZone = { zone, statusBar, onEnter, onLeave };
      }
      teardownAutoHideStatusBar() {
        clearTimeout(this._statusBarHideTimeout);
        if (this._statusBarZone) {
          const z = this._statusBarZone;
          z.zone?.remove();
          z.statusBar?.removeEventListener("mouseenter", z.onEnter);
          z.statusBar?.removeEventListener("mouseleave", z.onLeave);
          this._statusBarZone = null;
        }
        document.body.classList.remove("stnd-autohide-statusbar");
        document.body.classList.remove("stnd-statusbar-visible");
      }
      applyTruncateFilenames() {
        const on = this.settings.truncateFilenames;
        document.body.classList.toggle("stnd-truncate-filenames", on);
        if (on && !this._truncateStyle) {
          const style = document.createElement("style");
          style.id = "atelier-truncate-filenames";
          style.textContent = `
        body.stnd-truncate-filenames .tree-item-self {
          white-space: nowrap !important;
        }
        body.stnd-truncate-filenames .tree-item-inner {
          text-overflow: ellipsis !important;
          overflow: hidden !important;
          white-space: nowrap !important;
        }
      `;
          document.head.appendChild(style);
          this._truncateStyle = style;
        } else if (!on && this._truncateStyle) {
          this._truncateStyle.remove();
          this._truncateStyle = null;
        }
      }
    };
    var InterfaceManagerSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settings = this.plugin.settings.interface;
      }
      getFeature() {
        return this.plugin.features.find(
          (f) => f instanceof InterfaceManagerFeature2
        );
      }
      async save() {
        this.plugin.settings.interface = this.settings;
        await this.plugin.saveSettings();
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "General" });
        const desc = containerEl.createEl("p", {
          text: "Configure Zen mode and core interface enhancements. ",
          cls: "setting-item-description"
        });
        desc.createEl("a", {
          text: "View General Preferences Manual",
          href: "https://stnd.build/3-archives/obsidian-plugin"
        });
        new Setting(containerEl).setName("Zen").setDesc(descWithLinks(
          "Hide vault name, file explorer header, status bar, and tab header when only one tab is open. \xA7 for the full list of hidden elements.",
          [{ text: "See Zen mode guide", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
        )).addToggle(
          (t) => t.setValue(this.settings.zen).onChange(async (v) => {
            try {
              this.settings.zen = v;
              await this.save();
              const feature = this.getFeature();
              if (!feature) {
                new Notice("Error: InterfaceManagerFeature not found");
                return;
              }
              feature.applySettings();
              if (v) {
                feature.setupAutoHideSingleTab();
                feature.setupAutoHideStatusBar();
              } else {
                feature.teardownAutoHideSingleTab();
                feature.teardownAutoHideStatusBar();
              }
            } catch (err) {
              new Notice("Zen toggle error: " + err.message);
              console.error(err);
            }
          })
        );
        new Setting(containerEl).setName("Truncate long filenames").setDesc(descWithLinks(
          "Cut long file and folder names in the explorer with an ellipsis (\u2026) instead of clipping them. \xA7 for visual examples.",
          [{ text: "See General docs", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
        )).addToggle(
          (t) => t.setValue(this.settings.truncateFilenames).onChange(async (v) => {
            try {
              this.settings.truncateFilenames = v;
              await this.save();
              const feature = this.getFeature();
              if (!feature) {
                new Notice("Error: InterfaceManagerFeature not found");
                return;
              }
              feature.applyTruncateFilenames();
            } catch (err) {
              new Notice("Truncate toggle error: " + err.message);
              console.error(err);
            }
          })
        );
        new Setting(containerEl).setName("Default reading mode").setDesc(descWithLinks(
          "Automatically open notes in reading mode when no mode is defined in frontmatter. Override per-note using \xA7 (`mode: read`, `mode: edit`, `mode: source`).",
          [{ text: "frontmatter mode keys", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
        )).addToggle(
          (t) => t.setValue(this.settings.defaultReadingMode).onChange(async (v) => {
            try {
              this.settings.defaultReadingMode = v;
              await this.save();
              const feature = this.getFeature();
              if (!feature) {
                new Notice("Error: InterfaceManagerFeature not found");
                return;
              }
              feature.enforceReadingMode();
            } catch (err) {
              new Notice("Reading mode toggle error: " + err.message);
              console.error(err);
            }
          })
        );
        new Setting(containerEl).setName("Focus last line on mobile").setDesc(descWithLinks(
          "Scroll to and focus the last line when opening a note in edit mode on mobile. \xA7 for the mobile workflow guide.",
          [{ text: "See mobile tips", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
        )).addToggle(
          (t) => t.setValue(this.settings.autoFocusLastLineOnMobile).onChange(async (v) => {
            try {
              this.settings.autoFocusLastLineOnMobile = v;
              await this.save();
            } catch (err) {
              new Notice("Focus toggle error: " + err.message);
              console.error(err);
            }
          })
        );
        new Setting(containerEl).setName("Auto-hide sidebars").setDesc(descWithLinks(
          "Hide sidebars and the ribbon until you hover near the edge of the screen. \xA7 for the hover zone behavior.",
          [{ text: "See auto-hide guide", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
        )).addToggle(
          (t) => t.setValue(this.settings.autoHideSidebars).onChange(async (v) => {
            try {
              this.settings.autoHideSidebars = v;
              await this.save();
              const feature = this.getFeature();
              if (!feature) {
                new Notice("Error: InterfaceManagerFeature not found");
                return;
              }
              if (v) feature.setupAutoHideSidebars();
              else feature.teardownAutoHideSidebars();
            } catch (err) {
              new Notice("Auto-hide sidebars toggle error: " + err.message);
              console.error(err);
            }
          })
        );
      }
    };
    module2.exports = { InterfaceManagerFeature: InterfaceManagerFeature2, InterfaceManagerSettingTab: InterfaceManagerSettingTab2 };
  }
});

// src/features/base64-fold/index.js
var require_base64_fold = __commonJS({
  "src/features/base64-fold/index.js"(exports2, module2) {
    "use strict";
    var { Decoration, ViewPlugin, WidgetType } = require("@codemirror/view");
    var { PluginSettingTab: PluginSettingTab2, Setting } = require("obsidian");
    var { descWithLinks } = require_constants();
    var Base64FoldWidget = class extends WidgetType {
      constructor(length) {
        super();
        this.length = length;
      }
      eq(other) {
        return other.length === this.length;
      }
      toDOM() {
        const span = document.createElement("span");
        span.className = "atelier-base64-fold";
        span.textContent = `"[Base64 Data: ${this.length} chars]"`;
        span.title = "Click to expand";
        return span;
      }
    };
    var base64UrlRegex = /url\(['"]?data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+=[\w.+-]+)*;base64,([A-Za-z0-9+/=]+)['"]?\)/g;
    var base64FoldPlugin = ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.decorations = this.buildDecorations(view);
        }
        update(update) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
          }
        }
        buildDecorations(view) {
          const builder = [];
          const regex = new RegExp(base64UrlRegex.source, "g");
          const processedLines = /* @__PURE__ */ new Set();
          for (let { from, to } of view.visibleRanges) {
            const startLine = view.state.doc.lineAt(from);
            const endLine = view.state.doc.lineAt(to);
            for (let l = startLine.number; l <= endLine.number; l++) {
              if (processedLines.has(l)) continue;
              processedLines.add(l);
              const line = view.state.doc.line(l);
              regex.lastIndex = 0;
              let match;
              while ((match = regex.exec(line.text)) !== null) {
                const base64Data = match[1];
                if (base64Data.length > 100) {
                  const start = line.from + match.index + 4;
                  const end = line.from + match.index + match[0].length - 1;
                  const selection = view.state.selection.main;
                  if (selection.from >= start && selection.to <= end) {
                    continue;
                  }
                  builder.push(
                    Decoration.replace({
                      widget: new Base64FoldWidget(base64Data.length),
                      inclusive: false
                    }).range(start, end)
                  );
                }
              }
            }
          }
          builder.sort((a, b) => a.from - b.from);
          return Decoration.set(builder);
        }
      },
      {
        decorations: (v) => v.decorations,
        eventHandlers: {
          mousedown: (e, view) => {
            const target = e.target;
            if (target.classList.contains("atelier-base64-fold")) {
              const pos = view.posAtDOM(target);
              view.dispatch({ selection: { anchor: pos } });
              return true;
            }
          }
        }
      }
    );
    var Base64FoldFeature2 = class {
      constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        this.extension = null;
        if (!plugin.settings.base64) plugin.settings.base64 = { enabled: true };
        this.settings = plugin.settings.base64;
      }
      async load() {
        if (!this.settings.enabled) return;
        try {
          this.extension = base64FoldPlugin;
          this.plugin.registerEditorExtension(this.extension);
          this.plugin.registerMarkdownPostProcessor((el, ctx) => {
            const codeBlocks = el.querySelectorAll("code");
            codeBlocks.forEach((codeEl) => {
              const walker = document.createTreeWalker(
                codeEl,
                NodeFilter.SHOW_TEXT,
                null,
                false
              );
              const textNodes = [];
              let node;
              while (node = walker.nextNode()) {
                textNodes.push(node);
              }
              if (textNodes.length === 0) return;
              let fullText = "";
              const nodeMap = [];
              for (let i = 0; i < textNodes.length; i++) {
                const tNode = textNodes[i];
                const text = tNode.nodeValue;
                for (let j = 0; j < text.length; j++) {
                  nodeMap.push({ node: tNode, offset: j });
                }
                fullText += text;
              }
              const regex = new RegExp(base64UrlRegex.source, "g");
              let match;
              const matches = [];
              while ((match = regex.exec(fullText)) !== null) {
                if (match[1].length > 100) {
                  matches.unshift({
                    start: match.index + 4,
                    // index of the character after 'url('
                    end: match.index + match[0].length - 1,
                    // index of the character before ')'
                    dataLength: match[1].length
                  });
                }
              }
              for (const m of matches) {
                const startMap = nodeMap[m.start];
                const endMap = nodeMap[m.end - 1];
                if (startMap.node === endMap.node) {
                  const textNode = startMap.node;
                  const text = textNode.nodeValue;
                  const before = text.substring(0, startMap.offset);
                  const after = text.substring(endMap.offset + 1);
                  const span = document.createElement("span");
                  span.className = "atelier-base64-fold";
                  span.textContent = `"[Base64 Data: ${m.dataLength} chars]"`;
                  span.title = "Base64 data folded for performance";
                  const fragment = document.createDocumentFragment();
                  if (before) fragment.appendChild(document.createTextNode(before));
                  fragment.appendChild(span);
                  if (after) fragment.appendChild(document.createTextNode(after));
                  textNode.parentNode.replaceChild(fragment, textNode);
                } else {
                  const startNode = startMap.node;
                  startNode.nodeValue = startNode.nodeValue.substring(
                    0,
                    startMap.offset
                  );
                  const span = document.createElement("span");
                  span.className = "atelier-base64-fold";
                  span.textContent = `"[Base64 Data: ${m.dataLength} chars]"`;
                  span.title = "Base64 data folded for performance";
                  startNode.parentNode.insertBefore(span, startNode.nextSibling);
                  let currentNodeIndex = textNodes.indexOf(startNode) + 1;
                  const endNodeIndex = textNodes.indexOf(endMap.node);
                  while (currentNodeIndex < endNodeIndex) {
                    const nodeToRemove = textNodes[currentNodeIndex];
                    if (nodeToRemove.parentNode)
                      nodeToRemove.parentNode.removeChild(nodeToRemove);
                    currentNodeIndex++;
                  }
                  const endNode = endMap.node;
                  endNode.nodeValue = endNode.nodeValue.substring(
                    endMap.offset + 1
                  );
                }
              }
            });
          });
          console.log("Atelier: Base64 Fold feature loaded");
        } catch (e) {
          console.error("Atelier: Failed to load Base64 Fold feature", e);
        }
      }
      async unload() {
        console.log("Atelier: Base64 Fold feature unloaded");
      }
    };
    var Base64FoldSettingTab2 = class extends PluginSettingTab2 {
      constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.settings = plugin.settings.base64;
      }
      display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Base64 Fold" });
        const desc = containerEl.createEl("p", {
          text: "Automatically collapses long base64-encoded strings (images, fonts, binary data) in both the editor and reading view into a compact, expandable badge. Keeps your notes readable without losing the embedded data. ",
          cls: "setting-item-description"
        });
        desc.createEl("a", {
          text: "View Base64 Fold Manual",
          href: "https://stnd.build/3-archives/obsidian-plugin#10-base64-fold"
        });
        new Setting(containerEl).setName("Enable Base64 Fold").setDesc(descWithLinks(
          "Fold base64 strings longer than 100 characters into a compact badge. Click the badge to reveal. \xA7 for folding details.",
          [{ text: "See Base64 Fold docs", href: "https://stnd.build/3-archives/obsidian-plugin#10-base64-fold" }]
        )).addToggle(
          (t) => t.setValue(this.settings.enabled !== false).onChange(async (v) => {
            this.settings.enabled = v;
            await this.plugin.saveSettings();
          })
        );
      }
    };
    module2.exports = {
      Base64FoldFeature: Base64FoldFeature2,
      Base64FoldSettingTab: Base64FoldSettingTab2
    };
  }
});

// src/main.js
var { Plugin, PluginSettingTab } = require("obsidian");
var { LiveFeature, LiveSettingTab } = require_live();
var { EchoFeature, EchoSettingTab } = require_echo();
var {
  HollowFeature,
  HollowSettingTab
} = require_hollow();
var {
  BasesFeedFeature,
  BasesFeedSettingTab
} = require_bases_feed();
var {
  SystemTrayFeature,
  SystemTraySettingTab
} = require_system_tray();
var {
  MediaManagerFeature,
  MediaManagerSettingTab
} = require_media_manager();
var {
  EinkFeature,
  EinkSettingTab
} = require_eink();
var {
  ScrollMapFeature,
  ScrollMapSettingTab
} = require_scroll_map();
var {
  SnippetManagerFeature,
  SnippetManagerSettingTab
} = require_snippet_manager();
var {
  DailyNavFeature,
  DailyNavSettingTab
} = require_daily_nav();
var {
  SeedbedsFeature,
  SeedbedsSettingTab
} = require_seedbeds();
var {
  InterfaceManagerFeature,
  InterfaceManagerSettingTab
} = require_interface_manager();
var {
  Base64FoldFeature,
  Base64FoldSettingTab
} = require_base64_fold();
var ChiselPlugin = class extends Plugin {
  async onload() {
    console.log("Chisel plugin loading...");
    this.settings = await this.loadData() || {};
    this.features = [
      new LiveFeature(this.app, this),
      new EchoFeature(this.app, this),
      new HollowFeature(this.app, this),
      new BasesFeedFeature(this.app, this),
      new SystemTrayFeature(this.app, this),
      new MediaManagerFeature(this.app, this),
      new EinkFeature(this.app, this),
      new ScrollMapFeature(this.app, this),
      new SnippetManagerFeature(this.app, this),
      new DailyNavFeature(this.app, this),
      new SeedbedsFeature(this.app, this),
      new InterfaceManagerFeature(this.app, this),
      new Base64FoldFeature(this.app, this)
    ];
    this.addSettingTab(new ChiselSettingTab(this.app, this));
    for (const feature of this.features) {
      if (feature.load) await feature.load();
    }
  }
  async onunload() {
    for (const feature of this.features) {
      if (feature.unload) await feature.unload();
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var ChiselSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.currentTab = "Live";
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h1", { text: "Chisel" });
    const navEl = containerEl.createEl("div", { cls: "chisel-settings-nav" });
    navEl.style.cssText = "display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;";
    const tabs = [
      { id: "Live", tab: new LiveSettingTab(this.app, this.plugin) },
      { id: "Echo", tab: new EchoSettingTab(this.app, this.plugin) },
      { id: "Hollow", tab: new HollowSettingTab(this.app, this.plugin) },
      { id: "Feed", tab: new BasesFeedSettingTab(this.app, this.plugin) },
      { id: "Tray", tab: new SystemTrayFeature() ? new SystemTraySettingTab(this.app, this.plugin) : null },
      { id: "Media", tab: new MediaManagerSettingTab(this.app, this.plugin) },
      { id: "E-ink", tab: new EinkSettingTab(this.app, this.plugin) },
      { id: "Scroll Map", tab: new ScrollMapSettingTab(this.app, this.plugin) },
      { id: "Snippets", tab: new SnippetManagerSettingTab(this.app, this.plugin) },
      { id: "Daily Nav", tab: new DailyNavSettingTab(this.app, this.plugin) },
      { id: "Seedbeds", tab: new SeedbedsSettingTab(this.app, this.plugin) },
      { id: "Zen", tab: new InterfaceManagerSettingTab(this.app, this.plugin) },
      { id: "Base64", tab: new Base64FoldSettingTab(this.app, this.plugin) }
    ].filter((t) => Boolean(t.tab));
    for (const { id } of tabs) {
      const button = navEl.createEl("button", { text: id });
      button.style.padding = "5px 15px";
      if (this.currentTab === id) {
        button.style.backgroundColor = "var(--interactive-accent)";
        button.style.color = "var(--text-on-accent)";
      }
      button.onclick = () => {
        this.currentTab = id;
        this.display();
      };
    }
    const contentEl = containerEl.createEl("div", {
      cls: "chisel-settings-content"
    });
    const active = tabs.find((t) => t.id === this.currentTab) || tabs[0];
    active.tab.containerEl = contentEl;
    active.tab.display();
  }
};
module.exports = ChiselPlugin;

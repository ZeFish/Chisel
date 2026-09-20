"use strict";

const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");
const {
  parseNote,
  formatTimestamp,
  buildObsidianLink,
  extractDate,
  DEFAULT_SEPARATOR,
} = require("./parser");

// ─── Default Settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  logPaths: [""],
};

// ─── Echo Block Default Options ───────────────────────────────────────────────

const DEFAULT_BLOCK_OPTIONS = {
  tag: null,
  separator: DEFAULT_SEPARATOR,
  show_tag: false,
  show_time: true,
  date_format: "compact",
  sort: "desc",
  limit: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Plugin ───────────────────────────────────────────────────────────────────

class EchoFeature {
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
            cls: "echo-error",
          });
          console.error("[Echo]", err);
        }
      },
    );
  }

  async renderEchoBlock(source, el, ctx) {
    const opts = parseBlockOptions(source);
    if (!opts.tag) {
      el.createEl("p", {
        text: "Echo: please specify a tag. e.g.  tag: work",
        cls: "echo-empty",
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
        (e) => e.tag === opts.tag || e.tag.startsWith(opts.tag + "/"),
      );
      entries.push(...matching);
    }

    entries.sort((a, b) => {
      const aKey = `${a.date}${a.time}`;
      const bKey = `${b.date}${b.time}`;
      return opts.sort === "asc"
        ? aKey.localeCompare(bKey)
        : bKey.localeCompare(aKey);
    });

    if (opts.limit > 0) entries = entries.slice(0, opts.limit);

    const container = el.createEl("div", { cls: "echo-feed" });
    if (entries.length === 0) {
      container.createEl("p", {
        text: `No entries found for #${opts.tag}.`,
        cls: "echo-empty",
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
      const timestamp =
        opts.date_format === "compact"
          ? formatTimestamp(entry.date, entry.time)
          : entry.time
            ? `${entry.date} · ${entry.time}`
            : entry.date;

      const link = buildObsidianLink(vaultName, entry.sourceFile);
      const tsEl = entryEl.createEl("a", {
        text: timestamp,
        cls: "echo-timestamp",
        href: link,
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
          this.plugin,
        );
      } catch {
        contentEl.createEl("p", { text: entry.content });
      }
    }
  }
}

class EchoSettingTab extends PluginSettingTab {
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
      cls: "setting-item-description",
    });

    const listContainer = containerEl.createEl("div", {
      cls: "echo-paths-list",
    });
    this.renderPathsList(listContainer);

    new Setting(containerEl)
      .setName("Add log folder")
      .setDesc("Add a folder to scan for log entries.")
      .addButton((btn) =>
        btn
          .setButtonText("+ Add folder")
          .setCta()
          .onClick(async () => {
            if (!this.settings.logPaths)
              this.settings.logPaths = [];
            this.settings.logPaths.push("");
            await this.plugin.saveSettings();
            this.display();
          }),
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
        cls: "setting-item-description",
      });
      return;
    }

    paths.forEach((p, i) => {
      new Setting(container)
        .setName(`Folder ${i + 1}`)
        .setDesc(p === "" ? "Leave empty to scan entire vault" : "Folder path")
        .addText((text) =>
          text
            .setPlaceholder("e.g. Logs or Journal")
            .setValue(p)
            .onChange(async (value) => {
              this.settings.logPaths[i] = value;
              await this.plugin.saveSettings();
            }),
        )
        .addButton((btn) =>
          btn
            .setIcon("trash")
            .setTooltip("Remove")
            .onClick(async () => {
              this.settings.logPaths.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    });
  }
}

module.exports = { EchoFeature, EchoSettingTab };

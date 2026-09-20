"use strict";

const {
  Plugin,
  PluginSettingTab,
  Modal,
  Notice,
  Setting,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  excludePaths: [],
  showRibbon: true,
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

class HollowFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    // Ensure plugin settings are initialized
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
      callback: () => new HollowModal(this.app, this.settings).open(),
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
          },
        );
      }
    } else {
      if (this.ribbonIcon) {
        this.ribbonIcon.remove();
        this.ribbonIcon = null;
      }
    }
  }
}

class HollowModal extends Modal {
  constructor(app, settings) {
    super(app);
    this.settings = settings;
    this.files = [];
  }
  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("hollow-modal");
    contentEl.createEl("p", {
      text: "Scanning vault…",
      cls: "hollow-scanning",
    });
    this.files = await this.findHollowFiles();
    contentEl.empty();
    const header = contentEl.createEl("div", { cls: "hollow-header" });
    header.createEl("h2", { text: "Hollow notes" });
    this.countEl = header.createEl("p", {
      text: this.countText(),
      cls: "hollow-count",
    });
    if (this.files.length === 0) return;
    let armed = false;
    new Setting(contentEl)
      .setName("Delete all")
      .setDesc("Sends all hollow notes to the system trash.")
      .addButton((btn) => {
        btn
          .setButtonText("Delete all")
          .setWarning()
          .onClick(async () => {
            if (!armed) {
              armed = true;
              btn.setButtonText("Confirm — delete all?");
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
      cls: "hollow-path",
    });
    const actions = row.createEl("div", { cls: "hollow-actions" });
    const openBtn = actions.createEl("button", {
      text: "Open",
      cls: "hollow-btn",
    });
    openBtn.addEventListener("click", () => {
      this.app.workspace.getLeaf().openFile(file);
      this.close();
    });
    const delBtn = actions.createEl("button", {
      text: "Delete",
      cls: "hollow-btn hollow-btn-danger",
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
    return n === 0
      ? "No hollow notes found."
      : `${n} note${n === 1 ? "" : "s"} with no body content.`;
  }
  onClose() {
    this.contentEl.empty();
  }
}

class HollowSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    // Ensure settings exist
    if (!this.plugin.settings.hollow)
      this.plugin.settings.hollow = DEFAULT_SETTINGS;
    this.settings = this.plugin.settings.hollow;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Hollow" });

    new Setting(containerEl).setName("Show ribbon icon").addToggle((toggle) =>
      toggle.setValue(this.settings.showRibbon).onChange(async (value) => {
        this.settings.showRibbon = value;
        await this.plugin.saveSettings();
        this.plugin.features
          .find((f) => f instanceof HollowFeature)
          .updateRibbon();
      }),
    );

    containerEl.createEl("h3", { text: "Excluded folders" });
    containerEl.createEl("p", {
      text: "Hollow will skip notes inside these folders. Matches the folder name anywhere in the path.",
      cls: "setting-item-description",
    });
    const listContainer = containerEl.createEl("div", {
      cls: "hollow-paths-list",
    });
    this.renderExcludeList(listContainer);
    new Setting(containerEl)
      .setName("Add folder")
      .setDesc("Add a folder to exclude from the scan.")
      .addButton((btn) =>
        btn
          .setButtonText("+ Add folder")
          .setCta()
          .onClick(async () => {
            if (!this.settings.excludePaths) this.settings.excludePaths = [];
            this.settings.excludePaths.push("");
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }
  renderExcludeList(container) {
    container.empty();
    const paths = this.settings?.excludePaths || [];
    if (paths.length === 0) {
      container.createEl("p", {
        text: "No folders excluded.",
        cls: "hollow-scanning",
      });
      return;
    }
    paths.forEach((p, i) => {
      new Setting(container)
        .setName(`Folder ${i + 1}`)
        .setDesc(p === "" ? "Enter a folder name" : p)
        .addText((text) =>
          text
            .setPlaceholder("e.g. Templates  or  Archive/Old")
            .setValue(p)
            .onChange(async (value) => {
              this.settings.excludePaths[i] = value;
              await this.plugin.saveSettings();
            }),
        )
        .addButton((btn) =>
          btn
            .setIcon("trash")
            .setTooltip("Remove")
            .onClick(async () => {
              this.settings.excludePaths.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    });
  }
}

module.exports = { HollowFeature, HollowSettingTab };

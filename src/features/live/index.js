"use strict";

const { Plugin, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  baseURL: "https://example.com/",
  noPermalinkSuffix: "n/",
  showRibbon: true,
};

class LiveFeature {
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
      },
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

  slugify(str) {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
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
}

class LiveSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    if (!this.plugin.settings.live) this.plugin.settings.live = {
      baseURL: "https://francisfontaine.com/",
      noPermalinkSuffix: "n/",
      showRibbon: true,
    };
    this.settings = this.plugin.settings.live;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Live Settings" });

    new Setting(containerEl).setName("Show ribbon icon").addToggle((toggle) =>
      toggle.setValue(this.settings.showRibbon).onChange(async (value) => {
        this.settings.showRibbon = value;
        await this.plugin.saveSettings();
        this.plugin.features.find((f) => f instanceof LiveFeature).updateRibbon();
      }),
    );

    new Setting(containerEl)
      .setName("Base URL")
      .setDesc("The base URL for your public notes.")
      .addText((text) =>
        text
          .setPlaceholder("https://example.com/notes/")
          .setValue(this.settings.baseURL)
          .onChange(async (value) => {
            this.settings.baseURL = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("No permalink suffix")
      .setDesc("The suffix to add to the URL when there is no permalink frontmatter.")
      .addText((text) =>
        text
          .setPlaceholder("n/")
          .setValue(this.settings.noPermalinkSuffix)
          .onChange(async (value) => {
            this.settings.noPermalinkSuffix = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

module.exports = { LiveFeature, LiveSettingTab };

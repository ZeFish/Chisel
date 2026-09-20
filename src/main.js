"use strict";

const { Plugin, PluginSettingTab, Platform } = require("obsidian");

const { LiveFeature, LiveSettingTab } = require("./features/live/index.js");
const { EchoFeature, EchoSettingTab } = require("./features/echo/index.js");
const {
  HollowFeature,
  HollowSettingTab,
} = require("./features/hollow/index.js");
const {
  BasesFeedFeature,
  BasesFeedSettingTab,
} = require("./features/bases-feed/index.js");
const {
  SystemTrayFeature,
  SystemTraySettingTab,
} = require("./features/system-tray/index.js");
const {
  MediaManagerFeature,
  MediaManagerSettingTab,
} = require("./features/media-manager/index.js");
const {
  EinkFeature,
  EinkSettingTab,
} = require("./features/eink/index.js");
const {
  ScrollMapFeature,
  ScrollMapSettingTab,
} = require("./features/scroll-map/index.js");
const {
  SnippetManagerFeature,
  SnippetManagerSettingTab,
} = require("./features/snippet-manager/index.js");
const {
  DailyNavFeature,
  DailyNavSettingTab,
} = require("./features/daily-nav/index.js");
const {
  SeedbedsFeature,
  SeedbedsSettingTab,
} = require("./features/seedbeds/index.js");
const {
  InterfaceManagerFeature,
  InterfaceManagerSettingTab,
} = require("./features/interface-manager/index.js");
const {
  Base64FoldFeature,
  Base64FoldSettingTab,
} = require("./features/base64-fold/index.js");

class ChiselPlugin extends Plugin {
  async onload() {
    console.log("Chisel plugin loading...");
    this.settings = (await this.loadData()) || {};

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
      new Base64FoldFeature(this.app, this),
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
}

class ChiselSettingTab extends PluginSettingTab {
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
    navEl.style.cssText =
      "display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;";

    const tabs = [
      { id: "Live", tab: new LiveSettingTab(this.app, this.plugin) },
      { id: "Echo", tab: new EchoSettingTab(this.app, this.plugin) },
      { id: "Hollow", tab: new HollowSettingTab(this.app, this.plugin) },
      { id: "Feed", tab: new BasesFeedSettingTab(this.app, this.plugin) },
      { id: "Tray", tab: Platform.isDesktop ? new SystemTraySettingTab(this.app, this.plugin) : null },
      { id: "Media", tab: new MediaManagerSettingTab(this.app, this.plugin) },
      { id: "E-ink", tab: new EinkSettingTab(this.app, this.plugin) },
      { id: "Scroll Map", tab: new ScrollMapSettingTab(this.app, this.plugin) },
      { id: "Snippets", tab: new SnippetManagerSettingTab(this.app, this.plugin) },
      { id: "Daily Nav", tab: new DailyNavSettingTab(this.app, this.plugin) },
      { id: "Seedbeds", tab: new SeedbedsSettingTab(this.app, this.plugin) },
      { id: "Zen", tab: new InterfaceManagerSettingTab(this.app, this.plugin) },
      { id: "Base64", tab: new Base64FoldSettingTab(this.app, this.plugin) },
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
      cls: "chisel-settings-content",
    });
    const active = tabs.find((t) => t.id === this.currentTab) || tabs[0];
    active.tab.containerEl = contentEl;
    active.tab.display();
  }
}

module.exports = ChiselPlugin;

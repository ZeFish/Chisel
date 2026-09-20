"use strict";

const { Plugin, MarkdownView, Setting, PluginSettingTab } = require("obsidian");

const { descWithLinks } = require("../../constants.js");

const DEFAULT_SETTINGS = {
  position: "right",
  scrollbarWidth: 2,
  behavior: "map",
  opacity: 0.25,
};

class ScrollMapFeature {
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
        this.handleActiveLeafChange.bind(this),
      ),
    );
    // layout-change fires very frequently (editor reflow, scroll viewport, etc.).
    // Rebuilding on every one destroys the map and recreates it 500ms later,
    // making it flicker/vanish. Only do a full rebuild when the active leaf or
    // its mode (edit ↔ reading) actually changed; otherwise just refresh.
    this.plugin.registerEvent(
      this.app.workspace.on(
        "layout-change",
        this.handleLayoutChange.bind(this),
      ),
    );
    this.plugin.registerEvent(
      this.app.workspace.on("resize", this.updateScrollMap.bind(this)),
    );

    // Initial setup
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
    // Remove by ID if it still exists in the DOM, regardless of local references
    const existing = document.getElementById("obsidian-scroll-map-container");
    if (existing) {
      existing.remove();
    }
    this.scrollMapContainer = null;
    this.scrollIndicator = null;
  }

  handleActiveLeafChange() {
    // Remove old listener if exists
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

    // Use a longer delay to ensure the DOM has fully laid out
    setTimeout(() => {
      // Pick the scroller for the CURRENT mode. In reading mode the edit-mode
      // .cm-scroller still lingers in the DOM (just hidden), so we must not fall
      // back to it — we'd attach to an invisible element with no scroll.
      const mode = activeView.getMode?.(); // "source" | "preview"
      let scroller;
      if (mode === "preview") {
        scroller =
          activeView.containerEl.querySelector(".markdown-preview-view") ||
          activeView.containerEl.querySelector(".markdown-preview-scroller");
      } else {
        const editorEl =
          activeView.editor?.containerEl || activeView.containerEl;
        scroller = editorEl.querySelector(".cm-scroller");
      }
      // Last-resort fallback if the mode-specific scroller wasn't found.
      if (!scroller) {
        scroller =
          activeView.containerEl.querySelector(".cm-scroller") ||
          activeView.containerEl.querySelector(".markdown-preview-view") ||
          activeView.contentEl;
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

        // Retry logic: if dimensions are 0, try again shortly
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

    // Safely access settings
    const scrollbarWidth =
      this.settings?.scrollbarWidth || DEFAULT_SETTINGS.scrollbarWidth;
    const position = this.settings?.position || DEFAULT_SETTINGS.position;
    const opacity = this.settings?.opacity || DEFAULT_SETTINGS.opacity;
    const behavior = this.settings?.behavior || DEFAULT_SETTINGS.behavior;

    // Ensure container exists
    if (!this.scrollMapContainer || !this.scrollMapContainer.parentElement) {
      this.removeScrollMap(); // Clean up if orphaned
      this.scrollMapContainer = document.createElement("div");
      this.scrollMapContainer.id = "obsidian-scroll-map-container";
      this.scrollMapContainer.style.position = "absolute";
      this.scrollMapContainer.style.overflow = "hidden";
      this.scrollMapContainer.style.zIndex = "999";
      this.scrollMapContainer.style.backgroundColor = "transparent";

      containerEl.style.position = "relative";
      containerEl.appendChild(this.scrollMapContainer);
    }

    // Apply position styles
    if (position === "right" || position === "left") {
      this.scrollMapContainer.style.width = `${scrollbarWidth}px`;
      this.scrollMapContainer.style.height = "100%";
      this.scrollMapContainer.style.top = "0";
      this.scrollMapContainer.style.bottom = ""; // Reset
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
      this.scrollMapContainer.style.right = ""; // Reset
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
    // Always update opacity
    this.scrollIndicator.style.opacity = opacity.toString();

    // Update indicator
    const progress = (scrollTop / (scrollHeight - clientHeight)) * 100;

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
      // default map behavior
      const indicatorSize = (clientHeight / scrollHeight) * 100;
      const indicatorPos =
        (scrollTop / (scrollHeight - clientHeight)) * (100 - indicatorSize);

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
}

class ScrollMapSettingTab extends PluginSettingTab {
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
      cls: "setting-item-description",
    });
    desc.createEl("a", {
      text: "View Scroll Map Manual",
      href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map",
    });

    new Setting(containerEl)
      .setName("Scroll map position")
      .setDesc(descWithLinks("Where the scroll map indicator appears in the editor. § for layout tips.", [{ text: "See positioning guide", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }]))
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            right: "Right",
            left: "Left",
            top: "Top",
            bottom: "Bottom",
          })
          .setValue(this.settings.position || DEFAULT_SETTINGS.position)
          .onChange(async (v) => {
            this.settings.position = v;
            await this.plugin.saveSettings();
            this.plugin.features
              .find((f) => f instanceof ScrollMapFeature)
              .updateScrollMap();
          }),
      );

    new Setting(containerEl)
      .setName("Scrollbar width")
      .setDesc(descWithLinks("Visual thickness of the scroll indicator in pixels (1–10). § for visual examples.", [{ text: "See scroll map docs", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }]))
      .addSlider((slider) =>
        slider
          .setLimits(1, 10, 1)
          .setValue(
            this.settings.scrollbarWidth || DEFAULT_SETTINGS.scrollbarWidth,
          )
          .onChange(async (v) => {
            this.settings.scrollbarWidth = v;
            await this.plugin.saveSettings();
            this.plugin.features
              .find((f) => f instanceof ScrollMapFeature)
              .updateScrollMap();
          }),
      );

    new Setting(containerEl)
      .setName("Opacity")
      .setDesc(descWithLinks("Transparency of the indicator (0.1 = nearly invisible, 1 = fully opaque). § for recommended values.", [{ text: "See scroll map docs", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }]))
      .addSlider((slider) =>
        slider
          .setLimits(0.1, 1, 0.1)
          .setValue(this.settings.opacity || DEFAULT_SETTINGS.opacity)
          .onChange(async (v) => {
            this.settings.opacity = v;
            await this.plugin.saveSettings();
            this.plugin.features
              .find((f) => f instanceof ScrollMapFeature)
              .updateScrollMap();
          }),
      );

    new Setting(containerEl)
      .setName("Scroll map behavior")
      .setDesc(descWithLinks("Map mode shows a positional indicator; Progress mode shows a reading completion gauge. § for a full comparison.", [{ text: "Compare behaviors", href: "https://stnd.build/3-archives/obsidian-plugin#6-scroll-map" }]))
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            map: "Map (positional)",
            growth: "Progress (progressive)",
          })
          .setValue(this.settings.behavior || DEFAULT_SETTINGS.behavior)
          .onChange(async (v) => {
            this.settings.behavior = v;
            await this.plugin.saveSettings();
            this.plugin.features
              .find((f) => f instanceof ScrollMapFeature)
              .updateScrollMap();
          }),
      );
  }
}

module.exports = { ScrollMapFeature, ScrollMapSettingTab };

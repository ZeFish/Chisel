"use strict";

const { PluginSettingTab, Setting, Notice } = require("obsidian");
const { descWithLinks } = require("../../constants.js");


class InterfaceManagerFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    if (!plugin.settings.interface) {
      plugin.settings.interface = {
        zen: false,
        truncateFilenames: false,
        autoHideSidebars: false,
        defaultReadingMode: false,
        autoFocusLastLineOnMobile: false,
      };
    }
    // Migrate old separate toggles → zen
    const s = plugin.settings.interface;
    if (s.zen === undefined) {
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
      // Honor the frontmatter `mode` for whatever note is already open at boot.
      this.onFileOpen();
    });

    // Fires when a note is opened in the active leaf (including switching to a
    // tab that shows a *different* note) — but NOT on edits or metadata
    // refreshes. This is the "on open" trigger for honoring frontmatter `mode`.
    this.plugin.registerEvent(
      this.app.workspace.on("file-open", () => this.onFileOpen()),
    );

    // Metadata was re-parsed (an edit, a save, a sync). Keep the cheap body
    // classes in sync every time, but only enforce the view `mode` for a note
    // we *just* opened whose frontmatter wasn't ready in time — then never
    // again. Re-applying `mode` on every refresh used to yank the user back out
    // of a view they had switched to by hand (task 114).
    this.plugin.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.applySettings();
        if (file && file.path === this._pendingEnforceFile) {
          this._pendingEnforceFile = null;
          this.enforceReadingMode(true);
        }
      }),
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
      // Skip if the metadataCache catch already handled this open, or the user
      // moved to another note in the meantime.
      if (
        this._pendingEnforceFile &&
        this.app.workspace.getActiveFile()?.path === this._pendingEnforceFile
      ) {
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
      "stnd-hide-file-nav-header",
    );
  }

  applySettings() {
    document.body.classList.toggle("stnd-hide-vault-name", this.settings.zen);
    document.body.classList.toggle(
      "stnd-hide-file-nav-header",
      this.settings.zen,
    );

    this.applyTruncateFilenames();
  }

  // Publish-state classes (stnd-note-published / -public / -unlisted / -private)
  // are owned by the Standard Garden plugin — Atelier does not duplicate them.

  async enforceReadingMode(isOpening = false) {
    const activeView = this.app.workspace.getActiveViewOfType(
      require("obsidian").MarkdownView,
    );
    if (!activeView || !activeView.file) return;

    const meta = this.app.metadataCache.getFileCache(activeView.file);
    let mode = meta?.frontmatter?.mode;

    // Only apply default fallback if we are opening the file
    if (!mode && isOpening && this.settings.defaultReadingMode) {
      mode = "read";
    }

    if (!mode) return;

    mode = String(mode).toLowerCase().trim();
    const leaf = activeView.leaf;
    const viewState = leaf.getViewState();

    if (mode === "read") {
      if (viewState.state.mode !== "preview") {
        // Don't kick the user out of the editor if they are currently typing/focused,
        // unless we are specifically opening the file for the first time.
        if (!isOpening && activeView.editor?.hasFocus()) return;

        viewState.state.mode = "preview";
        leaf.setViewState(viewState);
      }
    } else if (mode === "edit" || mode === "source" || mode === "raw") {
      const targetSource = mode === "source" || mode === "raw";
      if (
        viewState.state.mode !== "source" ||
        viewState.state.source !== targetSource
      ) {
        viewState.state.mode = "source";
        viewState.state.source = targetSource;
        leaf.setViewState(viewState);

        if (
          isOpening &&
          this.settings.autoFocusLastLineOnMobile &&
          require("obsidian").Platform.isMobile
        ) {
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
      ".workspace-split.mod-right-split",
    );

    const collapseCmd = {
      left: "app:toggle-left-sidebar",
      right: "app:toggle-right-sidebar",
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
        "stnd-collapsing-right",
      );
    };

    const syncLeftClosedClass = () => {
      document.body.classList.toggle(
        "stnd-left-closed",
        !!leftSplit?.collapsed,
      );
    };
    this.plugin.registerEvent(
      this.app.workspace.on("layout-change", syncLeftClosedClass),
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

      let zoneLastX = 0,
        zoneLastY = 0,
        zoneLastT = 0;
      let zoneVelocityTimeout = null;

      const tryExpand = () => {
        cancelCollapse();
        const split = getSplit();
        if (split && split.collapsed) {
          hoverOpen[side] = true;
          onExpand
            ? onExpand()
            : this.app.commands.executeCommandById(collapseCmd[side]);
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
      onRibbonLeave,
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
          ".mod-root .workspace-tabs .workspace-tab-header-container .workspace-tab-header",
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
}

class InterfaceManagerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = this.plugin.settings.interface;
  }

  getFeature() {
    return this.plugin.features.find(
      (f) => f instanceof InterfaceManagerFeature,
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
      cls: "setting-item-description",
    });
    desc.createEl("a", {
      text: "View General Preferences Manual",
      href: "https://stnd.build/3-archives/obsidian-plugin",
    });

    new Setting(containerEl)
      .setName("Zen")
      .setDesc(descWithLinks(
        "Hide vault name, file explorer header, status bar, and tab header when only one tab is open. § for the full list of hidden elements.",
        [{ text: "See Zen mode guide", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
      ))
      .addToggle((t) =>
        t.setValue(this.settings.zen).onChange(async (v) => {
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
        }),
      );

    new Setting(containerEl)
      .setName("Truncate long filenames")
      .setDesc(descWithLinks(
        "Cut long file and folder names in the explorer with an ellipsis (\u2026) instead of clipping them. § for visual examples.",
        [{ text: "See General docs", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
      ))
      .addToggle((t) =>
        t.setValue(this.settings.truncateFilenames).onChange(async (v) => {
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
        }),
      );

    new Setting(containerEl)
      .setName("Default reading mode")
      .setDesc(descWithLinks(
        "Automatically open notes in reading mode when no mode is defined in frontmatter. Override per-note using § (`mode: read`, `mode: edit`, `mode: source`).",
        [{ text: "frontmatter mode keys", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
      ))
      .addToggle((t) =>
        t.setValue(this.settings.defaultReadingMode).onChange(async (v) => {
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
        }),
      );

    new Setting(containerEl)
      .setName("Focus last line on mobile")
      .setDesc(descWithLinks(
        "Scroll to and focus the last line when opening a note in edit mode on mobile. § for the mobile workflow guide.",
        [{ text: "See mobile tips", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
      ))
      .addToggle((t) =>
        t
          .setValue(this.settings.autoFocusLastLineOnMobile)
          .onChange(async (v) => {
            try {
              this.settings.autoFocusLastLineOnMobile = v;
              await this.save();
            } catch (err) {
              new Notice("Focus toggle error: " + err.message);
              console.error(err);
            }
          }),
      );

    new Setting(containerEl)
      .setName("Auto-hide sidebars")
      .setDesc(descWithLinks(
        "Hide sidebars and the ribbon until you hover near the edge of the screen. § for the hover zone behavior.",
        [{ text: "See auto-hide guide", href: "https://stnd.build/3-archives/obsidian-plugin#8-general--zen" }]
      ))
      .addToggle((t) =>
        t.setValue(this.settings.autoHideSidebars).onChange(async (v) => {
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
        }),
      );
  }
}

module.exports = { InterfaceManagerFeature, InterfaceManagerSettingTab };

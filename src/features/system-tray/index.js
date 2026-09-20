"use strict";

const obsidian = require("obsidian");
const { PluginSettingTab, Setting, Platform } = obsidian;
const { descWithLinks } = require("../../constants.js");


// Node builtins and Electron are unavailable on mobile. Requiring them at the
// module top level throws during plugin evaluation (this module is bundled and
// imported eagerly), which crashes Obsidian on mobile. Load them only on desktop.
let path = null;
let remote = null;
if (Platform.isDesktop) {
  try {
    path = require("path");
    remote = require("@electron/remote");
  } catch (e) {
    console.error("Atelier: Failed to load @electron/remote", e);
  }
}

const DEFAULT_SETTINGS = {
  enabled: true,
  hideOnLaunch: false,
  trayIconTooltip: "{{vault}} | Obsidian",
};

function getElectronWindow() {
  if (!Platform.isDesktop || !remote) return null;
  try {
    return remote.getCurrentWindow();
  } catch {
    return null;
  }
}

class SystemTrayFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    plugin.settings.systemTray = {
      ...DEFAULT_SETTINGS,
      ...(plugin.settings.systemTray || {}),
    };
    this.settings = plugin.settings.systemTray;
    this.vaultWindows = new Set();
    this.maximizedWindows = new Set();
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
      // Cleanup any stale tray icon from previous plugin loads (dev/reloads)
      if (
        window._atelierTray &&
        typeof window._atelierTray.destroy === "function"
      ) {
        try {
          window._atelierTray.destroy();
        } catch (e) {}
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

      // Only hide if we are actually at "startup" or "system boot"
      // On macOS, we can check if it was opened as a hidden login item.
      // On other platforms, we might check wasOpenedAtLogin.
      let shouldHide = true;
      try {
        const loginSettings = remote.app.getLoginItemSettings();
        // wasOpenedAsHidden is specific to macOS
        // wasOpenedAtLogin is more general
        shouldHide =
          loginSettings.wasOpenedAsHidden || loginSettings.wasOpenedAtLogin;
      } catch (e) {
        // Fallback to hiding if we can't detect, but only once per session
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
      const { TrayManager } = require("./tray-manager.js");
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
          },
        },
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

      if (
        rootLeaves.length === 0 ||
        (rootLeaves.length === 1 && rootLeaves[0].view.getViewType() === "empty")
      ) {
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
    remote
      .getCurrentWindow()
      .webContents.on("did-create-window", onWindowCreation);
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

  handleBeforeUnload = (event) => {
    if (this.isAppQuitting) return;
    if (Platform.isDesktop && remote) {
      remote.getCurrentWindow().hide();
    }
    event.stopImmediatePropagation();
    event.returnValue = false;
  };

  handleWindowClose = (event) => {
    if (this.isAppQuitting) return;
    event.preventDefault();
  };

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
}

class SystemTraySettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = this.plugin.settings.systemTray;
  }

  getFeature() {
    return this.plugin.features.find((f) => f instanceof SystemTrayFeature);
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
      cls: "setting-item-description",
    });
    desc.createEl("a", {
      text: "View System Tray Manual",
      href: "https://stnd.build/3-archives/obsidian-plugin#9-system-tray",
    });

    if (!Platform.isDesktop) {
      containerEl.createEl("p", {
        text: "System tray features are only available on desktop (Windows, macOS, Linux).",
        cls: "mod-warning",
      });
      return;
    }

    new Setting(containerEl)
      .setName("System Tray")
      .setDesc(descWithLinks(
        "Intercept the window close event and minimize Obsidian to the system tray instead of quitting. A tray icon lets you restore or fully quit at any time. § for platform-specific behavior.",
        [{ text: "See System Tray guide", href: "https://stnd.build/3-archives/obsidian-plugin#9-system-tray" }]
      ))
      .addToggle((toggle) =>
        toggle.setValue(this.settings.enabled !== false).onChange(async (v) => {
          this.settings.enabled = v;
          await this.save();
          const feature = this.getFeature();
          if (v) {
            feature.setupTrayManager();
            if (feature.trayManager) {
              try {
                feature.trayManager.createTrayIcon();
              } catch (e) {}
            }
            feature.setupBackgroundPersistence();
          } else {
            feature.teardownBackgroundPersistence();
            if (feature.trayManager) feature.trayManager.destroyTray();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Hide on launch")
      .setDesc(descWithLinks(
        "Launch Obsidian directly to the tray without showing the main window. § for the login item setup guide.",
        [{ text: "See startup guide", href: "https://stnd.build/3-archives/obsidian-plugin#9-system-tray" }]
      ))
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.hideOnLaunch || false)
          .onChange(async (v) => {
            this.settings.hideOnLaunch = v;
            await this.save();
          }),
      );
  }
}

module.exports = { SystemTrayFeature, SystemTraySettingTab };

"use strict";

// Desktop-only. This module is required lazily from index.js's
// setupTrayManager(), which only runs when Platform.isDesktop — so the
// Electron/Node requires below never execute on mobile.
const remote = require("@electron/remote");
const path = require("path");

const LOG_PREFIX = "obsidian-tray";
const TRAY_ICON_FILENAME = "trayTemplate.png";
const ACTION_DAILY_NOTE = "Daily Note";
const ACTION_OPEN = "Open Obsidian";
const ACTION_CLOSE = "Close Vault";

const log = (message) => console.log(`${LOG_PREFIX}: ${message}`);

class TrayManager {
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
      `icon size: ${obsidianIcon.getSize().width}x${obsidianIcon.getSize().height}`,
    );

    const contextMenu = remote.Menu.buildFromTemplate([
      {
        type: "normal",
        label: ACTION_DAILY_NOTE,
        click: this.callbacks.onDailyNote,
      },
      { type: "normal", label: ACTION_OPEN, click: this.callbacks.onOpen },
      { type: "separator" },
      { label: ACTION_CLOSE, click: this.callbacks.onClose },
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
}

module.exports = { TrayManager };

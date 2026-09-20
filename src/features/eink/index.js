"use strict";

const { PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  mode: "auto", // auto, always, never
  interceptVolume: true,
  interceptPageKeys: true,
  interceptArrows: false,
  scrollDistance: 85, // Percentage of view height to scroll
  disableSmoothScroll: true, // Disable smooth scroll by default for e-ink
  volUpAction: "scroll-up", // Actions: scroll-up, history-back, none
  volDownAction: "scroll-down", // Actions: scroll-down, history-forward, none
  fontWeight: "normal", // light, normal, medium, bold
  fontFamily: "Fraunces", // Active font family for text, header and interface
  bookModeEnabled: true,
};

class EinkFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.isActive = false;

    // Migrate settings if needed
    if (this.plugin.settings.eink && this.plugin.settings.eink.mode === undefined) {
      if (this.plugin.settings.eink.themeEnabled !== undefined) {
        this.plugin.settings.eink.mode = this.plugin.settings.eink.themeEnabled;
      } else if (this.plugin.settings.eink.enabled === false) {
        this.plugin.settings.eink.mode = "never";
      }
    }

    // Initialize settings with defaults
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(this.plugin.settings.eink || {})
    };
    this.plugin.settings.eink = this.settings;

    // Bind event handlers to maintain references during unloading
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
    const shouldEnable = 
      this.settings.mode === "always" || 
      (this.settings.mode === "auto" && this.isEinkDevice());

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

    // Apply the selected font family as a body style property
    let fontValue = this.settings.fontFamily || "Fraunces";
    if (fontValue !== "var(--font-default)" && !fontValue.startsWith('"')) {
      fontValue = `"${fontValue}"`;
    }
    
    document.body.style.setProperty("--font-text", fontValue, "important");
    document.body.style.setProperty("--font-header", fontValue, "important");
    document.body.style.setProperty("--font-interface", fontValue, "important");

    // Add font face adjustments helper class if Fraunces is selected
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

    // Clean up CSS properties
    document.body.style.removeProperty("--font-text");
    document.body.style.removeProperty("--font-header");
    document.body.style.removeProperty("--font-interface");
  }

  registerEvents() {
    this.unregisterEvents(); // Safety check to prevent duplicate listeners
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

    // Skip intercepting non-volume keys if user is editing text
    if (!isVolumeKey) {
      const activeEl = document.activeElement;
      const isEditing = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.contentEditable === "true" ||
        activeEl.classList.contains("cm-content")
      );
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
    // Intercept volume keyup to prevent system volume overlay on Android
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
    // direction: -1 for up, 1 for down
    const activeLeaf = this.app.workspace.activeLeaf;
    if (!activeLeaf) return;
    const view = activeLeaf.view;
    if (!view) return;
    const container = view.containerEl;
    if (!container) return;

    // Search for scrollable container:
    // - .cm-scroller for CodeMirror 6 editor (Source / Live Preview)
    // - .markdown-preview-view for Reading view
    // - .view-content as fallback
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
    return (
      ua.includes("onyx") ||
      ua.includes("boox") ||
      model.includes("note") ||
      model.includes("nova") ||
      model.includes("poke") ||
      model.includes("leaf") ||
      model.includes("page") ||
      model.includes("palma") ||
      model.includes("max") ||
      ua.includes("eink") ||
      ua.includes("ereader")
    );
  }
}

class EinkSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    if (!this.plugin.settings.eink) {
      this.plugin.settings.eink = { ...DEFAULT_SETTINGS };
    }
    this.settings = this.plugin.settings.eink;
  }

  getFeature() {
    return this.plugin.features.find((f) => f instanceof EinkFeature);
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
        cls: "callout",
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
        cls: "callout",
      });
      calloutEl.dataset.callout = "info";
      calloutEl.style.marginBottom = "20px";

      const titleEl = calloutEl.createEl("div", {
        cls: "callout-title",
      });
      titleEl.createEl("div", {
        cls: "callout-title-inner",
        text: "E-ink Tablet Detected",
      });

      const contentEl = calloutEl.createEl("div", {
        cls: "callout-content",
      });
      contentEl.createEl("p", {
        text: `Model detected: ${model || "Onyx Boox"}. For optimal button navigation, configure your device's physical buttons to 'Volume' mode in Obsidian's optimization settings on your e-reader.`
      });
    } else {
      const infoEl = containerEl.createEl("p", {
        cls: "setting-item-description",
      });
      if (model) {
        infoEl.setText(`Current device: ${model} (Not identified as a specific E-ink device).`);
      } else {
        infoEl.setText("Current device: Desktop or standard web browser.");
      }
      infoEl.style.fontStyle = "italic";
      infoEl.style.marginBottom = "20px";
    }

    new Setting(containerEl)
      .setName("Enable E-ink mode")
      .setDesc("Apply E-ink high-contrast rendering, disable animations, and enable physical navigation button support.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", "Auto (on detected e-reader)")
          .addOption("always", "Always active")
          .addOption("never", "Disabled")
          .setValue(this.settings.mode)
          .onChange(async (value) => {
            this.settings.mode = value;
            await this.save();
            this.getFeature().updateState();
          })
      );

    containerEl.createEl("h3", { text: "Physical Buttons & Scrolling" });

    new Setting(containerEl)
      .setName("Intercept volume keys")
      .setDesc("Map Volume Up and Volume Down (recommended on Onyx Boox configured in volume button mode).")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.interceptVolume).onChange(async (value) => {
          this.settings.interceptVolume = value;
          await this.save();
        })
      );

    new Setting(containerEl)
      .setName("Intercept page keys")
      .setDesc("Map Page Up and Page Down.")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.interceptPageKeys).onChange(async (value) => {
          this.settings.interceptPageKeys = value;
          await this.save();
        })
      );

    new Setting(containerEl)
      .setName("Intercept arrow keys")
      .setDesc("Map ArrowUp and ArrowDown (only when not editing text).")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.interceptArrows).onChange(async (value) => {
          this.settings.interceptArrows = value;
          await this.save();
        })
      );

    new Setting(containerEl)
      .setName("Prev / Volume Up action")
      .setDesc("Action triggered when pressing the previous page or volume up key.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("scroll-up", "Scroll Up")
          .addOption("history-back", "Previous Note (History)")
          .addOption("none", "None")
          .setValue(this.settings.volUpAction)
          .onChange(async (value) => {
            this.settings.volUpAction = value;
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Next / Volume Down action")
      .setDesc("Action triggered when pressing the next page or volume down key.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("scroll-down", "Scroll Down")
          .addOption("history-forward", "Next Note (History)")
          .addOption("none", "None")
          .setValue(this.settings.volDownAction)
          .onChange(async (value) => {
            this.settings.volDownAction = value;
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Scroll distance")
      .setDesc("Percentage of the screen height to scroll per action.")
      .addSlider((slider) =>
        slider
          .setLimits(10, 100, 5)
          .setValue(this.settings.scrollDistance)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.settings.scrollDistance = value;
            await this.save();
          })
      );

    new Setting(containerEl)
      .setName("Instant scroll")
      .setDesc("Disable smooth scrolling transitions to eliminate ghosting and flickering on E-ink screens.")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.disableSmoothScroll).onChange(async (value) => {
          this.settings.disableSmoothScroll = value;
          await this.save();
        })
      );

    containerEl.createEl("h3", { text: "E-ink Typography & Layout" });

    new Setting(containerEl)
      .setName("E-ink font family")
      .setDesc("Choose the active font family for text, headers, and UI interface in E-ink mode.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Fraunces", "Fraunces (Serif)")
          .addOption("Futura Now", "Futura Now (Geometric Sans)")
          .addOption("MonoLisa", "MonoLisa (Monospace)")
          .addOption("Atkinson Hyperlegible Next", "Atkinson Hyperlegible Next (Hyperlegible Sans)")
          .addOption("Atkinson Hyperlegible Mono", "Atkinson Hyperlegible Mono (Hyperlegible Mono)")
          .addOption("Berkeley Mono", "Berkeley Mono (Tech Monospace)")
          .addOption("EB Garamond", "EB Garamond (Classic Serif)")
          .addOption("Forrest", "Forrest (Warm Sans)")
          .addOption("Helvetica Now", "Helvetica Now (Neo-Grotesque)")
          .addOption("IBM Plex Sans", "IBM Plex Sans (Industrial Sans)")
          .addOption("IBM Plex Serif", "IBM Plex Serif (Industrial Serif)")
          .addOption("Inter", "Inter (Modern UI)")
          .addOption("var(--font-default)", "System Default")
          .setValue(this.settings.fontFamily || "Fraunces")
          .onChange(async (value) => {
            this.settings.fontFamily = value;
            await this.save();
            this.getFeature().updateState();
          })
      );

    new Setting(containerEl)
      .setName("Font weight")
      .setDesc("Choose character weight for screen rendering.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("light", "Light")
          .addOption("normal", "Normal")
          .addOption("medium", "Medium")
          .addOption("bold", "Bold")
          .setValue(this.settings.fontWeight)
          .onChange(async (value) => {
            this.settings.fontWeight = value;
            await this.save();
            this.getFeature().updateState();
          })
      );

    new Setting(containerEl)
      .setName("Book Mode")
      .setDesc("Justify text and enable auto-hyphenation in reading view.")
      .addToggle((toggle) =>
        toggle.setValue(this.settings.bookModeEnabled).onChange(async (value) => {
          this.settings.bookModeEnabled = value;
          await this.save();
          this.getFeature().updateState();
        })
      );
  }
}

module.exports = { EinkFeature, EinkSettingTab };

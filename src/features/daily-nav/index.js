"use strict";

const { MarkdownView, Setting, PluginSettingTab } = require("obsidian");
const { descWithLinks } = require("../../constants.js");

class DailyNavFeature {
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
    
    // Refresh when files are changed, created, or deleted so sequence updates
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
    // 1. Try Periodic Notes plugin
    const periodicNotes = this.app.plugins.getPlugin("periodic-notes");
    if (periodicNotes && periodicNotes.settings?.daily?.enabled) {
      const dailySettings = periodicNotes.settings.daily;
      return {
        format: dailySettings.format || "YYYY-MM-DD",
        folder: dailySettings.folder || "",
        template: dailySettings.template || ""
      };
    }

    // 2. Try native Daily Notes plugin
    const dailyNotesPlugin = this.app.internalPlugins.getPluginById("daily-notes");
    if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
      const options = dailyNotesPlugin.instance.options;
      return {
        format: options.format || "YYYY-MM-DD",
        folder: options.folder || "",
        template: options.template || ""
      };
    }

    // Fallback defaults
    return {
      format: "YYMMDD", // Default in user's vault is YYMMDD
      folder: "Logs",   // Default folder in user's vault is Logs
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
    
    // Update or clean up each open Markdown leaf
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const view = leaf.view;
      if (!view || !view.file) return;

      const isCurrentViewActive = activeView && activeView.leaf === leaf;
      
      // Check if this file is a daily note
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

      // It is a daily note! Render or update the pill
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
    // 1. Determine previous and next links
    let prevTarget = null; // { file: TFile } or { date: Moment, create: true }
    let nextTarget = null; // { file: TFile } or { date: Moment, create: true }

    const moment = window.moment;

    if (this.settings.navigationMode === "chronological") {
      const sortedNotes = this.getSortedDailyNotes(format, folder);
      const currentIndex = sortedNotes.findIndex(dn => dn.file.path === view.file.path);
      
      if (currentIndex !== -1) {
        if (currentIndex > 0) {
          prevTarget = { file: sortedNotes[currentIndex - 1].file };
        } else {
          // If no existing previous daily note, fall back to previous calendar day (creation)
          prevTarget = { date: currentDate.clone().subtract(1, "day"), create: true };
        }

        if (currentIndex < sortedNotes.length - 1) {
          nextTarget = { file: sortedNotes[currentIndex + 1].file };
        } else {
          // If no existing next daily note, fall back to next calendar day (creation)
          nextTarget = { date: currentDate.clone().add(1, "day"), create: true };
        }
      } else {
        // Current file is not in list yet, fallback to calendar
        prevTarget = { date: currentDate.clone().subtract(1, "day"), create: true };
        nextTarget = { date: currentDate.clone().add(1, "day"), create: true };
      }
    } else {
      // Literal calendar days (calendar mode)
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

    // 2. Create or reuse DOM elements
    let containerEl = view._stndDailyNavEl;
    if (!containerEl || !containerEl.isConnected) {
      containerEl = document.createElement("div");
      containerEl.className = "stnd-daily-nav-container";
      
      // Append directly to contentEl (sits at bottom of leaf pane, outside scroller)
      view.contentEl.style.position = "relative";
      view.contentEl.appendChild(containerEl);
      view._stndDailyNavEl = containerEl;
    }

    containerEl.empty();

    const pillEl = containerEl.createEl("div", { cls: "stnd-daily-nav-pill" });

    // 3. Render previous button
    this.createNavButton(pillEl, prevTarget, "prev", format);

    // Divider
    pillEl.createEl("div", { cls: "stnd-daily-nav-divider" });

    // 4. Render next button
    this.createNavButton(pillEl, nextTarget, "next", format);
  }

  createNavButton(parentEl, target, direction, format) {
    const moment = window.moment;
    let label = "";
    let btnClass = "stnd-daily-nav-btn";
    let clickHandler;

    if (target.file) {
      // Note exists
      const date = moment(target.file.basename, format, true);
      const formattedDate = date.isValid() ? date.format("D MMM") : target.file.basename;
      label = direction === "prev" ? `← ${formattedDate}` : `${formattedDate} →`;
      btnClass += " stnd-exists";

      clickHandler = () => {
        const leaf = this.app.workspace.getLeaf(false);
        leaf.openFile(target.file);
      };
    } else {
      // Note needs to be created
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
    
    // Set aria-label
    const actionLabel = target.create ? "Créer la note" : "Ouvrir la note";
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

    // Check once more
    let file = this.app.vault.getAbstractFileByPath(path);
    if (file) {
      await this.app.workspace.getLeaf(false).openFile(file);
      return;
    }

    // Ensure folder exists
    if (folder) {
      const folderExists = this.app.vault.getAbstractFileByPath(folder);
      if (!folderExists) {
        await this.app.vault.createFolder(folder);
      }
    }

    // Read template content
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

    // Create and open file
    try {
      const newFile = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf(false).openFile(newFile);
    } catch (err) {
      console.error("Standard: Erreur lors de la création de la note quotidienne :", err);
    }
  }

  replaceTemplateVariables(content, date, title) {
    let result = content;
    result = result.replace(/\{\{title\}\}/g, title);
    result = result.replace(/\{\{date\}\}/g, date.format("YYYY-MM-DD"));
    
    const moment = window.moment;
    result = result.replace(/\{\{time\}\}/g, moment().format("HH:mm"));
    
    // Date formats {{date:FORMAT}}
    const dateRegex = /\{\{date:(.*?)\}\}/g;
    let match;
    while ((match = dateRegex.exec(result)) !== null) {
      const formatStr = match[1];
      result = result.replace(match[0], date.format(formatStr));
    }
    
    // Time formats {{time:FORMAT}}
    const timeRegex = /\{\{time:(.*?)\}\}/g;
    while ((match = timeRegex.exec(result)) !== null) {
      const formatStr = match[1];
      result = result.replace(match[0], moment().format(formatStr));
    }
    
    return result;
  }
}

class DailyNavSettingTab extends PluginSettingTab {
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
      text: "Affiche deux boutons flottants au bas de vos notes quotidiennes pour passer facilement à la note précédente ou suivante. ",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Activer la navigation")
      .setDesc("Affiche la barre de navigation (pill) au bas des notes quotidiennes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.enabled)
          .onChange(async (v) => {
            this.settings.enabled = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof DailyNavFeature).refresh();
          })
      );

    new Setting(containerEl)
      .setName("Mode de navigation")
      .setDesc(descWithLinks(
        "Chronologique suit l'ordre des notes existantes dans votre coffre. Calendrier suit l'ordre des jours du calendrier.",
        []
      ))
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            chronological: "Chronologique (notes existantes)",
            calendar: "Calendrier (jour par jour)"
          })
          .setValue(this.settings.navigationMode)
          .onChange(async (v) => {
            this.settings.navigationMode = v;
            await this.plugin.saveSettings();
            this.plugin.features.find((f) => f instanceof DailyNavFeature).refresh();
          })
      );
  }
}

module.exports = { DailyNavFeature, DailyNavSettingTab };

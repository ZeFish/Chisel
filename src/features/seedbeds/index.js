"use strict";

const {
  Plugin,
  TFile,
  Setting,
  Notice,
  PluginSettingTab,
} = require("obsidian");
const { descWithLinks } = require("../../constants.js");

function toArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) {
    return val.filter(
      (item) => item !== null && item !== undefined && String(item).trim() !== "",
    );
  }
  const stringVal = String(val).trim();
  return stringVal !== "" ? [stringVal] : [];
}

class SeedbedsFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    if (!plugin.settings.seedbeds) plugin.settings.seedbeds = { rules: [] };
    this.settings = plugin.settings.seedbeds;
  }

  async load() {
    this.plugin.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (file instanceof TFile && file.extension === "md")
          await this.applyRules(file);
      }),
    );
    this.plugin.registerEvent(
      this.app.vault.on("create", async (file) => {
        if (file instanceof TFile && file.extension === "md")
          await this.applyRules(file);
      }),
    );

    this.plugin.addCommand({
      id: "auto-fm-apply-current",
      name: "Apply seedbed rules to current file",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "md") {
          await this.applyRules(file);
          new Notice("Seedbeds: rules applied.");
        } else {
          new Notice("No markdown file active.");
        }
      },
    });
  }

  async applyRules(file) {
    const path = file.path.replace(/\\/g, "/");
    const rules = this.settings?.rules || [];
    const matchingRules = rules.filter((r) =>
      this.isFileInFolder(path, r.folder),
    );

    if (matchingRules.length === 0) return;

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      const newValues = {};
      for (const rule of matchingRules) {
        for (const k in rule.frontmatter) {
          const incoming = rule.frontmatter[k];
          if (Array.isArray(incoming)) {
            const existing = toArray(frontmatter[k]);
            for (const val of incoming)
              if (!existing.includes(val)) existing.push(val);
            newValues[k] = existing;
          } else {
            if (k === "tags" || k === "tag" || k === "keywords") {
              const existing = toArray(frontmatter[k]);
              if (!existing.includes(incoming)) existing.push(incoming);
              newValues[k] = existing;
            } else {
              newValues[k] = incoming;
            }
          }
        }
      }

      for (const [key, newValue] of Object.entries(newValues)) {
        frontmatter[key] = newValue;
      }
    });
  }

  isFileInFolder(filePath, folder) {
    if (!folder) return false;
    const normFolder = folder.replace(/^\/+||\/+$/g, "").toLowerCase();
    if (normFolder === "") return false;
    const lastSlash = filePath.lastIndexOf("/");
    const dirPath = lastSlash === -1 ? "" : filePath.substring(0, lastSlash);
    const searchIn = "/" + dirPath.toLowerCase() + "/";
    const searchFor = "/" + normFolder + "/";
    return searchIn.includes(searchFor);
  }
}

class SeedbedsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    if (!this.plugin.settings.seedbeds) {
      this.plugin.settings.seedbeds = { rules: [] };
    }
    this.settings = this.plugin.settings.seedbeds;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Seedbeds (Auto Frontmatter)" });

    const desc = containerEl.createEl("p", {
      text: "Seedbeds automate metadata hygiene in your vault. When a markdown note is created inside or moved to a target folder, the plugin automatically writes the configured frontmatter properties to its YAML header without overwriting existing keys.",
      cls: "setting-item-description",
    });

    const listContainer = containerEl.createEl("div", {
      cls: "seedbeds-rules-list",
    });
    this.renderRulesList(listContainer);

    new Setting(containerEl)
      .setName("Add new seedbed")
      .setDesc("Create a new rule mapping a folder to a set of default frontmatter properties.")
      .addButton((btn) =>
        btn
          .setButtonText("+ Add a seedbed")
          .setCta()
          .onClick(async () => {
            if (!this.settings.rules) this.settings.rules = [];
            this.settings.rules.push({ folder: "", frontmatter: {} });
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }

  renderRulesList(container) {
    container.empty();
    const rules = this.settings?.rules || [];

    if (rules.length === 0) {
      container.createEl("p", {
        text: "No rules configured. Click the button above to add your first folder automation rule.",
        cls: "setting-item-description",
      });
      return;
    }

    rules.forEach((rule, i) => {
      const ruleContainer = container.createEl("div", {
        cls: "seedbed-rule-container",
      });
      ruleContainer.style.border = "1px solid var(--background-modifier-border)";
      ruleContainer.style.padding = "16px";
      ruleContainer.style.marginBottom = "24px";
      ruleContainer.style.borderRadius = "8px";
      ruleContainer.style.backgroundColor = "var(--background-secondary)";

      // Rule Header: Target Folder
      const pathSetting = new Setting(ruleContainer)
        .setName(`Seedbed ${i + 1}: Target Folder`)
        .setDesc("The folder path in your vault (e.g. Projects/Active)");
        
      pathSetting.addText((text) => {
          text
            .setPlaceholder("Folder path")
            .setValue(rule.folder)
            .onChange(async (value) => {
              this.settings.rules[i].folder = value.trim();
              await this.plugin.saveSettings();
            });

          const { FolderSuggest } = require("../../ui/folder-suggest.js");
          new FolderSuggest(this.app, text.inputEl);
        })
        .addButton((btn) =>
          btn
            .setIcon("trash")
            .setWarning()
            .setTooltip("Delete this seedbed")
            .onClick(async () => {
              this.settings.rules.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
        );
        
      ruleContainer.createEl("hr", { cls: "seedbed-divider" });

      // Properties List
      const entries = Object.entries(rule.frontmatter || {}).map(([key, value]) => {
        let type = "text";
        if (Array.isArray(value)) type = "list";
        else if (typeof value === "boolean") type = "boolean";
        else if (typeof value === "number") type = "number";
        return { key, value, type };
      });

      const rebuild = async () => {
        rule.frontmatter = {};
        entries.forEach((e) => {
          if (!e.key.trim()) return;
          if (e.type === "list") {
            if (Array.isArray(e.value)) rule.frontmatter[e.key] = e.value;
            else rule.frontmatter[e.key] = String(e.value).split(",").map((s) => s.trim()).filter((s) => s.length > 0);
          } else if (e.type === "number") {
            const num = Number(e.value);
            rule.frontmatter[e.key] = isNaN(num) ? 0 : num;
          } else if (e.type === "boolean") {
            rule.frontmatter[e.key] = !!e.value;
          } else {
            rule.frontmatter[e.key] = String(e.value);
          }
        });
        await this.plugin.saveSettings();
      };

      const renderPropertyRow = (entry) => {
        const propSetting = new Setting(ruleContainer)
          .setClass("seedbed-property-row");

        // 1. Clé
        propSetting.addText(t => {
            t.setPlaceholder("Key (e.g. status)");
            t.setValue(entry.key);
            t.inputEl.style.width = "120px";
            t.onChange(async (val) => {
              entry.key = val.trim();
              await rebuild();
            });
        });

        // 2. Type
        propSetting.addDropdown(d => {
            d.addOption("text", "Text");
            d.addOption("list", "List");
            d.addOption("number", "Number");
            d.addOption("boolean", "Boolean");
            d.setValue(entry.type);
            d.onChange(async (val) => {
              entry.type = val;
              if (val === "list") entry.value = typeof entry.value === "string" ? [entry.value] : [];
              else if (val === "boolean") entry.value = true;
              else if (val === "number") entry.value = 0;
              else entry.value = String(entry.value);
              await rebuild();
              this.display(); // Refresh to show correct input type
            });
        });

        // 3. Valeur
        if (entry.type === "boolean") {
          propSetting.addToggle(t => {
            t.setValue(!!entry.value);
            t.onChange(async (val) => {
              entry.value = val;
              await rebuild();
            });
          });
        } else if (entry.type === "number") {
          propSetting.addText(t => {
            t.inputEl.type = "number";
            t.setPlaceholder("0");
            t.setValue(String(entry.value));
            t.inputEl.style.width = "180px";
            t.onChange(async (val) => {
              entry.value = Number(val);
              await rebuild();
            });
          });
        } else if (entry.type === "list") {
          propSetting.addText(t => {
            t.setPlaceholder("val1, val2");
            t.setValue(Array.isArray(entry.value) ? entry.value.join(", ") : String(entry.value));
            t.inputEl.style.width = "180px";
            t.onChange(async (val) => {
              entry.value = val.split(",").map((s) => s.trim()).filter(Boolean);
              await rebuild();
            });
          });
        } else {
          propSetting.addText(t => {
            t.setPlaceholder("Value");
            t.setValue(String(entry.value));
            t.inputEl.style.width = "180px";
            t.onChange(async (val) => {
              entry.value = val;
              await rebuild();
            });
          });
        }

        // 4. Delete property
        propSetting.addExtraButton(b => {
          b.setIcon("cross");
          b.setTooltip("Remove property");
          b.onClick(async () => {
            const idx = entries.indexOf(entry);
            if (idx > -1) {
              entries.splice(idx, 1);
              await rebuild();
              this.display();
            }
          });
        });
        
        // Remove borders on property rows so they look grouped under the folder
        propSetting.settingEl.style.borderTop = "none";
        propSetting.settingEl.style.paddingTop = "0";
      };

      entries.forEach((entry) => {
        renderPropertyRow(entry);
      });

      // Add Property Button
      const btnSetting = new Setting(ruleContainer)
        .settingEl.style.borderTop = "none";
      
      const btnWrapper = ruleContainer.createEl("div");
      btnWrapper.style.display = "flex";
      btnWrapper.style.justifyContent = "flex-end";
      
      const addBtn = btnWrapper.createEl("button", { text: "+ Add property" });
      addBtn.onclick = async () => {
        const newEntry = { key: "", value: "", type: "text" };
        entries.push(newEntry);
        await rebuild();
        this.display();
      };
    });
  }
}

module.exports = { SeedbedsFeature, SeedbedsSettingTab };

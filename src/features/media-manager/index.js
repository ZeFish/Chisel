"use strict";

const { TFile, PluginSettingTab, Setting, Notice, TextComponent, ButtonComponent, Platform } = require("obsidian");
const { descWithLinks } = require("../../constants.js");


class VaultAuditFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    
    // Initialisation sécurisée des paramètres
    if (!this.plugin.settings.mediaManager) {
      this.plugin.settings.mediaManager = {
        enableSmartRename: true,
        onlyOnPasteOrDrop: true,
        enableOnMobile: false,
        aggressiveLinkFix: false,
        mediaFolder: "Kernel/attachments",
        timestampFormat: "YYMMDD_HHmm",
        timestampRegex: "^\\d{6}_\\d{4}_",
        excludeFolders: []
      };
    }
    this.settings = this.plugin.settings.mediaManager;
    if (this.settings.onlyOnPasteOrDrop === undefined) {
      this.settings.onlyOnPasteOrDrop = true;
    }
    if (this.settings.enableOnMobile === undefined) {
      this.settings.enableOnMobile = false;
    }
    if (this.settings.aggressiveLinkFix === undefined) {
      this.settings.aggressiveLinkFix = false;
    }
    this.plugin.vaultAudit = this;
    this.lastPasteOrDropTime = 0;
  }

  async load() {
    // Suivre les actions de collage et glisser-déposer utilisateur pour distinguer les ajouts manuels des synchronisations ou imports
    this.plugin.registerEvent(
      this.app.workspace.on("editor-paste", () => {
        this.lastPasteOrDropTime = Date.now();
      })
    );
    this.plugin.registerEvent(
      this.app.workspace.on("editor-drop", () => {
        this.lastPasteOrDropTime = Date.now();
      })
    );

    // Intercepter la création de nouveaux fichiers (Smart Media Manager)
    this.plugin.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          this.handleNewFile(file);
        }
      })
    );
  }

  async handleNewFile(file) {
    if (!this.settings.enableSmartRename) return;

    // Ne jamais auto-renommer sur mobile par défaut pour éviter les conflits Obsidian Sync
    if (Platform.isMobile && !this.settings.enableOnMobile) {
      return;
    }

    if (!this.isMediaFile(file)) return;

    // Si onlyOnPasteOrDrop est actif, ignorer les créations de fichiers sans action utilisateur récente (Sync, imports en masse, etc.)
    if (this.settings.onlyOnPasteOrDrop) {
      const elapsed = Date.now() - (this.lastPasteOrDropTime || 0);
      if (elapsed > 4000) {
        return;
      }
    }

    // Vérifier si le fichier est dans un dossier exclu
    if (this.settings.excludeFolders) {
      let excludeList = [];
      if (Array.isArray(this.settings.excludeFolders)) {
        excludeList = this.settings.excludeFolders;
      } else if (typeof this.settings.excludeFolders === "string") {
        excludeList = this.settings.excludeFolders.split(",");
      }

      const normalizedList = excludeList
        .map((f) => String(f).trim().replace(/^\/+/, "").replace(/\/+$/, ""))
        .filter((f) => f.length > 0);

      const isExcluded = normalizedList.some((folder) => {
        return file.path.startsWith(folder + "/");
      });

      if (isExcluded) {
        console.log(`[Standard] Média ignoré car dans un dossier exclu : ${file.path}`);
        return;
      }
    }

    // Petit délai pour laisser Obsidian finaliser la création et l'insertion du lien
    setTimeout(async () => {
      // Re-vérifier l'existence du fichier
      const currentFile = this.app.vault.getAbstractFileByPath(file.path);
      if (!currentFile || !(currentFile instanceof TFile)) return;

      await this.processMediaRenameAndMove(currentFile);
    }, 1500);
  }

  isMediaFile(file) {
    const ext = file.extension.toLowerCase();
    const mediaExtensions = [
      "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp",
      "mp4", "webm", "mov", "ogv",
      "mp3", "wav", "m4a", "ogg", "flac",
      "pdf"
    ];
    return mediaExtensions.includes(ext);
  }

  hasTimestamp(filename) {
    // 1. Check user-defined regex from settings
    if (this.settings && this.settings.timestampRegex) {
      try {
        const userRegex = new RegExp(this.settings.timestampRegex);
        if (userRegex.test(filename)) return true;
      } catch (e) {
        console.error("[Standard] Invalid timestampRegex:", e);
      }
    }

    // 2. Built-in robust timestamp patterns
    const patterns = [
      /^\d{6}_\d{4}_/,       // YYMMDD_HHmm_ (ex: 260619_0929_)
      /^\d{4}_\d{4}_/,       // YYYY_MMDD_ (ex: 2019_0310_)
      /^\d{4}_\d{2}_\d{2}_/, // YYYY_MM_DD_ (ex: 2019_03_10_)
      /^\d{4}-\d{2}-\d{2}/,   // YYYY-MM-DD (ex: 2019-03-10)
      /^\d{6}\s*-\s*/,       // YYMMDD - (ex: 240221 - )
      /^\d{8}\s*-\s*/,       // YYYYMMDD - (ex: 20240221 - )
      /^\d{6}_/,             // YYMMDD_ (ex: 240309_)
      /^\d{8}_/,             // YYYYMMDD_ (ex: 20240309_)
      /^\d{6}-\d{6}/,        // YYMMDD-HHMMSS
      /^\d{13}/,             // Milliseconds timestamp (ex: 1552472446693)
      /^(?:mvimg|img|screenshot|received|lrm_export)[-_\s]?\d+/i // Common photo/screenshot prefixes followed by numbers
    ];

    return patterns.some(pattern => pattern.test(filename));
  }

  async processMediaRenameAndMove(file) {
    const targetFolder = this.settings.mediaFolder || "Kernel/attachments";
    const alreadyTimestamped = this.hasTimestamp(file.name);
    const isInTargetFolder = file.parent?.path === targetFolder;

    // Si le fichier a déjà un horodatage et est dans le dossier cible, on n'a rien à faire
    if (alreadyTimestamped && isInTargetFolder) {
      return;
    }

    // S'assurer que le dossier de stockage cible existe
    const folderExists = this.app.vault.getAbstractFileByPath(targetFolder);
    if (!folderExists) {
      await this.app.vault.createFolder(targetFolder);
    }

    const oldName = file.name;

    let newName = file.name;
    if (!alreadyTimestamped) {
      const timestamp = this.getTimestamp(this.settings.timestampFormat);
      newName = `${timestamp}_${file.name}`;
    }

    // Calculer un chemin unique pour éviter d'écraser des fichiers existants
    const ext = file.extension;
    const baseName = newName.substring(0, newName.length - ext.length - 1);
    const uniquePath = await this.getUniquePath(targetFolder, baseName, ext);

    try {
      await this.app.fileManager.renameFile(file, uniquePath);
      new Notice(`Managed media: ${file.name} -> ${uniquePath.split("/").pop()}`);

      // Obsidian met à jour les liens nativement avec app.fileManager.renameFile.
      // Réparation optionnelle des liens non résolus si activée dans les réglages
      if (this.settings.aggressiveLinkFix) {
        setTimeout(async () => {
          await this.fixUnresolvedLinksForRename(oldName, uniquePath);
        }, 1000);
      }
    } catch (err) {
      console.error("[Standard] Échec du renommage/déplacement de pièce jointe:", err);
      new Notice("Error managing media");
    }
  }

  getTimestamp(format) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    if (format === "YYMMDD_HHmm") {
      return `${yy}${mm}${dd}_${hh}${min}`;
    } else if (format === "YYYYMMDDHHmmss") {
      return `${now.getFullYear()}${mm}${dd}${hh}${min}${ss}`;
    } else if (format === "ms") {
      return String(now.getTime());
    }
    return `${yy}${mm}${dd}_${hh}${min}`;
  }

  async getUniquePath(folder, baseName, ext) {
    let targetPath = `${folder}/${baseName}.${ext}`;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(targetPath)) {
      targetPath = `${folder}/${baseName}_${counter}.${ext}`;
      counter++;
    }
    return targetPath;
  }

  // ─── Logique de l'Auditeur du Coffre ───────────────────────────────────────
  async performAudit() {
    const notes = this.app.vault.getMarkdownFiles();
    const allFiles = this.app.vault.getFiles();

    const brokenEmbeds = []; // { file: TFile, link: string, original: string, isMedia: boolean }
    const brokenLinks = [];  // { file: TFile, link: string, original: string }
    const referencedPaths = new Set();

    // 1. Parcourir les notes pour collecter les liens et embeds brisés
    let noteIndex = 0;
    for (const note of notes) {
      noteIndex++;
      if (noteIndex % 100 === 0) {
        // Yield to the event loop to keep the UI responsive
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const cache = this.app.metadataCache.getFileCache(note);
      if (!cache) continue;

      if (cache.embeds) {
        for (const embed of cache.embeds) {
          const dest = this.app.metadataCache.getFirstLinkpathDest(embed.link, note.path);
          if (dest) {
            referencedPaths.add(dest.path);
          } else {
            // Ignorer les liens externes web
            if (/^https?:\/\//i.test(embed.link)) continue;
            
            const isMedia = this.isMediaLink(embed.link);
            brokenEmbeds.push({
              file: note,
              link: embed.link,
              original: embed.original,
              isMedia,
              line: embed.position?.start?.line ?? 0,
              startOffset: embed.position?.start?.offset ?? 0,
              endOffset: embed.position?.end?.offset ?? 0
            });
          }
        }
      }

      if (cache.links) {
        for (const link of cache.links) {
          const dest = this.app.metadataCache.getFirstLinkpathDest(link.link, note.path);
          if (dest) {
            referencedPaths.add(dest.path);
          } else {
            // Ignorer les liens externes web
            if (/^https?:\/\//i.test(link.link)) continue;

            brokenLinks.push({
              file: note,
              link: link.link,
              original: link.original,
              line: link.position?.start?.line ?? 0,
              startOffset: link.position?.start?.offset ?? 0,
              endOffset: link.position?.end?.offset ?? 0
            });
          }
        }
      }
    }

    // 2. Extraire toutes les références resolvedLinks (couvre les Canvases et autres types)
    let entryIndex = 0;
    for (const [sourcePath, links] of Object.entries(this.app.metadataCache.resolvedLinks)) {
      entryIndex++;
      if (entryIndex % 500 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      for (const destPath of Object.keys(links)) {
        referencedPaths.add(destPath);
      }
    }

    // 3. Identifier les fichiers de médias physiques orphelins
    const orphanedMedia = [];
    let fileIndex = 0;
    for (const file of allFiles) {
      fileIndex++;
      if (fileIndex % 1000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (this.isMediaFile(file)) {
        if (!referencedPaths.has(file.path)) {
          orphanedMedia.push(file);
        }
      }
    }

    return {
      brokenEmbeds,
      brokenLinks,
      orphanedMedia
    };
  }

  isMediaLink(linkPath) {
    const ext = (linkPath.split(".").pop() || "").toLowerCase();
    const mediaExtensions = [
      "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp",
      "mp4", "webm", "mov", "ogv",
      "mp3", "wav", "m4a", "ogg", "flac",
      "pdf"
    ];
    return mediaExtensions.includes(ext);
  }

  // ─── Actions de réparation ────────────────────────────────────────────────
  
  // Chercher des fichiers candidats ayant le même nom de fichier dans le coffre
  async findCandidates(missingLink) {
    const allFiles = this.app.vault.getFiles();
    const cleanLink = missingLink.split("/").pop().toLowerCase();
    
    return allFiles.filter(file => {
      return file.name.toLowerCase() === cleanLink;
    });
  }

  async resolveBrokenEmbed(item, candidatePath) {
    const file = item.file;
    const content = await this.app.vault.read(file);
    const original = item.original;
    
    const candidateFile = this.app.vault.getAbstractFileByPath(candidatePath);
    if (!candidateFile) return false;

    // Relier avec le chemin absolu dans le coffre
    const newLink = `![[${candidateFile.path}]]`;

    if (item.startOffset !== undefined && item.endOffset !== undefined) {
      const before = content.substring(0, item.startOffset);
      const after = content.substring(item.endOffset);
      await this.app.vault.modify(file, before + newLink + after);
      return true;
    }
    
    const newContent = content.replace(original, newLink);
    await this.app.vault.modify(file, newContent);
    return true;
  }

  async removeBrokenReference(item) {
    const file = item.file;
    const content = await this.app.vault.read(file);
    const original = item.original;

    if (item.startOffset !== undefined && item.endOffset !== undefined) {
      const before = content.substring(0, item.startOffset);
      const after = content.substring(item.endOffset);
      await this.app.vault.modify(file, before + after);
      return true;
    }

    const newContent = content.replace(original, "");
    await this.app.vault.modify(file, newContent);
    return true;
  }

  async createMissingNote(item) {
    const linkPath = item.link;
    const activeFile = item.file;

    let notePath = linkPath;
    if (!notePath.endsWith(".md")) {
      notePath += ".md";
    }

    try {
      const folderPath = notePath.includes("/") 
        ? notePath.substring(0, notePath.lastIndexOf("/")) 
        : "";
      
      if (folderPath) {
        const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folderExists) {
          await this.app.vault.createFolder(folderPath);
        }
      }

      await this.app.vault.create(
        notePath,
        `# ${linkPath.split("/").pop()}\n\nNote créée automatiquement pour résoudre un lien brisé depuis [[${activeFile.basename}]].\n`
      );
      return true;
    } catch (err) {
      console.error("[Standard] Échec de la création de la note manquante:", err);
      return false;
    }
  }

  async removeBrokenLink(item) {
    const file = item.file;
    const content = await this.app.vault.read(file);
    const original = item.original;
    
    let plainText = item.link;
    if (original.includes("|")) {
      const match = original.match(/\|([^\]]+)\]\]/);
      if (match) plainText = match[1];
    } else {
      const match = original.match(/\[\[([^\]]+)\]\]/);
      if (match) plainText = match[1];
    }

    if (item.startOffset !== undefined && item.endOffset !== undefined) {
      const before = content.substring(0, item.startOffset);
      const after = content.substring(item.endOffset);
      await this.app.vault.modify(file, before + plainText + after);
      return true;
    }

    const newContent = content.replace(original, plainText);
    await this.app.vault.modify(file, newContent);
    return true;
  }

  async deleteOrphan(file) {
    if (!(file instanceof TFile)) return false;
    await this.app.vault.delete(file);
    return true;
  }

  async fixDoubleTimestamps() {
    const audit = await this.performAudit();
    const { brokenEmbeds, orphanedMedia } = audit;
    
    let resolvedCount = 0;
    
    // Create a map of broken target names to their items for fast lookup
    const brokenMap = new Map();
    for (const item of brokenEmbeds) {
      const fileName = item.link.split("/").pop().toLowerCase();
      brokenMap.set(fileName, item);
    }
    
    for (const orphan of orphanedMedia) {
      // Check if orphan matches the timestamp pattern at the start
      const match = orphan.name.match(/^(\d{6}_\d{4}_)(.*)/);
      if (!match) continue;
      
      const targetName = match[2]; // Name without the first timestamp prefix
      const targetNameLower = targetName.toLowerCase();
      
      if (brokenMap.has(targetNameLower)) {
        // We found a match! Rename the physical orphan to targetName
        const targetPath = `${orphan.parent.path}/${targetName}`;
        try {
          await this.app.fileManager.renameFile(orphan, targetPath);
          resolvedCount++;
        } catch (err) {
          console.error(`[Standard] Échec du renommage d'horodatage pour ${orphan.name}:`, err);
        }
      }
    }
    
    return resolvedCount;
  }

  async fixUnresolvedLinksForRename(oldName, newPath) {
    const newName = newPath.split("/").pop();
    const unresolved = this.app.metadataCache.unresolvedLinks;
    
    for (const [sourcePath, links] of Object.entries(unresolved)) {
      let matchKey = null;
      for (const link of Object.keys(links)) {
        const linkClean = link.split("/").pop();
        if (linkClean === oldName) {
          matchKey = link;
          break;
        }
      }
      
      if (matchKey) {
        const noteFile = this.app.vault.getAbstractFileByPath(sourcePath);
        if (noteFile && noteFile instanceof TFile) {
          console.log(`[Standard] Réparation automatique du lien vers ${oldName} dans ${sourcePath}`);
          let content = await this.app.vault.read(noteFile);
          
          const escapedLink = matchKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          
          // Remplacer les liens Wiki
          const wikiRegex = new RegExp(`\\[\\[(${escapedLink})(\\|[^\\]]+)?\\]\\]`, 'g');
          content = content.replace(wikiRegex, (match, p1, p2) => {
            return `[[${newName}${p2 || ''}]]`;
          });
          
          // Remplacer les liens Markdown
          const urlEncodedLink = encodeURIComponent(matchKey).replace(/%2F/g, '/');
          const escapedUrlLink = urlEncodedLink.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const mdRegex = new RegExp(`\\[([^\\]]*)\\]\\((${escapedLink}|${escapedUrlLink})\\)`, 'g');
          content = content.replace(mdRegex, (match, p1, p2) => {
            const encodedNewName = encodeURIComponent(newName).replace(/%2F/g, '/');
            return `[${p1}](${encodedNewName})`;
          });
          
          await this.app.vault.modify(noteFile, content);
        }
      }
    }
  }
}

// ─── Interface de paramétrage de l'onglet Media Manager ─────────────────────
class MediaManagerSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    if (!this.plugin.settings.mediaManager) {
      this.plugin.settings.mediaManager = {
        enableSmartRename: true,
        onlyOnPasteOrDrop: true,
        enableOnMobile: false,
        aggressiveLinkFix: false,
        mediaFolder: "Kernel/attachments",
        timestampFormat: "YYMMDD_HHmm",
        timestampRegex: "^\\d{6}_\\d{4}_",
        excludeFolders: []
      };
    }
    this.settings = this.plugin.settings.mediaManager;
    if (this.settings.onlyOnPasteOrDrop === undefined) {
      this.settings.onlyOnPasteOrDrop = true;
    }
    if (this.settings.enableOnMobile === undefined) {
      this.settings.enableOnMobile = false;
    }
    if (this.settings.aggressiveLinkFix === undefined) {
      this.settings.aggressiveLinkFix = false;
    }
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Media Manager" });

    const desc = containerEl.createEl("p", {
      text: "Automatically renames and moves pasted or dropped media assets to keep your vault organized. ",
      cls: "setting-item-description",
    });
    desc.createEl("a", {
      text: "View Media Manager Manual",
      href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager",
    });

    new Setting(containerEl)
      .setName("Smart rename attachments")
      .setDesc(descWithLinks(
        "Intercepts newly pasted or dropped media, generates a unique timestamp prefix, and moves them to the configured folder. § for the naming format.",
        [{ text: "See Media Manager guide", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
      ))
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.enableSmartRename || false)
          .onChange(async (value) => {
            this.settings.enableSmartRename = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Only on paste or drop")
      .setDesc("Only intercept media when actively pasted or dropped into an open note editor. Prevents conflicts with Obsidian Sync and bulk note imports.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.onlyOnPasteOrDrop ?? true)
          .onChange(async (value) => {
            this.settings.onlyOnPasteOrDrop = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Enable on mobile devices")
      .setDesc("Allow auto-renaming attachments on mobile. Keep OFF to prevent Obsidian Sync from generating file collisions and broken links on mobile.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.enableOnMobile || false)
          .onChange(async (value) => {
            this.settings.enableOnMobile = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Aggressive link repair")
      .setDesc("Scans unresolved links and rewrites note files following a rename. Obsidian natively updates links on rename; keep disabled unless troubleshooting external link issues.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.settings.aggressiveLinkFix || false)
          .onChange(async (value) => {
            this.settings.aggressiveLinkFix = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Storage folder")
      .setDesc(descWithLinks(
        "Vault folder where all managed media files are moved after rename. § for recommended folder structures.",
        [{ text: "View setup guide", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
      ))
      .addText((text) => {
        text
          .setPlaceholder("Kernel/attachments")
          .setValue(this.settings.mediaFolder || "Kernel/attachments")
          .onChange(async (value) => {
            this.settings.mediaFolder = value.trim();
            await this.plugin.saveSettings();
          });

        const { FolderSuggest } = require("../../ui/folder-suggest.js");
        new FolderSuggest(this.app, text.inputEl);
      });

    // Dossiers Exclus Section — wrapped in a surface group
    const excludesSection = containerEl.createEl("div");
    excludesSection.style.cssText =
      "background: var(--background-secondary); border: 1px solid var(--background-modifier-border);" +
      "border-radius: 10px; padding: 16px 20px 8px; margin: 16px 0;";

    excludesSection.createEl("h3", { text: "Excluded folders" }).style.cssText =
      "margin: 0 0 6px; font-size: var(--font-ui-medium);";
    excludesSection.createEl("p", {
      text: "Ignore new media created in these folders.",
      cls: "setting-item-description"
    }).style.marginBottom = "12px";

    let rawExcludes = this.settings.excludeFolders;
    if (typeof rawExcludes === "string") {
      this.settings.excludeFolders = rawExcludes.split(",").map(s => s.trim()).filter(Boolean);
    } else if (!Array.isArray(this.settings.excludeFolders)) {
      this.settings.excludeFolders = [];
    }
    const excludes = this.settings.excludeFolders;

    const excludesListContainer = excludesSection.createEl("div");
    excludesListContainer.style.marginBottom = "8px";

    const renderExcludeRow = (folderPath, idx) => {
      const rowEl = excludesListContainer.createEl("div");
      rowEl.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:8px;";

      const textComp = new TextComponent(rowEl);
      textComp.setPlaceholder("e.g., Archive");
      textComp.setValue(folderPath);
      textComp.inputEl.style.flex = "1";
      textComp.onChange(async (val) => {
        excludes[idx] = val.trim();
        await this.plugin.saveSettings();
      });

      const { FolderSuggest } = require("../../ui/folder-suggest.js");
      new FolderSuggest(this.app, textComp.inputEl);

      new ButtonComponent(rowEl)
        .setIcon("trash")
        .setWarning()
        .setTooltip("Delete this exclusion")
        .onClick(async () => {
          excludes.splice(idx, 1);
          await this.plugin.saveSettings();
          this.display();
        });
    };

    excludes.forEach((folderPath, idx) => {
      renderExcludeRow(folderPath, idx);
    });

    // "Add" button sits inside the surface, flush at the bottom
    const addExclusionRow = excludesSection.createEl("div");
    addExclusionRow.style.cssText =
      "display:flex;justify-content:flex-end;padding-top:4px;" +
      "border-top:1px solid var(--background-modifier-border);margin-top:4px;";
    new ButtonComponent(addExclusionRow)
      .setButtonText("+ Add an exclusion")
      .onClick(async () => {
        excludes.push("");
        await this.plugin.saveSettings();
        this.display();
      });

    new Setting(containerEl)
      .setName("Timestamp format")
      .setDesc(descWithLinks(
        "Format used to prefix media filenames. § for a comparison of all available formats.",
        [{ text: "See timestamp formats", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
      ))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("YYMMDD_HHmm", "YYMMDD_HHmm (e.g., 260619_0904)")
          .addOption("YYYYMMDDHHmmss", "YYYYMMDDHHmmss")
          .addOption("ms", "Timestamp milliseconds")
          .setValue(this.settings.timestampFormat || "YYMMDD_HHmm")
          .onChange(async (value) => {
            this.settings.timestampFormat = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Timestamp exclusion regex")
      .setDesc(descWithLinks(
        "A regular expression used to detect if a file already carries a timestamp, preventing double-prefixing. § for regex syntax help.",
        [{ text: "View exclusion docs", href: "https://stnd.build/3-archives/obsidian-plugin#7-media-manager" }]
      ))
      .addText((text) =>
        text
          .setPlaceholder("^\\d{6}_\\d{4}_")
          .setValue(this.settings.timestampRegex || "^\\d{6}_\\d{4}_")
          .onChange(async (value) => {
            this.settings.timestampRegex = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}

module.exports = { VaultAuditFeature, MediaManagerFeature: VaultAuditFeature, MediaManagerSettingTab };

"use strict";

const { BasesView, MarkdownRenderer, Setting, Notice } = require("obsidian");

const VIEW_ID = "atelier-feed";

const DEFAULT_SETTINGS = {
  // How many entries to render at once (feeds can be huge — cap for perf).
  maxItems: 50,
  // Character budget for each card's markdown preview (0 = full note).
  previewChars: 600,
  // Show the first image embed / cover property as a card banner.
  showCovers: true,
};

/* ───────────────────────── The custom Bases view ───────────────────────── */

class FeedBasesView extends BasesView {
  // Required by BasesView — the type ID this instance reports.
  type = VIEW_ID;

  constructor(controller, containerEl, settings) {
    super(controller);
    this.feedContainerEl = containerEl;
    this.settings = settings;
    this.renderToken = 0;
  }

  onload() {
    this.feedContainerEl.addClass("atelier-feed");
    // Paint immediately on (re)attach. When the view is set as a base's default
    // and you navigate away and back, Obsidian reuses/reattaches the view and
    // empties the container, but onDataUpdated does NOT re-fire if the query
    // result is unchanged — leaving a frozen empty base. Rendering here too
    // guarantees a repaint whenever the view is shown.
    this._render();
  }

  onunload() {
    this.renderToken++; // cancel any in-flight async card renders
    this.feedContainerEl.removeClass("atelier-feed");
    this.feedContainerEl.empty();
  }

  // Called every time the query result / filters / config change.
  onDataUpdated() {
    this._render();
  }

  _render() {
    // Invalidate any in-flight async render so stale cards never land late.
    const token = ++this.renderToken;

    const root = this.feedContainerEl;
    if (!root) return;
    root.empty();

    // Data may not be ready yet on the very first attach — bail quietly;
    // onDataUpdated() will call us again once the query result arrives.
    if (!this.data) return;

    const entries = this.data?.data ?? [];
    if (entries.length === 0) {
      root.createDiv({ cls: "atelier-feed-empty", text: "Aucune note dans ce feed." });
      return;
    }

    // Read user options live from the Bases toolbar (fall back to settings).
    const maxItems = this._option("maxItems", this.settings.maxItems);
    const previewChars = this._option("previewChars", this.settings.previewChars);
    const showCovers = this._option("showCovers", this.settings.showCovers);

    const shown = entries.slice(0, maxItems);

    for (const entry of shown) {
      this._renderCard(root, entry, { previewChars, showCovers, token });
    }

    if (entries.length > shown.length) {
      root.createDiv({
        cls: "atelier-feed-more",
        text: `+ ${entries.length - shown.length} note(s) de plus — affine le filtre ou augmente la limite.`,
      });
    }
  }

  _option(key, fallback) {
    try {
      const v = this.config?.get?.(key);
      return v === undefined || v === null ? fallback : v;
    } catch {
      return fallback;
    }
  }

  _renderCard(root, entry, { previewChars, showCovers, token }) {
    const file = entry.file;
    if (!file) return;

    const card = root.createDiv({ cls: "atelier-feed-card" });

    // Header: title + date, whole header opens the note.
    const header = card.createDiv({ cls: "atelier-feed-card-header" });
    header.createDiv({ cls: "atelier-feed-title", text: file.basename });

    const mtime = file.stat?.mtime;
    if (mtime) {
      header.createDiv({
        cls: "atelier-feed-date",
        text: this._formatDate(mtime),
      });
    }

    // Click anywhere on the card (except links) opens the note.
    card.addEventListener("click", (evt) => {
      if (evt.target.closest("a")) return; // let internal links work
      this.app.workspace.getLeaf(evt.metaKey || evt.ctrlKey ? "tab" : false).openFile(file);
    });

    const body = card.createDiv({ cls: "atelier-feed-body" });

    // Async: read + render the note preview. Guarded by the render token.
    this.app.vault.cachedRead(file).then((raw) => {
      if (token !== this.renderToken) return; // a newer render superseded us

      let content = this._stripFrontmatter(raw);

      if (showCovers) {
        const cover = this._extractCover(content, entry);
        if (cover) {
          const img = body.createEl("img", { cls: "atelier-feed-cover" });
          img.src = cover;
        }
      }

      if (previewChars > 0 && content.length > previewChars) {
        content = content.slice(0, previewChars).trimEnd() + "…";
      }

      MarkdownRenderer.render(this.app, content, body, file.path, this).catch(() => {
        body.setText(content);
      });
    });
  }

  _stripFrontmatter(text) {
    // Remove a leading YAML frontmatter block so it doesn't show in the preview.
    if (text.startsWith("---")) {
      const end = text.indexOf("\n---", 3);
      if (end !== -1) {
        const after = text.indexOf("\n", end + 1);
        return after !== -1 ? text.slice(after + 1) : "";
      }
    }
    return text;
  }

  _extractCover(content, entry) {
    // 1. A `cover` or `image` frontmatter property, if the base exposes it.
    for (const key of ["cover", "image", "banner"]) {
      try {
        const v = entry.getValue?.(`note.${key}`);
        const s = v?.toString?.();
        if (s && /^https?:\/\//.test(s)) return s;
      } catch {
        /* property not present */
      }
    }
    // 2. First external image embed in the body.
    const m = content.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
    return m ? m[1] : null;
  }

  _formatDate(ms) {
    const d = new Date(ms);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
}

/* ───────────────────────── Atelier feature wrapper ──────────────────────── */

class BasesFeedFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    if (!plugin.settings.basesFeed) plugin.settings.basesFeed = { ...DEFAULT_SETTINGS };
    this.settings = plugin.settings.basesFeed;
    this.styleEl = null;
  }

  async load() {
    if (typeof this.plugin.registerBasesView !== "function") {
      console.warn("[Atelier] registerBasesView unavailable — Obsidian ≥ 1.10 required for the Feed view.");
      return;
    }

    this._injectStyles();

    this.plugin.registerBasesView(VIEW_ID, {
      name: "Feed",
      icon: "rss",
      factory: (controller, containerEl) =>
        new FeedBasesView(controller, containerEl, this.settings),
      // Per-base options surfaced in the Bases toolbar config menu.
      options: () => [
        { type: "slider", key: "maxItems", displayName: "Max entries", default: this.settings.maxItems, min: 5, max: 200, step: 5 },
        { type: "slider", key: "previewChars", displayName: "Preview length (chars, 0 = full)", default: this.settings.previewChars, min: 0, max: 2000, step: 100 },
        { type: "toggle", key: "showCovers", displayName: "Show cover images", default: this.settings.showCovers },
      ],
    });
  }

  async unload() {
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }

  _injectStyles() {
    if (this.styleEl) return;
    const el = document.createElement("style");
    el.id = "atelier-feed-styles";
    el.textContent = `
      .atelier-feed {
        overflow-y: auto;
        height: 100%;
        padding: var(--size-4-4, 1rem);
        display: flex;
        flex-direction: column;
        gap: var(--size-4-4, 1rem);
        max-width: 42rem;
        margin: 0 auto;
      }
      .atelier-feed-card {
        border: 1px solid var(--color-border, var(--background-modifier-border));
        border-radius: var(--radius-m, 8px);
        padding: var(--size-4-4, 1rem);
        background: var(--color-surface, var(--background-secondary));
        cursor: pointer;
        transition: border-color 120ms ease, transform 120ms ease;
      }
      .atelier-feed-card:hover {
        border-color: var(--color-accent, var(--interactive-accent));
      }
      .atelier-feed-card-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: var(--size-4-2, 0.5rem);
      }
      .atelier-feed-title {
        font-weight: var(--bold-weight, 600);
        color: var(--color-header, var(--color-foreground, var(--text-normal)));
      }
      .atelier-feed-date {
        font-size: var(--font-ui-smaller, 0.8em);
        color: var(--color-muted, var(--text-muted));
        white-space: nowrap;
      }
      .atelier-feed-body {
        color: var(--color-foreground, var(--text-normal));
        font-size: var(--font-ui-small, 0.9em);
        margin-block: var(--space) !important;
      }
      .atelier-feed-body > :first-child { margin-top: 0; }
      .atelier-feed-body > :last-child { margin-bottom: 0; }
      .atelier-feed-cover {
        width: 100%;
        border-radius: var(--radius-s, 4px);
        margin-bottom: var(--size-4-2, 0.5rem);
        object-fit: cover;
        max-height: 12rem;
      }
      .atelier-feed-empty, .atelier-feed-more {
        color: var(--color-muted, var(--text-muted));
        text-align: center;
        padding: var(--size-4-4, 1rem);
        font-size: var(--font-ui-small, 0.9em);
      }
    `;
    document.head.appendChild(el);
    this.styleEl = el;
  }
}

/* ───────────────────────────── Settings tab ─────────────────────────────── */

class BasesFeedSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    if (!plugin.settings.basesFeed) plugin.settings.basesFeed = { ...DEFAULT_SETTINGS };
    this.settings = plugin.settings.basesFeed;
  }

  display() {
    const { containerEl } = this;
    containerEl.createEl("h2", { text: "Feed (Bases view)" });
    containerEl.createEl("p", {
      text: "Defaults for the custom Feed view. Each .base can override these in its toolbar.",
      cls: "setting-item-description",
    });

    new Setting(containerEl)
      .setName("Max entries")
      .setDesc("How many notes to render in the feed at once.")
      .addText((t) =>
        t.setValue(String(this.settings.maxItems)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            this.settings.maxItems = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Preview length")
      .setDesc("Characters of each note to preview. 0 = render the full note.")
      .addText((t) =>
        t.setValue(String(this.settings.previewChars)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0) {
            this.settings.previewChars = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Show cover images")
      .setDesc("Display the first image embed (or cover/image property) as a banner.")
      .addToggle((tog) =>
        tog.setValue(this.settings.showCovers).onChange(async (v) => {
          this.settings.showCovers = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}

module.exports = { BasesFeedFeature, BasesFeedSettingTab };

const { Decoration, ViewPlugin, WidgetType } = require("@codemirror/view");
const { PluginSettingTab, Setting } = require("obsidian");
const { descWithLinks } = require("../../constants.js");

class Base64FoldWidget extends WidgetType {
  constructor(length) {
    super();
    this.length = length;
  }

  eq(other) {
    return other.length === this.length;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "atelier-base64-fold";
    span.textContent = `"[Base64 Data: ${this.length} chars]"`;
    span.title = "Click to expand";
    return span;
  }
}

// Matches url(data:<mime>;base64,<data>) for any MIME type, including
// application/* (fonts embedded in @font-face) and optional parameters
// like ;charset=utf-8 that may appear before ;base64,.
const base64UrlRegex =
  /url\(['"]?data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+=[\w.+-]+)*;base64,([A-Za-z0-9+/=]+)['"]?\)/g;

const base64FoldPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view) {
      const builder = [];
      const regex = new RegExp(base64UrlRegex.source, "g");
      const processedLines = new Set();

      for (let { from, to } of view.visibleRanges) {
        const startLine = view.state.doc.lineAt(from);
        const endLine = view.state.doc.lineAt(to);

        for (let l = startLine.number; l <= endLine.number; l++) {
          if (processedLines.has(l)) continue;
          processedLines.add(l);

          const line = view.state.doc.line(l);
          regex.lastIndex = 0;
          let match;

          while ((match = regex.exec(line.text)) !== null) {
            const base64Data = match[1];
            // Only fold if it's reasonably long
            if (base64Data.length > 100) {
              // Replace the *entire* base64 string, leaving `url(` and `)` visible
              // This is cleaner and avoids syntax highlighter confusion with quotes.
              const start = line.from + match.index + 4; // after "url("
              const end = line.from + match.index + match[0].length - 1; // before ")"

              // Check if cursor is inside the fold; if so, don't fold it so it can be edited
              const selection = view.state.selection.main;
              if (selection.from >= start && selection.to <= end) {
                continue;
              }

              builder.push(
                Decoration.replace({
                  widget: new Base64FoldWidget(base64Data.length),
                  inclusive: false,
                }).range(start, end),
              );
            }
          }
        }
      }

      // CodeMirror requires decorations to be sorted by start position
      builder.sort((a, b) => a.from - b.from);
      return Decoration.set(builder);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown: (e, view) => {
        const target = e.target;
        if (target.classList.contains("atelier-base64-fold")) {
          // Find where we clicked
          const pos = view.posAtDOM(target);
          // Move cursor there to "unfold" it (since our plugin avoids folding active selections)
          view.dispatch({ selection: { anchor: pos } });
          return true;
        }
      },
    },
  },
);

class Base64FoldFeature {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.extension = null;
    if (!plugin.settings.base64) plugin.settings.base64 = { enabled: true };
    this.settings = plugin.settings.base64;
  }

  async load() {
    if (!this.settings.enabled) return;
    try {
      this.extension = base64FoldPlugin;
      this.plugin.registerEditorExtension(this.extension);

      // Register Markdown Post Processor for Reading Mode
      this.plugin.registerMarkdownPostProcessor((el, ctx) => {
        // Find base64 strings inside code blocks in reading mode
        const codeBlocks = el.querySelectorAll("code");

        codeBlocks.forEach((codeEl) => {
          // Obsidian's syntax highlighter (Prism) splits long base64 strings into multiple
          // <span class="token string"> elements, sometimes even chopping them arbitrarily.
          // A simple regex on innerHTML fails if there are tags in the middle of the string.

          // 1. Extract all text nodes in order
          const walker = document.createTreeWalker(
            codeEl,
            NodeFilter.SHOW_TEXT,
            null,
            false,
          );
          const textNodes = [];
          let node;
          while ((node = walker.nextNode())) {
            textNodes.push(node);
          }

          if (textNodes.length === 0) return;

          // 2. Build a continuous string and a mapping back to the original text nodes
          let fullText = "";
          const nodeMap = []; // Maps character index in fullText to { node, offsetInNode }

          for (let i = 0; i < textNodes.length; i++) {
            const tNode = textNodes[i];
            const text = tNode.nodeValue;
            for (let j = 0; j < text.length; j++) {
              nodeMap.push({ node: tNode, offset: j });
            }
            fullText += text;
          }

          // 3. Find base64 strings in the continuous text
          const regex = new RegExp(base64UrlRegex.source, "g");
          let match;
          // Process matches in reverse order so DOM mutations don't mess up earlier offsets
          const matches = [];
          while ((match = regex.exec(fullText)) !== null) {
            if (match[1].length > 100) {
              matches.unshift({
                start: match.index + 4, // index of the character after 'url('
                end: match.index + match[0].length - 1, // index of the character before ')'
                dataLength: match[1].length,
              });
            }
          }

          // 4. Surgically replace the matched text across multiple nodes
          for (const m of matches) {
            const startMap = nodeMap[m.start];
            const endMap = nodeMap[m.end - 1]; // -1 because m.end is exclusive boundary

            if (startMap.node === endMap.node) {
              // Simple case: The whole base64 string is inside a single text node
              const textNode = startMap.node;
              const text = textNode.nodeValue;

              const before = text.substring(0, startMap.offset);
              const after = text.substring(endMap.offset + 1);

              const span = document.createElement("span");
              span.className = "atelier-base64-fold";
              span.textContent = `"[Base64 Data: ${m.dataLength} chars]"`;
              span.title = "Base64 data folded for performance";

              const fragment = document.createDocumentFragment();
              if (before) fragment.appendChild(document.createTextNode(before));
              fragment.appendChild(span);
              if (after) fragment.appendChild(document.createTextNode(after));

              textNode.parentNode.replaceChild(fragment, textNode);
            } else {
              // Complex case: The string spans multiple nodes

              // A. Truncate the start node
              const startNode = startMap.node;
              startNode.nodeValue = startNode.nodeValue.substring(
                0,
                startMap.offset,
              );

              // B. Insert the badge immediately after the start node
              const span = document.createElement("span");
              span.className = "atelier-base64-fold";
              span.textContent = `"[Base64 Data: ${m.dataLength} chars]"`;
              span.title = "Base64 data folded for performance";
              startNode.parentNode.insertBefore(span, startNode.nextSibling);

              // C. Delete all intermediate nodes entirely
              let currentNodeIndex = textNodes.indexOf(startNode) + 1;
              const endNodeIndex = textNodes.indexOf(endMap.node);

              while (currentNodeIndex < endNodeIndex) {
                const nodeToRemove = textNodes[currentNodeIndex];
                if (nodeToRemove.parentNode)
                  nodeToRemove.parentNode.removeChild(nodeToRemove);
                currentNodeIndex++;
              }

              // D. Truncate the end node (remove the beginning of it)
              const endNode = endMap.node;
              endNode.nodeValue = endNode.nodeValue.substring(
                endMap.offset + 1,
              );
            }
          }
        });
      });

      console.log("Atelier: Base64 Fold feature loaded");
    } catch (e) {
      console.error("Atelier: Failed to load Base64 Fold feature", e);
    }
  }

  async unload() {
    console.log("Atelier: Base64 Fold feature unloaded");
  }
}

class Base64FoldSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settings = plugin.settings.base64;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Base64 Fold" });

    const desc = containerEl.createEl("p", {
      text: "Automatically collapses long base64-encoded strings (images, fonts, binary data) in both the editor and reading view into a compact, expandable badge. Keeps your notes readable without losing the embedded data. ",
      cls: "setting-item-description",
    });
    desc.createEl("a", {
      text: "View Base64 Fold Manual",
      href: "https://stnd.build/3-archives/obsidian-plugin#10-base64-fold",
    });

    new Setting(containerEl)
      .setName("Enable Base64 Fold")
      .setDesc(descWithLinks(
        "Fold base64 strings longer than 100 characters into a compact badge. Click the badge to reveal. § for folding details.",
        [{ text: "See Base64 Fold docs", href: "https://stnd.build/3-archives/obsidian-plugin#10-base64-fold" }]
      ))
      .addToggle((t) =>
        t.setValue(this.settings.enabled !== false).onChange(async (v) => {
          this.settings.enabled = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}

module.exports = {
  Base64FoldFeature,
  Base64FoldSettingTab,
};

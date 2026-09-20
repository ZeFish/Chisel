# Chisel — Artisan Toolkit for Obsidian

[![Release](https://img.shields.io/github/v/release/ZeFish/Chisel?include_prereleases&style=flat-square)](https://github.com/ZeFish/Chisel/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-v1.6.0+-blue?style=flat-square)](https://obsidian.md)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-yellow.svg?style=flat-square)](https://www.gnu.org/licenses/gpl-3.0)

Chisel is an artisan companion plugin for Obsidian designed for thoughtful knowledge crafters. It unifies intelligent media handling, font and snippet styling, Zen distraction-free editing, and e-ink display optimizations into a cohesive, modular experience.

---

## ✨ Features

### 🖼️ Intelligent Media Manager
Stop cluttering your vault with randomly dumped screenshots and attachments.
- **Rule-Based Routing**: Route incoming media automatically to dedicated asset folders relative to each note or at a global vault root.
- **Clean Naming & Slugification**: Transform clumsy filenames like `CleanShot 2026-09-20 at 11.23.45.png` into clean, human-readable slugs.
- **Deduplication**: Automatically detects duplicate attachments using content hashes to prevent storage bloat.
- **Mobile & Sync Friendly**: Carefully guarded against sync conflicts and mobile file-system lag.

### 🎨 Snippets & Typography Engine
Refine your vault's visual identity note by note.
- **Note-Scoped Styling**: Dynamically apply styling rules and CSS snippets driven by frontmatter metadata (`cssclasses`, `theme`, or custom tags).
- **Custom Font Offloader**: Embed and manage high-quality web fonts directly inside your vault with an optimized, lightweight base64 engine.
- **Global CSS Cache**: Precompiles and persists stylesheets to `data.json` for lightning-fast startup on both desktop and mobile without recomputing heavy fonts.

### 🧘 Zen Interface Manager
Create a calm writing sanctuary whenever you need deep focus.
- **Distraction-Free Canvas**: Instantly collapse sidebars, ribbon buttons, tab headers, and status bars with a single toggle or hotkey.
- **Custom Chrome Rules**: Selectively show or hide individual Obsidian interface elements to tailor your ideal writing environment.

### 📖 E-ink & Reader Optimization
Built from experience for e-ink tablets (Onyx Boox, Supernote, Kindle Scribe, reMarkable).
- **High-Contrast Reader**: Crisp monochromatic typography and ultra-sharp line rendering tuned specifically for grayscale e-ink displays.
- **Zero-Latency Layouts**: Disables unnecessary visual animations and heavy blur effects to maximize responsiveness on e-paper screens.

### 🧭 Navigation & Workflow Essentials
- **Daily Navigation**: Fast keyboard shortcuts to navigate back and forth through daily journal entries.
- **Scroll Position Memory**: Preserves exact scroll states across pane switches and workspace reloads.
- **Base64 Fold**: Neatly collapses long base64 embedded data in the editor so your markdown stays clean and readable.

---

## 📦 Installation

### Option 1: Obsidian Community Plugins (Recommended)
1. Open **Settings** > **Community plugins** in Obsidian.
2. Ensure **Restricted mode** is turned **off**.
3. Click **Browse** and search for **Chisel**.
4. Click **Install**, then **Enable**.

*(Note: Currently submitted to the community directory. In the meantime, use Option 2 or 3.)*

### Option 2: Via Obsidian BRAT (Beta Reviewers Auto-update Tester)
1. Install and enable the **BRAT** plugin from Community Plugins.
2. In Obsidian, run the command `BRAT: Add a beta plugin for testing`.
3. Enter `ZeFish/Chisel` and confirm.

### Option 3: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release on the [Releases page](https://github.com/ZeFish/Chisel/releases).
2. Create a folder named `chisel` in your vault's plugins folder: `<vault>/.obsidian/plugins/chisel/`.
3. Copy the downloaded files into that folder.
4. Reload Obsidian and enable **Chisel** in **Settings** > **Community plugins**.

---

## ⚙️ Configuration

Chisel features a dedicated tabbed settings interface:
- **Media**: Set attachment target paths (e.g. `./assets`, `attachments/{note}`), file rename patterns, and mobile safety preferences.
- **Snippets**: Manage loaded theme snippets, custom font embedding, and view global cache status.
- **Zen**: Configure focus mode behaviors and interface elements to hide.
- **E-ink**: Toggle e-ink high contrast mode and grayscale rendering.
- **Daily Nav**: Customize daily note formats and navigation commands.

---

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/ZeFish/Chisel.git
cd Chisel

# Install dependencies
pnpm install

# Build the bundle (produces main.js and styles.css)
pnpm run build

# Watch mode during development
pnpm run dev
```

To automatically copy build artifacts to your Obsidian vault during development, define `VAULT_PLUGINS`:

```bash
export VAULT_PLUGINS="/path/to/your/vault/.obsidian/plugins"
pnpm run build
```

---

## 📄 License

Chisel is licensed under the [GNU General Public License v3.0](LICENSE).
Built with craftsmanship by [Francis Fontaine](https://github.com/ZeFish).

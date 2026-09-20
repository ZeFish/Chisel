"use strict";

const { AbstractInputSuggest, TFolder } = require("obsidian");

class FolderSuggest extends AbstractInputSuggest {
  constructor(app, inputEl, options = {}) {
    super(app, inputEl);
    this.app = app;
    this.inputEl = inputEl;
    this.multiselect = !!options.multiselect;
  }

  getSuggestions(query) {
    let folderQuery = query;
    if (this.multiselect) {
      const parts = query.split(",");
      folderQuery = parts[parts.length - 1];
    }
    
    const searchVal = folderQuery.trim().toLowerCase();
    const folders = [];
    const files = this.app.vault.getAllLoadedFiles();

    for (const file of files) {
      if (
        file instanceof TFolder &&
        file.path !== "/" &&
        file.path.toLowerCase().includes(searchVal)
      ) {
        folders.push(file.path);
      }
    }

    // Trier par ordre alphabétique et limiter à 100 suggestions
    return folders.sort().slice(0, 100);
  }

  renderSuggestion(value, el) {
    el.setText(value);
  }

  selectSuggestion(value) {
    if (this.multiselect) {
      const parts = this.inputEl.value.split(",");
      parts[parts.length - 1] = " " + value;
      this.inputEl.value = parts.join(",").trim();
    } else {
      this.inputEl.value = value;
    }
    this.inputEl.dispatchEvent(new Event("input"));
  }
}

module.exports = { FolderSuggest };

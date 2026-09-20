"use strict";

function descWithLinks(text, links = []) {
  const frag = document.createDocumentFragment();
  const parts = text.split("§");
  parts.forEach((part, i) => {
    if (part) frag.appendText(part);
    if (i < links.length) {
      const link = links[i];
      const a = frag.createEl("a", { text: link.text, href: link.href });
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.style.color = "var(--link-color, var(--interactive-accent))";
      a.style.textDecoration = "underline";
      a.style.textUnderlineOffset = "2px";
    }
  });
  return frag;
}

module.exports = {
  descWithLinks,
};

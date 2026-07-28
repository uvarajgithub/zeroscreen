(function () {
  "use strict";

  var replacements = [
    [/\u00e2\u20ac\u201d/g, "\u2014"],
    [/\u00e2\u20ac\u201c/g, "\u2013"],
    [/\u00e2\u20ac\u00a6/g, "\u2026"],
    [/\u00e2\u201a\u00b9/g, "\u20b9"],
    [/\u00c2\u00a9/g, "\u00a9"],
    [/\u00c2\u00b7/g, "\u00b7"],
    [/\u00c2/g, ""]
  ];

  function clean(value) {
    var text = String(value || "");
    replacements.forEach(function (pair) {
      text = text.replace(pair[0], pair[1]);
    });
    if (text.indexOf("?") === -1) return text;
    return text
      .replace(/\?{2,}\s*/g, "")
      .replace(/\?(\d[\d,.]*)/g, "\u20b9$1")
      .replace(/^\s*\?\s+(?=Prev\b)/i, " \u2190 ")
      .replace(/\s+\?(?=\s*$)/g, " \u2192")
      .replace(/(^|\s)\?(?=\s|$)/g, "$1\u00b7")
      .replace(/\s{2,}/g, " ");
  }

  function repair(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches && root.matches("script,style,textarea,code,pre")) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || parent.closest("script,style,textarea,code,pre")) continue;
      var fixed = clean(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
    }

    [root].concat(Array.prototype.slice.call(root.querySelectorAll("[title],[placeholder],[aria-label]")))
      .forEach(function (element) {
        ["title", "placeholder", "aria-label"].forEach(function (name) {
          if (!element.hasAttribute || !element.hasAttribute(name)) return;
          var value = element.getAttribute(name);
          var fixed = clean(value);
          if (fixed !== value) element.setAttribute(name, fixed);
        });
      });
  }

  function start() {
    repair(document.body);
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) repair(node);
          if (node.nodeType === 3 && node.parentElement) repair(node.parentElement);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

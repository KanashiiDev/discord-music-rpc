// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/5/LICENSE

// Defines jumpToLine command. Uses dialog.js if present.

(function (mod) {
  if (typeof exports == "object" && typeof module == "object")
    // CommonJS
    mod(require("../../lib/codemirror"), require("../dialog/dialog"));
  else if (typeof define == "function" && define.amd)
    // AMD
    define(["../../lib/codemirror", "../dialog/dialog"], mod);
  // Plain browser env
  else mod(CodeMirror);
})(function (CodeMirror) {
  "use strict";

  // default search panel location
  CodeMirror.defineOption("search", { bottom: false });

  function dialog(cm, text, shortText, deflt, f) {
    if (cm.openDialog) {
      // Create alias once (optional optimization)
      if (!cm.openCmDialog) cm.openCmDialog = cm.openDialog;

      // Create a safe HTML template
      const safeDialog = createSafeJumpDialog(cm, text);

      // Call the aliased safe version
      cm.openCmDialog(safeDialog, f, {
        value: deflt,
        selectValueOnOpen: true,
        bottom: cm.options.search.bottom,
      });
    } else {
      f(prompt(shortText, deflt));
    }
  }

  function createSafeJumpDialog(cm, originalText) {
    // Create a safe, static template with properly escaped dynamic content
    const jumpText = escapeHtml(cm.phrase("Jump to line:"));
    const hintText = escapeHtml(cm.phrase("(Use line:column or scroll% syntax)"));

    return `
      <div class="CodeMirror-jump-dialog">
        <label>${jumpText}</label>
        <input type="text" 
               style="width: 10em" 
               class="CodeMirror-search-field"
               autocomplete="off"
               autocorrect="off"
               autocapitalize="off"
               spellcheck="false"/>
        <span style="color: #888" class="CodeMirror-search-hint">${hintText}</span>
      </div>
    `;
  }

  function escapeHtml(unsafe) {
    if (typeof unsafe !== "string") return unsafe;
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function getJumpDialog(cm) {
    // This function is kept for backward compatibility but not used directly
    return (
      cm.phrase("Jump to line:") +
      ' <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint">' +
      cm.phrase("(Use line:column or scroll% syntax)") +
      "</span>"
    );
  }

  function interpretLine(cm, string) {
    var num = Number(string);
    if (/^[-+]/.test(string)) return cm.getCursor().line + num;
    else return num - 1;
  }

  CodeMirror.commands.jumpToLine = function (cm) {
    var cur = cm.getCursor();

    // Pass the original text but it will be safely handled in the dialog function
    dialog(cm, getJumpDialog(cm), cm.phrase("Jump to line:"), cur.line + 1 + ":" + cur.ch, function (posStr) {
      if (!posStr) return;

      var match;
      if ((match = /^\s*([\+\-]?\d+)\s*\:\s*(\d+)\s*$/.exec(posStr))) {
        cm.setCursor(interpretLine(cm, match[1]), Number(match[2]));
      } else if ((match = /^\s*([\+\-]?\d+(\.\d+)?)\%\s*/.exec(posStr))) {
        var line = Math.round((cm.lineCount() * Number(match[1])) / 100);
        if (/^[-+]/.test(match[1])) line = cur.line + line + 1;
        cm.setCursor(line - 1, cur.ch);
      } else if ((match = /^\s*\:?\s*([\+\-]?\d+)\s*/.exec(posStr))) {
        cm.setCursor(interpretLine(cm, match[1]), cur.ch);
      }
    });
  };

  CodeMirror.keyMap["default"]["Alt-G"] = "jumpToLine";
});

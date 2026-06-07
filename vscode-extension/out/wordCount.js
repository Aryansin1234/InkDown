"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordCountStatusBar = void 0;
const vscode = __importStar(require("vscode"));
const WORDS_PER_MINUTE = 200;
function countWords(text) {
    // Strip frontmatter
    const stripped = text.replace(/^---[\s\S]*?---\s*/m, '');
    // Strip code blocks
    const noCode = stripped.replace(/```[\s\S]*?```/g, '').replace(/`[^`]+`/g, '');
    // Strip HTML tags
    const noHtml = noCode.replace(/<[^>]+>/g, '');
    // Count words
    const words = noHtml.match(/\b\w+\b/g);
    return words ? words.length : 0;
}
class WordCountStatusBar {
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        this.item.tooltip = 'InkDown: Word count and estimated reading time';
        this.item.command = 'inkdown.convertWithOptions';
    }
    register(context) {
        context.subscriptions.push(this.item);
        // Update on active editor change and text change
        context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => {
            this.update(editor);
        }), vscode.workspace.onDidChangeTextDocument((event) => {
            if (vscode.window.activeTextEditor?.document === event.document) {
                this.scheduleUpdate(vscode.window.activeTextEditor);
            }
        }));
        // Initial render
        this.update(vscode.window.activeTextEditor);
    }
    scheduleUpdate(editor) {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => this.update(editor), 300);
    }
    update(editor) {
        if (!editor || editor.document.languageId !== 'markdown') {
            this.item.hide();
            return;
        }
        const wordCount = countWords(editor.document.getText());
        const readingMin = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
        this.item.text = `$(book) ${wordCount.toLocaleString()} words · ${readingMin} min read`;
        this.item.show();
    }
    dispose() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.item.dispose();
    }
}
exports.WordCountStatusBar = WordCountStatusBar;
//# sourceMappingURL=wordCount.js.map
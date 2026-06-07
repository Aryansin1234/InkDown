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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const commands_1 = require("./commands");
const statusBar_1 = require("./statusBar");
const serverManager_1 = require("./serverManager");
const wordCount_1 = require("./wordCount");
const symbolProvider_1 = require("./symbolProvider");
let statusBar;
let serverManager;
let wordCountBar;
function activate(context) {
    serverManager = new serverManager_1.ServerManager(context);
    statusBar = new statusBar_1.StatusBarManager(serverManager);
    wordCountBar = new wordCount_1.WordCountStatusBar();
    (0, commands_1.registerCommands)(context, serverManager);
    statusBar.register(context);
    wordCountBar.register(context);
    // Document symbol provider — headings appear in VS Code Outline panel (E7)
    context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ language: 'markdown' }, new symbolProvider_1.MarkdownSymbolProvider()));
    // Silently check if InkDown is available — only warn on first conversion failure.
    serverManager.detectInkDownPath();
}
function deactivate() {
    statusBar?.dispose();
    wordCountBar?.dispose();
    serverManager?.stop();
}
//# sourceMappingURL=extension.js.map
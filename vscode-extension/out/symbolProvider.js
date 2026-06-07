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
exports.MarkdownSymbolProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * DocumentSymbolProvider for Markdown files.
 * Registers headings (H1–H6) as symbols in the VS Code Outline panel,
 * allowing quick navigation and breadcrumbs.
 */
class MarkdownSymbolProvider {
    provideDocumentSymbols(document, _token) {
        const symbols = [];
        const stack = [];
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            // Match ATX headings: # through ######
            const match = text.match(/^(#{1,6})\s+(.*)/);
            if (!match) {
                continue;
            }
            const level = match[1].length;
            const title = match[2].trim();
            const range = line.range;
            const kindMap = {
                1: vscode.SymbolKind.File,
                2: vscode.SymbolKind.Module,
                3: vscode.SymbolKind.Namespace,
                4: vscode.SymbolKind.Class,
                5: vscode.SymbolKind.Method,
                6: vscode.SymbolKind.Property,
            };
            const symbol = new vscode.DocumentSymbol(title, `H${level}`, kindMap[level] ?? vscode.SymbolKind.String, range, range);
            // Pop stack entries at same or deeper level
            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            if (stack.length === 0) {
                symbols.push(symbol);
            }
            else {
                stack[stack.length - 1].symbol.children.push(symbol);
            }
            stack.push({ level, symbol });
        }
        return symbols;
    }
}
exports.MarkdownSymbolProvider = MarkdownSymbolProvider;
//# sourceMappingURL=symbolProvider.js.map
import * as vscode from 'vscode';

/**
 * DocumentSymbolProvider for Markdown files.
 * Registers headings (H1–H6) as symbols in the VS Code Outline panel,
 * allowing quick navigation and breadcrumbs.
 */
export class MarkdownSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] {
    const symbols: vscode.DocumentSymbol[] = [];
    const stack: { level: number; symbol: vscode.DocumentSymbol }[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text;

      // Match ATX headings: # through ######
      const match = text.match(/^(#{1,6})\s+(.*)/);
      if (!match) { continue; }

      const level = match[1].length;
      const title = match[2].trim();
      const range = line.range;

      const kindMap: Record<number, vscode.SymbolKind> = {
        1: vscode.SymbolKind.File,
        2: vscode.SymbolKind.Module,
        3: vscode.SymbolKind.Namespace,
        4: vscode.SymbolKind.Class,
        5: vscode.SymbolKind.Method,
        6: vscode.SymbolKind.Property,
      };

      const symbol = new vscode.DocumentSymbol(
        title,
        `H${level}`,
        kindMap[level] ?? vscode.SymbolKind.String,
        range,
        range
      );

      // Pop stack entries at same or deeper level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) {
        symbols.push(symbol);
      } else {
        stack[stack.length - 1].symbol.children.push(symbol);
      }

      stack.push({ level, symbol });
    }

    return symbols;
  }
}

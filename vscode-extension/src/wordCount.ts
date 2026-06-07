import * as vscode from 'vscode';

const WORDS_PER_MINUTE = 200;

function countWords(text: string): number {
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

export class WordCountStatusBar {
  private readonly item: vscode.StatusBarItem;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.tooltip = 'InkDown: Word count and estimated reading time';
    this.item.command = 'inkdown.convertWithOptions';
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(this.item);

    // Update on active editor change and text change
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.update(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (vscode.window.activeTextEditor?.document === event.document) {
          this.scheduleUpdate(vscode.window.activeTextEditor);
        }
      })
    );

    // Initial render
    this.update(vscode.window.activeTextEditor);
  }

  private scheduleUpdate(editor: vscode.TextEditor | undefined): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.debounceTimer = setTimeout(() => this.update(editor), 300);
  }

  private update(editor: vscode.TextEditor | undefined): void {
    if (!editor || editor.document.languageId !== 'markdown') {
      this.item.hide();
      return;
    }

    const wordCount = countWords(editor.document.getText());
    const readingMin = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
    this.item.text = `$(book) ${wordCount.toLocaleString()} words · ${readingMin} min read`;
    this.item.show();
  }

  dispose(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); }
    this.item.dispose();
  }
}

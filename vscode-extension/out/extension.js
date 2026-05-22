"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const commands_1 = require("./commands");
const statusBar_1 = require("./statusBar");
const serverManager_1 = require("./serverManager");
let statusBar;
let serverManager;
function activate(context) {
    serverManager = new serverManager_1.ServerManager(context);
    statusBar = new statusBar_1.StatusBarManager(serverManager);
    (0, commands_1.registerCommands)(context, serverManager);
    statusBar.register(context);
    // Silently check if InkDown is available — only warn on first conversion failure.
    // This avoids noisy warnings in workspaces where the user hasn't converted yet.
    serverManager.detectInkDownPath();
    // If not found, don't warn on activation. The error will surface
    // when the user actually tries to convert, with actionable guidance.
}
function deactivate() {
    statusBar?.dispose();
    serverManager?.stop();
}
//# sourceMappingURL=extension.js.map
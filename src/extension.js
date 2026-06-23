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
const parser_1 = require("./parser");
let diagnostics;
function activate(context) {
    diagnostics = vscode.languages.createDiagnosticCollection("kv1");
    context.subscriptions.push(diagnostics);
    const validateDocument = (document) => {
        if (document.languageId !== "kv1") {
            return;
        }
        const result = (0, parser_1.validateKv1)(document);
        diagnostics.set(document.uri, result);
    };
    for (const document of vscode.workspace.textDocuments) {
        validateDocument(document);
    }
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(validateDocument), vscode.workspace.onDidSaveTextDocument(validateDocument), vscode.workspace.onDidChangeTextDocument(event => {
        validateDocument(event.document);
    }), vscode.workspace.onDidCloseTextDocument(document => {
        diagnostics.delete(document.uri);
    }));
}
function deactivate() {
    diagnostics?.dispose();
}
//# sourceMappingURL=extension.js.map
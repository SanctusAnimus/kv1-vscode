import * as vscode from "vscode";
import * as path from "path";
import { validateKv1 } from "./parser";
import { registerKv1CompletionProvider } from "./completion";
import { registerKv1HoverProvider } from "./hover";
import { initializeKv1Schema } from "./kv1Schema";

let diagnostics: vscode.DiagnosticCollection;

const KV1_DOTA_ASSOCIATIONS: Record<string, string> = {
	"**/game/scripts/*.txt": "kv1",
	"**/game/scripts/**/*.txt": "kv1",
};

const LANGUAGE_ID = "kv1";

const MATCHERS: RegExp[] = [
    /^game\/scripts\/npc\/.*\.txt$/i,
    /^game\/resource\/.*\.txt$/i
];

function getWorkspaceRelativePath(uri: vscode.Uri): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        return undefined;
    }

    for (const folder of folders) {
        const relative = path.relative(folder.uri.fsPath, uri.fsPath);

        if (
            relative &&
            !relative.startsWith("..") &&
            !path.isAbsolute(relative)
        ) {
            return relative.replace(/\\/g, "/");
        }
    }

    return undefined;
}

async function maybeSetDotaKvLanguage(document: vscode.TextDocument) {
	if (document.uri.scheme !== "file") {
		return;
	}

	if (document.languageId === LANGUAGE_ID) {
		return;
	}

	if (!document.fileName.toLowerCase().endsWith(".txt")) {
		return;
	}

	const relativePath = getWorkspaceRelativePath(document.uri);
	if (!relativePath) {
		return;
	}

	const matched = MATCHERS.some(pattern => pattern.test(relativePath));

    if (!matched) {
        return;
    }

	await vscode.languages.setTextDocumentLanguage(document, LANGUAGE_ID);
}

export function activate(context: vscode.ExtensionContext) {
	initializeKv1Schema(context);
	diagnostics = vscode.languages.createDiagnosticCollection("kv1");
	context.subscriptions.push(diagnostics);

	registerKv1CompletionProvider(context);
	registerKv1HoverProvider(context);

	for (const document of vscode.workspace.textDocuments) {
        void maybeSetDotaKvLanguage(document);
    }

	context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            void maybeSetDotaKvLanguage(document);
        }),

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                void maybeSetDotaKvLanguage(editor.document);
            }
        })
    );

	const validateDocument = (document: vscode.TextDocument) => {
		if (document.languageId !== "kv1") {
			return;
		}

		diagnostics.set(document.uri, validateKv1(document));
	};

	for (const document of vscode.workspace.textDocuments) {
		validateDocument(document);
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(validateDocument),
		vscode.workspace.onDidSaveTextDocument(validateDocument),
		vscode.workspace.onDidChangeTextDocument((event) => {
			validateDocument(event.document);
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			diagnostics.delete(document.uri);
		})
	);
}

export function deactivate() {
	diagnostics?.dispose();
}

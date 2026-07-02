import * as vscode from "vscode";
import * as path from "path";
import { validateKv1 } from "./parser";
import { registerKv1CompletionProvider } from "./completion";
import { registerKv1HoverProvider } from "./hover";
import { validateScriptFiles, VSCRIPTS_ROOT, ScriptFileDocumentLinkProvider } from "./scriptFileDiagnostic";
import { initializeKv1Schema } from "./kv1Schema";
import { ScriptFileCompletionProvider } from "./scriptFileCompletion";

const diagnostics: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection("kv1");
const scriptFileDiagnostics: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection("kv1-scriptfile");

const LANGUAGE_ID = "kv1";

const MATCHERS: RegExp[] = [
    /^game\/scripts\/npc\/.*\.txt$/i,
    /^game\/scripts\/upgrades\/.*\.txt$/i,
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
	context.subscriptions.push(diagnostics);
	context.subscriptions.push(scriptFileDiagnostics);

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
		if (document.languageId !== LANGUAGE_ID) {
			return;
		}

		diagnostics.set(document.uri, validateKv1(document));
	};

	for (const document of vscode.workspace.textDocuments) {
		validateDocument(document);
	}

	context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: LANGUAGE_ID },
            new ScriptFileCompletionProvider(),
            "/", "\""
        )
    );

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(validateDocument),
		vscode.workspace.onDidSaveTextDocument(validateDocument),
		vscode.workspace.onDidChangeTextDocument((event) => {
			validateDocument(event.document);
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			diagnostics.delete(document.uri);
			scriptFileDiagnostics.delete(document.uri);
		})
	);

	context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            if (doc.languageId === LANGUAGE_ID) {
                void validateScriptFiles(doc, scriptFileDiagnostics);
            }
        }),

        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === LANGUAGE_ID) {
                void validateScriptFiles(event.document, scriptFileDiagnostics);
            }
        }),

        vscode.workspace.onDidSaveTextDocument(doc => {
            if (doc.languageId === LANGUAGE_ID) {
                void validateScriptFiles(doc, scriptFileDiagnostics);
            }
        })
    );

    for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === LANGUAGE_ID) {
            void validateScriptFiles(doc, scriptFileDiagnostics);
        }
	}	

	context.subscriptions.push(
		vscode.languages.registerDocumentLinkProvider(
			{ language: LANGUAGE_ID },
			new ScriptFileDocumentLinkProvider()
		)
	);
	
	registerVScriptWatcher(context);
}

function registerVScriptWatcher(context: vscode.ExtensionContext) {
    const watcher = vscode.workspace.createFileSystemWatcher(
        `**/${VSCRIPTS_ROOT}/**/*.lua`
    );

    const revalidateOpenKvDocuments = () => {
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.languageId === LANGUAGE_ID) {
                void validateScriptFiles(doc, scriptFileDiagnostics);
            }
        }
    };

    watcher.onDidCreate(revalidateOpenKvDocuments);
    watcher.onDidDelete(revalidateOpenKvDocuments);
    watcher.onDidChange(revalidateOpenKvDocuments);

    context.subscriptions.push(watcher);
}

export function deactivate() {
	diagnostics?.dispose();
}

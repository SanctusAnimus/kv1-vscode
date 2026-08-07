import * as vscode from "vscode";
import * as path from "path";


export const VSCRIPTS_ROOT = "game/scripts/vscripts";
const SCRIPTFILE_DIAGNOSTIC_SOURCE = "dota-kv";
const SCRIPTFILE_MISSING_CODE = "missing-scriptfile";

export async function validateScriptFiles(document: vscode.TextDocument, scriptFileDiagnostics: vscode.DiagnosticCollection): Promise<void> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        scriptFileDiagnostics.delete(document.uri);
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
        const line = document.lineAt(lineIndex).text;

        const regex = /"ScriptFile"\s+"([^"]*)"/g;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(line)) !== null) {
            const rawValue = match[1];

            const valueStart = match.index + match[0].indexOf(rawValue);
            const valueEnd = valueStart + rawValue.length;

            const range = new vscode.Range(
                lineIndex,
                valueStart,
                lineIndex,
                valueEnd
            );

            const resolved = resolveLuaScriptPath(workspaceFolder, rawValue);

            if (!resolved) {
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `Invalid ScriptFile path: "${rawValue}"`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
                continue;
            }

            try {
                const stat = await vscode.workspace.fs.stat(resolved);

                if (stat.type !== vscode.FileType.File) {
                    diagnostics.push(
                        new vscode.Diagnostic(
                            range,
                            `ScriptFile exists but is not a file: "${rawValue}"`,
                            vscode.DiagnosticSeverity.Error
                        )
                    );
                }
            } catch {
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `ScriptFile not found: ${VSCRIPTS_ROOT}/${normalizeScriptFileValue(rawValue)}`,
                        vscode.DiagnosticSeverity.Error
                    )
				);
				
				const diagnostic = diagnostics[diagnostics.length - 1];
				diagnostic.source = SCRIPTFILE_DIAGNOSTIC_SOURCE;
				diagnostic.code = SCRIPTFILE_MISSING_CODE;
            }
        }
    }

    scriptFileDiagnostics.set(document.uri, diagnostics);
}

export class ScriptFileDocumentLinkProvider implements vscode.DocumentLinkProvider {
    async provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentLink[]> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return [];
        }

        const links: vscode.DocumentLink[] = [];

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
            if (token.isCancellationRequested) {
                return links;
            }

            const line = document.lineAt(lineIndex).text;

            const regex = /"ScriptFile"\s+"([^"]*)"/g;
            let match: RegExpExecArray | null;

            while ((match = regex.exec(line)) !== null) {
                const rawValue = match[1];

                const valueStart = match.index + match[0].indexOf(rawValue);
                const valueEnd = valueStart + rawValue.length;

                const targetUri = resolveLuaScriptPath(workspaceFolder, rawValue);
                if (!targetUri) {
                    continue;
                }

                // Optional: only make it clickable if the file really exists.
                try {
                    const stat = await vscode.workspace.fs.stat(targetUri);
                    if (stat.type !== vscode.FileType.File) {
                        continue;
                    }
                } catch {
                    continue;
                }

                const range = new vscode.Range(
                    lineIndex,
                    valueStart,
                    lineIndex,
                    valueEnd
                );

                const link = new vscode.DocumentLink(range, targetUri);
                link.tooltip = `Open ${rawValue.endsWith(".lua") ? rawValue : rawValue + ".lua"}`;

                links.push(link);
            }
        }

        return links;
    }
}


export class ScriptFileCodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (
                diagnostic.source !== SCRIPTFILE_DIAGNOSTIC_SOURCE ||
                diagnostic.code !== SCRIPTFILE_MISSING_CODE
            ) {
                continue;
            }

            const rawValue = document.getText(diagnostic.range);
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (!workspaceFolder) {
                continue;
            }

            const targetUri = resolveLuaScriptPath(workspaceFolder, rawValue);
            if (!targetUri || !isInsideWorkspace(workspaceFolder, targetUri)) {
                continue;
            }

            const action = new vscode.CodeAction(
				`Create and open Lua script: ${rawValue.endsWith(".lua") ? rawValue : rawValue + ".lua"}`,
				vscode.CodeActionKind.QuickFix
			);

			action.command = {
				title: "Create Lua script",
				command: "dota-kv.createScriptFile",
				arguments: [targetUri, rawValue]
			};

			action.diagnostics = [diagnostic];
			action.isPreferred = true;

            actions.push(action);
        }

        return actions;
    }
}

function isInsideWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
    targetUri: vscode.Uri
): boolean {
    const root = workspaceFolder.uri.fsPath;
    const target = targetUri.fsPath;
    const relative = path.relative(root, target);

    return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function makeNewLuaScriptTemplate(rawValue: string): string {
    const name = path.posix.basename(rawValue).replace(/\.lua$/i, "");

    return [
        `-- ${name}`,
        "",
        ""
    ].join("\n");
}

export async function createAndEditFile(uri: vscode.Uri, rawValue: string)
{
	const edit = new vscode.WorkspaceEdit();

	edit.createFile(uri, {
		ignoreIfExists: true,
		overwrite: false
	});

	edit.insert(uri, new vscode.Position(0, 0), makeNewLuaScriptTemplate(rawValue));

	const ok = await vscode.workspace.applyEdit(edit);
	if (!ok) {
		vscode.window.showErrorMessage(`Failed to create script file: ${uri.fsPath}`);
		return;
	}

	const document = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(document, { preview: false });
}

function resolveLuaScriptPath(
    workspaceFolder: vscode.WorkspaceFolder,
    rawValue: string
): vscode.Uri | undefined {
    let normalized = normalizeScriptFileValue(rawValue);

    // Reject absolute paths and parent traversal.
    if (
        normalized.startsWith("/") ||
        normalized.startsWith("../") ||
        normalized.includes("/../")
    ) {
        return undefined;
    }

    if (!normalized.endsWith(".lua")) {
        normalized += ".lua";
    }

    return vscode.Uri.joinPath(
        workspaceFolder.uri,
        VSCRIPTS_ROOT,
        ...normalized.split("/").filter(Boolean)
    );
}

function normalizeScriptFileValue(value: string): string {
    return path.posix.normalize(value.replace(/\\/g, "/"));
}

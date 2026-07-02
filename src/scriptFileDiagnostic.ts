import * as vscode from "vscode";
import * as path from "path";


export const VSCRIPTS_ROOT = "game/scripts/vscripts";

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

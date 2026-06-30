import * as vscode from "vscode";
import * as path from "path";

import { VSCRIPTS_ROOT } from "./scriptFileDiagnostic";


export class ScriptFileCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        const context = getScriptFileStringContext(document, position);
        if (!context) {
            return [];
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return [];
        }

        const typedValue = context.valueBeforeCursor.replace(/\\/g, "/");
        const dirPart = path.posix.dirname(typedValue);
        const filePrefix = path.posix.basename(typedValue);

        const relativeDir = dirPart === "." ? "" : dirPart;
        const targetDir = vscode.Uri.joinPath(
            workspaceFolder.uri,
            VSCRIPTS_ROOT,
            ...relativeDir.split("/").filter(Boolean)
        );

        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(targetDir);
        } catch {
            return [];
        }

        const replacementRange = new vscode.Range(
            position.translate(0, -filePrefix.length),
            position
        );

        const result: vscode.CompletionItem[] = [];

        for (const [name, type] of entries) {
            if (!name.toLowerCase().startsWith(filePrefix.toLowerCase())) {
                continue;
            }

            if (type === vscode.FileType.Directory) {
                const item = new vscode.CompletionItem(
                    name,
                    vscode.CompletionItemKind.Folder
                );

                item.insertText = name + "/";
                item.range = replacementRange;
                item.command = {
                    title: "Suggest",
                    command: "editor.action.triggerSuggest"
                };

                result.push(item);
                continue;
            }

            if (type === vscode.FileType.File && name.endsWith(".lua")) {
                const nameWithoutLua = name.slice(0, -".lua".length);

                const item = new vscode.CompletionItem(
                    nameWithoutLua,
                    vscode.CompletionItemKind.File
                );

                // Insert without .lua because your format allows omitted extension.
                item.insertText = nameWithoutLua;
                item.detail = name;
                item.range = replacementRange;

                result.push(item);
            }
        }

        return result;
    }
}

function getScriptFileStringContext(
    document: vscode.TextDocument,
    position: vscode.Position
): { valueBeforeCursor: string } | undefined {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);

    // Matches:
    // "ScriptFile" "items/foo/bar
    //
    // Cursor is expected to be inside the second quoted string.
    const match = linePrefix.match(/"ScriptFile"\s+"([^"]*)$/);
    if (!match) {
        return undefined;
    }

    return {
        valueBeforeCursor: match[1]
    };
}

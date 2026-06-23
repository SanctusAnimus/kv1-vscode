import * as vscode from "vscode";
import {
    getValueSpecForKey,
    getAllValueSpecs
} from "./kv1Schema";

function stripQuotes(text: string): string {
    if (text.startsWith("\"") && text.endsWith("\"")) {
        return text.slice(1, -1);
    }

    return text;
}

function findQuotedTokenAtPosition(
    line: string,
    character: number
): { text: string; start: number; end: number } | null {
    const regex = /"(?:\\.|[^"])*"/g;

    for (const match of line.matchAll(regex)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;

        if (character >= start && character <= end) {
            return {
                text: stripQuotes(match[0]),
                start,
                end
            };
        }
    }

    return null;
}

export function registerKv1HoverProvider(context: vscode.ExtensionContext): void {
    const provider: vscode.HoverProvider = {
        provideHover(document, position) {
            const line = document.lineAt(position.line).text;
            const token = findQuotedTokenAtPosition(line, position.character);

            if (!token) {
                return undefined;
            }

            // Hover over key.
            const spec = getValueSpecForKey(token.text);

            if (spec) {
                const md = new vscode.MarkdownString();
                md.appendMarkdown(`**${token.text}**\n\n`);
                md.appendMarkdown(`Value mode: \`${spec.mode}\`\n\n`);
                md.appendMarkdown(`Allowed values:\n\n`);

                for (const value of spec.values) {
                    md.appendMarkdown(`- \`${value.value}\`\n`);
                }

                return new vscode.Hover(
                    md,
                    new vscode.Range(
                        position.line,
                        token.start,
                        position.line,
                        token.end
                    )
                );
            }

            // Hover over literal value.
            for (const [key, keySpec] of Object.entries(getAllValueSpecs())) {
                const literal = keySpec.values.find(v => v.value === token.text);

                if (!literal) {
                    continue;
                }

                const md = new vscode.MarkdownString();
                md.appendMarkdown(`**${literal.value}**\n\n`);
                md.appendMarkdown(`Allowed in: \`${key}\`\n\n`);

                if (literal.documentation) {
                    md.appendMarkdown(`${literal.documentation}\n`);
                }

                return new vscode.Hover(
                    md,
                    new vscode.Range(
                        position.line,
                        token.start,
                        position.line,
                        token.end
                    )
                );
            }

            return undefined;
        }
    };

    context.subscriptions.push(
        vscode.languages.registerHoverProvider({ language: "kv1" }, provider)
    );
}

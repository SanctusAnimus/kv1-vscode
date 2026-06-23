import * as vscode from "vscode";
import {
    createCompletionItem,
    getValueSpecForKey
} from "./kv1Schema";

interface QuotedSpan {
    start: number;
    end: number;
    text: string;
}

interface ValueCompletionContext {
    key: string;
    alreadyQuoted: boolean;
    replaceRange: vscode.Range;
    existingFlags: Set<string>;
}

function stripLineComment(line: string): string {
    let inString = false;
    let escaped = false;

    for (let i = 0; i < line.length - 1; i++) {
        const ch = line[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === "\\" && inString) {
            escaped = true;
            continue;
        }

        if (ch === "\"") {
            inString = !inString;
            continue;
        }

        if (!inString && ch === "/" && line[i + 1] === "/") {
            return line.slice(0, i);
        }
    }

    return line;
}

function getQuotedSpans(line: string): QuotedSpan[] {
    const spans: QuotedSpan[] = [];

    let i = 0;

    while (i < line.length) {
        if (line[i] !== "\"") {
            i++;
            continue;
        }

        const start = i;
        i++;

        let escaped = false;

        while (i < line.length) {
            const ch = line[i];

            if (escaped) {
                escaped = false;
                i++;
                continue;
            }

            if (ch === "\\") {
                escaped = true;
                i++;
                continue;
            }

            if (ch === "\"") {
                i++;
                break;
            }

            i++;
        }

        const end = i;
        const text = line.slice(start + 1, Math.max(start + 1, end - 1));

        spans.push({ start, end, text });
    }

    return spans;
}

function getCurrentFlagReplaceRange(
    lineNo: number,
    valueStart: number,
    valueText: string,
    cursorChar: number
): { range: vscode.Range; currentValue: string } {
    const localCursor = Math.max(
        0,
        Math.min(valueText.length, cursorChar - valueStart)
    );

    const leftPipe = valueText.lastIndexOf("|", Math.max(0, localCursor - 1));
    const rightPipe = valueText.indexOf("|", localCursor);

    const rawStart = leftPipe === -1 ? 0 : leftPipe + 1;
    const rawEnd = rightPipe === -1 ? valueText.length : rightPipe;

    const rawFragment = valueText.slice(rawStart, rawEnd);

    const leadingWhitespace = rawFragment.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = rawFragment.match(/\s*$/)?.[0].length ?? 0;

    const trimmedStart = rawStart + leadingWhitespace;
    const trimmedEnd = rawEnd - trailingWhitespace;

    const range = new vscode.Range(
        lineNo,
        valueStart + trimmedStart,
        lineNo,
        valueStart + trimmedEnd
    );

    return {
        range,
        currentValue: valueText.slice(trimmedStart, trimmedEnd)
    };
}

function splitFlags(value: string): string[] {
    return value
        .split("|")
        .map(part => part.trim())
        .filter(part => part.length > 0);
}

function getValueCompletionContext(
    document: vscode.TextDocument,
    position: vscode.Position
): ValueCompletionContext | null {
    const lineNo = position.line;
    const rawLine = document.lineAt(lineNo).text;
    const line = stripLineComment(rawLine);
    const cursorChar = position.character;

    const spans = getQuotedSpans(line);

    if (spans.length === 0) {
        return null;
    }

    const keySpan = spans[0];
    const key = keySpan.text;

    const spec = getValueSpecForKey(key);

    if (!spec) {
        return null;
    }

    // Case 1:
    // "AbilityBehavior" |
    // cursor is after the key but before a value string exists.
    if (spans.length === 1 && cursorChar >= keySpan.end) {
        return {
            key,
            alreadyQuoted: false,
            replaceRange: new vscode.Range(lineNo, cursorChar, lineNo, cursorChar),
            existingFlags: new Set()
        };
    }

    const valueSpan = spans[1];

    if (!valueSpan) {
        return null;
    }

    const valueContentStart = valueSpan.start + 1;
    const valueContentEnd = valueSpan.end - 1;

    // Only complete inside the value string.
    if (cursorChar < valueContentStart || cursorChar > valueContentEnd) {
        return null;
    }

    if (spec.mode === "flags") {
        const { range, currentValue } = getCurrentFlagReplaceRange(
            lineNo,
            valueContentStart,
            valueSpan.text,
            cursorChar
        );

        const existingFlags = new Set(splitFlags(valueSpan.text));
        existingFlags.delete(currentValue.trim());

        return {
            key,
            alreadyQuoted: true,
            replaceRange: range,
            existingFlags
        };
    }

    return {
        key,
        alreadyQuoted: true,
        replaceRange: new vscode.Range(
            lineNo,
            valueContentStart,
            lineNo,
            valueContentEnd
        ),
        existingFlags: new Set()
    };
}

export function registerKv1CompletionProvider(
    context: vscode.ExtensionContext
): void {
    const provider: vscode.CompletionItemProvider = {
        provideCompletionItems(document, position) {
            const completionContext = getValueCompletionContext(document, position);

            if (!completionContext) {
                return undefined;
            }

            const spec = getValueSpecForKey(completionContext.key);

            if (!spec) {
                return undefined;
            }

            const items = spec.values
                .filter(literal => {
                    if (spec.mode !== "flags") {
                        return true;
                    }

                    return !completionContext.existingFlags.has(literal.value);
                })
                .map(literal => {
                    const item = createCompletionItem(
                        literal,
                        completionContext.replaceRange,
                        completionContext.alreadyQuoted
                    );

                    item.detail = `${completionContext.key}: ${spec.mode}`;

                    return item;
                });

            return new vscode.CompletionList(items, false);
        }
    };

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: "kv1" },
            provider,
            "\"",
            "|",
            " "
        )
    );
}
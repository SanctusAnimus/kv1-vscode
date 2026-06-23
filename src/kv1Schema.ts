import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { KV1_ENUM_BINDINGS } from "./kv1EnumBindings";

export type Kv1ValueMode = "single" | "flags";

export interface Kv1Literal {
    value: string;
    shortName?: string;
    detail?: string;
    documentation?: string;
}

export interface Kv1ValueSpec {
    mode: Kv1ValueMode;
    values: Kv1Literal[];
}

interface DotaEnumJsonEntry {
    name: string;
    members: Array<{
        name: string;
        shortName?: string;
    }>;
}

let valueSpecs: Record<string, Kv1ValueSpec> = {};

export function initializeKv1Schema(context: vscode.ExtensionContext): void {
    const enumJsonPath = context.asAbsolutePath(
        path.join("data", "engine-enums.json")
    );

    const raw = fs.readFileSync(enumJsonPath, "utf8");
    const enumEntries = JSON.parse(raw) as DotaEnumJsonEntry[];

    const enumsByName = new Map<string, DotaEnumJsonEntry>();

    for (const enumEntry of enumEntries) {
        enumsByName.set(enumEntry.name, enumEntry);
    }

    const nextSpecs: Record<string, Kv1ValueSpec> = {};

    for (const [kvKey, binding] of Object.entries(KV1_ENUM_BINDINGS)) {
        const enumEntry = enumsByName.get(binding.enumName);

        if (!enumEntry) {
            console.warn(
                `[kv1] Enum '${binding.enumName}' bound to key '${kvKey}' was not found.`
            );
            continue;
        }

        nextSpecs[kvKey] = {
            mode: binding.mode,
            values: enumEntry.members.map(member => ({
                value: member.name,
                shortName: member.shortName,
                detail: `${kvKey}: ${binding.enumName}`,
                documentation: member.shortName
                    ? `Short name: \`${member.shortName}\``
                    : undefined
            }))
        };
    }

    valueSpecs = nextSpecs;
}

export function getValueSpecForKey(key: string): Kv1ValueSpec | undefined {
    return valueSpecs[key];
}

export function getAllValueSpecs(): Record<string, Kv1ValueSpec> {
    return valueSpecs;
}

export function createCompletionItem(
    literal: Kv1Literal,
    range: vscode.Range,
    alreadyQuoted: boolean
): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
        literal.value,
        vscode.CompletionItemKind.EnumMember
    );

    item.detail = literal.detail ?? "KV1 enum value";

    if (literal.shortName) {
        item.documentation = new vscode.MarkdownString(
            `Short name: \`${literal.shortName}\``
        );
    } else if (literal.documentation) {
        item.documentation = literal.documentation;
    }

    item.range = range;
    item.insertText = alreadyQuoted ? literal.value : `"${literal.value}"`;

    return item;
}

export interface Kv1ValueError {
    message: string;
    startOffset: number;
    endOffset: number;
}

export function validateKnownValue(key: string, value: string): Kv1ValueError[] {
    const spec = getValueSpecForKey(key);

    if (!spec) {
        return [];
    }

    const allowed = new Set(spec.values.map(v => v.value));

    if (spec.mode === "single") {
        if (!allowed.has(value)) {
            return [
                {
                    message: `Invalid value '${value}' for '${key}'.`,
                    startOffset: 0,
                    endOffset: value.length
                }
            ];
        }

        return [];
    }

    const errors: Kv1ValueError[] = [];

    let offset = 0;

    for (const rawPart of value.split("|")) {
        const leadingWhitespace = rawPart.match(/^\s*/)?.[0].length ?? 0;
        const trailingWhitespace = rawPart.match(/\s*$/)?.[0].length ?? 0;

        const partStart = leadingWhitespace;
        const partEnd = rawPart.length - trailingWhitespace;
        const part = rawPart.slice(partStart, partEnd);

        if (part.length > 0 && !allowed.has(part)) {
            errors.push({
                message: `Invalid flag '${part}' for '${key}'.`,
                startOffset: offset + partStart,
                endOffset: offset + partEnd
            });
        }

        offset += rawPart.length + 1;
    }

    return errors;
}

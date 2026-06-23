import * as vscode from "vscode";
import { validateKnownValue } from "./kv1Schema";

export interface Kv1Error {
	message: string;
	line: number;
	start: number;
	end: number;
}

type Token =
	| { kind: "string"; text: string; start: number; end: number }
	| { kind: "lbrace"; start: number; end: number }
	| { kind: "rbrace"; start: number; end: number }
	| { kind: "directive"; text: string; start: number; end: number };

function stripComment(line: string): string {
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

		if (ch === '"') {
			inString = !inString;
			continue;
		}

		if (!inString && ch === "/" && line[i + 1] === "/") {
			return line.slice(0, i);
		}
	}

	return line;
}

function unquoteKv1String(text: string): string {
	if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
		return text.slice(1, -1);
	}

	return text;
}

function tokenizeLine(
	line: string,
	lineNo: number,
	errors: Kv1Error[]
): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < line.length) {
		const ch = line[i];

		if (/\s/.test(ch)) {
			i++;
			continue;
		}

		if (ch === "{") {
			tokens.push({ kind: "lbrace", start: i, end: i + 1 });
			i++;
			continue;
		}

		if (ch === "}") {
			tokens.push({ kind: "rbrace", start: i, end: i + 1 });
			i++;
			continue;
		}

		if (ch === "#") {
			const start = i;
			i++;
			while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) {
				i++;
			}

			tokens.push({
				kind: "directive",
				text: line.slice(start, i),
				start,
				end: i,
			});

			continue;
		}

		if (ch === '"') {
			const start = i;
			i++;

			let escaped = false;
			let closed = false;

			while (i < line.length) {
				const c = line[i];

				if (escaped) {
					escaped = false;
					i++;
					continue;
				}

				if (c === "\\") {
					escaped = true;
					i++;
					continue;
				}

				if (c === '"') {
					i++;
					closed = true;
					break;
				}

				i++;
			}

			if (!closed) {
				errors.push({
					message: "Unterminated string.",
					line: lineNo,
					start,
					end: line.length,
				});
			}

			tokens.push({
				kind: "string",
				text: line.slice(start, i),
				start,
				end: i,
			});

			continue;
		}

		errors.push({
			message: `Unexpected character '${ch}'. Expected quoted string, brace, directive, or comment.`,
			line: lineNo,
			start: i,
			end: i + 1,
		});

		i++;
	}

	return tokens;
}

interface BlockFrame {
	keyLine: number;
	keyCol: number;
	key: string;

	openBraceLine: number;
	openBraceCol: number;
}

export function validateKv1(
	document: vscode.TextDocument
): vscode.Diagnostic[] {
	const errors: Kv1Error[] = [];

	const stack: BlockFrame[] = [];

	let pendingBlockKey: { line: number; col: number; key: string } | null =
		null;
	let expecting: "key" | "value-or-block" = "key";

	for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
		const originalLine = document.lineAt(lineNo).text;
		const line = stripComment(originalLine);

		if (line.trim().length === 0) {
			continue;
		}

		const tokens = tokenizeLine(line, lineNo, errors);

		if (tokens.length === 0) {
			continue;
		}

		// Directives are only allowed as whole-line statements:
		// #base "path"
		if (tokens[0].kind === "directive") {
			if (tokens.length !== 2 || tokens[1].kind !== "string") {
				errors.push({
					message:
						"Directive must have exactly one quoted path argument.",
					line: lineNo,
					start: tokens[0].start,
					end: line.length,
				});
				continue;
			}

			if (tokens[0].text !== "#base" && tokens[0].text !== "#include") {
				errors.push({
					message: `Unknown directive '${tokens[0].text}'.`,
					line: lineNo,
					start: tokens[0].start,
					end: tokens[0].end,
				});
			}

			continue;
		}

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];

			if (token.kind === "directive") {
				errors.push({
					message: "Directive is only valid at the start of a line.",
					line: lineNo,
					start: token.start,
					end: token.end,
				});
				continue;
			}

			if (token.kind === "string") {
				if (expecting === "key") {
					pendingBlockKey = {
						line: lineNo,
						col: token.start,
						key: token.text,
					};

					expecting = "value-or-block";
					continue;
				}

				// expecting value after a key
				if (!pendingBlockKey) {
					errors.push({
						message:
							"Internal parser state error: value found without a pending key.",
						line: lineNo,
						start: token.start,
						end: token.end,
					});

					expecting = "key";
					continue;
				}

				const keyToken = pendingBlockKey;
				const key = unquoteKv1String(keyToken.key);
				const value = unquoteKv1String(token.text);

				const valueErrors = validateKnownValue(key, value);

				for (const valueError of valueErrors) {
					errors.push({
						message: valueError.message,
						line: lineNo,
						start: token.start + 1 + valueError.startOffset,
						end: token.start + 1 + valueError.endOffset,
					});
				}

				pendingBlockKey = null;
				expecting = "key";
				continue;
			}

			if (token.kind === "lbrace") {
				if (expecting !== "value-or-block" || !pendingBlockKey) {
					errors.push({
						message: "Opening brace must follow a block key.",
						line: lineNo,
						start: token.start,
						end: token.end,
					});
					continue;
				}

				stack.push({
					keyLine: pendingBlockKey.line,
					keyCol: pendingBlockKey.col,
					key: pendingBlockKey.key,

					openBraceLine: lineNo,
					openBraceCol: token.start,
				});

				pendingBlockKey = null;
				expecting = "key";
				continue;
			}

			if (token.kind === "rbrace") {
				if (expecting === "value-or-block" && pendingBlockKey) {
					errors.push({
						message: "Key is missing a value or opening brace.",
						line: pendingBlockKey.line,
						start: pendingBlockKey.col,
						end: pendingBlockKey.col + 1,
					});

					pendingBlockKey = null;
					expecting = "key";
				}

				const closeCol = token.start;

				// Indentation-based recovery, but only for normal multi-line blocks.
				// This avoids damaging compact inline blocks like:
				// "Wearable1" { "ItemDef" "7408" }
				while (
					stack.length > 1 &&
					closeCol < stack[stack.length - 1].openBraceCol &&
					stack[stack.length - 1].openBraceLine !== lineNo
				) {
					const unclosed = stack.pop()!;

					errors.push({
						message: "Missing closing brace for this block.",
						line: unclosed.keyLine,
						start: unclosed.keyCol,
						end: unclosed.keyCol + 1,
					});
				}

				if (stack.length === 0) {
					errors.push({
						message: "Unexpected closing brace.",
						line: lineNo,
						start: token.start,
						end: token.end,
					});
				} else {
					stack.pop();
				}

				expecting = "key";
				continue;
			}
		}

		// If a line ends after a bare key, allow this form:
		//
		// "SomeBlock"
		// {
		//
		// But if the same line had other tokens and still ended expecting a value,
		// it is suspicious.
		//
		// Example:
		// "Key" "Value" "DanglingKey"
		//
		if (
			expecting === "value-or-block" &&
			pendingBlockKey?.line === lineNo
		) {
			const lastToken = tokens[tokens.length - 1];

			if (lastToken.kind !== "string" || tokens.length === 1) {
				// bare "BlockName" on its own line is allowed
				continue;
			}

			// Do not error here for now; the next meaningful token may be "{"
			// on the following line.
		}
	}

	if (expecting === "value-or-block" && pendingBlockKey) {
		errors.push({
			message: "Key is missing a value or opening brace.",
			line: pendingBlockKey.line,
			start: pendingBlockKey.col,
			end: pendingBlockKey.col + 1,
		});
	}

	for (const open of stack) {
		errors.push({
			message: "Missing closing brace for this block.",
			line: open.keyLine,
			start: open.keyCol,
			end: open.keyCol + 1,
		});
	}

	return errors.map((error) => {
		const range = new vscode.Range(
			error.line,
			error.start,
			error.line,
			Math.max(error.end, error.start + 1)
		);

		return new vscode.Diagnostic(
			range,
			error.message,
			vscode.DiagnosticSeverity.Error
		);
	});
}

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
exports.validateKv1 = validateKv1;
const vscode = __importStar(require("vscode"));
function stripComment(line) {
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
function tokenizeLine(line, lineNo, errors) {
    const tokens = [];
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
                end: i
            });
            continue;
        }
        if (ch === "\"") {
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
                if (c === "\"") {
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
                    end: line.length
                });
            }
            tokens.push({
                kind: "string",
                text: line.slice(start, i),
                start,
                end: i
            });
            continue;
        }
        errors.push({
            message: `Unexpected character '${ch}'. Expected quoted string, brace, directive, or comment.`,
            line: lineNo,
            start: i,
            end: i + 1
        });
        i++;
    }
    return tokens;
}
function validateKv1(document) {
    const errors = [];
    const stack = [];
    let pendingBlockKey = null;
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
        const kinds = tokens.map(t => t.kind).join(" ");
        // #base "file"
        if (tokens[0].kind === "directive") {
            if (tokens[0].text !== "#base" && tokens[0].text !== "#include") {
                errors.push({
                    message: `Unknown directive '${tokens[0].text}'.`,
                    line: lineNo,
                    start: tokens[0].start,
                    end: tokens[0].end
                });
            }
            if (tokens.length !== 2 ||
                tokens[1].kind !== "string") {
                errors.push({
                    message: "Directive must have exactly one quoted path argument.",
                    line: lineNo,
                    start: tokens[0].start,
                    end: line.length
                });
            }
            continue;
        }
        // {
        if (kinds === "lbrace") {
            if (!pendingBlockKey) {
                errors.push({
                    message: "Opening brace must follow a block key.",
                    line: lineNo,
                    start: tokens[0].start,
                    end: tokens[0].end
                });
            }
            else {
                stack.push(pendingBlockKey);
                pendingBlockKey = null;
            }
            continue;
        }
        // }
        if (kinds === "rbrace") {
            if (pendingBlockKey) {
                errors.push({
                    message: "Block key is missing opening brace.",
                    line: pendingBlockKey.line,
                    start: pendingBlockKey.col,
                    end: pendingBlockKey.col + 1
                });
                pendingBlockKey = null;
            }
            if (stack.length === 0) {
                errors.push({
                    message: "Unexpected closing brace.",
                    line: lineNo,
                    start: tokens[0].start,
                    end: tokens[0].end
                });
            }
            else {
                stack.pop();
            }
            continue;
        }
        // "key" "value"
        if (kinds === "string string") {
            if (pendingBlockKey) {
                errors.push({
                    message: "Previous block key is missing opening brace.",
                    line: pendingBlockKey.line,
                    start: pendingBlockKey.col,
                    end: pendingBlockKey.col + 1
                });
                pendingBlockKey = null;
            }
            continue;
        }
        // "key"
        if (kinds === "string") {
            if (pendingBlockKey) {
                errors.push({
                    message: "Previous block key is missing opening brace.",
                    line: pendingBlockKey.line,
                    start: pendingBlockKey.col,
                    end: pendingBlockKey.col + 1
                });
            }
            pendingBlockKey = {
                line: lineNo,
                col: tokens[0].start
            };
            continue;
        }
        // "key" {
        if (kinds === "string lbrace") {
            if (pendingBlockKey) {
                errors.push({
                    message: "Previous block key is missing opening brace.",
                    line: pendingBlockKey.line,
                    start: pendingBlockKey.col,
                    end: pendingBlockKey.col + 1
                });
            }
            stack.push({
                line: lineNo,
                col: tokens[0].start
            });
            pendingBlockKey = null;
            continue;
        }
        errors.push({
            message: `Invalid KeyValues statement: ${kinds}.`,
            line: lineNo,
            start: tokens[0].start,
            end: tokens[tokens.length - 1].end
        });
    }
    if (pendingBlockKey) {
        errors.push({
            message: "Block key is missing opening brace.",
            line: pendingBlockKey.line,
            start: pendingBlockKey.col,
            end: pendingBlockKey.col + 1
        });
    }
    for (const open of stack) {
        errors.push({
            message: "Missing closing brace for this block.",
            line: open.line,
            start: open.col,
            end: open.col + 1
        });
    }
    return errors.map(error => {
        const range = new vscode.Range(error.line, error.start, error.line, Math.max(error.end, error.start + 1));
        return new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error);
    });
}
//# sourceMappingURL=parser.js.map
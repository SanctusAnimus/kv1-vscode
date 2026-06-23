import * as vscode from "vscode";
export interface Kv1Error {
    message: string;
    line: number;
    start: number;
    end: number;
}
export declare function validateKv1(document: vscode.TextDocument): vscode.Diagnostic[];
//# sourceMappingURL=parser.d.ts.map
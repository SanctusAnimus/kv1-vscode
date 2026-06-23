import * as vscode from "vscode";
import { validateKv1 } from "./parser";
import { registerKv1CompletionProvider } from "./completion";
import { registerKv1HoverProvider } from "./hover";
import { initializeKv1Schema } from "./kv1Schema";

let diagnostics: vscode.DiagnosticCollection;

const KV1_DOTA_ASSOCIATIONS: Record<string, string> = {
	"**/game/scripts/*.txt": "kv1",
	"**/game/scripts/**/*.txt": "kv1",
};

export function activate(context: vscode.ExtensionContext) {
	initializeKv1Schema(context);
	diagnostics = vscode.languages.createDiagnosticCollection("kv1");
	context.subscriptions.push(diagnostics);

	registerKv1CompletionProvider(context);
	registerKv1HoverProvider(context);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"kv1.configureDotaFileAssociations",
			configureDotaFileAssociations
		)
	);
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"kv1.removeDotaFileAssociations",
			removeDotaFileAssociations
		)
	);

	const validateDocument = (document: vscode.TextDocument) => {
		if (document.languageId !== "kv1") {
			return;
		}

		diagnostics.set(document.uri, validateKv1(document));
	};

	for (const document of vscode.workspace.textDocuments) {
		validateDocument(document);
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(validateDocument),
		vscode.workspace.onDidSaveTextDocument(validateDocument),
		vscode.workspace.onDidChangeTextDocument((event) => {
			validateDocument(event.document);
		}),
		vscode.workspace.onDidCloseTextDocument((document) => {
			diagnostics.delete(document.uri);
		})
	);
}
async function configureDotaFileAssociations() {
	if (!vscode.workspace.workspaceFolders?.length) {
		vscode.window.showWarningMessage(
			"Open a workspace or folder before configuring KV1 Dota settings."
		);
		return;
	}

	const config = vscode.workspace.getConfiguration();

	const existingAssociations =
		config.get<Record<string, string>>("files.associations") ?? {};

	const conflictingPatterns = Object.keys(KV1_DOTA_ASSOCIATIONS).filter(
		(pattern) => {
			return (
				existingAssociations[pattern] &&
				existingAssociations[pattern] !== "kv1"
			);
		}
	);

	if (conflictingPatterns.length > 0) {
		const choice = await vscode.window.showWarningMessage(
			`Some file associations already exist: ${conflictingPatterns.join(
				", "
			)}. Replace them with KV1?`,
			"Replace",
			"Cancel"
		);

		if (choice !== "Replace") {
			return;
		}
	}

	await config.update(
		"files.associations",
		{
			...existingAssociations,
			...KV1_DOTA_ASSOCIATIONS,
		},
		vscode.ConfigurationTarget.Workspace
	);

	const existingKv1Settings =
		config.get<Record<string, unknown>>("[kv1]") ?? {};

	const existingQuickSuggestions =
		typeof existingKv1Settings["editor.quickSuggestions"] === "object" &&
		existingKv1Settings["editor.quickSuggestions"] !== null
			? (existingKv1Settings["editor.quickSuggestions"] as Record<
					string,
					unknown
			  >)
			: {};

	await config.update(
		"[kv1]",
		{
			...existingKv1Settings,
			"editor.quickSuggestions": {
				...existingQuickSuggestions,
				strings: "on",
			},
		},
		vscode.ConfigurationTarget.Workspace
	);

	vscode.window.showInformationMessage(
		"KV1 Dota file associations and string autocomplete were added to this workspace."
	);
}

async function removeDotaFileAssociations() {
	const config = vscode.workspace.getConfiguration();
	const existing =
		config.get<Record<string, string>>("files.associations") ?? {};

	const next = { ...existing };

	for (const pattern of Object.keys(KV1_DOTA_ASSOCIATIONS)) {
		if (next[pattern] === "kv1") {
			delete next[pattern];
		}
	}

	await config.update(
		"files.associations",
		next,
		vscode.ConfigurationTarget.Workspace
	);

	vscode.window.showInformationMessage(
		"KV1 Dota file associations were removed from this workspace."
	);
}

export function deactivate() {
	diagnostics?.dispose();
}

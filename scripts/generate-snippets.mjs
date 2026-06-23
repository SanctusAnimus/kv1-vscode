import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "snippets-src");
const outputDir = path.join(root, "snippets");
const manifestPath = path.join(sourceDir, "snippets.json");
const outputPath = path.join(outputDir, "kv1.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const result = {};

for (const [name, entry] of Object.entries(manifest)) {
	const templatePath = path.join(sourceDir, entry.file);
	const template = fs.readFileSync(templatePath, "utf8");

	result[name] = {
		prefix: entry.prefix,
		body: template.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n"),
		description: entry.description ?? name,
	};
}

fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");

console.log(`Generated ${outputPath}`);

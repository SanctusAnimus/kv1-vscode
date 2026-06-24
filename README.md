# Dota2 KeyValues1 VSCode extension

Syntax highlighting and diagnostics for Valve KeyValues1 files in DOTA2 custom game tools.
Provides bracket and quote validation, color highlighting, validating and autocomplete for certain kv keys (such as AbilityBehavior).

Will validate all `.kv` files by default, and associate all `.txt` files under `/game/scripts/npc/` and `/game/resource/` folders

## Compiling and running
Run `npm install`, then `npm run compile`. Then you can test extension via `Extension Development Host` under F5 menu.

To install it outside, build it into vsix file using `npx vsce package`

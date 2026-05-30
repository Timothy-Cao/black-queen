// Vendors the pure game engine from src/game into the Edge Functions as
// Deno-compatible modules (Deno requires explicit .ts extensions on relative
// imports). Run after changing any engine file:
//
//   node supabase/functions/_shared/sync-engine.mjs
//
// src/game/{types,rules,deck,engine}.ts is the single source of truth; the
// copies under _shared/engine/ are generated — do not edit them by hand.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcDir = resolve(repoRoot, "src/game");
const outDir = resolve(here, "engine");
mkdirSync(outDir, { recursive: true });

const FILES = ["types.ts", "rules.ts", "deck.ts", "engine.ts"];

// Add `.ts` to relative imports: `from "./x"` and dynamic `import("./x")`.
function addTsExtensions(code) {
  return code
    .replace(/from\s+"(\.\.?\/[^".]+)"/g, 'from "$1.ts"')
    .replace(/import\("(\.\.?\/[^".]+)"\)/g, 'import("$1.ts")');
}

const banner =
  "// GENERATED — do not edit. Source: src/game/<name>.ts\n" +
  "// Regenerate: node supabase/functions/_shared/sync-engine.mjs\n\n";

for (const f of FILES) {
  const code = readFileSync(resolve(srcDir, f), "utf8");
  writeFileSync(resolve(outDir, f), banner + addTsExtensions(code), "utf8");
  console.log("vendored", f);
}
console.log("done →", outDir);

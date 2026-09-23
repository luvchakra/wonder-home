#!/usr/bin/env node
// `npm run eval` — the Wave 5 unified AI evaluation (design/AI-EVALUATION-WAVE-5.md).
// Loads the TypeScript evaluation framework directly, so what runs is the
// same source the app ships; see packages/core/src/evaluation/cli.ts.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url);
const { main } = await jiti.import(join(root, "packages/core/src/evaluation/cli.ts"));
process.exitCode = await main(process.argv.slice(2), root);

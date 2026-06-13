import path from "node:path";
import fs from "node:fs";

const possibleEnvPaths = [
  // Workspace root .env from src/lib/env.ts
  path.resolve(import.meta.dirname, "../../../../.env"),
  // Workspace root .env from dist/index.mjs
  path.resolve(import.meta.dirname, "../../../.env"),
  // Local .env from src/lib/env.ts
  path.resolve(import.meta.dirname, "../../.env"),
  // Local .env from dist/index.mjs
  path.resolve(import.meta.dirname, "../.env"),
  // From current working directory
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch (err) {
      // Ignore
    }
  }
}

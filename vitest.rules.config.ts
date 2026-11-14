import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Security-rules tests. They need the Firestore emulator: run with `npm run test:rules`
// (wraps vitest in `firebase emulators:exec --only firestore`).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});

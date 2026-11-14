import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Rules tests need the Firestore emulator; run them with `npm run test:rules`.
    exclude: ["tests/rules/**", "node_modules/**"],
    testTimeout: 20000,
  },
});

import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// 結合テスト(tests/integration)はローカルSupabase前提のため別設定
// (vitest.config.integration.ts / npm run test:integration)で実行する。
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "tests/integration/**"],
  },
});

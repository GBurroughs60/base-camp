import path from "path";
import { defineConfig } from "vitest/config";

// Added alongside the Admin Pending Review feature's server-action tests
// (pendingReview.server.test.ts), which need to load a module that itself
// imports via the "@/..." alias (createClient, requireAdmin) the same way
// the app does. dateSignalExtraction.test.ts never needed this -- it only
// ever imported its subject by relative path -- so no vitest config
// existed before this. Mirrors tsconfig.json's "@/*" -> "./src/*" mapping;
// keep the two in sync if that ever changes.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

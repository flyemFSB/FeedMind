import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "invariants",
          root: `${root}/tests/invariants`,
          include: ["**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@feedmind/contracts": `${root}/packages/contracts/src/index.ts`,
            "@feedmind/wiki-core": `${root}/packages/wiki-core/src/index.ts`,
            "@feedmind/crawler-core": `${root}/packages/crawler-core/src/index.ts`,
            "@feedmind/env": `${root}/packages/env/src/index.ts`,
            "@feedmind/db": `${root}/packages/db/src/index.ts`,
          },
        },
      },
    ],
  },
});

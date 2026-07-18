import { build } from "esbuild";

await build({
  entryPoints: ["apps/api/src/index.ts"],
  outfile: "api/bundle.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});

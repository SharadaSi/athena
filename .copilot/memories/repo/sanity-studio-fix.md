# Sanity Studio dev-server workaround

Vite 7's esbuild-based dep optimizer emits an EMPTY `node_modules/.sanity/vite/deps/sanity.js` entry
shim on Windows + Node 25 + esbuild 0.25+. Browser then errors with
"module does not provide an export named 'X'".

Cause: esbuild tree-shakes the `sanity` entry's exports based on what other bundled deps reference.
459 of 682 sanity exports get dropped because no other dep imports them.

Fix is in `studio-czechalert-website/sanity.cli.ts`:

1. Esbuild plugin via `optimizeDeps.esbuildOptions.plugins`:
   - Forces `build.initialOptions.write = false` so `onEnd` receives the in-memory bundle
   - Detects empty entry by `!text.includes('export ')` (35-byte file is just sourcemap pragma)
   - Builds replacement shim from each chunk's trailing `export { ... };` block. Regex:
     `/^  ([a-zA-Z_$][\w$]*)(?:\s+as\s+([a-zA-Z_$][\w$]*))?/gm` — capture the post-`as` name
   - For exports tree-shaken out of all chunks, re-import them from the original ESM via
     relative path `../../../sanity/lib/index.js` (Vite serves it with bare imports rewritten)
   - Writes all output files manually (since we forced `write:false`)

2. `optimizeDeps.include` is auto-populated by parsing every bare-module import in
   `node_modules/sanity/lib/index.js` (~190 entries). Without this, Vite serves CJS
   transitive deps (`react-is`, `void-elements`, `react/compiler-runtime`, etc.) without
   ESM interop and they fail with missing `default` exports. Filter out `sanity/*`,
   `{{...}}` template placeholders, and `scheduled-publishing` (internal alias).

3. Plugin must be registered in `sanity.cli.ts` (NOT `sanity.config.ts`) — only the cli
   config's `vite:` field is applied to the `sanity dev` server.

Cleanup commands when fix appears broken:
```
rm -rf node_modules/.sanity node_modules/.vite && npm run dev
```

Confirmed working on:
- Windows 11, Node 25.2.1, npm 11.5.1
- Vite 7.3.2, esbuild 0.27.4 (pinned via `package.json` `overrides`)
- Sanity 5.21.0, project at `C:\DEV\CODE\CZECHALERT-WEB`

import {defineCliConfig} from 'sanity/cli'
import {writeFileSync, mkdirSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {createRequire} from 'node:module'

const __require = createRequire(join(process.cwd(), 'package.json'))

/**
 * Read every bare-module import from `node_modules/sanity/lib/index.js`. These are the deps
 * Vite needs to serve when our shim re-exports the tree-shaken names through that file. Any
 * bare import not in `optimizeDeps.include` gets served as raw CJS-converted ESM and can fail
 * with "does not provide an export named 'default'" at runtime.
 */
function collectSanityRuntimeBareImports(): string[] {
  try {
    let sanityIndexPath: string
    try {
      sanityIndexPath = __require.resolve('sanity/lib/index.js')
    } catch {
      // Fallback when subpath resolution is blocked by package "exports".
      sanityIndexPath = join(process.cwd(), 'node_modules', 'sanity', 'lib', 'index.js')
    }
    const source = readFileSync(sanityIndexPath, 'utf8')
    const matches = source.matchAll(/from\s+['"]([^.\/][^'"]*)['"]/g)
    const set = new Set<string>()
    for (const m of matches) set.add(m[1])
    // sanity's own subpath imports must NOT be added — they would force-optimize sanity itself
    // and break the very flow we're patching.
    return [...set].filter(
      (name) =>
        !name.startsWith('sanity/') &&
        name !== 'sanity' &&
        // Template placeholders never resolve, and `scheduled-publishing` is an internal alias
        // that Vite cannot find on disk.
        !name.startsWith('{{') &&
        name !== 'scheduled-publishing',
    )
  } catch (e) {
    console.warn('[sanity.cli.vite] collectSanityRuntimeBareImports failed:', (e as Error).message)
    return []
  }
}

/**
 * Workaround for a bug where Vite's dependency optimizer (esbuild on Windows + Node 25)
 * emits the `sanity.js` entry shim as a 0-byte file even though all `chunk-*.js` outputs
 * contain the real exports. The browser then errors with:
 *   "module does not provide an export named 'defineField'".
 *
 * Vite invokes esbuild with `write: false` and writes the bundle to disk itself, so the only
 * place to fix this is **before** Vite reads the in-memory output. We register an esbuild
 * plugin via `optimizeDeps.esbuildOptions.plugins`. In `onEnd`, we inspect `result.outputFiles`,
 * detect an empty `sanity.js` entry, then aggregate every chunk's trailing `export { ... };`
 * block to produce a correct re-export shim — and mutate the entry's `contents`/`text` directly
 * so Vite writes the corrected version to disk and serves it from the optimized-deps cache.
 */

interface OutputFile {
  path: string
  text: string
  contents: Uint8Array
}

/** Build a corrected entry-shim source by scanning chunk outputs in memory. */
function buildShimFromOutputFiles(outputFiles: OutputFile[]): string | null {
  const chunkFiles = outputFiles.filter((f) => /[\\/]chunk-[A-Z0-9]+\.js$/.test(f.path))
  if (chunkFiles.length === 0) return null

  const exportToChunk = new Map<string, string>()
  for (const file of chunkFiles) {
    const txt = file.text
    const basename = file.path.split(/[\\/]/).pop() as string
    let lastIdx = -1
    let from = 0
    while (true) {
      const i = txt.indexOf('\nexport {', from)
      if (i === -1) break
      lastIdx = i + 1
      from = i + 1
    }
    if (lastIdx === -1 && txt.startsWith('export {')) lastIdx = 0
    if (lastIdx === -1) continue
    const tail = txt.slice(lastIdx)
    const endRel = tail.indexOf('\n};')
    if (endRel === -1) continue
    const block = tail.slice(0, endRel + 3)
    // Each line of the block is `  <localName>` or `  <localName> as <exportName>`. We want
    // the public export name — the part after `as` when present, otherwise the local name.
    const lineRe = /^  ([a-zA-Z_$][\w$]*)(?:\s+as\s+([a-zA-Z_$][\w$]*))?/gm
    let lm: RegExpExecArray | null
    while ((lm = lineRe.exec(block))) {
      const name = lm[2] ?? lm[1]
      if (!exportToChunk.has(name)) exportToChunk.set(name, basename)
    }
  }
  if (exportToChunk.size === 0) return null

  const byChunk = new Map<string, string[]>()
  for (const [name, chunk] of exportToChunk) {
    if (!byChunk.has(chunk)) byChunk.set(chunk, [])
    byChunk.get(chunk)!.push(name)
  }

  let shim = ''
  const all: string[] = []
  for (const [chunk, names] of byChunk) {
    shim += `import {\n${names.map((n) => '  ' + n).join(',\n')}\n} from "./${chunk}";\n`
    all.push(...names)
  }

  // Esbuild's optimizer aggressively tree-shakes the `sanity` entry: it only keeps exports
  // referenced from other bundled deps (e.g. @sanity/assist imports `defineField`, `defineType`).
  // Names like `defineConfig`, `renderStudio`, hundreds of components — used only by user code
  // or Sanity's runtime entry — get dropped entirely. To recover them, we ALSO import every
  // missing name from the original sanity ESM (`node_modules/sanity/lib/index.js`) via a
  // relative path that Vite serves through its dev pipeline (rewriting bare imports inside it
  // to point at the optimized chunks). The relative path from `.sanity/vite/deps/sanity.js`
  // up to `node_modules/sanity/lib/index.js` is `../../../sanity/lib/index.js`.
  const surviving = new Set(all)
  let allSanityExports: string[] = []
  try {
    allSanityExports = Object.keys(__require('sanity'))
  } catch {
    // ignore — only the chunk-based exports will be available
  }
  const missing = allSanityExports.filter(
    (name) => !surviving.has(name) && /^[a-zA-Z_$][\w$]*$/.test(name),
  )
  if (missing.length > 0) {
    shim += `\n// Re-export names that esbuild's optimizer tree-shook out of the chunk bundles.\n`
    shim += `// Vite serves /node_modules/sanity/lib/index.js with bare imports rewritten.\n`
    shim += `import {\n${missing.map((n) => '  ' + n).join(',\n')}\n} from "../../../sanity/lib/index.js";\n`
    all.push(...missing)
  }

  shim += `export {\n${all.map((n) => '  ' + n).join(',\n')}\n};\n`
  return shim
}

/** Esbuild plugin that mutates the empty entry shim in-memory before Vite writes/caches it. */
function fixEmptySanityShimEsbuildPlugin() {
  return {
    name: 'fix-empty-sanity-shim',
    setup(build: {
      initialOptions: {write?: boolean}
      onEnd: (cb: (r: {errors?: unknown[]; outputFiles?: OutputFile[]}) => void) => void
    }) {
      // Vite calls esbuild with `write: true`, so we wouldn't get `outputFiles` in onEnd.
      // Force write: false so we receive the in-memory bundle, fix the empty entry, then
      // write all files ourselves. This pre-empts Vite's own disk write of the broken shim.
      build.initialOptions.write = false

      build.onEnd((result) => {
        if (result.errors && result.errors.length) return
        const outputFiles = result.outputFiles
        if (!outputFiles || outputFiles.length === 0) return

        // Find a sanity.js entry whose contents are missing the real re-exports. Vite places
        // the bundle in a temp folder (`deps_temp_*`) before renaming to `deps`. The buggy
        // entry is typically just a sourcemap pragma (~35 bytes) with no `export` keyword.
        const entryIdx = outputFiles.findIndex((f) => {
          if (!/[\\/]sanity\.js$/.test(f.path)) return false
          if (f.path.endsWith('.map')) return false
          const txt = f.text || ''
          return !txt.includes('export ')
        })

        if (entryIdx !== -1) {
          const shim = buildShimFromOutputFiles(outputFiles)
          if (shim) {
            const bytes = Buffer.from(shim, 'utf8')
            const original = outputFiles[entryIdx]
            outputFiles[entryIdx] = {
              ...original,
              path: original.path,
              contents: bytes,
              text: shim,
            }
            // eslint-disable-next-line no-console
            console.log(
              `[sanity.cli] patched empty sanity.js entry shim (${bytes.byteLength} bytes)`,
            )
          } else {
            // eslint-disable-next-line no-console
            console.warn('[sanity.cli] could not build shim — no exports discovered')
          }
        }

        // Because we forced write:false, esbuild did not write to disk. Write everything ourselves.
        for (const f of outputFiles) {
          try {
            mkdirSync(dirname(f.path), {recursive: true})
          } catch {
            // ignore
          }
          writeFileSync(f.path, f.contents)
        }
      })
    },
  }
}

export default defineCliConfig({
  api: {
    projectId: '8z0tbe2a',
    dataset: 'production',
  },
  deployment: {
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/cli#auto-updates
     */
    autoUpdates: false,
  },
  vite: (config) => {
    const extraIncludes = collectSanityRuntimeBareImports()
    return {
      ...config,
      optimizeDeps: {
        ...(config.optimizeDeps ?? {}),
        // Force-pre-bundle every bare import that appears inside `node_modules/sanity/lib/index.js`.
        // Our shim re-exports tree-shaken names through that file; any of its bare imports that
        // Vite hasn't optimized will be served as raw CJS-converted ESM and fail at runtime.
        include: [...(config.optimizeDeps?.include ?? []), ...extraIncludes],
        esbuildOptions: {
          ...(config.optimizeDeps?.esbuildOptions ?? {}),
          plugins: [
            ...(config.optimizeDeps?.esbuildOptions?.plugins ?? []),
            fixEmptySanityShimEsbuildPlugin(),
          ],
        },
      },
    }
  },
})

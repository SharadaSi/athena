// node/rev-assets.js
import {createHash} from 'crypto'
import {promises as fs} from 'fs'
import path from 'path'

const root = 'c:/Users/admin/OneDrive/Plocha/CODE/CZECH ALERT WEB'
const assets = [
  
  'css/style.css',
]
const htmlFiles = [

  'index.html',
  
  // add other pages that reference these assets
]

function hash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 8)
}

async function run() {
  const manifest = {}
  for (const rel of assets) {
    const src = path.join(root, rel)
    const buf = await fs.readFile(src)
    const h = hash(buf)
    const ext = path.extname(rel)
    const base = rel.slice(0, -ext.length)
    const hashedRel = `${base}.${h}${ext}`
    const dest = path.join(root, hashedRel)
    await fs.writeFile(dest, buf)
    manifest[rel] = hashedRel
    console.log(`Hashed ${rel} -> ${hashedRel}`)
  }

  for (const rel of htmlFiles) {
    const file = path.join(root, rel)
    let html = await fs.readFile(file, 'utf8')
    for (const [orig, hashed] of Object.entries(manifest)) {
      const re = new RegExp(orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      html = html.replace(re, hashed)
    }
    await fs.writeFile(file, html)
    console.log(`Updated refs in ${rel}`)
  }
}

run().catch((e) => { console.error(e); process.exit(1) })

/*
Then: Add script in package.json (at repository root directory)

{
  "scripts": {
    "build:assets": "node node/hashed-files-gen.js"
  }
}

Then in Git Bash run

    npm run build:assests

Then in .htacces set long TTL for assests
*/
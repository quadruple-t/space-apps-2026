// Copies Cesium's prebuilt browser bundle into public/cesium so the Globe can
// load it at runtime (Turbopack doesn't bundle Cesium's workers and assets).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
let pkgPath
try {
  pkgPath = require.resolve("cesium/package.json")
} catch {
  console.warn("[copy-cesium] cesium is not installed; skipping")
  process.exit(0)
}
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"))
const src = join(dirname(pkgPath), "Build", "Cesium")
const dest = join(process.cwd(), "public", "cesium")
const stamp = join(dest, ".version")

if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === version) process.exit(0)

mkdirSync(dest, { recursive: true })
for (const entry of ["Cesium.js", "Workers", "ThirdParty", "Assets", "Widgets"]) {
  cpSync(join(src, entry), join(dest, entry), { recursive: true })
}
writeFileSync(stamp, version)
console.log(`[copy-cesium] copied Cesium ${version} to public/cesium`)

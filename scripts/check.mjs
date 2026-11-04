#!/usr/bin/env node
/**
 * Offline manifest check for this bundle: no DSH installation required.
 *
 * Verifies the package manifest, the bundle patch, the client module identity,
 * the locale resources, the icon, and the `files` list a published package
 * would ship.
 */
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ok = []
const problems = []
const fail = (message) => problems.push(message)
const pass = (message) => ok.push(message)

function readJson(relative) {
  try {
    return JSON.parse(readFileSync(join(root, relative), 'utf8'))
  } catch (error) {
    fail(`${relative}: ${error.message}`)
    return undefined
  }
}

function readText(relative) {
  try {
    return readFileSync(join(root, relative), 'utf8')
  } catch (error) {
    fail(`${relative}: ${error.message}`)
    return undefined
  }
}

const pkg = readJson('package.json')
if (pkg) {
  pass('package.json parses')

  if (pkg.type !== 'module') fail('package.json: "type" must be "module"')
  if (!pkg.dsh?.bundle?.patch) fail('package.json: missing dsh.bundle.patch')
  if (pkg.dsh?.client?.platform !== 'web') fail('package.json: dsh.client.platform must be "web"')
  if (!Array.isArray(pkg.dsh?.client?.inject) || pkg.dsh.client.inject.length === 0) {
    fail('package.json: dsh.client.inject must name the slot owner it depends on')
  }

  for (const key of ['.', './client', './icon', './locale/*.json']) {
    if (!pkg.exports?.[key]) fail(`package.json: missing exports["${key}"]`)
  }

  const coveredBy = (entry, file) => {
    if (entry === file) return true
    const pattern = entry
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
    return new RegExp(`^${pattern}$`).test(file)
  }

  const required = ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json']
  for (const file of required) {
    if (!pkg.files?.some((entry) => coveredBy(entry, file))) {
      fail(`package.json: files[] does not cover ${file}`)
    }
  }
  pass('package.json keys present')

  // The browser module id must equal the package name, or the client half loads
  // under a name the loader never resolves.
  const client = readText('client.js')
  if (client) {
    const match = client.match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/)
    if (!match) {
      fail('client.js: no __ModuleLoader__.load({ id }) call found')
    } else if (match[1] !== pkg.name) {
      fail(`client.js: loader id "${match[1]}" does not match package name "${pkg.name}"`)
    } else {
      pass('client.js loader id matches the package name')
    }
  }

  const entry = readText('index.js')
  if (entry && !/export\s+(async\s+)?function\s+apply\b/.test(entry)) {
    fail('index.js: must export a function named apply')
  }
}

const reference = readJson('locale/en.json')
if (reference?.meta?.title && reference?.meta?.description) {
  pass('locale/en.json has meta.title and meta.description')
} else {
  fail('locale/en.json: meta.title and meta.description are required')
}

for (const locale of ['en', 'zh']) {
  const data = readJson(`locale/${locale}.json`)
  if (!data) continue
  if (!data.meta?.title) fail(`locale/${locale}.json: meta.title missing`)
  if (!data.meta?.description) fail(`locale/${locale}.json: meta.description missing`)
  if (reference && Object.keys(data).sort().join(',') !== Object.keys(reference).sort().join(',')) {
    fail(`locale/${locale}.json: top-level keys differ from locale/en.json`)
  }
}

try {
  const icon = statSync(join(root, 'icon.svg'))
  if (icon.size === 0) fail('icon.svg: empty file')
  if (icon.size > 256 * 1024) fail('icon.svg: larger than 256 KiB')
  if (!readFileSync(join(root, 'icon.svg'), 'utf8').slice(0, 200).includes('<svg')) {
    fail('icon.svg: does not look like SVG markup')
  } else {
    pass('icon.svg is valid SVG under 256 KiB')
  }
} catch (error) {
  fail(`icon.svg: ${error.message}`)
}

// Patch: one id, and a name matching the package exactly. A scoped name must be
// quoted, because '@' cannot start a YAML scalar.
const patch = readText('cordis.patch.yml')
if (patch) {
  if (!patch.includes('insert:')) fail('cordis.patch.yml: no insert block')
  if (!/^\s*-\s*id:\s*\S+/m.test(patch)) fail('cordis.patch.yml: inserted row needs an id')
  if (pkg) {
    const escaped = pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const quoted = new RegExp(`name:\\s*['"]${escaped}['"]\\s*$`, 'm')
    const plain = new RegExp(`name:\\s*${escaped}\\s*$`, 'm')
    if (quoted.test(patch)) {
      // correct
    } else if (plain.test(patch) && pkg.name.startsWith('@')) {
      fail(`cordis.patch.yml: scoped name "${pkg.name}" must be quoted — '@' cannot start a YAML scalar`)
    } else {
      fail(`cordis.patch.yml: row name does not match package name "${pkg.name}"`)
    }
  }
  pass('cordis.patch.yml references the package')
}

for (const message of ok) console.log(`  ok   ${message}`)
for (const message of problems) console.log(`  FAIL ${message}`)

if (problems.length > 0) {
  console.log(`\n${problems.length} problem(s) found.`)
  process.exit(1)
}
console.log('\nAll checks passed.')

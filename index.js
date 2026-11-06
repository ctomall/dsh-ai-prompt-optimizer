/**
 * Host half of the AI prompt optimizer.
 *
 * The browser control (`client.js`) posts one draft prompt and gets a stream of
 * NDJSON events back while a model rewrites it. Everything model-facing lives
 * here: the rewrites rules, the request limits, model resolution, and the
 * browser trust fence. The client only renders.
 *
 * The route is a plain `webServer` route (no generated Remote schema), so it is
 * identical in shape to the shipped open-in-app routes: `connection`
 * `requestRejection` first (Host/Origin fence plus the login-token cookie),
 * then a bounded JSON body, then the stream.
 */

import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

/** Cordis function-plugin name. */
export const name = 'ai-prompt-optimizer'

/** The streaming carrier, the trust fence, and the two model sources. */
export const inject = ['llm', 'agentDefaultModel', 'webServer', 'connection']

/** Exact route the browser control posts to. */
const ROUTE = '/prompt-optimizer/optimize'

/** Settings endpoint used by the plugin detail page and the composer halves. */
const SETTINGS_ROUTE = '/prompt-optimizer/settings'

/** Longest accepted draft; longer drafts are rejected with a stable code. */
const MAX_PROMPT_CHARS = 8000

/** Floor for the configurable draft limit. */
const MIN_PROMPT_CHARS = 200

/** Shipped defaults for every user-facing switch. */
const DEFAULT_SETTINGS = Object.freeze({
  /** Show the composer trigger at all. */
  enabled: true,
  /** Panel anchor: above the composer card, or ambient below it. */
  position: 'below',
  /** Direction preselected when the panel opens. */
  defaultMode: 'general',
  /** Longest draft this deployment accepts. */
  maxChars: MAX_PROMPT_CHARS,
  /** Stream partial text into the panel instead of waiting for the reply. */
  stream: true,
  /** Keep the direction chips visible. */
  showModes: true,
})

/** Every key a settings payload may carry. */
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS)

/** This package's own directory: the git checkout the updater operates on. */
const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url))

/** Updater endpoints: status/upgrade, and the post-upgrade service restart. */
const UPDATE_ROUTE = '/prompt-optimizer/update'
const RESTART_ROUTE = '/prompt-optimizer/restart'

/** Upper bound for one git invocation. */
const GIT_TIMEOUT_MS = 45_000

/** Bound for the read-only remote probe. */
const GIT_PROBE_TIMEOUT_MS = 20_000

const execFileAsync = promisify(execFile)

/** Git environment: never block on an interactive credential prompt. */
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'true',
  GIT_CONFIG_NOSYSTEM: '1',
  LC_ALL: 'C',
}

/**
 * Run one git command inside this package.
 * @param args - git arguments.
 * @param timeout - deadline in milliseconds.
 * @returns stdout.
 */
async function git(args, timeout = GIT_TIMEOUT_MS) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: PACKAGE_ROOT,
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    env: GIT_ENV,
  })
  return String(stdout)
}

/**
 * Classify one updater failure into a stable code the page can translate.
 * @param error - thrown value from execFile or a guard.
 * @returns a code and message.
 */
function updateFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (error?.code === 'ENOENT') return { code: 'git-missing', message: 'git is not installed on this Host' }
  if (error?.killed === true || /timed? ?out/i.test(message)) return { code: 'timeout', message }
  const text = `${message}${error?.stderr ? ` ${String(error.stderr)}` : ''}`
  if (/not a git repository/i.test(text)) return { code: 'not-a-repo', message }
  if (/no such remote|does not appear to be a git repository|could not read from remote|authentication|repository not found/i.test(text)) {
    return { code: 'remote-unreachable', message }
  }
  if (/could not resolve host|network is unreachable|connection (refused|timed out)/i.test(text)) {
    return { code: 'network', message }
  }
  return { code: 'git-failed', message }
}

/**
 * Read the local checkout state.
 * @returns branch, commit ids, last subject, tracked-modification flag, remote.
 */
async function readRepoState() {
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const head = (await git(['rev-parse', 'HEAD'])).trim()
  const short = (await git(['rev-parse', '--short', 'HEAD'])).trim()
  let subject = ''
  try {
    subject = (await git(['log', '-1', '--format=%s'])).trim()
  } catch {
    // A shallow or broken history still lets the updater work by commit id.
  }
  let dirty = false
  try {
    // Untracked files are ignored on purpose: they survive a reset and are not
    // the user's edits to tracked plugin code.
    dirty = (await git(['status', '--porcelain', '--untracked-files=no'])).trim().length > 0
  } catch {
    dirty = false
  }
  let remoteUrl = ''
  try {
    remoteUrl = (await git(['remote', 'get-url', 'origin'])).trim()
  } catch {
    remoteUrl = ''
  }
  return { branch, head, short, subject, dirty, remoteUrl }
}

/**
 * Ask the remote for the tip of one branch without touching the work tree.
 * @param branch - branch name.
 * @returns the remote commit id, or undefined when the branch is gone.
 */
async function probeRemote(branch) {
  const stdout = await git(['ls-remote', 'origin', `refs/heads/${branch}`], GIT_PROBE_TIMEOUT_MS)
  const first = stdout.trim().split('\n')[0] ?? ''
  const sha = first.split(/\s+/)[0] ?? ''
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined
}

/**
 * Serve one updater call: GET reports status, POST performs the upgrade.
 * @param ctx - plugin context.
 * @param req - incoming request.
 * @param res - response pair.
 */
async function handleUpdate(ctx, req, res) {
  if (rejectUntrusted(ctx, req, res)) return
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendError(res, 405, 'method-not-allowed', 'GET or POST required')
    return
  }

  let force = false
  if (req.method === 'POST') {
    const mediaType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
    if (mediaType === 'application/json') {
      try {
        const body = await readJsonBody(req)
        force = body !== null && typeof body === 'object' && body.force === true
      } catch {
        force = false
      }
    }
  }

  let state
  try {
    state = await readRepoState()
  } catch (error) {
    const failure = updateFailure(error)
    sendJson(res, 200, { ok: false, error: failure, checkedAt: new Date().toISOString() })
    return
  }
  if (state.remoteUrl === '') {
    sendJson(res, 200, {
      ok: false,
      error: { code: 'no-remote', message: 'this checkout has no origin remote' },
      state,
      checkedAt: new Date().toISOString(),
    })
    return
  }

  let remoteHead
  try {
    remoteHead = await probeRemote(state.branch)
  } catch (error) {
    const failure = updateFailure(error)
    sendJson(res, 200, { ok: false, error: failure, state, checkedAt: new Date().toISOString() })
    return
  }
  if (remoteHead === undefined) {
    sendJson(res, 200, {
      ok: false,
      error: { code: 'branch-missing', message: `remote branch ${state.branch} was not found` },
      state,
      checkedAt: new Date().toISOString(),
    })
    return
  }

  const available = remoteHead !== state.head
  const remote = { head: remoteHead, short: remoteHead.slice(0, 7) }

  if (req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      state,
      remote,
      available,
      canUpdate: available && !state.dirty,
      checkedAt: new Date().toISOString(),
    })
    return
  }

  // POST: upgrade.
  if (!available) {
    sendJson(res, 200, { ok: true, upgraded: false, state, remote, restartRequired: false, message: 'already up to date' })
    return
  }
  if (state.dirty && !force) {
    sendJson(res, 200, {
      ok: false,
      error: { code: 'dirty', message: 'tracked files have local modifications' },
      state,
      remote,
      available,
      checkedAt: new Date().toISOString(),
    })
    return
  }

  const from = state.short
  try {
    await git(['fetch', '--depth=1', 'origin', state.branch])
    await git(['reset', '--hard', 'FETCH_HEAD'])
  } catch (error) {
    const failure = updateFailure(error)
    sendJson(res, 200, { ok: false, error: failure, state, remote, available, checkedAt: new Date().toISOString() })
    return
  }

  let after
  try {
    after = await readRepoState()
  } catch {
    after = { ...state, head: remoteHead, short: remote.short, dirty: false }
  }
  sendJson(res, 200, {
    ok: true,
    upgraded: after.head !== state.head,
    from,
    to: after.short,
    state: after,
    remote,
    // Module code is read at boot, so the new files only take effect on restart.
    restartRequired: true,
    checkedAt: new Date().toISOString(),
  })
}

/**
 * Serve a restart request: schedule `systemctl restart dsh-web` just after the
 * response flushes, so the page that asked can show the result first.
 * @param ctx - plugin context.
 * @param req - incoming request.
 * @param res - response pair.
 */
async function handleRestart(ctx, req, res) {
  if (rejectUntrusted(ctx, req, res)) return
  if (req.method !== 'POST') {
    sendError(res, 405, 'method-not-allowed', 'POST required')
    return
  }
  const unit = `apo-restart-${Date.now()}`
  try {
    await execFileAsync(
      'systemd-run',
      ['--on-active=3', `--unit=${unit}`, '--description=dsh-web restart requested by the prompt optimizer', '/bin/systemctl', 'restart', 'dsh-web.service'],
      { timeout: 15_000, env: process.env },
    )
    sendJson(res, 200, { ok: true, scheduled: true, seconds: 3, unit })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    sendJson(res, 200, {
      ok: false,
      error: { code: 'restart-failed', message },
      command: 'sudo systemctl restart dsh-web.service',
    })
  }
}

/**
 * Absolute path of the settings document.
 *
 * It lives under the DSH home's plugin-data area, next to the other per-plugin
 * state, so it survives a page reload and a browser switch.
 * @returns the settings file path.
 */
function settingsFile() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'plugin-data', '@local', 'ai-prompt-optimizer', 'settings.json')
}

/** Coerce one stored value to the shape the switch declares. */
function coerceSetting(key, value, fallback) {
  switch (key) {
    case 'enabled':
    case 'stream':
    case 'showModes':
      return typeof value === 'boolean' ? value : fallback
    case 'position':
      return value === 'above' || value === 'below' ? value : fallback
    case 'defaultMode':
      return MODE_KEYS.includes(value) ? value : fallback
    case 'maxChars': {
      const numeric = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
      if (!Number.isFinite(numeric)) return fallback
      return Math.min(MAX_PROMPT_CHARS, Math.max(MIN_PROMPT_CHARS, Math.round(numeric)))
    }
    default:
      return fallback
  }
}

/**
 * Merge one untrusted patch over the current settings.
 * Unknown keys are ignored, so a stale page cannot resurrect a removed switch.
 */
function normalizeSettings(patch, current) {
  const next = { ...current }
  for (const key of SETTING_KEYS) {
    if (patch === null || typeof patch !== 'object' || !Object.hasOwn(patch, key)) continue
    next[key] = coerceSetting(key, patch[key], current[key])
  }
  return next
}

/**
 * Read the settings document, falling back to defaults for anything missing or
 * unreadable. A corrupt file must never break the composer.
 */
function loadSettings() {
  const settings = { ...DEFAULT_SETTINGS }
  let raw
  try {
    raw = readFileSync(settingsFile(), 'utf8')
  } catch {
    return settings
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return settings
  }
  return normalizeSettings(parsed, settings)
}

/** Write the settings document atomically so a crash cannot truncate it. */
function saveSettings(next) {
  const file = settingsFile()
  mkdirSync(join(file, '..'), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
}

/** Ceiling for the JSON request body. */
const MAX_BODY_BYTES = 64 * 1024

/** Hard deadline for one rewrite, including provider retries. */
const REQUEST_TIMEOUT_MS = 120_000

/** Output budget per direction: a longer brief needs more room than a rewrite. */
const TOKEN_BUDGET = {
  general: 2200,
  structure: 3200,
  concise: 1800,
  detail: 2600,
  technical: 4200,
  frontend: 3200,
  backend: 3600,
  review: 3200,
  dsh: 3600,
}
/** Fallback budget when a direction is unknown. */
const MAX_OUTPUT_TOKENS = 2200

/** Sampling temperature: rewrite faithfully rather than creatively. */
const TEMPERATURE = 0.4

/**
 * Rewrite rules shared by every direction. The output contract is deliberately
 * strict: the browser inserts the reply into the composer verbatim, so any
 * preamble, fence, or quotation would become part of the prompt.
 */
const SYSTEM_PROMPT = [
  'You are a senior prompt engineer. Rewrite the user\'s draft prompt into a better prompt that the user will send to an AI assistant.',
  '',
  'Rules:',
  '1. Preserve the user\'s intent, facts, names, numbers, code, paths, and language exactly. Never invent facts; where a required detail is missing, use a square-bracket placeholder such as [framework].',
  '2. Remove ambiguity: make the goal, the context, the constraints, and the expected output explicit whenever the draft implies them.',
  '3. Keep the result self-contained: it must make sense without this conversation or the original draft.',
  '4. Do not answer the draft, do not explain your changes, and do not add a preamble.',
  '5. Output only the optimized prompt text. No surrounding quotation marks, no code fences, and no commentary. If the draft itself is code, keep its code formatting.',
  '6. Write the result in the same language as the draft.',
].join('\n')

/**
 * Direction-specific instructions appended to the shared rules. Keys are the
 * wire values accepted from the browser; anything else falls back to
 * `general`.
 */
const DIRECTIONS = {
  general: [
    'Direction: general improvement.',
    'Clarify the goal, add the context and constraints the draft needs, and make the expected output explicit. Stay close to the original length; do not restructure it into sections unless that is clearly better.',
  ].join(' '),
  structure: [
    'Direction: structured prompt.',
    'Organize the result into short labeled sections that fit the request (for example Role, Task, Context, Requirements, Output format), using bullet points where they help. Omit any section that would have no content.',
  ].join(' '),
  concise: [
    'Direction: concise prompt.',
    'Compress the draft. Remove filler, repetition, and hedging while keeping every instruction, fact, and constraint. The result must be clearly shorter than the draft.',
  ].join(' '),
  detail: [
    'Direction: richer prompt.',
    'Spell out the background, constraints, quality bar, and output format that the draft implies so the request is unambiguous. Use square-bracket placeholders instead of inventing specifics.',
  ].join(' '),
  technical: [
    'Direction: engineering brief.',
    'Treat the draft as an engineering task. State the goal, the relevant stack and environment, the files or components involved, hard constraints, and concrete acceptance criteria. Keep code, paths, identifiers, and error text exactly as written.',
  ].join(' '),
  frontend: [
    'Direction: front-end UI brief.',
    'Treat the draft as a UI request. Describe the screen or component goal, the layout and visual hierarchy, the tokens to reuse (spacing, radius, typography, color roles), every state (empty, loading, error, hover, focus, disabled), responsive behaviour and breakpoints, and the accessibility requirements (contrast, focus order, labels). Keep existing component, class, and token names exactly as written; use square brackets for anything unknown.',
  ].join(' '),
  backend: [
    'Direction: back-end design brief.',
    'Treat the draft as a back-end request. Cover the endpoint or job surface (inputs, outputs, status and error codes), the data model and migration, validation rules, auth and authorization, idempotency and concurrency, limits and performance, observability, and the rollout or rollback plan. Preserve names, paths, and schema fields exactly as written; mark unknown specifics with square brackets instead of inventing them.',
  ].join(' '),
  review: [
    'Direction: code review brief.',
    'Treat the draft as a review request. State the scope (files, diff, language), the review focus (correctness, edge cases, error handling, security, performance, readability, tests), the severity scale, and the exact output shape: blocking versus non-blocking findings, each with file and line, the problem, why it matters, and a concrete fix. Forbid rewriting code the review does not ask about.',
  ].join(' '),
  dsh: [
    'Direction: DeepSeek Harness plugin brief.',
    'Treat the draft as a DSH plugin task. State the package name and entry points, whether it is Host-only, browser half, or both, the Loader row id and cordis patch, the services it injects, the tools, routes, or slots it registers, its config schema and defaults, its failure behaviour, and the verification steps including whether a restart is required. Follow existing DSH conventions and never invent an API.',
  ].join(' '),
}

/** Recognized direction keys. */
const MODE_KEYS = Object.keys(DIRECTIONS)

/**
 * Answer an untrusted or unauthenticated request.
 * @param ctx - plugin context carrying the connection service.
 * @param req - incoming request.
 * @param res - response pair.
 * @returns whether the request was rejected.
 */
function rejectUntrusted(ctx, req, res) {
  const rejection = ctx.connection.requestRejection(req)
  if (rejection === undefined) return false
  res.statusCode = rejection
  res.end()
  return true
}

/**
 * Send one small JSON payload.
 * @param res - response pair.
 * @param status - HTTP status.
 * @param payload - JSON-serializable body.
 * @param headers - extra response headers.
 */
function sendJson(res, status, payload, headers = {}) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value)
  res.end(JSON.stringify(payload))
}

/** One stable JSON error body. */
function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } })
}

/**
 * Read one bounded JSON body.
 * @param req - incoming request.
 * @returns the parsed body.
 * @throws a tagged error (`code`) for oversized or malformed input.
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (code, message) => {
      if (settled) return
      settled = true
      reject(Object.assign(new Error(message), { code }))
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        fail('payload-too-large', 'request body is too large')
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('request body is not valid JSON'), { code: 'bad-request' }))
      }
    })
    req.on('error', (error) => {
      fail('bad-request', error instanceof Error ? error.message : 'request body unreadable')
    })
  })
}

/**
 * Resolve the model route for one rewrite.
 *
 * Preference order: the model this Session last used (the selector the user
 * already sees), then the Agent's configured options, then the profile default
 * selection. Every step is defensive because a resumed or blank Session may
 * carry none of them.
 *
 * @param ctx - plugin context.
 * @param sessionId - optional incoming Session identity.
 * @returns `{ provider, model }` or `undefined` when nothing is configured.
 */
function resolveTarget(ctx, sessionId) {
  const usable = (candidate) =>
    candidate !== undefined &&
    typeof candidate.provider === 'string' &&
    candidate.provider.length > 0 &&
    typeof candidate.model === 'string' &&
    candidate.model.length > 0

  if (typeof sessionId === 'string' && sessionId.length > 0) {
    try {
      const agents = ctx.get('agents')
      const agent = agents?.get(sessionId)
      if (agent !== undefined) {
        const latest = agent.session?.requestHeader?.()?.config
        if (usable(latest)) return { provider: latest.provider, model: latest.model }
        if (usable(agent.options)) return { provider: agent.options.provider, model: agent.options.model }
      }
    } catch {
      // A Session outside this process (or a closed one) simply falls through.
    }
  }
  try {
    const selection = ctx.agentDefaultModel.currentSelection()
    if (usable(selection)) return { provider: selection.provider, model: selection.model }
  } catch {
    return undefined
  }
  return undefined
}

/**
 * Write one NDJSON event, ignoring a peer that already hung up.
 * @param res - response pair.
 * @param event - event payload.
 */
function writeEvent(res, event) {
  if (res.writableEnded || res.destroyed) return
  try {
    res.write(`${JSON.stringify(event)}\n`)
  } catch {
    // The reader is gone; the stream loop stops on its own signal.
  }
}

/**
 * Stream one rewrite over the open response.
 * @param ctx - plugin context.
 * @param res - response pair.
 * @param request - validated prompt, direction, and target.
 */
async function streamRewrite(ctx, res, request) {
  const { prompt, mode, target, sessionId, stream = true } = request
  const abort = new AbortController()
  const onClose = () => abort.abort()
  res.on('close', onClose)

  const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)
  let sawText = false
  let settled = false
  // Non-streaming mode buffers the reply and emits it in one delta.
  let buffered = ''
  const flushBuffered = () => {
    if (stream || buffered.length === 0) return
    writeEvent(res, { type: 'delta', text: buffered })
    buffered = ''
  }

  try {
    res.statusCode = 200
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-accel-buffering', 'no')
    res.flushHeaders?.()

    for await (const chunk of ctx.llm.stream({
      provider: target.provider,
      model: target.model,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [{ type: 'text', text: `${prompt}\n\n${DIRECTIONS[mode]}` }] }],
      maxTokens: TOKEN_BUDGET[mode] ?? MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      signal: abort.signal,
      ...(typeof sessionId === 'string' && sessionId.length > 0 ? { sessionId } : {}),
    })) {
      if (chunk.type === 'text-delta') {
        sawText = true
        if (stream) writeEvent(res, { type: 'delta', text: chunk.text })
        else buffered += chunk.text
        continue
      }
      if (chunk.type !== 'finish') continue
      settled = true
      const reason = chunk.reason
      if (reason.kind === 'aborted') {
        // Cancelled from the page or by the deadline: close silently.
      } else if (reason.kind === 'max-tokens') {
        // A long brief can reach the budget: keep what arrived and mark it
        // truncated instead of discarding a usable reply as a failure.
        if (sawText) {
          flushBuffered()
          writeEvent(res, { type: 'done', truncated: true })
        } else {
          writeEvent(res, {
            type: 'error',
            code: 'max-tokens',
            message: 'the reply hit the output limit before any text arrived',
          })
        }
      } else if (reason.kind === 'stop' || reason.kind === 'tool-calls') {
        if (sawText) {
          flushBuffered()
          writeEvent(res, { type: 'done' })
        }
        else writeEvent(res, { type: 'error', code: 'empty', message: 'the model returned no text' })
      } else {
        const detail = typeof reason.failure?.message === 'string' && reason.failure.message !== ''
          ? reason.failure.message
          : `the model ended with reason ${String(reason.kind)}`
        ctx.get('logger')?.warn?.(`[ai-prompt-optimizer] model call failed: ${detail}`)
        writeEvent(res, { type: 'error', code: 'model-error', message: detail })
      }
      break
    }

    if (!settled && !abort.signal.aborted) {
      if (sawText) {
        flushBuffered()
        writeEvent(res, { type: 'done' })
      }
      else writeEvent(res, { type: 'error', code: 'empty', message: 'the model returned no text' })
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      writeEvent(res, {
        type: 'error',
        code: 'model-error',
        message: error instanceof Error ? error.message : 'the model call failed',
      })
    }
  } finally {
    clearTimeout(timeout)
    res.off('close', onClose)
    if (!res.writableEnded) res.end()
  }
}

/**
 * Handle one settings read or write.
 *
 * The plugin detail page and both composer halves read the same document, so a
 * saved switch takes effect without reloading the page.
 * @param ctx - plugin context.
 * @param req - incoming request.
 * @param res - response pair.
 */
async function handleSettings(ctx, req, res) {
  if (rejectUntrusted(ctx, req, res)) return

  if (req.method === 'GET') {
    sendJson(res, 200, { settings: loadSettings(), defaults: DEFAULT_SETTINGS })
    return
  }
  if (req.method !== 'POST') {
    sendError(res, 405, 'method-not-allowed', 'GET or POST required')
    return
  }
  const mediaType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    sendError(res, 415, 'unsupported-media-type', 'content-type must be application/json')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    const code = error?.code === 'payload-too-large' ? 'payload-too-large' : 'bad-request'
    sendError(res, code === 'payload-too-large' ? 413 : 400, code, 'request body unreadable')
    return
  }

  const patch = body !== null && typeof body === 'object' && body.settings !== undefined ? body.settings : body
  if (patch === null || typeof patch !== 'object') {
    sendError(res, 400, 'bad-request', 'expected a settings object')
    return
  }

  const next = normalizeSettings(patch, loadSettings())
  try {
    saveSettings(next)
  } catch (error) {
    sendError(res, 500, 'save-failed', error instanceof Error ? error.message : 'could not write settings')
    return
  }
  sendJson(res, 200, { settings: next, defaults: DEFAULT_SETTINGS })
}

/**
 * Handle one rewrite request end to end.
 * @param ctx - plugin context.
 * @param req - incoming request.
 * @param res - response pair.
 */
async function handleOptimize(ctx, req, res) {
  if (rejectUntrusted(ctx, req, res)) return
  if (req.method !== 'POST') {
    sendError(res, 405, 'method-not-allowed', 'POST required')
    return
  }
  const mediaType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') {
    sendError(res, 415, 'unsupported-media-type', 'content-type must be application/json')
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    const code = error?.code === 'payload-too-large' ? 'payload-too-large' : 'bad-request'
    sendError(res, code === 'payload-too-large' ? 413 : 400, code, error instanceof Error ? error.message : 'request body unreadable')
    return
  }

  const settings = loadSettings()
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (prompt.length === 0) {
    sendError(res, 400, 'empty-prompt', 'prompt must be a non-empty string')
    return
  }
  if (prompt.length > settings.maxChars) {
    sendError(res, 413, 'prompt-too-long', `prompt must be at most ${settings.maxChars} characters`)
    return
  }

  const mode = MODE_KEYS.includes(body?.mode) ? body.mode : settings.defaultMode
  const target = resolveTarget(ctx, typeof body?.sessionId === 'string' ? body.sessionId : undefined)
  if (target === undefined) {
    sendError(res, 409, 'no-model', 'no model is configured for this profile')
    return
  }

  await streamRewrite(ctx, res, {
    prompt,
    mode,
    target,
    stream: settings.stream,
    sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
  })
}

/**
 * Register the optimizer routes for the life of this plugin.
 * @param ctx - plugin context carrying the services declared in `inject`.
 */
export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: (req, res) => handleOptimize(ctx, req, res),
      }),
    `ai-prompt-optimizer: POST ${ROUTE}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: SETTINGS_ROUTE,
        handler: (req, res) => handleSettings(ctx, req, res),
      }),
    `ai-prompt-optimizer: GET/POST ${SETTINGS_ROUTE}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: UPDATE_ROUTE,
        handler: (req, res) => handleUpdate(ctx, req, res),
      }),
    `ai-prompt-optimizer: GET/POST ${UPDATE_ROUTE}`,
  )

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: RESTART_ROUTE,
        handler: (req, res) => handleRestart(ctx, req, res),
      }),
    `ai-prompt-optimizer: POST ${RESTART_ROUTE}`,
  )
}

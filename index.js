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

/** Cordis function-plugin name. */
export const name = 'ai-prompt-optimizer'

/** The streaming carrier, the trust fence, and the two model sources. */
export const inject = ['llm', 'agentDefaultModel', 'webServer', 'connection']

/** Exact route the browser control posts to. */
const ROUTE = '/prompt-optimizer/optimize'

/** Longest accepted draft; longer drafts are rejected with a stable code. */
const MAX_PROMPT_CHARS = 8000

/** Ceiling for the JSON request body. */
const MAX_BODY_BYTES = 64 * 1024

/** Hard deadline for one rewrite, including provider retries. */
const REQUEST_TIMEOUT_MS = 120_000

/** Output budget per direction. */
const MAX_OUTPUT_TOKENS = 1800

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
  const { prompt, mode, target, sessionId } = request
  const abort = new AbortController()
  const onClose = () => abort.abort()
  res.on('close', onClose)

  const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS)
  let sawText = false
  let settled = false

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
      maxTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      signal: abort.signal,
      ...(typeof sessionId === 'string' && sessionId.length > 0 ? { sessionId } : {}),
    })) {
      if (chunk.type === 'text-delta') {
        sawText = true
        writeEvent(res, { type: 'delta', text: chunk.text })
        continue
      }
      if (chunk.type !== 'finish') continue
      settled = true
      const reason = chunk.reason
      if (reason.kind === 'stop' || reason.kind === 'tool-calls') {
        if (sawText) writeEvent(res, { type: 'done' })
        else writeEvent(res, { type: 'error', code: 'empty', message: 'the model returned no text' })
      } else if (reason.kind === 'aborted') {
        // Cancelled from the page or by the deadline: close silently.
      } else {
        writeEvent(res, {
          type: 'error',
          code: 'model-error',
          message: reason.failure?.message ?? 'the model call failed',
        })
      }
      break
    }

    if (!settled && !abort.signal.aborted) {
      if (sawText) writeEvent(res, { type: 'done' })
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

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (prompt.length === 0) {
    sendError(res, 400, 'empty-prompt', 'prompt must be a non-empty string')
    return
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    sendError(res, 413, 'prompt-too-long', `prompt must be at most ${MAX_PROMPT_CHARS} characters`)
    return
  }

  const mode = MODE_KEYS.includes(body?.mode) ? body.mode : 'general'
  const target = resolveTarget(ctx, typeof body?.sessionId === 'string' ? body.sessionId : undefined)
  if (target === undefined) {
    sendError(res, 409, 'no-model', 'no model is configured for this profile')
    return
  }

  await streamRewrite(ctx, res, {
    prompt,
    mode,
    target,
    sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
  })
}

/**
 * Register the optimizer route for the life of this plugin.
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
}

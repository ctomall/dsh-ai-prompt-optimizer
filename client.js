window.__ModuleLoader__.load({
  id: '@local/ai-prompt-optimizer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'aiPromptOptimizer'
    const ENDPOINT = '/prompt-optimizer/optimize'
    const MAX_PROMPT_CHARS = 8000
    const MODE_KEYS = ['general', 'structure', 'concise', 'detail', 'technical', 'frontend', 'backend', 'review', 'dsh']

    /** Package name doubles as the detail-page config key. */
    const PACKAGE = '@local/ai-prompt-optimizer'
    const SETTINGS_ENDPOINT = '/prompt-optimizer/settings'
    const UPDATE_ENDPOINT = '/prompt-optimizer/update'
    const RESTART_ENDPOINT = '/prompt-optimizer/restart'

    /** Shipped defaults; the Host owns the same table. */
    const DEFAULT_SETTINGS = {
      enabled: true,
      position: 'below',
      defaultMode: 'general',
      maxChars: 8000,
      stream: true,
      showModes: true,
    }

    /** One shared settings snapshot: the composer halves and the detail page. */
    let settingsState = { ...DEFAULT_SETTINGS }
    const settingsListeners = new Set()

    /** Replace the snapshot and wake every mounted consumer. */
    function publishSettings(next) {
      settingsState = { ...DEFAULT_SETTINGS, ...(next ?? {}) }
      for (const listener of settingsListeners) {
        try {
          listener()
        } catch {
          // One broken view must not stop the others.
        }
      }
    }

    /** Subscribe one component to the shared settings snapshot. */
    function useSettings() {
      const [snapshot, setSnapshot] = React.useState(settingsState)
      React.useEffect(() => {
        const listener = () => setSnapshot(settingsState)
        settingsListeners.add(listener)
        return () => {
          settingsListeners.delete(listener)
        }
      }, [])
      return snapshot
    }

    /** Read the Host settings once; failures keep the shipped defaults. */
    async function fetchSettings() {
      try {
        const response = await fetch(SETTINGS_ENDPOINT, { credentials: 'same-origin' })
        if (!response.ok) return null
        const payload = await response.json()
        if (payload !== null && typeof payload === 'object' && payload.settings !== undefined) {
          publishSettings(payload.settings)
          return payload.settings
        }
      } catch {
        // Offline or a Host without the route: defaults are good enough.
      }
      return null
    }

    /** Persist one settings patch and publish the saved document. */
    async function pushSettings(patch) {
      const response = await fetch(SETTINGS_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ settings: patch }),
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const payload = await response.json()
      if (payload !== null && typeof payload === 'object' && payload.settings !== undefined) {
        publishSettings(payload.settings)
        return payload.settings
      }
      throw new Error('malformed response')
    }

    const CSS = `
.apo-trigger{display:inline-flex;align-items:center;gap:5px;height:28px;max-width:100%;padding:0 9px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}
.apo-trigger:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.apo-trigger[aria-expanded="true"]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent);color:var(--dsw-alias-brand-primary)}
.apo-trigger:disabled{opacity:.45;cursor:default}
.apo-trigger:focus-visible,.apo-icon:focus-visible,.apo-chip:focus-visible,.apo-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.apo-trigger svg{display:block;flex:none}

.apo-dock{box-sizing:border-box;width:100%;display:flex;justify-content:center;padding:0 6px 6px}
/* Floating drawer: out of the composer's flex row, anchored bottom-right. */
.apo-drawer{position:fixed;right:calc(env(safe-area-inset-right,0px) + var(--apo-drawer-right,20px));bottom:calc(env(safe-area-inset-bottom,0px) + var(--apo-drawer-bottom,160px));z-index:80;isolation:isolate;display:flex;justify-content:flex-end;width:min(var(--apo-drawer-width,560px),calc(100vw - 32px));pointer-events:none}
.apo-drawer .apo-panel{pointer-events:auto;max-width:100%;border-radius:16px;box-shadow:0 28px 64px -28px rgba(0,0,0,.6),0 2px 8px rgba(0,0,0,.16)}
/* Keep the drawer inside the visible area: the panel caps its own height and the
   body scrolls, so a short viewport (phone keyboard, small window) never pushes
   the window above the top edge. */
.apo-drawer .apo-panel{max-height:var(--apo-drawer-max,min(560px,calc(100dvh - 24px)))}
.apo-drawer .apo-body{flex:1 1 auto;min-height:0;overflow:auto}
.apo-drawer .apo-head,.apo-drawer .apo-modes,.apo-drawer .apo-foot{flex:none}
.apo-drawer .apo-output{max-height:none}
@media (max-height:560px){.apo-drawer .apo-modes{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.apo-drawer .apo-chip{flex:none}}
/* The drawer floats over chat content, so nothing may show through it. */
.apo-drawer .apo-foot{background:var(--dsw-alias-bg-overlay)}
.apo-drawer .apo-panel{backdrop-filter:blur(2px)}
@media (max-width:520px){.apo-drawer{right:12px;left:12px;width:auto}}
.apo-panel{position:relative;box-sizing:border-box;width:100%;max-width:680px;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 14px 34px -14px rgba(0,0,0,.34),0 1px 2px rgba(0,0,0,.10);animation:apo-in .16s ease-out}
@keyframes apo-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.apo-panel{animation:none}}

.apo-progress{position:absolute;top:0;left:0;right:0;height:2px;overflow:hidden;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);z-index:1}
.apo-progress:after{content:"";position:absolute;top:0;bottom:0;width:38%;background:linear-gradient(90deg,transparent,var(--dsw-alias-brand-primary),transparent);animation:apo-progress 1.15s ease-in-out infinite}
@keyframes apo-progress{from{transform:translateX(-70%)}to{transform:translateX(330%)}}

.apo-head{display:flex;align-items:flex-start;gap:10px;padding:14px 14px 10px}
.apo-badge{flex:none;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin-top:1px;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary)}
.apo-headtext{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}
.apo-title{font-size:13.5px;font-weight:600;line-height:19px;letter-spacing:.01em}
.apo-subtitle{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;opacity:.9}
.apo-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s ease,color .12s ease}
.apo-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}

.apo-modes{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px}
.apo-chip{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}
.apo-chip:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.apo-chip[aria-pressed="true"]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary);font-weight:500}

.apo-body{display:flex;flex-direction:column;gap:9px;padding:12px 14px 14px}
.apo-result{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.apo-result-head{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 38%,transparent)}
.apo-result-label{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.apo-result-count{margin-left:auto;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);opacity:.75;font-variant-numeric:tabular-nums}
.apo-copy{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;cursor:pointer;transition:background .12s ease,color .12s ease}
.apo-copy:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.apo-copy:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.apo-copy svg{display:block;flex:none}

.apo-output{margin:0;box-sizing:border-box;min-height:96px;max-height:280px;overflow:auto;padding:11px 12px;border:0;background:transparent;font-family:inherit;font-size:13px;line-height:1.68;white-space:pre-wrap;word-break:break-word;scrollbar-width:thin}
.apo-output[aria-busy="true"]{border:0}
.apo-caret{display:inline-block;width:2px;height:.95em;margin-left:2px;vertical-align:-2px;background:currentColor;opacity:.6;animation:apo-blink 1s steps(2,start) infinite}
@keyframes apo-blink{50%{opacity:0}}

.apo-skeleton{display:flex;flex-direction:column;gap:9px;min-height:96px;box-sizing:border-box;padding:13px 12px}
.apo-skel-line{height:9px;border-radius:999px;background:linear-gradient(90deg,var(--dsw-alias-bg-layer-2) 20%,var(--dsw-alias-bg-layer-1) 40%,var(--dsw-alias-bg-layer-2) 60%);background-size:400% 100%;animation:apo-shimmer 1.5s ease-in-out infinite}
.apo-skel-line:nth-child(2){width:88%}
.apo-skel-line:nth-child(3){width:64%}
@keyframes apo-shimmer{0%{background-position:100% 0}100%{background-position:0 0}}

.apo-running{display:inline-flex;align-items:center;gap:7px;margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.apo-spinner{flex:none;width:11px;height:11px;border-radius:999px;border:1.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent);border-top-color:var(--dsw-alias-brand-primary);animation:apo-spin .8s linear infinite}
@keyframes apo-spin{to{transform:rotate(360deg)}}
.apo-error{margin:0;padding:8px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 32%,transparent);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent);font-size:12px;line-height:17px;color:var(--dsw-alias-state-error-primary)}
.apo-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.8}
.apo-notice{margin:0;padding:7px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 30%,transparent);border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 10%,transparent);font-size:11.5px;line-height:17px;color:var(--dsw-alias-state-warn-primary,#d97706)}

.apo-foot{display:flex;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 55%,transparent)}
.apo-meta{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;line-height:18px;color:var(--dsw-alias-label-secondary);opacity:.9}
.apo-dotsep{margin:0 5px;opacity:.45}
.apo-actions{display:flex;flex:none;gap:6px}
.apo-btn{height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.apo-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.apo-btn:disabled{opacity:.5;cursor:default}
.apo-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff;font-weight:500}
.apo-btn-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 88%,#000)}
@media (max-width:520px){.apo-panel{border-radius:12px}.apo-subtitle{display:none}}
.apo-set{display:flex;flex-direction:column;gap:2px;font-size:13px}
.apo-set-summary{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.apo-set-row{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:13px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.apo-set-row:first-child{padding-top:2px}
.apo-set-text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.apo-set-label{font-size:13px;font-weight:500;line-height:18px;color:var(--dsw-alias-label-primary);cursor:pointer}
.apo-set-desc{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.apo-set-control{flex:none;display:flex;align-items:center}
.apo-set-switch{width:36px;height:20px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.apo-set-seg{display:inline-flex;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);gap:2px}
.apo-set-seg-btn{height:26px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;transition:background .12s ease,color .12s ease}
.apo-set-seg-btn:hover{color:var(--dsw-alias-label-primary)}
.apo-set-seg-btn[aria-pressed="true"]{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.14)}
.apo-set-select,.apo-set-number{height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.apo-set-number{width:110px;text-align:right}
.apo-set-select{min-width:132px}
.apo-set-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:14px}
.apo-set-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.apo-set-actions{display:flex;flex:none;gap:8px}
.apo-upd{display:flex;flex-direction:column;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l1)}
.apo-upd-title{margin:0;font-size:13px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary)}
.apo-upd-desc{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.apo-upd-rows{display:flex;flex-direction:column;gap:4px}
.apo-upd-row{display:flex;align-items:center;gap:10px;font-size:12px;line-height:18px}
.apo-upd-key{flex:none;width:72px;color:var(--dsw-alias-label-secondary)}
.apo-upd-val{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}
.apo-upd-badge{margin-left:6px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 18%,transparent);color:var(--dsw-alias-state-warn-primary,#d97706);font-size:11px}
.apo-upd-status{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}
.apo-upd-actions{display:flex;flex-wrap:wrap;gap:8px}
@media (prefers-reduced-motion:reduce){.apo-spinner,.apo-skel-line,.apo-caret{animation:none}}
`

    /** Sparkle mark reused by the composer control and the panel header. */
    function SparkleIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: 'false' },
        h('path', {
          fill: 'currentColor',
          d: 'M6.6 1.4 7.7 4.5 10.8 5.6 7.7 6.7 6.6 9.8 5.5 6.7 2.4 5.6 5.5 4.5z',
        }),
        h('path', {
          fill: 'currentColor',
          opacity: 0.7,
          d: 'm11.6 9.1 .7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z',
        }),
      )
    }

    /** Two overlapping sheets: the copy affordance inside the result header. */
    function CopyIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 11, height: 11, 'aria-hidden': true, focusable: 'false' },
        h('rect', { x: 5.5, y: 1.5, width: 9, height: 9, rx: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', d: 'M10.5 10.5v2a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h2' }),
      )
    }

    /** Plain close glyph; the host primitives are not importable from a plugin. */
    function CloseIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, focusable: 'false' },
        h('path', {
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          d: 'M4 4l8 8M12 4l-8 8',
        }),
      )
    }

    /**
     * Per-Session optimizer state shared by the composer control and the panel.
     *
     * The two live in different slots, so the state must survive the panel
     * unmounting when it is closed; it also carries the abort controller of the
     * one in-flight rewrite.
     */
    function createOptimizer(sessionId) {
      let state = {
        open: false,
        mode: 'general',
        status: 'idle',
        output: '',
        error: null,
        source: '',
        sourceLength: 0,
        truncated: false,
        runId: 0,
      }
      const listeners = new Set()
      let abort = null
      // `conversation.composer.dock` renders with empty props, so the composer
      // actions are captured from whichever registration does receive them.
      let inputActions = null

      const get = () => state
      const subscribe = (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }
      const publish = (patch) => {
        state = Object.assign({}, state, patch)
        for (const listener of listeners) {
          try {
            listener()
          } catch {
            // One broken view must not stop the others.
          }
        }
      }
      const cancel = () => {
        const current = abort
        abort = null
        if (current !== null) current.abort()
      }

      const finish = (truncated) => {
        const text = state.output.trim()
        publish(text.length > 0
          ? { status: 'done', truncated: truncated === true }
          : { status: 'error', error: { code: 'empty', detail: '' } })
      }

      /** Consume the NDJSON stream, ignoring events from a superseded run. */
      async function stream(prompt, mode, controller, runId) {
        const current = () => state.runId === runId
        try {
          const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ prompt, mode, sessionId }),
            signal: controller.signal,
          })
          if (!response.ok) {
            let code = 'http'
            let detail = `HTTP ${response.status}`
            try {
              const payload = await response.json()
              const error = payload !== null && typeof payload === 'object' ? payload.error : undefined
              if (error !== undefined && error !== null) {
                if (typeof error.code === 'string') code = error.code
                if (typeof error.message === 'string') detail = error.message
              }
            } catch {
              // A non-JSON failure body keeps the status-only detail.
            }
            if (current()) publish({ status: 'error', error: { code, detail } })
            return
          }
          if (response.body === null) {
            if (current()) publish({ status: 'error', error: { code: 'network', detail: 'empty response body' } })
            return
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          let settled = false

          while (!settled) {
            const step = await reader.read()
            if (step.done) break
            buffer += decoder.decode(step.value, { stream: true })
            let boundary = buffer.indexOf('\n')
            while (boundary >= 0) {
              const line = buffer.slice(0, boundary).trim()
              buffer = buffer.slice(boundary + 1)
              boundary = buffer.indexOf('\n')
              if (line.length === 0) continue
              let event
              try {
                event = JSON.parse(line)
              } catch {
                continue
              }
              if (!current()) {
                settled = true
                break
              }
              if (event.type === 'delta' && typeof event.text === 'string' && event.text.length > 0) {
                publish({ output: state.output + event.text })
              } else if (event.type === 'error') {
                settled = true
                publish({
                  status: 'error',
                  error: {
                    code: typeof event.code === 'string' ? event.code : 'model-error',
                    detail: typeof event.message === 'string' ? event.message : '',
                  },
                })
              } else if (event.type === 'done') {
                settled = true
                finish(event.truncated === true)
              }
            }
          }
          if (!settled && current()) finish()
        } catch (error) {
          if (controller.signal.aborted) return
          if (current()) {
            publish({
              status: 'error',
              error: { code: 'network', detail: error instanceof Error ? error.message : '' },
            })
          }
        } finally {
          if (abort === controller) abort = null
        }
      }

      const start = (prompt, mode) => {
        const text = typeof prompt === 'string' ? prompt : ''
        if (text.trim().length === 0) return false
        if (text.length > settingsState.maxChars) {
          publish({
            open: true,
            status: 'error',
            output: '',
            error: { code: 'prompt-too-long', detail: '' },
            source: text,
            sourceLength: text.length,
          })
          return false
        }
        cancel()
        const controller = new AbortController()
        abort = controller
        const runId = state.runId + 1
        const nextMode = MODE_KEYS.includes(mode) ? mode : state.mode
        publish({
          open: true,
          mode: nextMode,
          status: 'running',
          output: '',
          error: null,
          truncated: false,
          source: text,
          sourceLength: text.length,
          runId,
        })
        void stream(text, nextMode, controller, runId)
        return true
      }

      return {
        get,
        subscribe,
        start,
        setMode(mode) {
          if (!MODE_KEYS.includes(mode)) return
          if (state.source.trim().length > 0) {
            start(state.source, mode)
            return
          }
          publish({ mode })
        },
        cancel() {
          cancel()
          publish(state.output.trim().length > 0 ? { status: 'done' } : { status: 'idle' })
        },
        close() {
          cancel()
          publish({ open: false, status: 'idle', error: null })
        },
        setInputActions(actions) {
          if (actions !== undefined && actions !== null && typeof actions.setDraft === 'function') inputActions = actions
        },
        applyTo(actions) {
          const text = state.output
          const target = actions !== undefined && actions !== null ? actions : inputActions
          if (text.trim().length === 0 || target === null || target === undefined) return
          try {
            target.setDraft(text)
          } catch {
            return
          }
          publish({ open: false, status: 'idle', error: null })
        },
      }
    }

    const controllers = new Map()

    /** Reuse one controller per Session so both slot entries see the same run. */
    function controllerFor(sessionId) {
      let controller = controllers.get(sessionId)
      if (controller === undefined) {
        controller = createOptimizer(sessionId)
        controllers.set(sessionId, controller)
      }
      return controller
    }

    /** Subscribe one component to its controller snapshot. */
    function useOptimizer(optimizer) {
      const [snapshot, setSnapshot] = React.useState(optimizer.get())
      React.useEffect(() => optimizer.subscribe(() => setSnapshot(optimizer.get())), [optimizer])
      return snapshot
    }

    /** Localized failure text for one controller error record. */
    function errorText(t, error) {
      const keys = {
        'prompt-too-long': 'error.tooLong',
        'empty-prompt': 'error.emptyDraft',
        'no-model': 'error.noModel',
        'model-error': 'error.model',
        'max-tokens': 'error.truncated',
        'payload-too-large': 'error.tooLong',
        network: 'error.network',
        empty: 'error.empty',
      }
      const key = keys[error.code] !== undefined ? keys[error.code] : 'error.generic'
      const base = t(key)
      return error.detail.length > 0 && key !== 'error.noModel' ? `${base} (${error.detail})` : base
    }

    /**
     * Composer-toolbar control: starts a rewrite of the current draft and
     * toggles the panel that shows it.
     */
    function OptimizerTrigger({ optimizer, useInput, t }) {
      const draft = useInput((snapshot) => snapshot.draft)
      const state = useOptimizer(optimizer)
      const settings = useSettings()
      if (!settings.enabled) return null
      const draftText = typeof draft === 'string' ? draft : ''
      const disabled = draftText.trim().length === 0
      return h(
        'button',
        {
          type: 'button',
          className: 'apo-trigger',
          disabled,
          'aria-expanded': state.open,
          'aria-label': t('trigger.title'),
          'data-prompt-optimizer-trigger': true,
          title: disabled ? t('trigger.disabled') : t('trigger.title'),
          onClick: () => {
            if (state.open) optimizer.close()
            else optimizer.start(draftText, state.source.length > 0 ? state.mode : settings.defaultMode)
          },
        },
        h(SparkleIcon),
        h('span', null, t('trigger.label')),
      )
    }

    /**
     * Panel docked above the composer. It shows the streaming rewrite, lets the
     * user switch direction, and can copy the result or put it back into the
     * composer.
     */
    function OptimizerPanel({ optimizer, inputActions, t, position }) {
      const state = useOptimizer(optimizer)
      const settings = useSettings()
      const [copied, setCopied] = React.useState(false)

      // Only the slot above the composer card receives `inputActions`; keep it
      // so the below-composer copy can still write back into the draft.
      React.useEffect(() => {
        optimizer.setInputActions(inputActions)
      }, [optimizer, inputActions])
      const panelRef = React.useRef(null)
      // The floating container owns the anchor variables; the panel is its child,
      // so variables written on the panel would never reach the drawer's CSS.
      const drawerRef = React.useRef(null)

      React.useEffect(() => {
        if (!state.open) return undefined
        const node = panelRef.current
        if (node !== null) {
          try {
            node.focus({ preventScroll: true })
          } catch {
            // Focus is a nicety; the panel works without it.
          }
        }
        return undefined
      }, [state.open])

      React.useEffect(() => {
        if (!copied) return undefined
        const timer = setTimeout(() => setCopied(false), 1600)
        return () => clearTimeout(timer)
      }, [copied])

      // Anchor the drawer to the real composer: measure its dock so the panel
      // sits just above the input card, right-aligned, and never covers it.
      React.useEffect(() => {
        if (!state.open || position !== 'below') return undefined
        // The dock is the empty row at the bottom of the composer card; its
        // parent is the card itself, whose top edge is what the panel must clear.
        const cardOf = (node) => {
          const dock = node?.closest('[data-composer-dock]')
          if (!(dock instanceof Element)) return null
          const parent = dock.parentElement
          return parent instanceof Element ? parent : dock
        }
        const apply = () => {
          const node = drawerRef.current
          if (node === null) return
          const card = cardOf(panelRef.current ?? node)
          const rect = card === null ? null : card.getBoundingClientRect()
          // Measure against the visual viewport: on a phone the layout viewport
          // still spans the keyboard, so innerHeight alone would float the drawer
          // into the covered strip.
          const view = window.visualViewport
          const viewHeight = view === null || view === undefined ? window.innerHeight : view.height
          const viewTop = view === null || view === undefined ? 0 : view.offsetTop
          const cardTop = rect === null ? viewHeight - 152 : rect.top
          const right = rect === null ? 20 : Math.max(12, window.innerWidth - rect.right)
          // Cap the panel to the space above the composer card, so it always fits
          // instead of hanging off the top edge of a short viewport.
          const space = Math.round(cardTop - viewTop - 8)
          // Prefer the room above the card; fall back to overlapping the composer
          // (the top clamp below keeps it on screen) when that room is tiny.
          const maxHeight = Math.min(Math.round(viewHeight - 16), Math.max(200, space))
          node.style.setProperty('--apo-drawer-max', `${maxHeight}px`)
          if (rect !== null) node.style.setProperty('--apo-drawer-width', `${Math.round(Math.min(rect.width, 680))}px`)
          node.style.setProperty('--apo-drawer-right', `${Math.round(right)}px`)
          // Two passes: the capped height is known only after the max-height lands.
          // Keep the panel's top edge inside the viewport; on a viewport too short
          // for the composer it overlaps the composer instead of leaving the screen.
          const height = node.getBoundingClientRect().height
          const wanted = rect === null ? viewHeight - 160 : cardTop - 8 - height
          const top = Math.max(8, Math.min(wanted, viewHeight - 8 - height))
          const bottom = Math.round(viewHeight - top - height)
          node.style.setProperty('--apo-drawer-bottom', `${Math.max(8, bottom)}px`)
          // A transformed or will-change ancestor makes this drawer's fixed
          // containing block that ancestor rather than the viewport, so the
          // viewport-relative bottom above can land a little off. Measure the
          // result and correct: top = constant - bottom.
          const placed = node.getBoundingClientRect()
          const drift = Math.round(placed.top - top)
          if (Math.abs(drift) > 1) {
            node.style.setProperty('--apo-drawer-bottom', `${Math.max(8, Math.round(viewHeight - top - height + drift))}px`)
          }
        }
        apply()
        window.addEventListener('resize', apply)
        const view = window.visualViewport
        view?.addEventListener('resize', apply)
        view?.addEventListener('scroll', apply)
        let observer = null
        const card = cardOf(panelRef.current)
        if (card !== null && typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(apply)
          observer.observe(card)
        }
        return () => {
          window.removeEventListener('resize', apply)
          view?.removeEventListener('resize', apply)
          view?.removeEventListener('scroll', apply)
          observer?.disconnect()
        }
      }, [state.open, position, state.output.length])

      // The drawer floats above the page and blocks nothing, so a pointer press
      // elsewhere dismisses it. The composer trigger is exempt: it owns the
      // toggle, and closing here first would make the same click reopen the panel.
      React.useEffect(() => {
        if (!state.open || position !== 'below') return undefined
        const onPointerDown = (event) => {
          const node = panelRef.current
          if (node === null) return
          const target = event.target
          if (target instanceof Element && target.closest('[data-prompt-optimizer-trigger]') !== null) return
          if (!node.contains(target)) optimizer.close()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        return () => document.removeEventListener('pointerdown', onPointerDown, true)
      }, [state.open, position, optimizer])

      if (!state.open) return null
      // Two registrations share this component; only the active anchor renders.
      if (settings.position !== position) return null

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(state.output)
          setCopied(true)
        } catch {
          setCopied(false)
        }
      }

      const modeKeys = MODE_KEYS.map((mode) =>
        h(
          'button',
          {
            key: mode,
            type: 'button',
            className: 'apo-chip',
            'aria-pressed': state.mode === mode,
            onClick: () => optimizer.setMode(mode),
          },
          t(`mode.${mode}`),
        ),
      )

      const outputChars = state.output.trim().length
      const actions = []
      if (state.status === 'running') {
        actions.push(h('button', {
          key: 'cancel',
          type: 'button',
          className: 'apo-btn',
          onClick: () => optimizer.cancel(),
        }, t('action.cancel')))
      } else {
        actions.push(h('button', {
          key: 'again',
          type: 'button',
          className: 'apo-btn',
          onClick: () => optimizer.start(state.source, state.mode),
        }, state.error === null ? t('action.run') : t('action.retry')))
        if (outputChars > 0) {
          actions.push(h('button', {
            key: 'apply',
            type: 'button',
            className: 'apo-btn apo-btn-primary',
            onClick: () => optimizer.applyTo(inputActions),
          }, t('action.apply')))
        }
      }

      const resultHead = h(
        'div',
        { className: 'apo-result-head' },
        h('span', { className: 'apo-result-label' }, t('result.label')),
        outputChars > 0
          ? h('span', { className: 'apo-result-count' }, t('result.count', { n: outputChars }))
          : null,
        outputChars > 0
          ? h(
              'button',
              {
                type: 'button',
                className: 'apo-copy',
                title: t('action.copy'),
                'aria-label': t('action.copy'),
                onClick: copy,
              },
              h(CopyIcon),
              h('span', null, copied ? t('action.copied') : t('action.copy')),
            )
          : null,
      )

      const resultBody = state.output.length > 0
        ? h(
            'pre',
            { className: 'apo-output', 'aria-live': 'polite', 'aria-busy': state.status === 'running' },
            state.output,
            state.status === 'running' ? h('span', { className: 'apo-caret', 'aria-hidden': true }) : null,
          )
        : h(
            'div',
            { className: 'apo-skeleton', 'aria-hidden': true },
            h('span', { className: 'apo-skel-line' }),
            h('span', { className: 'apo-skel-line' }),
            h('span', { className: 'apo-skel-line' }),
          )

      return h(
        'div',
        {
          className: position === 'below' ? 'apo-drawer' : 'apo-dock',
          'data-prompt-optimizer': position,
          ref: drawerRef,
        },
        h(
          'div',
          {
            className: 'apo-panel',
            role: 'dialog',
            'aria-label': t('panel.title'),
            tabIndex: -1,
            ref: panelRef,
            onKeyDown: (event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                optimizer.close()
              }
            },
          },
          state.status === 'running' ? h('div', { className: 'apo-progress', 'aria-hidden': true }) : null,
          h(
            'div',
            { className: 'apo-head' },
            h('span', { className: 'apo-badge' }, h(SparkleIcon)),
            h(
              'div',
              { className: 'apo-headtext' },
              h('span', { className: 'apo-title' }, t('panel.title')),
              h('span', { className: 'apo-subtitle' }, t(`mode.${state.mode}.desc`)),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'apo-icon',
                'aria-label': t('panel.close'),
                title: t('panel.close'),
                onClick: () => optimizer.close(),
              },
              h(CloseIcon),
            ),
          ),
          settings.showModes
            ? h('div', { className: 'apo-modes', role: 'group', 'aria-label': t('mode.label') }, modeKeys)
            : null,
          h(
            'div',
            { className: 'apo-body' },
            state.status === 'running'
              ? h(
                  'p',
                  { className: 'apo-running', 'aria-live': 'polite' },
                  h('span', { className: 'apo-spinner', 'aria-hidden': true }),
                  t('status.running'),
                )
              : null,
            state.output.length > 0 || state.status === 'running'
              ? h('div', { className: 'apo-result' }, resultHead, resultBody)
              : null,
            state.truncated === true && state.status === 'done'
              ? h('p', { className: 'apo-notice' }, t('status.truncated'))
              : null,
            state.error !== null
              ? h('p', { className: 'apo-error', role: 'alert' }, errorText(t, state.error))
              : null,
            state.status === 'idle' ? h('p', { className: 'apo-hint' }, t('status.idle')) : null,
          ),
          h(
            'div',
            { className: 'apo-foot' },
            h(
              'span',
              { className: 'apo-meta' },
              t('note.source', { n: state.sourceLength }),
              h('span', { className: 'apo-dotsep', 'aria-hidden': true }, '·'),
              t(`mode.${state.mode}`),
            ),
            h('div', { className: 'apo-actions' }, actions),
          ),
        ),
      )
    }

    /** One label + control row used by the settings page. */
    function SettingRow({ id, label, description, control }) {
      return h(
        'div',
        { className: 'apo-set-row' },
        h(
          'div',
          { className: 'apo-set-text' },
          h('label', { className: 'apo-set-label', htmlFor: id }, label),
          description ? h('span', { className: 'apo-set-desc' }, description) : null,
        ),
        h('div', { className: 'apo-set-control' }, control),
      )
    }

    /**
     * Plugin detail page: the switches the composer halves read.
     *
     * Rendered by the plugin manager inside the bundle page (`view: 'page'`) or
     * as its one-line summary on the card (`view: 'summary'`).
     */
    function OptimizerSettings({ view, t }) {
      const settings = useSettings()
      const [draft, setDraft] = React.useState(settings)
      const [status, setStatus] = React.useState('idle')
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        setDraft(settings)
      }, [settings])

      if (view === 'summary') {
        return h('p', { className: 'apo-set-summary' }, t('settings.summary'))
      }

      const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
      const patch = (next) => {
        setDraft((current) => ({ ...current, ...next }))
        setStatus('idle')
      }

      const save = async () => {
        setStatus('saving')
        setError('')
        try {
          await pushSettings(draft)
          setStatus('saved')
        } catch (failure) {
          setStatus('error')
          setError(failure instanceof Error ? failure.message : '')
        }
      }

      const restore = () => {
        setDraft(DEFAULT_SETTINGS)
        setStatus('idle')
        setError('')
      }

      const statusText = status === 'saving'
        ? t('settings.saving')
        : status === 'saved'
          ? t('settings.saved')
          : status === 'error'
            ? t('settings.failed')
            : dirty
              ? t('settings.dirty')
              : t('settings.synced')

      return h(
        'section',
        { className: 'apo-set', 'aria-label': t('settings.title') },
        h(
          SettingRow,
          {
            id: 'apo-set-enabled',
            label: t('settings.enabled'),
            description: t('settings.enabled.desc'),
            control: h('input', {
              id: 'apo-set-enabled',
              className: 'apo-set-switch',
              type: 'checkbox',
              checked: draft.enabled,
              onChange: (event) => patch({ enabled: event.target.checked }),
            }),
          },
        ),
        h(
          SettingRow,
          {
            id: 'apo-set-position',
            label: t('settings.position'),
            description: t('settings.position.desc'),
            control: h(
              'div',
              { className: 'apo-set-seg', role: 'group', 'aria-label': t('settings.position') },
              h(
                'button',
                {
                  type: 'button',
                  className: 'apo-set-seg-btn',
                  'aria-pressed': draft.position === 'below',
                  onClick: () => patch({ position: 'below' }),
                },
                t('settings.position.below'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'apo-set-seg-btn',
                  'aria-pressed': draft.position === 'above',
                  onClick: () => patch({ position: 'above' }),
                },
                t('settings.position.above'),
              ),
            ),
          },
        ),
        h(
          SettingRow,
          {
            id: 'apo-set-mode',
            label: t('settings.defaultMode'),
            description: t('settings.defaultMode.desc'),
            control: h(
              'select',
              {
                id: 'apo-set-mode',
                className: 'apo-set-select',
                value: draft.defaultMode,
                onChange: (event) => patch({ defaultMode: event.target.value }),
              },
              MODE_KEYS.map((mode) => h('option', { key: mode, value: mode }, t(`mode.${mode}`))),
            ),
          },
        ),
        h(
          SettingRow,
          {
            id: 'apo-set-max',
            label: t('settings.maxChars'),
            description: t('settings.maxChars.desc'),
            control: h('input', {
              id: 'apo-set-max',
              className: 'apo-set-number',
              type: 'number',
              min: 200,
              max: 8000,
              step: 100,
              value: draft.maxChars,
              onChange: (event) => patch({ maxChars: Number(event.target.value) || 8000 }),
            }),
          },
        ),
        h(
          SettingRow,
          {
            id: 'apo-set-stream',
            label: t('settings.stream'),
            description: t('settings.stream.desc'),
            control: h('input', {
              id: 'apo-set-stream',
              className: 'apo-set-switch',
              type: 'checkbox',
              checked: draft.stream,
              onChange: (event) => patch({ stream: event.target.checked }),
            }),
          },
        ),
        h(
          SettingRow,
          {
            id: 'apo-set-modes',
            label: t('settings.showModes'),
            description: t('settings.showModes.desc'),
            control: h('input', {
              id: 'apo-set-modes',
              className: 'apo-set-switch',
              type: 'checkbox',
              checked: draft.showModes,
              onChange: (event) => patch({ showModes: event.target.checked }),
            }),
          },
        ),
        h(UpdateSection, { t }),
        h(
          'div',
          { className: 'apo-set-foot' },
          h(
            'span',
            { className: 'apo-set-status', role: 'status', 'aria-live': 'polite' },
            error === '' ? statusText : `${statusText} (${error})`,
          ),
          h(
            'div',
            { className: 'apo-set-actions' },
            h('button', { type: 'button', className: 'apo-btn', onClick: restore, disabled: status === 'saving' }, t('settings.restore')),
            h(
              'button',
              {
                type: 'button',
                className: 'apo-btn apo-btn-primary',
                onClick: save,
                disabled: status === 'saving' || !dirty,
              },
              status === 'saving' ? t('settings.saving') : t('settings.save'),
            ),
          ),
        ),
      )
    }

    /**
     * Online upgrade card: reads the git checkout the plugin was installed from,
     * compares it with the remote branch, and can pull the new commit.
     */
    function UpdateSection({ t }) {
      const [snapshot, setSnapshot] = React.useState({ phase: 'checking', data: null, error: '', restart: 'idle', force: false, note: '' })

      const patch = (next) => setSnapshot((current) => ({ ...current, ...next }))

      const check = React.useCallback(async () => {
        patch({ phase: 'checking', error: '', note: '' })
        try {
          const response = await fetch(UPDATE_ENDPOINT, { credentials: 'same-origin' })
          const payload = await response.json()
          if (!response.ok || payload === null || payload.ok !== true) {
            patch({ phase: 'error', data: payload, error: payload?.error?.code ?? 'http' })
            return
          }
          patch({ phase: 'ready', data: payload, error: '' })
        } catch (failure) {
          patch({ phase: 'error', data: null, error: 'network' })
        }
      }, [])

      React.useEffect(() => {
        void check()
      }, [check])

      const upgrade = async (force) => {
        patch({ phase: 'upgrading', error: '', note: '' })
        try {
          const response = await fetch(UPDATE_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ force: force === true }),
          })
          const payload = await response.json()
          if (payload === null || payload.ok !== true) {
            patch({ phase: 'error', data: payload, error: payload?.error?.code ?? 'http', force: payload?.error?.code === 'dirty' })
            return
          }
          patch({ phase: 'ready', data: payload, error: '', force: false, note: payload.upgraded ? '' : 'uptodate' })
        } catch (failure) {
          patch({ phase: 'error', data: null, error: 'network' })
        }
      }

      const restart = async () => {
        patch({ restart: 'sending' })
        try {
          const response = await fetch(RESTART_ENDPOINT, { method: 'POST', credentials: 'same-origin' })
          const payload = await response.json()
          if (payload !== null && payload.ok === true) {
            patch({ restart: 'scheduled' })
            return
          }
          patch({ restart: 'failed', note: payload?.command ?? '' })
        } catch {
          patch({ restart: 'failed' })
        }
      }

      const data = snapshot.data
      const state = data?.state
      const remote = data?.remote
      const current = state === undefined ? '' : `${state.short}`
      const branch = state?.branch ?? ''
      const dirty = state?.dirty === true
      const available = data?.available === true
      const busy = snapshot.phase === 'checking' || snapshot.phase === 'upgrading'

      const errorCode = snapshot.error
      const errorText = errorCode === ''
        ? ''
        : errorCode === 'dirty'
          ? t('update.error.dirty')
          : errorCode === 'network'
            ? t('update.error.network')
            : errorCode === 'git-missing'
              ? t('update.error.git')
              : errorCode === 'remote-unreachable'
                ? t('update.error.remote')
                : errorCode === 'no-remote' || errorCode === 'not-a-repo'
                  ? t('update.error.repo')
                  : t('update.error.generic')

      const status = snapshot.phase === 'checking'
        ? t('update.checking')
        : snapshot.phase === 'upgrading'
          ? t('update.upgrading')
          : errorText !== ''
            ? errorText
            : snapshot.restart === 'scheduled'
              ? t('update.restartScheduled')
              : snapshot.restart === 'failed'
                ? t('update.restartFailed')
                : snapshot.note === 'uptodate'
                  ? t('update.uptodate')
                  : available
                    ? t('update.available', { commit: remote?.short ?? '' })
                    : data === null
                      ? t('update.unknown')
                      : t('update.current')

      const actions = [
        h('button', {
          key: 'check',
          type: 'button',
          className: 'apo-btn',
          disabled: busy,
          onClick: () => void check(),
        }, t('update.check')),
      ]
      if (available && errorText === '') {
        actions.push(h('button', {
          key: 'up',
          type: 'button',
          className: 'apo-btn apo-btn-primary',
          disabled: busy,
          onClick: () => void upgrade(false),
        }, t('update.upgrade')))
      }
      if (snapshot.force === true) {
        actions.push(h('button', {
          key: 'force',
          type: 'button',
          className: 'apo-btn',
          disabled: busy,
          onClick: () => void upgrade(true),
        }, t('update.force')))
      }
      if (data?.restartRequired === true || snapshot.restart === 'scheduled') {
        actions.push(h('button', {
          key: 'restart',
          type: 'button',
          className: 'apo-btn apo-btn-primary',
          disabled: snapshot.restart === 'sending' || snapshot.restart === 'scheduled',
          onClick: () => void restart(),
        }, snapshot.restart === 'scheduled' ? t('update.restarting') : t('update.restart')))
      }

      return h(
        'section',
        { className: 'apo-upd', 'aria-label': t('update.title') },
        h('h3', { className: 'apo-upd-title' }, t('update.title')),
        h('p', { className: 'apo-upd-desc' }, t('update.desc')),
        h(
          'div',
          { className: 'apo-upd-rows' },
          h('div', { className: 'apo-upd-row' },
            h('span', { className: 'apo-upd-key' }, t('update.currentLabel')),
            h('span', { className: 'apo-upd-val' },
              current === '' ? t('update.unknown') : `${t('update.version')} · ${current}${branch === '' || branch === 'HEAD' ? '' : ` · ${branch}`}`,
              dirty ? h('span', { className: 'apo-upd-badge' }, t('update.dirty')) : null)),
          h('div', { className: 'apo-upd-row' },
            h('span', { className: 'apo-upd-key' }, t('update.remote')),
            h('span', { className: 'apo-upd-val' }, remote === undefined ? '—' : remote.short)),
        ),
        h('p', { className: 'apo-upd-status', role: 'status', 'aria-live': 'polite' }, status),
        h('div', { className: 'apo-upd-actions' }, actions),
      )
    }

    const en = {
      'trigger.label': 'Optimize',
      'trigger.title': 'Optimize this prompt with AI',
      'trigger.disabled': 'Write a prompt in the composer first',
      'panel.title': 'AI prompt optimizer',
      'panel.subtitle': 'Rewrite the draft into a clearer, more complete prompt',
      'panel.close': 'Close',
      'mode.label': 'Direction',
      'mode.general': 'General',
      'mode.general.desc': 'Clarify intent and make the expected output explicit, staying close to the original length.',
      'mode.structure': 'Structured',
      'mode.structure.desc': 'Organize the prompt into labeled sections and bullets.',
      'mode.concise': 'Concise',
      'mode.concise.desc': 'Cut filler and repetition while keeping every instruction and constraint.',
      'mode.detail': 'More detail',
      'mode.detail.desc': 'Add the implied context, constraints, and quality bar.',
      'mode.technical': 'Engineering',
      'mode.technical.desc': 'Frame it as an engineering brief with stack, files, and acceptance criteria.',
      'mode.frontend': 'Front-end UI',
      'mode.frontend.desc': 'Frame it as a UI task: hierarchy, component states, responsiveness, accessibility.',
      'mode.backend': 'Back-end',
      'mode.backend.desc': 'Frame it as a back-end design: contracts, data model, auth, concurrency, observability.',
      'mode.review': 'Code review',
      'mode.review.desc': 'Frame it as a code review: scope, focus, severity, and output shape.',
      'mode.dsh': 'DSH plugin',
      'mode.dsh.desc': 'Frame it as a DSH plugin task: package, entry points, services, slots, verification.',
      'result.label': 'Result',
      'result.count': '{n} chars',
      'status.running': 'Optimizing…',
      'status.idle': 'Nothing to optimize yet.',
      'status.truncated': 'The reply hit the output limit and may be incomplete. Try the Concise direction or a shorter draft.',
      'note.source': 'From a {n}-character draft',
      'action.cancel': 'Cancel',
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'action.apply': 'Use in composer',
      'action.run': 'Optimize again',
      'action.retry': 'Retry',
      'error.generic': 'Optimization failed.',
      'error.http': 'The optimizer rejected the request.',
      'error.noModel': 'No model is configured for this profile.',
      'error.model': 'The model call failed.',
      'error.network': 'Could not reach the optimizer service.',
      'error.empty': 'The model returned no text.',
      'error.truncated': 'The model hit the output limit before producing text.',
      'error.tooLong': 'The draft is longer than 8000 characters.',
      'error.emptyDraft': 'The composer is empty.',
      'settings.title': 'Prompt optimizer settings',
      'settings.summary': 'Composer trigger, panel anchor, and default direction.',
      'settings.enabled': 'Show the Optimize button',
      'settings.enabled.desc': 'When off, the composer trigger is hidden.',
      'settings.position': 'Panel anchor',
      'settings.position.desc': 'The drawer floats at the bottom-right without taking composer space; above docks it over the conversation.',
      'settings.position.below': 'Floating drawer',
      'settings.position.above': 'Above the composer',
      'settings.defaultMode': 'Default direction',
      'settings.defaultMode.desc': 'Preselected when the panel opens; still switchable per run.',
      'settings.maxChars': 'Draft length limit',
      'settings.maxChars.desc': 'Longer drafts are rejected. Range 200-8000.',
      'settings.stream': 'Stream the result',
      'settings.stream.desc': 'On: text appears while it is generated. Off: one block at the end.',
      'settings.showModes': 'Show the direction picker',
      'settings.showModes.desc': 'Off keeps the panel to the default direction.',
      'settings.save': 'Save',
      'settings.saving': 'Saving...',
      'settings.saved': 'Saved',
      'settings.synced': 'Up to date',
      'settings.dirty': 'Unsaved changes',
      'settings.failed': 'Save failed',
      'settings.restore': 'Restore defaults',
      'update.title': 'Online upgrade',
      'update.desc': 'This plugin is installed as a git checkout and can pull new commits from upstream.',
      'update.currentLabel': 'Installed',
      'update.remote': 'Upstream',
      'update.version': 'v1.0.0',
      'update.checking': 'Checking upstream...',
      'update.upgrading': 'Fetching and applying...',
      'update.available': 'New commit {commit} is available.',
      'update.upToDate': 'Up to date.',
      'update.unknown': 'Not checked yet',
      'update.dirty': 'local changes',
      'update.check': 'Check for updates',
      'update.upgrade': 'Upgrade now',
      'update.force': 'Force upgrade (discards local changes)',
      'update.restart': 'Restart to apply',
      'update.restarting': 'Restarting...',
      'update.restartScheduled': 'Restart scheduled; the page disconnects in 3 seconds.',
      'update.restartFailed': 'Could not restart automatically. Run: sudo systemctl restart dsh-web.service',
      'update.uptodate': 'Already up to date.',
      'update.error.dirty': 'Tracked files have local changes; upgrading overwrites them. Force to continue.',
      'update.error.network': 'Network unavailable; the upstream repository could not be reached.',
      'update.error.git': 'git is not installed on this Host.',
      'update.error.remote': 'Upstream repository unreachable (private or deleted).',
      'update.error.repo': 'The install directory is not a git checkout.',
      'update.error.generic': 'Check or upgrade failed; see the service log.',
    }

    const zh = {
      'trigger.label': '优化',
      'trigger.title': '用 AI 优化这段提示词',
      'trigger.disabled': '请先在输入框写下提示词',
      'panel.title': 'AI 提示词优化',
      'panel.subtitle': '把草稿改写成更清晰、更完整的提示词',
      'panel.close': '关闭',
      'mode.label': '优化方向',
      'mode.general': '通用',
      'mode.general.desc': '澄清意图、补全输出要求，尽量贴近原长度。',
      'mode.structure': '结构化',
      'mode.structure.desc': '拆成带小标题和要点的结构，便于模型执行。',
      'mode.concise': '精简',
      'mode.concise.desc': '去掉冗余与空话，保留全部指令和约束。',
      'mode.detail': '补充细节',
      'mode.detail.desc': '补齐隐含的背景、约束和验收标准。',
      'mode.technical': '技术任务',
      'mode.technical.desc': '按工程任务书写：技术栈、涉及文件、验收条件。',
      'mode.frontend': '前端 UI',
      'mode.frontend.desc': '按界面任务书写：布局层级、组件状态、响应式与无障碍。',
      'mode.backend': '后端设计',
      'mode.backend.desc': '按后端设计书写：接口契约、数据模型、鉴权、并发与可观测性。',
      'mode.review': '代码审查',
      'mode.review.desc': '按代码审查书写：范围、关注点、严重级别与输出格式。',
      'mode.dsh': 'DSH 插件',
      'mode.dsh.desc': '按 DSH 插件书写：包名入口、注入服务、插槽与验证步骤。',
      'result.label': '优化结果',
      'result.count': '{n} 字',
      'status.running': '正在优化…',
      'status.idle': '还没有可以优化的内容。',
      'status.truncated': '已达到模型输出上限，结果可能不完整。可换「精简」方向或缩短草稿后重试。',
      'note.source': '基于 {n} 字草稿',
      'action.cancel': '取消',
      'action.copy': '复制',
      'action.copied': '已复制',
      'action.apply': '替换输入框',
      'action.run': '重新优化',
      'action.retry': '重试',
      'error.generic': '优化失败。',
      'error.http': '优化请求被拒绝。',
      'error.noModel': '当前配置中没有可用的模型。',
      'error.model': '模型调用失败。',
      'error.network': '无法连接优化服务。',
      'error.empty': '模型没有返回内容。',
      'error.truncated': '模型输出达到上限，未能产出内容。',
      'error.tooLong': '草稿超过 8000 字，请先精简。',
      'error.emptyDraft': '输入框为空。',
      'settings.title': '提示词优化设置',
      'settings.summary': '输入框旁的优化按钮、面板位置与默认优化方向。',
      'settings.enabled': '显示「优化」按钮',
      'settings.enabled.desc': '关闭后输入框旁不再出现按钮，右键菜单与快捷键均不受影响。',
      'settings.position': '面板位置',
      'settings.position.desc': '悬浮抽屉固定在窗口右下角、不挤占输入区；上方模式则铺在输入框上方。',
      'settings.position.below': '悬浮抽屉',
      'settings.position.above': '输入框上方',
      'settings.defaultMode': '默认优化方向',
      'settings.defaultMode.desc': '打开面板时预选的方向，仍可在面板里临时切换。',
      'settings.maxChars': '草稿长度上限',
      'settings.maxChars.desc': '超过该长度的草稿会被拒绝，范围 200–8000。',
      'settings.stream': '流式显示结果',
      'settings.stream.desc': '开启时边生成边显示；关闭后等模型写完再一次性出现。',
      'settings.showModes': '显示优化方向切换',
      'settings.showModes.desc': '关闭后面板只保留默认方向，界面更简洁。',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.synced': '已同步',
      'settings.dirty': '有未保存的修改',
      'settings.failed': '保存失败',
      'settings.restore': '恢复默认',
      'update.title': '在线升级',
      'update.desc': '本插件以 git 检出方式安装，可直接从上游仓库拉取新提交。',
      'update.currentLabel': '当前版本',
      'update.remote': '远端最新',
      'update.version': 'v1.0.0',
      'update.checking': '正在检查上游…',
      'update.upgrading': '正在拉取并应用更新…',
      'update.available': '发现新提交 {commit}，可以升级。',
      'update.upToDate': '已是最新版本。',
      'update.unknown': '尚未检查',
      'update.dirty': '本地有改动',
      'update.check': '检查更新',
      'update.upgrade': '立即升级',
      'update.force': '强制升级（覆盖本地修改）',
      'update.restart': '重启服务生效',
      'update.restarting': '正在重启…',
      'update.restartScheduled': '已排定重启，页面将在 3 秒后断开，稍后刷新即可。',
      'update.restartFailed': '无法自动重启，请执行：sudo systemctl restart dsh-web.service',
      'update.uptodate': '已经是最新，无需升级。',
      'update.error.dirty': '本地有未提交的改动，升级会覆盖它们。确认后可强制升级。',
      'update.error.network': '网络不可用，无法访问上游仓库。',
      'update.error.git': '当前 Host 没有安装 git。',
      'update.error.remote': '无法连接上游仓库（可能是私有或已删除）。',
      'update.error.repo': '安装目录不是有效的 git 检出，无法在线升级。',
      'update.error.generic': '检查或升级失败，请查看服务日志。',
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const tagId = '@local/ai-prompt-optimizer/client.css'
          const tag = document.createElement('style')
          tag.dataset.plugin = '@local/ai-prompt-optimizer'
          tag.dataset.pluginCss = tagId
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'ai-prompt-optimizer: styles')

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ai-prompt-optimizer: dictionaries')

        // `conversation.composer.dock` renders its entries with empty props, so
        // both registrations supply the translator themselves.
        const bound = ctx.locale.bind(NS)
        const withT = (props, position) => h(OptimizerPanel, {
          ...props,
          position,
          t: typeof props.t === 'function' ? props.t : bound,
        })

        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'prompt-optimizer-trigger',
              order: 5,
              locale: NS,
              inject: (sessionId) => ({ optimizer: controllerFor(sessionId) }),
            },
            OptimizerTrigger,
          ),
        )

        // One panel, two possible anchors: only the configured one renders.
        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'prompt-optimizer-above',
              order: 5,
              locale: NS,
              inject: (sessionId) => ({ optimizer: controllerFor(sessionId) }),
            },
            (props) => withT(props, 'above'),
          ),
        )

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'prompt-optimizer-below',
              order: 5,
              locale: NS,
              inject: (sessionId) => ({ optimizer: controllerFor(sessionId) }),
            },
            (props) => withT(props, 'below'),
          ),
        )

        // Plugin detail page: the bundle-level settings form.
        ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register(
            {
              name: 'plugins.bundle.config',
              key: PACKAGE,
              locale: NS,
            },
            (props) => h(OptimizerSettings, { view: props.view, t: typeof props.t === 'function' ? props.t : ctx.locale.bind(NS) }),
          ),
        )

        // Read the saved switches once; the page can be opened before settings load.
        void fetchSettings()
      },
    }
  },
})

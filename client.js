window.__ModuleLoader__.load({
  id: '@local/ai-prompt-optimizer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'aiPromptOptimizer'
    const ENDPOINT = '/prompt-optimizer/optimize'
    const MAX_PROMPT_CHARS = 8000
    const MODE_KEYS = ['general', 'structure', 'concise', 'detail', 'technical']

    const CSS = `
.apo-trigger{display:inline-flex;align-items:center;gap:4px;height:28px;max-width:100%;padding:0 8px;border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer}
.apo-trigger:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.apo-trigger[aria-expanded="true"]{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}
.apo-trigger:disabled{opacity:.45;cursor:default}
.apo-trigger:focus-visible,.apo-icon:focus-visible,.apo-chip:focus-visible,.apo-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.apo-trigger svg{display:block;flex:none}
.apo-dock{box-sizing:border-box;width:100%;display:flex;justify-content:center;padding:0 4px}
.apo-panel{box-sizing:border-box;width:100%;max-width:640px;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(0,0,0,.12))}
.apo-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.apo-head svg{display:block;flex:none;color:var(--dsw-alias-brand-primary)}
.apo-title{flex:none;font-size:13px;font-weight:600;line-height:20px}
.apo-subtitle{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.apo-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.apo-icon:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.apo-modes{display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px 0}
.apo-chip{height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer}
.apo-chip:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.apo-chip[aria-pressed="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.apo-body{display:flex;flex-direction:column;gap:6px;padding:8px 10px 10px}
.apo-modehelp{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.apo-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.apo-output{margin:0;max-height:220px;overflow:auto;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-family:inherit;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.apo-caret{opacity:.5}
.apo-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.apo-running{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.apo-dot{width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-brand-primary);flex:none}
.apo-pulse{animation:apo-pulse 1.2s ease-in-out infinite}
.apo-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1)}
.apo-meta{min-width:0;flex:1;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.apo-actions{display:flex;flex:none;gap:6px}
.apo-btn{height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;cursor:pointer}
.apo-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.apo-btn:disabled{opacity:.5;cursor:default}
.apo-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
@keyframes apo-pulse{0%,100%{opacity:.4}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.apo-pulse{animation:none}}
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
        runId: 0,
      }
      const listeners = new Set()
      let abort = null

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

      const finish = () => {
        const text = state.output.trim()
        publish(text.length > 0 ? { status: 'done' } : { status: 'error', error: { code: 'empty', detail: '' } })
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
                finish()
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
        if (text.length > MAX_PROMPT_CHARS) {
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
        applyTo(inputActions) {
          const text = state.output
          if (text.trim().length === 0 || inputActions === undefined) return
          try {
            inputActions.setDraft(text)
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
      const disabled = draft.trim().length === 0
      return h(
        'button',
        {
          type: 'button',
          className: 'apo-trigger',
          disabled,
          'aria-expanded': state.open,
          'aria-label': t('trigger.title'),
          title: disabled ? t('trigger.disabled') : t('trigger.title'),
          onClick: () => {
            if (state.open) optimizer.close()
            else optimizer.start(draft, state.mode)
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
    function OptimizerPanel({ optimizer, inputActions, t }) {
      const state = useOptimizer(optimizer)
      const [copied, setCopied] = React.useState(false)
      const panelRef = React.useRef(null)

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

      if (!state.open) return null

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

      const actions = []
      if (state.status === 'running') {
        actions.push(
          h(
            'button',
            {
              key: 'cancel',
              type: 'button',
              className: 'apo-btn',
              onClick: () => optimizer.cancel(),
            },
            t('action.cancel'),
          ),
        )
      } else {
        if (state.output.trim().length > 0) {
          actions.push(
            h(
              'button',
              {
                key: 'copy',
                type: 'button',
                className: 'apo-btn',
                onClick: copy,
              },
              copied ? t('action.copied') : t('action.copy'),
            ),
          )
          actions.push(
            h(
              'button',
              {
                key: 'apply',
                type: 'button',
                className: 'apo-btn apo-btn-primary',
                onClick: () => optimizer.applyTo(inputActions),
              },
              t('action.apply'),
            ),
          )
        }
        actions.push(
          h(
            'button',
            {
              key: 'again',
              type: 'button',
              className: 'apo-btn',
              onClick: () => optimizer.start(state.source, state.mode),
            },
            state.error === null ? t('action.run') : t('action.retry'),
          ),
        )
      }

      return h(
        'div',
        { className: 'apo-dock', 'data-prompt-optimizer': true },
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
          h(
            'div',
            { className: 'apo-head' },
            h(SparkleIcon),
            h('span', { className: 'apo-title' }, t('panel.title')),
            h('span', { className: 'apo-subtitle' }, t('panel.subtitle')),
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
          h('div', { className: 'apo-modes', role: 'group', 'aria-label': t('mode.label') }, modeKeys),
          h(
            'div',
            { className: 'apo-body' },
            h('p', { className: 'apo-modehelp' }, t(`mode.${state.mode}.desc`)),
            state.status === 'running' && state.output.length === 0
              ? h('p', { className: 'apo-running' }, h('span', { className: 'apo-dot apo-pulse' }), t('status.running'))
              : null,
            state.output.length > 0
              ? h(
                  'pre',
                  { className: 'apo-output', 'aria-live': 'polite', 'aria-busy': state.status === 'running' },
                  state.output,
                  state.status === 'running' ? h('span', { className: 'apo-caret' }, '▍') : null,
                )
              : null,
            state.error !== null ? h('p', { className: 'apo-error', role: 'alert' }, errorText(t, state.error)) : null,
            state.status === 'idle' ? h('p', { className: 'apo-hint' }, t('status.idle')) : null,
          ),
          h(
            'div',
            { className: 'apo-foot' },
            h('span', { className: 'apo-meta' }, t('note.source', { n: state.sourceLength })),
            h('div', { className: 'apo-actions' }, actions),
          ),
        ),
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
      'status.running': 'Optimizing…',
      'status.idle': 'Nothing to optimize yet.',
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
      'error.tooLong': 'The draft is longer than 8000 characters.',
      'error.emptyDraft': 'The composer is empty.',
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
      'status.running': '正在优化…',
      'status.idle': '还没有可以优化的内容。',
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
      'error.tooLong': '草稿超过 8000 字，请先精简。',
      'error.emptyDraft': '输入框为空。',
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

        ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.dock',
              id: 'prompt-optimizer',
              order: 5,
              locale: NS,
              inject: (sessionId) => ({ optimizer: controllerFor(sessionId) }),
            },
            OptimizerPanel,
          ),
        )
      },
    }
  },
})

/**
 * Python in the browser (Pyodide) running inside a Web Worker.
 *
 * - The worker keeps the page responsive while Python runs.
 * - stdout / stderr stream back line by line.
 * - input() works through a SharedArrayBuffer (needs the COOP/COEP headers WebContainers already need).
 * - Ctrl+C raises KeyboardInterrupt through an interrupt buffer, and falls back to killing the worker.
 * - pip install is micropip: pure-Python wheels from PyPI plus everything built into Pyodide (numpy, pandas, scikit-learn...).
 *
 * To change the Pyodide version, edit PYODIDE_VERSION (see https://pyodide.org for releases).
 */

export const PYODIDE_VERSION = '314.0.7'
export const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

/** Python helpers loaded once inside the worker. */
const PY_HELPERS = String.raw`
import sys, os, traceback, codeop

if "/home/project" not in sys.path:
    sys.path.insert(0, "/home/project")

_repl_buf = []
_repl_globals = {"__name__": "__main__"}

def _nirmaan_exit_code(e):
    c = e.code
    if c is None:
        return 0
    if isinstance(c, int):
        return c
    print(c, file=sys.stderr)
    return 1

def _nirmaan_report(e):
    tb = e.__traceback__.tb_next if e.__traceback__ else None
    traceback.print_exception(type(e), e, tb)

def _nirmaan_run(path, argv):
    sys.argv = [path] + list(argv)
    try:
        with open(path) as f:
            src = f.read()
        g = {"__name__": "__main__", "__file__": path}
        exec(compile(src, path, "exec"), g)
        return 0
    except SystemExit as e:
        return _nirmaan_exit_code(e)
    except BaseException as e:
        _nirmaan_report(e)
        return 1

def _nirmaan_exec(code):
    sys.argv = ["-c"]
    try:
        exec(compile(code, "<string>", "exec"), {"__name__": "__main__"})
        return 0
    except SystemExit as e:
        return _nirmaan_exit_code(e)
    except BaseException as e:
        _nirmaan_report(e)
        return 1

def _nirmaan_repl(line):
    _repl_buf.append(line)
    src = "\n".join(_repl_buf)
    try:
        code = codeop.compile_command(src, "<stdin>", "single")
    except (SyntaxError, OverflowError, ValueError):
        _repl_buf.clear()
        traceback.print_exc(limit=0)
        return False
    if code is None:
        return True
    _repl_buf.clear()
    try:
        exec(code, _repl_globals)
    except SystemExit:
        pass
    except BaseException as e:
        _nirmaan_report(e)
    return False
`

/** Worker source. Built with String.raw so the JS escapes stay as written. */
const WORKER_SOURCE = String.raw`
import { loadPyodide } from "${PYODIDE_BASE}pyodide.mjs"

const BASE = ${JSON.stringify(PYODIDE_BASE)}
const HELPERS = ${JSON.stringify(PY_HELPERS)}
let py = null, ctrl = null, data = null, intr = null
let synced = new Set()
let pySources = ""
const post = (m) => self.postMessage(m)

function writer(type) {
  const dec = new TextDecoder()
  return { write: (buf) => { post({ type, text: dec.decode(buf, { stream: true }) }); return buf.length } }
}
function lastLine(err) {
  const lines = String((err && err.message) || err).trim().split("\n")
  const errorLines = lines.filter((l) => /^[A-Za-z_.]*(Error|Exception)\b/.test(l.trim()))
  return errorLines.length ? errorLines[errorLines.length - 1] : lines[lines.length - 1]
}

async function runExec(m) {
  if (intr) Atomics.store(intr, 0, 0)
  if (m.op === "file" || m.op === "code") {
    let src = ""
    if (m.op === "file") {
      try { src = py.FS.readFile("/home/project/" + m.path, { encoding: "utf8" }) } catch (e) {}
    }
    try { await py.loadPackagesFromImports(pySources + "\n" + src + "\n" + (m.code || "")) } catch (e) {}
    if (m.op === "file") {
      const argv = py.toPy(m.argv || [])
      const rc = py.globals.get("_nirmaan_run")(m.path, argv)
      if (argv.destroy) argv.destroy()
      return { code: Number(rc) }
    }
    return { code: Number(py.globals.get("_nirmaan_exec")(m.code)) }
  }
  if (m.op === "repl") {
    const more = py.globals.get("_nirmaan_repl")(m.line)
    return { code: 0, more: !!more }
  }
  if (m.op === "pip") {
    try {
      if (m.action === "list") {
        py.runPython("import micropip; print(micropip.list())")
        return { code: 0 }
      }
      const mp = py.pyimport("micropip")
      const list = py.toPy(m.pkgs || [])
      if (m.action === "install") {
        post({ type: "out", text: "Installing " + (m.pkgs || []).join(", ") + " ...\n" })
        await mp.install(list)
        post({ type: "out", text: "Successfully installed " + (m.pkgs || []).join(" ") + "\n" })
      } else {
        await mp.uninstall(list)
        post({ type: "out", text: "Successfully uninstalled " + (m.pkgs || []).join(" ") + "\n" })
      }
      if (list.destroy) list.destroy()
      return { code: 0 }
    } catch (err) {
      post({ type: "err", text: "ERROR: " + lastLine(err) + "\n" })
      return { code: 1 }
    }
  }
  return { code: 0 }
}

self.onmessage = async (e) => {
  const m = e.data
  try {
    if (m.type === "init") {
      if (m.sab) { ctrl = new Int32Array(m.sab, 0, 2); data = new Uint8Array(m.sab, 8) }
      if (m.intrSab) intr = new Int32Array(m.intrSab)
      py = await loadPyodide({ indexURL: BASE })
      py.setStdout(writer("out"))
      py.setStderr(writer("err"))
      py.setStdin({
        stdin: () => {
          if (!ctrl) return undefined
          Atomics.store(ctrl, 0, 0)
          post({ type: "input" })
          Atomics.wait(ctrl, 0, 0)
          const n = Atomics.load(ctrl, 1)
          if (n < 0) return undefined
          return new TextDecoder().decode(data.slice(0, n)) + "\n"
        },
        autoEOF: false,
      })
      if (intr && typeof py.setInterruptBuffer === "function") py.setInterruptBuffer(intr)
      py.runPython(HELPERS)
      await py.loadPackage("micropip")
      py.FS.mkdirTree("/home/project")
      py.FS.chdir("/home/project")
      post({ type: "ready", version: String(py.runPython("import sys; sys.version.split()[0]")) })
    } else if (m.type === "sync") {
      const next = new Set()
      for (const f of m.files) {
        const dir = f.path.split("/").slice(0, -1).join("/")
        if (dir) py.FS.mkdirTree("/home/project/" + dir)
        py.FS.writeFile("/home/project/" + f.path, f.content)
        next.add(f.path)
      }
      for (const old of synced) {
        if (!next.has(old)) { try { py.FS.unlink("/home/project/" + old) } catch (err) {} }
      }
      synced = next
      pySources = m.files.filter((f) => f.path.endsWith(".py")).map((f) => f.content).join("\n")
    } else if (m.type === "exec") {
      const r = await runExec(m)
      post({ type: "done", id: m.id, code: r.code, more: r.more })
    }
  } catch (err) {
    if (m.type === "init") post({ type: "fatal", message: lastLine(err) })
    else {
      post({ type: "err", text: lastLine(err) + "\n" })
      post({ type: "done", id: m.id, code: 1 })
    }
  }
}
`

export interface ProjectFile { path: string; content: string }

export type ExecRequest =
  | { op: 'file'; path: string; argv: string[] }
  | { op: 'code'; code: string }
  | { op: 'repl'; line: string }
  | { op: 'pip'; action: 'install' | 'uninstall' | 'list'; pkgs?: string[] }

export interface ExecResult { code: number; more?: boolean }

interface Handlers {
  onOut: (text: string) => void
  onErr: (text: string) => void
  onInput: () => void
}

const INPUT_BYTES = 4000

export class PythonRuntime {
  version = ''
  busy = false
  private worker: Worker | null = null
  private booting: Promise<void> | null = null
  private pending = new Map<number, (r: ExecResult) => void>()
  private nextId = 1
  private ctrl: Int32Array | null = null
  private data: Uint8Array | null = null
  private intr: Int32Array | null = null
  private generation = 0
  private restarted = false

  constructor(private handlers: Handlers) {}

  /** Starts the worker (downloads Pyodide the first time, then it is cached by the browser). */
  start(): Promise<void> {
    if (this.booting) return this.booting
    const isolated = typeof SharedArrayBuffer !== 'undefined' && typeof window !== 'undefined' && window.crossOriginIsolated
    let sab: SharedArrayBuffer | undefined
    let intrSab: SharedArrayBuffer | undefined
    if (isolated) {
      sab = new SharedArrayBuffer(8 + INPUT_BYTES)
      intrSab = new SharedArrayBuffer(4)
      this.ctrl = new Int32Array(sab, 0, 2)
      this.data = new Uint8Array(sab, 8)
      this.intr = new Int32Array(intrSab)
    } else {
      this.ctrl = this.data = this.intr = null
    }

    this.booting = new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
      const worker = new Worker(url, { type: 'module' })
      this.worker = worker
      worker.onerror = () => {
        URL.revokeObjectURL(url)
        this.booting = null
        this.worker = null
        reject(new Error('Could not load Python. Check your internet connection (Pyodide is downloaded from cdn.jsdelivr.net).'))
      }
      worker.onmessage = (event: MessageEvent) => {
        const m = event.data
        if (m.type === 'ready') { this.version = m.version; URL.revokeObjectURL(url); resolve() }
        else if (m.type === 'fatal') { this.booting = null; this.worker = null; worker.terminate(); reject(new Error(m.message)) }
        else if (m.type === 'out') this.handlers.onOut(m.text)
        else if (m.type === 'err') this.handlers.onErr(m.text)
        else if (m.type === 'input') this.handlers.onInput()
        else if (m.type === 'done') {
          const resolveExec = this.pending.get(m.id)
          this.pending.delete(m.id)
          this.busy = this.pending.size > 0
          resolveExec?.({ code: m.code, more: m.more })
        }
      }
      worker.postMessage({ type: 'init', sab, intrSab })
    })
    return this.booting
  }

  private async ensure() {
    if (!this.worker) {
      if (this.restarted) this.handlers.onErr('Restarting Python (installed packages were reset)...\n')
      await this.start()
    } else {
      await this.booting
    }
  }

  async sync(files: ProjectFile[]) {
    await this.ensure()
    this.worker?.postMessage({ type: 'sync', files })
  }

  async exec(request: ExecRequest): Promise<ExecResult> {
    await this.ensure()
    const worker = this.worker
    if (!worker) return { code: 1 }
    const id = this.nextId++
    this.busy = true
    return new Promise<ExecResult>((resolve) => {
      this.pending.set(id, resolve)
      worker.postMessage({ type: 'exec', id, ...request })
    })
  }

  /** Answer a pending input() call. Pass null to send end-of-file. */
  provideInput(text: string | null) {
    if (!this.ctrl || !this.data) return
    if (text === null) {
      Atomics.store(this.ctrl, 1, -1)
    } else {
      const bytes = new TextEncoder().encode(text).slice(0, INPUT_BYTES)
      this.data.set(bytes)
      Atomics.store(this.ctrl, 1, bytes.length)
    }
    Atomics.store(this.ctrl, 0, 1)
    Atomics.notify(this.ctrl, 0)
  }

  /** Ctrl+C: ask Python to raise KeyboardInterrupt, and kill the worker if it does not stop. */
  interrupt() {
    if (!this.busy) return
    const generation = this.generation
    if (this.intr) {
      Atomics.store(this.intr, 0, 2)
      setTimeout(() => { if (this.busy && this.generation === generation) this.kill(true) }, 1500)
    } else {
      this.kill(true)
    }
  }

  kill(markRestart = false) {
    this.generation++
    this.worker?.terminate()
    this.worker = null
    this.booting = null
    this.restarted = markRestart
    this.pending.forEach((resolve) => resolve({ code: 130 }))
    this.pending.clear()
    this.busy = false
  }
}

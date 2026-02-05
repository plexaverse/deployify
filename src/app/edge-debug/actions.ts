'use server'

import { NextRequest, NextResponse } from 'next/server'
import vm from 'vm'

type SimulationResult = {
  status: number
  headers: Record<string, string>
  body: string
  logs: string[]
  type: 'response' | 'rewrite' | 'redirect' | 'next' | 'error'
  error?: string
}

export async function runSimulation(
  code: string,
  requestDetails: { url: string; method: string; headers: Record<string, string> }
): Promise<SimulationResult> {
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    return {
      status: 403,
      headers: {},
      body: '',
      logs: [],
      type: 'error',
      error: 'Simulation is only available in development mode',
    }
  }

  const logs: string[] = []

  try {
    // 1. Prepare the Request
    const req = new NextRequest(requestDetails.url, {
      method: requestDetails.method,
      headers: requestDetails.headers,
    })

    // 2. Prepare the Sandbox
    const sandbox: any = {
      NextRequest,
      NextResponse,
      request: req,
      URL,
      console: {
        log: (...args: any[]) => logs.push(args.map((a) => String(a)).join(' ')),
        error: (...args: any[]) => logs.push('[ERROR] ' + args.map((a) => String(a)).join(' ')),
        warn: (...args: any[]) => logs.push('[WARN] ' + args.map((a) => String(a)).join(' ')),
      },
      process: {
        env: {},
      },
      exports: {},
      module: { exports: {} },
    }

    // Link exports
    sandbox.exports = sandbox.module.exports

    const context = vm.createContext(sandbox)

    // 3. Prepare Code
    // Strip imports: basic heuristic to avoid syntax errors in VM
    // We assume the user imports NextRequest/NextResponse which we provide globally.
    let cleanCode = code.replace(/^\s*import\s+.*$/gm, '// import removed')

    // Handle exports to ensure they are accessible in the sandbox
    // 1. Handle "export default" -> "exports.default ="
    cleanCode = cleanCode.replace(/^\s*export\s+default\s+/gm, 'exports.default = ')
    // 2. Handle "export function/class/var" -> "function/class/var" (makes them global in script scope)
    cleanCode = cleanCode.replace(/^\s*export\s+(function|class|var)\s+/gm, '$1 ')
    // 3. Handle "export const/let" -> "var" (makes them global/accessible on sandbox)
    cleanCode = cleanCode.replace(/^\s*export\s+(const|let)\s+/gm, 'var ')
    // 4. Remove named export statements like "export { middleware }"
    cleanCode = cleanCode.replace(/^\s*export\s*\{[^}]*\}\s*;?/gm, '')

    // 4. Run the code to define the function
    const script = new vm.Script(cleanCode)
    script.runInContext(context, { timeout: 1000 })

    let middlewareFn = null

    // Check module.exports and exports
    if (typeof sandbox.module.exports === 'function') {
      middlewareFn = sandbox.module.exports
    } else if (typeof sandbox.module.exports.middleware === 'function') {
      middlewareFn = sandbox.module.exports.middleware
    } else if (typeof sandbox.module.exports.default === 'function') {
        middlewareFn = sandbox.module.exports.default
    } else if (typeof sandbox.exports.middleware === 'function') {
       middlewareFn = sandbox.exports.middleware
    } else if (typeof sandbox.middleware === 'function') {
        middlewareFn = sandbox.middleware
    }

    if (!middlewareFn) {
        // Try to find *any* exported function if strict naming fails?
        // No, let's stick to 'middleware' or default export.
        return {
            status: 500,
            headers: {},
            body: '',
            logs,
            type: 'error',
            error: 'Could not find a "middleware" function or default export in the code.',
        }
    }

    // 5. Execute Middleware
    // We await it in case it's async
    const result = await middlewareFn(req)

    // 6. Process Result
    if (!result) {
      return {
        status: 200, // or 500?
        headers: {},
        body: '',
        logs,
        type: 'error',
        error: 'Middleware returned nothing (undefined/null).',
      }
    }

    const headers: Record<string, string> = {}
    result.headers.forEach((v: string, k: string) => {
      headers[k] = v
    })

    // Determine type
    let type: SimulationResult['type'] = 'response'

    const rewriteHeader = headers['x-middleware-rewrite']
    const nextHeader = headers['x-middleware-next']

    if (rewriteHeader) {
        type = 'rewrite'
    } else if (nextHeader) {
        type = 'next'
    } else if (result.status >= 300 && result.status < 400 && headers['location']) {
        type = 'redirect'
    }

    const body = await result.text()

    return {
      status: result.status,
      headers,
      body,
      logs,
      type,
    }

  } catch (err: any) {
    return {
      status: 500,
      headers: {},
      body: '',
      logs,
      type: 'error',
      error: err.message,
    }
  }
}

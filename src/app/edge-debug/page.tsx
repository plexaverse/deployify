'use client'

import { useState } from 'react'
import { notFound } from 'next/navigation'
import { runSimulation } from './actions'
import { toast } from 'sonner'
import { Loader2, Play, AlertCircle, CheckCircle2 } from 'lucide-react'

const DEFAULT_CODE = `import { NextResponse } from 'next/server'

export function middleware(request) {
  const url = request.nextUrl.clone()
  if (url.pathname === '/hello') {
    return NextResponse.json({ message: 'Hello from Edge!' })
  }
  return NextResponse.next()
}`

const DEFAULT_HEADERS = `{
  "content-type": "application/json"
}`

export default function EdgeDebugPage() {
  // Restrict to development environment for security
  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    notFound()
  }

  const [code, setCode] = useState(DEFAULT_CODE)
  const [url, setUrl] = useState('http://localhost:3000/hello')
  const [method, setMethod] = useState('GET')
  const [headers, setHeaders] = useState(DEFAULT_HEADERS)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleRun = async () => {
    setLoading(true)
    setResult(null)
    try {
      let parsedHeaders = {}
      try {
        parsedHeaders = JSON.parse(headers)
      } catch (e) {
        toast.error('Invalid JSON in headers')
        setLoading(false)
        return
      }

      const res = await runSimulation(code, {
        url,
        method,
        headers: parsedHeaders,
      })

      setResult(res)
      if (res.type === 'error') {
        toast.error('Simulation failed')
      } else {
        toast.success('Simulation complete')
      }
    } catch (e) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
        <header className="mb-8 flex items-center justify-between">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edge Function Simulator</h1>
                <p className="text-muted-foreground mt-2">Test middleware logic and edge functions in a sandboxed environment.</p>
                <p className="text-xs text-muted-foreground mt-1">Note: Only JavaScript is supported. TypeScript types are not transpiled.</p>
            </div>
            <button
                onClick={handleRun}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer"
            >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Run Simulation
            </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
            {/* Left Column: Code Editor */}
            <div className="flex flex-col gap-4 h-full">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Middleware Code</h2>
                </div>
                <div className="flex-1 border rounded-md overflow-hidden bg-zinc-950 shadow-sm">
                     <textarea
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full h-full bg-transparent text-gray-100 font-mono text-sm p-4 focus:outline-none resize-none"
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Right Column: Configuration & Output */}
            <div className="flex flex-col gap-6 overflow-y-auto pr-2 pb-4">

                {/* Request Config */}
                <div className="space-y-4 border rounded-md p-4 bg-card shadow-sm">
                    <h2 className="text-lg font-semibold">Request Configuration</h2>
                    <div className="grid grid-cols-[100px_1fr] gap-4">
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option>GET</option>
                            <option>POST</option>
                            <option>PUT</option>
                            <option>DELETE</option>
                            <option>PATCH</option>
                        </select>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="https://example.com/path"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block">Headers (JSON)</label>
                        <textarea
                            value={headers}
                            onChange={(e) => setHeaders(e.target.value)}
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        />
                    </div>
                </div>

                {/* Output */}
                 <div className="space-y-4 flex-1 flex flex-col">
                    <h2 className="text-lg font-semibold">Simulation Result</h2>

                    {!result && !loading && (
                        <div className="flex-1 border border-dashed rounded-md flex items-center justify-center text-muted-foreground p-8 min-h-[200px]">
                            Run a simulation to see the results
                        </div>
                    )}

                    {loading && (
                        <div className="flex-1 border border-dashed rounded-md flex items-center justify-center text-muted-foreground p-8 min-h-[200px]">
                             <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    )}

                    {result && (
                        <div className="border rounded-md bg-card overflow-hidden flex flex-col gap-0 shadow-sm">
                            {/* Status Bar */}
                            <div className={`p-4 border-b flex items-center gap-2 ${result.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                {result.type === 'error' ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                                <span className="font-bold">{result.status}</span>
                                <span className="uppercase text-xs font-mono px-2 py-0.5 rounded-full border border-current">{result.type}</span>
                            </div>

                            {/* Logs */}
                            {result.logs.length > 0 && (
                                <div className="p-4 border-b bg-zinc-950 text-white font-mono text-xs overflow-auto max-h-[150px]">
                                    <div className="text-muted-foreground mb-2">Logs:</div>
                                    {result.logs.map((log: string, i: number) => (
                                        <div key={i}>{log}</div>
                                    ))}
                                </div>
                            )}

                             {/* Error Message */}
                            {result.error && (
                                <div className="p-4 text-red-500 bg-red-500/5 font-mono text-sm">
                                    {result.error}
                                </div>
                            )}

                            {/* Response Info */}
                            {!result.error && (
                                <div className="p-4 space-y-4">
                                    {/* Headers */}
                                    {Object.keys(result.headers).length > 0 && (
                                         <details className="text-sm">
                                            <summary className="cursor-pointer font-medium mb-2 select-none">Response Headers</summary>
                                            <div className="bg-muted p-2 rounded-md font-mono text-xs overflow-auto border">
                                                {Object.entries(result.headers).map(([k, v]) => (
                                                    <div key={k}><span className="text-blue-500">{k}:</span> {v as any}</div>
                                                ))}
                                            </div>
                                        </details>
                                    )}

                                    {/* Body */}
                                    <div>
                                         <div className="font-medium mb-2 text-sm">Response Body</div>
                                         <pre className="bg-muted p-3 rounded-md font-mono text-xs overflow-auto max-h-[300px] whitespace-pre-wrap border">
                                            {result.body || <span className="text-muted-foreground italic">No content</span>}
                                         </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  )
}

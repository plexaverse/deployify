'use client'

import { useState } from 'react'
import { notFound } from 'next/navigation'
import { runSimulation } from './actions'
import { toast } from 'sonner'
import { Loader2, Play, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button as MovingBorderButton } from '@/components/ui/moving-border'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null)

  const handleRun = async () => {
    setLoading(true)
    setResult(null)
    try {
      let parsedHeaders = {}
      try {
        parsedHeaders = JSON.parse(headers)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">Edge Function Simulator</h1>
                <p className="text-[var(--muted-foreground)] mt-2">Test middleware logic and edge functions in a sandboxed environment.</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Note: Only JavaScript is supported. TypeScript types are not transpiled.</p>
            </div>
            <MovingBorderButton
                onClick={handleRun}
                disabled={loading}
                containerClassName="h-12 w-48"
                className="font-bold text-sm"
            >
                {!loading && <Play className="mr-2 h-4 w-4" />}
                {loading ? 'Running...' : 'Run Simulation'}
            </MovingBorderButton>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-200px)]">
            {/* Left Column: Code Editor */}
            <div className="flex flex-col gap-4 h-full">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">Middleware Code</h2>
                </div>
                <div className="flex-1 border border-[var(--terminal-border)] rounded-md overflow-hidden bg-[var(--terminal-bg)] shadow-sm">
                     <textarea
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full h-full bg-transparent text-[var(--terminal-foreground)] font-mono text-sm p-4 focus:outline-none resize-none"
                        spellCheck={false}
                    />
                </div>
            </div>

            {/* Right Column: Configuration & Output */}
            <div className="flex flex-col gap-6 overflow-y-auto pr-2 pb-4">

                {/* Request Config */}
                <Card className="space-y-6">
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">Request Configuration</h2>

                    <div className="space-y-2">
                        <Label>HTTP Method</Label>
                        <SegmentedControl
                            options={[
                                { value: 'GET', label: 'GET' },
                                { value: 'POST', label: 'POST' },
                                { value: 'PUT', label: 'PUT' },
                                { value: 'DELETE', label: 'DELETE' },
                                { value: 'PATCH', label: 'PATCH' },
                            ]}
                            value={method}
                            onChange={setMethod}
                        />
                    </div>

                    <div className="space-y-2">
                         <Label>Target URL</Label>
                         <Input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/path"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="mb-2 block">Headers (JSON)</Label>
                        <textarea
                            value={headers}
                            onChange={(e) => setHeaders(e.target.value)}
                            className={cn(
                                "flex min-h-[100px] w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm",
                                "ring-offset-[var(--background)] placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                "font-mono text-[var(--foreground)] resize-none"
                            )}
                            spellCheck={false}
                        />
                    </div>
                </Card>

                {/* Output */}
                 <div className="space-y-4 flex-1 flex flex-col">
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">Simulation Result</h2>

                    {!result && !loading && (
                        <div className="flex-1 border border-dashed border-[var(--border)] rounded-md flex items-center justify-center text-[var(--muted-foreground)] p-8 min-h-[200px]">
                            Run a simulation to see the results
                        </div>
                    )}

                    {loading && (
                        <div className="flex-1 border border-dashed border-[var(--border)] rounded-md flex items-center justify-center text-[var(--muted-foreground)] p-8 min-h-[200px]">
                             <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    )}

                    {result && (
                        <Card className="p-0 overflow-hidden flex flex-col gap-0 shadow-sm border-[var(--border)]">
                            {/* Status Bar */}
                            <div className={cn("p-4 border-b border-[var(--border)] flex items-center gap-2",
                                result.type === 'error' ? 'bg-[var(--error-bg)] text-[var(--error)]' : 'bg-[var(--success-bg)] text-[var(--success)]'
                            )}>
                                {result.type === 'error' ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                                <span className="font-bold">{result.status}</span>
                                <span className="uppercase text-xs font-mono px-2 py-0.5 rounded-full border border-current">{result.type}</span>
                            </div>

                            {/* Logs */}
                            {result.logs.length > 0 && (
                                <div className="p-4 border-b border-[var(--terminal-border)] bg-[var(--terminal-bg)] text-[var(--terminal-foreground)] font-mono text-xs overflow-auto max-h-[150px]">
                                    <div className="text-[var(--muted-foreground)] mb-2">Logs:</div>
                                    {result.logs.map((log: string, i: number) => (
                                        <div key={i}>{log}</div>
                                    ))}
                                </div>
                            )}

                             {/* Error Message */}
                            {result.error && (
                                <div className="p-4 text-[var(--error)] bg-[var(--error-bg)] font-mono text-sm">
                                    {result.error}
                                </div>
                            )}

                            {/* Response Info */}
                            {!result.error && (
                                <div className="p-4 space-y-4">
                                    {/* Headers */}
                                    {Object.keys(result.headers).length > 0 && (
                                         <details className="text-sm text-[var(--foreground)]">
                                            <summary className="cursor-pointer font-medium mb-2 select-none">Response Headers</summary>
                                            <div className="bg-[var(--muted)]/20 p-2 rounded-md font-mono text-xs overflow-auto border border-[var(--border)]">
                                                {Object.entries(result.headers).map(([k, v]) => (
                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    <div key={k}><span className="text-[var(--info)]">{k}:</span> {v as any}</div>
                                                ))}
                                            </div>
                                        </details>
                                    )}

                                    {/* Body */}
                                    <div>
                                         <div className="font-medium mb-2 text-sm text-[var(--foreground)]">Response Body</div>
                                         <pre className="bg-[var(--muted)]/20 p-3 rounded-md font-mono text-xs overflow-auto max-h-[300px] whitespace-pre-wrap border border-[var(--border)] text-[var(--foreground)]">
                                            {result.body || <span className="text-[var(--muted-foreground)] italic">No content</span>}
                                         </pre>
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}
                </div>
            </div>
        </div>
    </div>
  )
}

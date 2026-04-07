'use client'

import { useState } from 'react'
import { notFound } from 'next/navigation'
import { runSimulation, type SimulationResult } from './actions'
import { toast } from 'sonner'
import { Loader2, Play, AlertCircle, CheckCircle2, Cpu, Terminal, Layout } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button as MovingBorderButton } from '@/components/ui/moving-border'
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
  const [result, setResult] = useState<SimulationResult | null>(null)

  const handleRun = async () => {
    setLoading(true)
    setResult(null)
    try {
      let parsedHeaders = {}
      try {
        parsedHeaders = JSON.parse(headers)
      } catch {
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
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 space-y-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                    <Cpu className="w-8 h-8 text-[var(--primary)]" />
                </div>
                <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Developer Tools</span>
                    <h1 className="text-lg font-bold tracking-tight">Edge Function Simulator</h1>
                </div>
            </div>
            <MovingBorderButton
                onClick={handleRun}
                disabled={loading}
                containerClassName="h-12 w-48"
                className="text-[10px] font-bold uppercase tracking-wider"
            >
                {!loading && <Play className="mr-2 h-4 w-4" />}
                {loading ? 'Running...' : 'Run Simulation'}
            </MovingBorderButton>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-200px)]">
            {/* Left Column: Code Editor */}
            <Card className="overflow-hidden p-0 flex flex-col h-full">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                        <Terminal className="w-5 h-5 text-[var(--primary)]" />
                    </div>
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Code Editor</span>
                        <h2 className="text-sm font-semibold">Middleware Code</h2>
                    </div>
                </div>
                <Separator className="bg-[var(--border)]" />
                <div className="flex-1 p-0 overflow-hidden bg-[var(--terminal-bg)]">
                     <textarea
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full h-full bg-transparent text-[var(--terminal-foreground)] font-mono text-sm p-4 focus:outline-none resize-none"
                        spellCheck={false}
                    />
                </div>
            </Card>

            {/* Right Column: Configuration & Output */}
            <div className="flex flex-col gap-8 overflow-y-auto pr-2 pb-4">

                {/* Request Config */}
                <Card className="overflow-hidden p-0">
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--info-bg)] text-[var(--info)] flex items-center justify-center border border-[var(--info)]/30 shrink-0">
                            <Cpu className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Configuration</span>
                            <h2 className="text-sm font-semibold text-[var(--foreground)]">Request Configuration</h2>
                        </div>
                    </div>
                    <Separator className="bg-[var(--border)]" />
                    <div className="p-6 space-y-6">

                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">HTTP Method</Label>
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
                         <Label className="text-sm font-semibold">Target URL</Label>
                         <Input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="HTTPS://EXAMPLE.COM/PATH"
                            className="placeholder:text-[10px] placeholder:font-bold placeholder:uppercase placeholder:tracking-wider"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-semibold mb-2 block">Headers (JSON)</Label>
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
                    </div>
                </Card>

                {/* Output */}
                 <div className="space-y-4 flex-1 flex flex-col">
                    <Card className="overflow-hidden p-0 flex flex-col flex-1">
                        <div className="p-6 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/10 flex items-center justify-center shrink-0">
                                <Layout className="w-5 h-5 text-[var(--primary)]" />
                            </div>
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Execution Output</span>
                                <h2 className="text-sm font-semibold">Simulation Result</h2>
                            </div>
                        </div>
                        <Separator className="bg-[var(--border)]" />

                        <div className="p-6 flex-1 flex flex-col">
                            {!result && !loading && (
                                <div className="flex-1 border border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--muted-foreground)] p-8 min-h-[200px] text-[10px] font-bold uppercase tracking-wider">
                                    Run a simulation to see the results
                                </div>
                            )}

                            {loading && (
                                <div className="flex-1 border border-dashed border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--muted-foreground)] p-8 min-h-[200px]">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                            )}

                            {result && (
                                <div className="flex flex-col gap-6">
                                    <div className={cn("p-4 rounded-xl border flex items-center gap-3",
                                        result.type === 'error' ? 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error)]/20' : 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20'
                                    )}>
                                        {result.type === 'error' ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                                        <span className="text-sm font-semibold">{result.status}</span>
                                        <Badge variant={result.type === 'error' ? 'error' : 'success'} className="ml-auto">
                                            {result.type}
                                        </Badge>
                                    </div>

                                    {/* Logs */}
                                    {result.logs.length > 0 && (
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Runtime Logs</span>
                                            <div className="p-4 rounded-xl border border-[var(--terminal-border)] bg-[var(--terminal-bg)] text-[var(--terminal-foreground)] font-mono text-[10px] font-bold uppercase tracking-wider overflow-auto max-h-[150px]">
                                                {result.logs.map((log: string, i: number) => (
                                                    <div key={i}>{log}</div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Error Message */}
                                    {result.error && (
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--error)]">Error Details</span>
                                            <div className="p-4 text-[var(--error)] bg-[var(--error-bg)] border border-[var(--error)]/20 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider">
                                                {result.error}
                                            </div>
                                        </div>
                                    )}

                                    {/* Response Info */}
                                    {!result.error && (
                                        <div className="space-y-6">
                                            {/* Headers */}
                                            {Object.keys(result.headers).length > 0 && (
                                                <div className="space-y-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Response Headers</span>
                                                    <div className="bg-[var(--muted)]/5 p-4 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider overflow-auto border border-[var(--border)]">
                                                        {Object.entries(result.headers).map(([k, v]) => (
                                                            <div key={k} className="flex gap-2">
                                                                <span className="text-[var(--primary)]">{k.toUpperCase()}:</span>
                                                                <span className="text-[var(--foreground)]">{v.toUpperCase()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Body */}
                                            <div className="space-y-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Response Body</span>
                                                <pre className="bg-[var(--muted)]/5 p-4 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider overflow-auto max-h-[300px] whitespace-pre-wrap border border-[var(--border)] text-[var(--foreground)]">
                                                    {result.body || <span className="text-[var(--muted-foreground)] italic opacity-50">No content</span>}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    </div>
  )
}

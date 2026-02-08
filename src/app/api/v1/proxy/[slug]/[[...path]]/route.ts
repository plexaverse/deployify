import { NextRequest, NextResponse } from 'next/server';
import { getProjectBySlugGlobal } from '@/lib/db';
import { getDb, Collections } from '@/lib/firebase';
import { FieldValue } from 'firebase-admin/firestore';

// Helper for bot detection
const isBot = (ua: string) => {
    const bots = ['bot', 'crawler', 'spider', 'lighthouse', 'chrome-lighthouse', 'headless'];
    return bots.some(bot => ua.toLowerCase().includes(bot));
};

async function logEdgeEvent(projectId: string, req: NextRequest, path: string) {
    const ua = req.headers.get('user-agent') || '';
    if (isBot(ua)) return;

    let ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
        req.headers.get('x-real-ip') ||
        'unknown';

    // Privacy: Mask IP
    if (ip !== 'unknown' && ip.includes('.')) {
        const parts = ip.split('.');
        parts[parts.length - 1] = '0';
        ip = parts.join('.');
    } else if (ip !== 'unknown' && ip.includes(':')) {
        const parts = ip.split(':');
        parts[parts.length - 1] = '0000';
        ip = parts.join(':');
    }

    const eventData = {
        projectId,
        type: 'pageview',
        path: path.split('?')[0] || '/',
        referrer: req.headers.get('referer') || '',
        ip,
        userAgent: ua,
        source: 'edge', // Distinguish from client SDK
        timestamp: FieldValue.serverTimestamp(),
    };

    try {
        const db = getDb();
        await db.collection(Collections.ANALYTICS_EVENTS).add(eventData);
        console.log(`[Edge Analytics] Logged visit for ${projectId} at ${eventData.path}`);

        // BigQuery DUAL-WRITE
        const { streamEventToBigQuery } = await import('@/lib/gcp/bigquery');
        streamEventToBigQuery({
            ...eventData,
            source: 'edge',
            timestamp: new Date().toISOString(),
        }).catch(err => console.error('[BigQuery Dual-Write Error (Edge)]:', err));

    } catch (e) {
        console.error('[Edge Analytics] Failed to log event:', e);
    }
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string; path?: string[] }> }
) {
    // Next.js 15/16: params is a promise
    const awaitedParams = await params;
    const { slug, path } = awaitedParams;

    console.log(`[Proxy Trace] Incoming request: slug=${slug}, path=${JSON.stringify(path)}`);

    const pathStr = path ? `/${path.join('/')}` : '/';
    const searchParams = req.nextUrl.searchParams.toString();
    const fullPath = searchParams ? `${pathStr}?${searchParams}` : pathStr;

    console.log(`[Proxy Trace] Resolved fullPath: ${fullPath}`);

    // 1. Resolve Project
    let project = await getProjectBySlugGlobal(slug);

    // Fallback: If slug is like "my-app-853384839522", try "my-app"
    if (!project && slug.includes('-')) {
        const parts = slug.split('-');
        const potentialNumber = parts[parts.length - 1];
        if (/^\d{10,}$/.test(potentialNumber)) {
            const strippedSlug = parts.slice(0, -1).join('-');
            console.log(`[Proxy] Slug not found: ${slug}, trying stripped version: ${strippedSlug}`);
            project = await getProjectBySlugGlobal(strippedSlug);
        }
    }

    if (!project || !project.productionUrl) {
        return NextResponse.json({ error: `Project not found or not deployed: ${slug}` }, { status: 404 });
    }

    // 2. Fetch from Target
    const baseUrl = project.productionUrl.endsWith('/')
        ? project.productionUrl.slice(0, -1)
        : project.productionUrl;
    const targetUrl = `${baseUrl}${fullPath}`;

    // Security/Safety: Avoid fetching localhost/127.0.0.1 from a production server
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalTarget = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');

    if (isProduction && isLocalTarget) {
        console.error(`[Proxy Security] Blocking localhost target in production: ${targetUrl}`);
        return NextResponse.json({
            error: 'Invalid Target URL',
            message: 'A production server cannot proxy to a local address. Please update the project\'s Production URL in the dashboard.',
            targetUrl
        }, { status: 400 });
    }

    console.log(`[Proxy] Forwarding to: ${targetUrl}`);

    try {
        const targetResponse = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': req.headers.get('User-Agent') || '',
                'Accept': req.headers.get('Accept') || '',
                'Accept-Language': req.headers.get('Accept-Language') || '',
                'X-Forwarded-For': req.headers.get('x-forwarded-for') || '',
                'X-Forwarded-Host': req.headers.get('host') || '',
                'X-Forwarded-Proto': req.headers.get('x-forwarded-proto') || 'https',
                'Cookie': req.headers.get('cookie') || '',
                'Referer': req.headers.get('referer') || '',
            },
        });

        console.log(`[Proxy] Target Response: ${targetResponse.status} ${targetResponse.statusText} (${targetResponse.headers.get('content-type')})`);

        const contentType = targetResponse.headers.get('content-type') || '';
        const responseHeaders = new Headers();

        // Copy allowed headers from target response
        const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'x-frame-options'];
        targetResponse.headers.forEach((value, key) => {
            if (!skipHeaders.includes(key.toLowerCase())) {
                responseHeaders.set(key, value);
            }
        });

        // 3. Inject SDK and Log Edge Event if HTML
        if (contentType.includes('text/html')) {
            // Log analytics at the edge (server-side)
            logEdgeEvent(project.id, req, pathStr).catch(() => { });

            let html = await targetResponse.text();

            if (project.analyticsApiKey) {
                const scriptTag = `\n<script src="/deployify-insights.js" data-api-key="${project.analyticsApiKey}" defer></script>\n`;

                if (html.includes('</body>')) {
                    html = html.replace('</body>', `${scriptTag}</body>`);
                } else if (html.includes('</html>')) {
                    html = html.replace('</html>', `${scriptTag}</html>`);
                } else {
                    html += scriptTag;
                }
            }

            // Ensure content type and prevent undesirable caching for HTML
            responseHeaders.set('Content-Type', 'text/html');
            responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

            return new NextResponse(html, {
                status: targetResponse.status,
                headers: responseHeaders,
            });
        }

        // 4. Proxy through non-HTML content
        const body = await targetResponse.arrayBuffer();
        return new NextResponse(body, {
            status: targetResponse.status,
            headers: responseHeaders,
        });

    } catch (error: any) {
        console.error('Internal Proxy Error:', error);
        return NextResponse.json({
            error: 'Internal Proxy Error',
            message: error.message || 'Unknown error occurred during proxying',
            targetUrl
        }, { status: 502 }); // Bad Gateway is more appropriate than 500
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string; path?: string[] }> }
) {
    const { slug, path } = await params;
    const project = await getProjectBySlugGlobal(slug);
    if (!project || !project.productionUrl) return new NextResponse('Not found', { status: 404 });

    const pathStr = path ? `/${path.join('/')}` : '/';
    const baseUrl = project.productionUrl.endsWith('/')
        ? project.productionUrl.slice(0, -1)
        : project.productionUrl;
    const targetUrl = `${baseUrl}${pathStr}`;

    // Security/Safety: Avoid fetching localhost/127.0.0.1 from a production server
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalTarget = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');

    if (isProduction && isLocalTarget) {
        console.error(`[Proxy Security] Blocking localhost target in production: ${targetUrl}`);
        return NextResponse.json({
            error: 'Invalid Target URL',
            message: 'A production server cannot proxy to a local address. Please update the project\'s Production URL in the dashboard.',
            targetUrl
        }, { status: 400 });
    }

    console.log(`[Proxy POST] Forwarding to: ${targetUrl}`);

    try {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': req.headers.get('content-type') || 'application/json',
                'User-Agent': req.headers.get('user-agent') || '',
                'X-Forwarded-For': req.headers.get('x-forwarded-for') || '',
                'X-Forwarded-Host': req.headers.get('host') || '',
                'X-Forwarded-Proto': req.headers.get('x-forwarded-proto') || 'https',
                'Cookie': req.headers.get('cookie') || '',
                'Referer': req.headers.get('referer') || '',
            },
            body: await req.text(),
        });

        const responseHeaders = new Headers();
        const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];
        res.headers.forEach((value, key) => {
            if (!skipHeaders.includes(key.toLowerCase())) {
                responseHeaders.set(key, value);
            }
        });

        const data = await res.arrayBuffer();
        return new NextResponse(data, {
            status: res.status,
            headers: responseHeaders,
        });
    } catch (error: any) {
        console.error('Internal Proxy Error (POST):', error);
        return NextResponse.json({
            error: 'Internal Proxy Error',
            message: error.message || 'Unknown error occurred during proxying',
            targetUrl
        }, { status: 502 });
    }
}

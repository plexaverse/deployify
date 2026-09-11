import { NextRequest, NextResponse } from 'next/server';
import { getDb, Collections } from '@/lib/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { getProjectByApiKey } from '@/lib/db';
import { ensureBigQuerySchema } from '@/lib/gcp/bigquery';

// Flag to ensure BigQuery schema is initialized once
let isBigQueryInitialized = false;

// Simple in-memory rate limiting for development
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
// This endpoint is PUBLIC and unauthenticated, and nothing ever removed entries, so the Map
// grew without bound - one entry per distinct (spoofable) IP until the instance OOMs.
const MAX_RATE_LIMIT_ENTRIES = 20_000;

function pruneRateLimitMap(now: number): void {
    for (const [key, info] of rateLimitMap) {
        if (now - info.lastReset > WINDOW_MS) {
            rateLimitMap.delete(key);
        }
    }
    // Hard ceiling in case traffic outpaces expiry: drop oldest-first.
    if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
        const excess = rateLimitMap.size - MAX_RATE_LIMIT_ENTRIES;
        let dropped = 0;
        for (const key of rateLimitMap.keys()) {
            rateLimitMap.delete(key);
            if (++dropped >= excess) break;
        }
    }
}
const RATE_LIMIT = 20; // 20 requests
const WINDOW_MS = 60 * 1000; // per minute

export async function POST(req: NextRequest) {
    try {
        // Ensure BigQuery schema is ready
        if (!isBigQueryInitialized && process.env.NODE_ENV !== 'development') {
            await ensureBigQuerySchema().catch(err =>
                console.error('[BigQuery Schema Error]:', err)
            );
            isBigQueryInitialized = true;
        }

        const body = await req.json();
        const { type, path, referrer, width, metrics, apiKey } = body;

        let ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
            req.headers.get('x-real-ip') ||
            'unknown';

        // Privacy: Mask IP (e.g. 192.168.1.123 -> 192.168.1.0)
        if (ip !== 'unknown' && ip.includes('.')) {
            const parts = ip.split('.');
            parts[parts.length - 1] = '0';
            ip = parts.join('.');
        } else if (ip !== 'unknown' && ip.includes(':')) {
            // IPv6 masking
            const parts = ip.split(':');
            parts[parts.length - 1] = '0000';
            ip = parts.join(':');
        }

        // Basic Rate Limiting
        const now = Date.now();
        pruneRateLimitMap(now);
        const rateInfo = rateLimitMap.get(ip) || { count: 0, lastReset: now };

        if (now - rateInfo.lastReset > WINDOW_MS) {
            rateInfo.count = 0;
            rateInfo.lastReset = now;
        }

        if (rateInfo.count >= RATE_LIMIT) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        rateInfo.count++;
        rateLimitMap.set(ip, rateInfo);

        if (!apiKey) {
            return NextResponse.json({ error: 'Missing apiKey' }, { status: 400 });
        }

        // Verify API Key (or allow internal dashboard key)
        let projectId = '';
        const isInternal = apiKey === 'deployify-dashboard-internal';

        if (isInternal) {
            projectId = 'deployify-dashboard';
        } else {
            const project = await getProjectByApiKey(apiKey);
            if (!project) {
                return NextResponse.json({ error: 'Invalid apiKey' }, { status: 401 });
            }
            projectId = project.id;
        }

        const userAgent = req.headers.get('user-agent') || 'unknown';

        const eventData = {
            projectId,
            type: type || 'pageview',
            path: path || '/',
            referrer: referrer || '',
            width: width || 0,
            metrics: metrics || null,
            ip,
            userAgent,
            timestamp: FieldValue.serverTimestamp(),
        };

        const db = getDb();
        await db.collection(Collections.ANALYTICS_EVENTS).add(eventData);

        // BigQuery DUAL-WRITE
        const { streamEventToBigQuery } = await import('@/lib/gcp/bigquery');
        streamEventToBigQuery({
            ...eventData,
            source: 'client',
            timestamp: new Date().toISOString(),
            metrics: metrics || null,
        }).catch(err => console.error('[BigQuery Dual-Write Error]:', err));

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error('In-house collector error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// OPTIONS for CORS if needed for cross-domain tracking
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

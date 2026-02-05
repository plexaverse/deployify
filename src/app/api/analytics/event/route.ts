import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const ip = req.headers.get('x-forwarded-for') || (req as any).ip;
  const userAgent = req.headers.get('user-agent');

  const plausibleUrl = 'https://plausible.io/api/event';

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (userAgent) headers.set('User-Agent', userAgent);
  if (ip) headers.set('X-Forwarded-For', ip);

  try {
    const response = await fetch(plausibleUrl, {
      method: 'POST',
      headers,
      body,
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
      },
    });

  } catch (error) {
    console.error('Plausible proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

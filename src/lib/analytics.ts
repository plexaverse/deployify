
export interface AnalyticsStats {
    aggregate: {
        visitors: { value: number };
        pageviews: { value: number };
        bounce_rate: { value: number };
        visit_duration: { value: number };
    };
    timeseries: Array<{
        date: string;
        visitors: number;
        pageviews: number;
    }>;
    sources: Array<{
        source: string;
        visitors: number;
    }>;
}

export async function getAnalyticsStats(
    siteId: string,
    period: string = '30d',
    apiKey?: string
): Promise<AnalyticsStats | null> {
    const PLAUSIBLE_API_URL = 'https://plausible.io/api/v1';
    const key = apiKey || process.env.PLAUSIBLE_API_KEY;

    // Return mock data if no API key is present (for development)
    if (!key) {
        console.warn('No Plausible API key found, returning mock data.');
        return getMockData(period);
    }

    try {
        const headers = {
            'Authorization': `Bearer ${key}`,
        };

        const [aggregateRes, timeseriesRes, sourcesRes] = await Promise.all([
            fetch(`${PLAUSIBLE_API_URL}/stats/aggregate?site_id=${siteId}&period=${period}&metrics=visitors,pageviews,bounce_rate,visit_duration`, { headers }),
            fetch(`${PLAUSIBLE_API_URL}/stats/timeseries?site_id=${siteId}&period=${period}&metrics=visitors,pageviews`, { headers }),
            fetch(`${PLAUSIBLE_API_URL}/stats/breakdown?site_id=${siteId}&period=${period}&property=visit:source&limit=5`, { headers }),
        ]);

        if (!aggregateRes.ok || !timeseriesRes.ok || !sourcesRes.ok) {
            console.error('Failed to fetch analytics from Plausible', {
                aggregate: aggregateRes.status,
                timeseries: timeseriesRes.status,
                sources: sourcesRes.status
            });
            // If the site doesn't exist in Plausible yet, this might fail.
            // We can return null or mock data. For now, null to indicate no data or error.
            return null;
        }

        const aggregate = await aggregateRes.json();
        const timeseries = await timeseriesRes.json();
        const sources = await sourcesRes.json();

        return {
            aggregate: aggregate.results,
            timeseries: timeseries.results,
            sources: sources.results,
        };
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return null;
    }
}

function getMockData(period: string): AnalyticsStats {
    // Generate last 30 days (or generic period)
    const days = 30;
    const timeseries = Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));
        return {
            date: date.toISOString().split('T')[0],
            visitors: Math.floor(Math.random() * 100) + 20,
            pageviews: Math.floor(Math.random() * 200) + 50,
        };
    });

    const totalVisitors = timeseries.reduce((acc, curr) => acc + curr.visitors, 0);
    const totalPageviews = timeseries.reduce((acc, curr) => acc + curr.pageviews, 0);

    return {
        aggregate: {
            visitors: { value: totalVisitors },
            pageviews: { value: totalPageviews },
            bounce_rate: { value: 45 + Math.random() * 10 },
            visit_duration: { value: 60 + Math.random() * 60 },
        },
        timeseries,
        sources: [
            { source: 'Google', visitors: Math.floor(totalVisitors * 0.4) },
            { source: 'Direct', visitors: Math.floor(totalVisitors * 0.3) },
            { source: 'Twitter', visitors: Math.floor(totalVisitors * 0.2) },
            { source: 'GitHub', visitors: Math.floor(totalVisitors * 0.05) },
            { source: 'Other', visitors: Math.floor(totalVisitors * 0.05) },
        ],
    };
}
export const trackEvent = async (eventName: string, props?: Record<string, any>) => {
  if (typeof window === 'undefined') {
    return; // Don't run on server side
  }

  try {
    const domain = window.location.hostname;
    // Plausible expects: n (name), u (url), d (domain), r (referrer), w (width), p (props)
    const payload = {
      n: eventName,
      u: window.location.href,
      d: domain,
      r: document.referrer,
      w: window.innerWidth,
      p: props,
    };

    await fetch('/api/analytics/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to track event:', error);
  }
};

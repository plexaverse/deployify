import { LighthouseMetrics } from '@/types';

export async function runLighthouseAudit(url: string): Promise<LighthouseMetrics> {
    const apiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    apiUrl.searchParams.set('url', url);
    apiUrl.searchParams.set('category', 'performance');
    // Default strategy is mobile, which is standard for ranking.

    try {
        const response = await fetch(apiUrl.toString());
        if (!response.ok) {
            throw new Error(`PageSpeed Insights API failed with status: ${response.status}`);
        }

        const data = await response.json();
        const lighthouse = data.lighthouseResult;
        const loadingExperience = data.loadingExperience;

        if (!lighthouse) {
            throw new Error('No Lighthouse data received');
        }

        // Extract metrics
        const audits = lighthouse.audits;

        // Helper to get numeric value safely
        const getMetric = (id: string): number => {
            return audits[id]?.numericValue || 0;
        };

        const performanceScore = lighthouse.categories.performance?.score || 0;
        const lcp = getMetric('largest-contentful-paint');
        const cls = getMetric('cumulative-layout-shift'); // This is unitless
        const tbt = getMetric('total-blocking-time');

        // FID is a field metric (CrUX). It might be in loadingExperience if the URL has traffic history.
        let fid: number | null = null;
        if (loadingExperience?.metrics?.FIRST_INPUT_DELAY_MS) {
            fid = loadingExperience.metrics.FIRST_INPUT_DELAY_MS.percentile;
        }

        return {
            performanceScore,
            lcp,
            cls,
            fid,
            tbt
        };
    } catch (error) {
        console.error('Lighthouse audit failed:', error);
        throw error;
    }
}

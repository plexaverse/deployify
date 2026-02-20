import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import { runLighthouseAudit } from './lighthouse';

describe('runLighthouseAudit', () => {
    // Save original fetch
    const originalFetch = global.fetch;

    afterEach(() => {
        mock.reset();
        global.fetch = originalFetch;
    });

    it('should parse PageSpeed Insights response correctly', async () => {
        // Mock global fetch
        const mockResponse = {
            lighthouseResult: {
                categories: {
                    performance: { score: 0.95 }
                },
                audits: {
                    'largest-contentful-paint': { numericValue: 1200 },
                    'cumulative-layout-shift': { numericValue: 0.05 },
                    'total-blocking-time': { numericValue: 30 }
                }
            },
            loadingExperience: {
                metrics: {
                    FIRST_INPUT_DELAY_MS: { percentile: 12 }
                }
            }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        global.fetch = mock.fn(async (url: any) => {
            assert.ok(url.toString().includes('googleapis.com/pagespeedonline/v5/runPagespeed'));
            return {
                ok: true,
                json: async () => mockResponse
            };
        });

        const metrics = await runLighthouseAudit('https://example.com');

        assert.strictEqual(metrics.performanceScore, 0.95);
        assert.strictEqual(metrics.lcp, 1200);
        assert.strictEqual(metrics.cls, 0.05);
        assert.strictEqual(metrics.fid, 12);
        assert.strictEqual(metrics.tbt, 30);
    });

    it('should handle missing fields gracefully', async () => {
        const mockResponse = {
            lighthouseResult: {
                categories: {}, // Missing performance
                audits: {} // Missing audits
            }
            // Missing loadingExperience
        };

        global.fetch = mock.fn(async () => ({
            ok: true,
            json: async () => mockResponse
        }));

        const metrics = await runLighthouseAudit('https://example.com');

        assert.strictEqual(metrics.performanceScore, 0);
        assert.strictEqual(metrics.lcp, 0);
        assert.strictEqual(metrics.cls, 0);
        assert.strictEqual(metrics.fid, null);
        assert.strictEqual(metrics.tbt, 0);
    });

    it('should throw on API error', async () => {
        global.fetch = mock.fn(async () => ({
            ok: false,
            status: 429
        }));

        await assert.rejects(
            async () => await runLighthouseAudit('https://example.com'),
            /PageSpeed Insights API failed/
        );
    });
});

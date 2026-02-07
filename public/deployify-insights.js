(function () {
    'use strict';

    // Get configuration from script tag
    const script = document.currentScript;

    // Initialize state
    const config = {
        endpoint: script ? script.getAttribute('data-api-endpoint') || '/api/v1/collect' : '/api/v1/collect',
        apiKey: script ? script.getAttribute('data-api-key') : null,
    };

    if (!config.apiKey) {
        console.warn('[Deployify Insights] Missing data-api-key. Tracking disabled.');
        return;
    }

    // Performance Metrics Storage
    const metrics = {
        lcp: null,
        cls: 0,
        fid: null,
        fcp: null,
        ttfb: null
    };

    const trackEvent = async (type, data = {}) => {
        const payload = {
            apiKey: config.apiKey,
            type,
            path: window.location.pathname,
            referrer: document.referrer,
            width: window.innerWidth,
            ...data,
            timestamp: new Date().toISOString()
        };

        if (navigator.sendBeacon) {
            const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon(config.endpoint, blob);
        } else {
            fetch(config.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(() => { });
        }
    };

    // Web Vitals Capturing
    try {
        // TTFB
        if (performance.getEntriesByType('navigation').length > 0) {
            metrics.ttfb = performance.getEntriesByType('navigation')[0].responseStart;
        }

        // FCP and LCP
        const paintObserver = new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                if (entry.name === 'first-contentful-paint') {
                    metrics.fcp = entry.startTime;
                }
                if (entry.entryType === 'largest-contentful-paint') {
                    metrics.lcp = entry.startTime;
                }
            }
        });
        paintObserver.observe({ type: 'paint', buffered: true });
        paintObserver.observe({ type: 'largest-contentful-paint', buffered: true });

        // CLS
        const clsObserver = new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                if (!entry.hadRecentInput) {
                    metrics.cls += entry.value;
                }
            }
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });

        // FID
        const fidObserver = new PerformanceObserver((entryList) => {
            for (const entry of entryList.getEntries()) {
                metrics.fid = entry.processingStart - entry.startTime;
            }
        });
        fidObserver.observe({ type: 'first-input', buffered: true });

    } catch (e) {
        console.warn('[Deployify Insights] Web Vitals capture not supported or failed:', e);
    }

    // Capture initial pageview
    if (document.readyState === 'complete') {
        trackEvent('pageview');
    } else {
        window.addEventListener('load', () => trackEvent('pageview'));
    }

    // Capture vitals on visibility change (hidden)
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            trackEvent('vitals', { metrics });
        }
    });

    // Handle History API changes (for SPAs)
    let lastPath = window.location.pathname;
    const observer = new MutationObserver(() => {
        if (window.location.pathname !== lastPath) {
            lastPath = window.location.pathname;
            trackEvent('pageview');
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }

})();

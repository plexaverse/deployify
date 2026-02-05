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

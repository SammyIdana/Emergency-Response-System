// Simple analytics event logger (console-based, can be swapped for real analytics)
export function logEvent(event, data = {}) {
  // For real analytics, integrate Google Analytics, Mixpanel, etc. here
  // Example: window.gtag('event', event, data);
  // For now, just log to console
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[Analytics] ${event}`, data);
  }
}

import React, { useEffect, useRef } from 'react';
import { useConsent } from '../../contexts/ConsentContext';

const MEASUREMENT_ID = 'G-4MDFWPMV5H';

export const GoogleAnalytics: React.FC = () => {
  const { hasConsent } = useConsent();
  const injectedRef = useRef(false);

  useEffect(() => {
    if (!hasConsent('analytics')) return;
    // If already initialized in this session or by another source, avoid re-injecting
    if (injectedRef.current || (window as any).gtag || document.querySelector(`script[src^="https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"]`)) {
      injectedRef.current = true;
      // send page_view on nav changes
      if ((window as any).gtag) {
        (window as any).gtag('event', 'page_view', {
          page_path: window.location.pathname,
          page_location: window.location.href,
          page_title: document.title,
        });
      }
      return;
    }
    // inject GA scripts once
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    script.setAttribute('data-gtag-id', MEASUREMENT_ID);
    document.head.appendChild(script);

    (window as any).dataLayer = (window as any).dataLayer || [];
    function gtag(){ (window as any).dataLayer.push(arguments); }
    (window as any).gtag = gtag;
    gtag('js', new Date());
    // EU-friendly options: anonymize IP and disable ads personalization signals
    gtag('config', MEASUREMENT_ID, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_path: window.location.pathname,
    });

    const onPop = () => {
      if ((window as any).gtag) {
        (window as any).gtag('event', 'page_view', {
          page_path: window.location.pathname,
          page_location: window.location.href,
          page_title: document.title,
        });
      }
    };
    window.addEventListener('popstate', onPop);
    injectedRef.current = true;
    return () => window.removeEventListener('popstate', onPop);
  }, [hasConsent]);

  return null;
};

import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Custom HTML template (web only). Two jobs:
 *   1. Inject Expo's scroll-view reset (so RN ScrollView styles apply correctly).
 *   2. Style scrollbars to be slim and theme-friendly. Default OS scrollbars on
 *      web look out of place on a phone-sized layout — we hide the system bar
 *      on `body` and render thin auto-hiding bars inside scroll containers.
 *
 * On iOS/Android this file is ignored; native ScrollView indicators are turned
 * off via the wrapper components instead (`showsVerticalScrollIndicator={false}`).
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: SCROLLBAR_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const SCROLLBAR_CSS = `
  /* Hide the document-level scrollbar — the page scrolls inside RN scrollers. */
  html, body {
    scrollbar-width: none;
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  /* Slim, auto-hiding scrollbar for inner scrollable regions (Firefox). */
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 196, 0, 0.4) transparent;
  }

  /* Webkit (Chrome / Safari / mobile-Safari) — thin track, themed thumb. */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(255, 196, 0, 0.35);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 196, 0, 0.55);
  }
  ::-webkit-scrollbar-corner {
    background: transparent;
  }
`;

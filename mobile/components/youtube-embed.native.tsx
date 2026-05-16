import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildYouTubeEmbedSrc } from '@/lib/youtube';

interface Props {
  url: string;
  width?: number | string;
  autoplay?: boolean;
}

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36';

/** baseUrl is what document.origin / referrer report to YouTube. Has to be
 *  a real https://… host that YouTube recognises (any well-formed origin
 *  works — we use the app's own domain). Loading the embed URL directly
 *  as the top frame instead trips YouTube's "Video player configuration
 *  error" (code 153) because there's no embedding context for it to
 *  validate against. */
const EMBED_HOST_ORIGIN = 'https://pumpshinsa.com';

function buildEmbedHtml(src: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
    .frame { position: absolute; inset: 0; }
    iframe { width: 100%; height: 100%; border: 0; display: block; background: #000; }
  </style>
</head>
<body>
  <div class="frame">
    <iframe
      src="${src}"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="origin"
    ></iframe>
  </div>
</body>
</html>`;
}

/**
 * Native YouTube embed: renders the player iframe inside a tiny HTML
 * shell loaded at `EMBED_HOST_ORIGIN`. The web counterpart
 * (`youtube-embed.tsx`) just emits a real `<iframe>` since the browser
 * already provides a valid embedding origin.
 */
export function YouTubeEmbed({ url, autoplay = false }: Props) {
  const src = buildYouTubeEmbedSrc(url, { autoplay });
  const html = useMemo(() => (src ? buildEmbedHtml(src) : ''), [src]);
  if (!src) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.aspect}>
        <WebView
          source={{ html, baseUrl: EMBED_HOST_ORIGIN }}
          originWhitelist={['https://*', 'http://*']}
          style={styles.web}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          // Default Android WebView UA includes "wv" which YouTube treats
          // as an embedded shell and sometimes refuses — pin a standard
          // Chrome UA so the player loads identically to a browser tab.
          userAgent={CHROME_UA}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' },
  aspect: { width: '100%', aspectRatio: 16 / 9 },
  web: { flex: 1, backgroundColor: '#000' },
});

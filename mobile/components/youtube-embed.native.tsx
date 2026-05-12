import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildYouTubeEmbedSrc } from '@/lib/youtube';

interface Props {
  url: string;
  width?: number | string;
  autoplay?: boolean;
}

/**
 * Native YouTube embed: renders a `WebView` pointing at YouTube's embed URL.
 * The web counterpart (`youtube-embed.tsx`) renders a real `<iframe>`.
 */
export function YouTubeEmbed({ url, autoplay = false }: Props) {
  const src = buildYouTubeEmbedSrc(url, { autoplay });
  if (!src) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.aspect}>
        <WebView
          source={{ uri: src }}
          style={styles.web}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
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

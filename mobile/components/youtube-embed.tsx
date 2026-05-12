import { createElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { buildYouTubeEmbedSrc } from '@/lib/youtube';

interface Props {
  url: string;
  /** Maximum width hint — defaults to 100% of parent. */
  width?: number | string;
  /** Begin playback automatically. Used for replay modals. */
  autoplay?: boolean;
}

/**
 * Web-only YouTube embed: renders an `<iframe>` via React's createElement so
 * react-native-web passes it through to the DOM. The corresponding native file
 * (`youtube-embed.native.tsx`) renders a WebView for iOS/Android.
 */
export function YouTubeEmbed({ url, autoplay = false }: Props) {
  const src = buildYouTubeEmbedSrc(url, { autoplay });
  if (!src) return null;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.aspect} onPress={(e) => e.stopPropagation?.()}>
        {createElement('iframe', {
          src,
          frameBorder: 0,
          allowFullScreen: true,
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          style: { width: '100%', height: '100%', border: 0, display: 'block' },
          title: 'YouTube video',
        })}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' },
  aspect: { width: '100%', aspectRatio: 16 / 9 },
});

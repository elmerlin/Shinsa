import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { noticesApi } from '@/lib/api';
import type { ThemeColors } from '@/constants/theme';

function formatDate(input?: string): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString();
}

export function NoticeBoard() {
  const s = useThemedStyles(makeStyles);
  const { data } = useQuery({
    queryKey: ['notices'],
    queryFn: () => noticesApi.list(),
  });

  const notices = data ?? [];
  if (notices.length === 0) return null;

  return (
    <View style={s.container}>
      {notices.map((n) => {
        const pinned = !!n.pinned;
        return (
          <View key={String(n.id)} style={s.row}>
            <Text style={[s.tag, pinned && s.tagPinned]}>{pinned ? 'PINNED' : 'NOTICE'}</Text>
            <Text style={s.title} numberOfLines={1}>{n.title || 'Untitled notice'}</Text>
            <Text style={s.date}>{formatDate(n.created_at)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (t: ThemeColors) => ({
  container: { gap: 6 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: t.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    borderRadius: 10,
  },
  tag: { fontSize: 10, fontWeight: '800' as const, color: t.textDim, letterSpacing: 0.5 },
  tagPinned: { color: t.accent },
  title: { flex: 1, fontSize: 13, color: t.text },
  date: { fontSize: 11, color: t.textDim },
});

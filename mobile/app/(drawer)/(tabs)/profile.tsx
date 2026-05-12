import { ActivityIndicator, View } from 'react-native';
import { ProfileBody } from '@/app/profile/[id]';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/contexts/theme-context';

/**
 * Profile tab — reuses the same `ProfileBody` rendered by `/profile/[id]`,
 * just bound to the current user's id so visiting the tab shows your own
 * profile with the same UI other users see. Theme + logout live on the side
 * drawer's "My Account" entry.
 */
export default function ProfileTab() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

  if (loading || !user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
        {loading ? <ActivityIndicator color={theme.spinner} /> : null}
      </View>
    );
  }

  return <ProfileBody lookup={user.id} />;
}

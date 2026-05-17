import type { ApiClient } from './client';

// ────────────────────────────────────────────────────────────────────────
// Venue / checkin data types — mirror the server's /api/checkins/* shapes
// in server/routes/checkins.js. Keep field names verbatim so the mobile
// client doesn't have to translate.
// ────────────────────────────────────────────────────────────────────────

export interface VenueMachine {
  id: string;
  venue_id: string;
  name: string;
  position?: number;
  sort_order?: number;
}

export interface Venue {
  id: string;
  slug: string;
  name: string;
  latitude?: number;
  longitude?: number;
  proximity_radius_m?: number;
  machines: VenueMachine[];
}

export interface ActiveCheckin {
  user_id: string;
  machine_id: string;
  checked_in_at: string;
  username: string;
  avatar?: string;
  avatar_v?: number;
  gender?: string;
  skill_title?: string;
  pumbility?: number;
}

export interface ActiveCheckinsResponse {
  venue: Venue;
  machines: VenueMachine[];
  activeCheckins: ActiveCheckin[];
}

export interface MyCheckin {
  id: string;
  venue_id: string;
  machine_id: string;
  checked_in_at: string;
  venue_name: string;
  venue_slug: string;
  venue_latitude?: number;
  venue_longitude?: number;
  proximity_radius_m?: number;
  machine_name: string;
  machine_position?: number;
}

export interface MyStatusResponse {
  checked_in: boolean;
  checkin: MyCheckin | null;
  playing_status: string;
}

export interface CheckinResult {
  id: string;
  status: string;
  machine_name: string;
}

export interface ProximityRequest {
  latitude: number;
  longitude: number;
  accuracy?: number;
  client_session_id: string;
}

/**
 * Possible response shapes from POST /proximity.
 *   - When the user is checked in AND their client_session_id matches the
 *     server's record for that checkin, `tracked: true` and the full
 *     proximity payload comes back.
 *   - Otherwise `tracked: false` plus a `reason` string explaining why
 *     (no coordinates on the venue, mismatched session id, etc.).
 */
export type ProximityResponse =
  | {
      checked_in: true;
      tracked: true;
      venue_slug: string;
      venue_name: string;
      machine_name: string;
      is_near: boolean;
      distance_m: number;
      radius_m: number;
      effective_radius_m: number;
      last_near_venue_at: string | null;
      auto_checkout_at: string | null;
      auto_checked_out?: boolean;
    }
  | {
      checked_in: boolean;
      tracked: false;
      reason:
        | 'not_checked_in'
        | 'venue_missing_coordinates'
        | 'client_session_required'
        | 'different_client_session'
        | 'client_session_unclaimed';
      venue_slug?: string;
      venue_name?: string;
      machine_name?: string;
    };

export interface CheckinHistoryItem {
  id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  venue_name: string;
  venue_slug: string;
  machine_name: string;
}

export interface CheckinHistoryStats {
  total_sessions: number;
  total_hours: number;
  avg_session_minutes: number;
  week_sessions: number;
  week_hours: number;
  month_sessions: number;
  month_hours: number;
}

export interface CheckinHistoryResponse {
  checkins: CheckinHistoryItem[];
  stats: CheckinHistoryStats;
}

export interface NotificationPrefs {
  venue_id: string;
  venue_slug: string;
  subscribed: boolean;
  notify_checkins: boolean;
  notify_checkouts: boolean;
}

export interface VenueAccessSubscription {
  id: string;
  plan_name: string;
  subscription_cadence_label: string;
  current_period_end: string;
}

export interface VenueAccessDayPass {
  id: string;
  pass_date: string;
  plan_name: string;
  status: 'active' | 'used';
}

export interface VenueAccessDiscount {
  discount_percent: number;
  applies_to: 'all' | 'monthly' | 'day_pass';
  note?: string;
}

export interface MyVenueAccess {
  has_access: boolean;
  access_type: 'monthly' | 'day_pass' | null;
  subscription: VenueAccessSubscription | null;
  day_passes: VenueAccessDayPass[];
  discounts: VenueAccessDiscount[];
}

export function createCheckinsApi(client: ApiClient) {
  return {
    venues() {
      return client.request<Venue[]>('/api/checkins/venues');
    },
    activeCheckins(venueSlug: string) {
      return client.request<ActiveCheckinsResponse>(
        `/api/checkins/active/${encodeURIComponent(venueSlug)}`,
      );
    },
    myStatus() {
      return client.request<MyStatusResponse>('/api/checkins/my-status');
    },
    checkin(payload: { venue_id: string; machine_id: string; client_session_id: string }) {
      return client.request<CheckinResult>('/api/checkins/checkin', {
        method: 'POST',
        body: payload,
      });
    },
    checkout() {
      return client.request<{ success: true }>('/api/checkins/checkout', {
        method: 'POST',
        body: {},
      });
    },
    proximity(payload: ProximityRequest) {
      return client.request<ProximityResponse>('/api/checkins/proximity', {
        method: 'POST',
        body: payload,
      });
    },
    history() {
      return client.request<CheckinHistoryResponse>('/api/checkins/history');
    },
    notificationPrefs(venueSlug: string) {
      return client.request<NotificationPrefs>(
        `/api/checkins/notifications/${encodeURIComponent(venueSlug)}`,
      );
    },
    updateNotificationPrefs(
      venueSlug: string,
      payload: { notify_checkins?: boolean; notify_checkouts?: boolean },
    ) {
      return client.request<NotificationPrefs>(
        `/api/checkins/notifications/${encodeURIComponent(venueSlug)}`,
        { method: 'PUT', body: payload },
      );
    },
    /** Read-only membership status — purchase flow stays on web. */
    myVenueAccess(venueSlug: string) {
      return client.request<MyVenueAccess>(
        `/api/venue-access/my-access/${encodeURIComponent(venueSlug)}`,
      );
    },
  };
}

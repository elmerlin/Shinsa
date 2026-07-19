import type { ApiClient } from './client';

// Dojo fridge tab — mirrors server/routes/fridge.js. Honor-system tab for the
// mini fridge at the dojo; settles in one Square quick-pay checkout.

export interface FridgeItem {
  id: number;
  name: string;
  emoji: string;
  price_pence: number;
}

export interface FridgeTabEntry {
  id: number;
  item_id: number | null;
  item_name: string;
  emoji: string;
  price_pence: number;
  qty: number;
  created_at: string;
  settling_payment_id: number | null;
}

export interface FridgeTab {
  entries: FridgeTabEntry[];
  total_pence: number;
  settling: boolean;
}

export interface FridgePaymentHistoryRow {
  id: number;
  amount_pence: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

// --- Admin: every open tab (admins + dojo_admin only) ---

export interface FridgeAdminTabEntry {
  id: number;
  item_name: string;
  emoji: string;
  price_pence: number;
  qty: number;
  /** price_pence × qty */
  line_pence: number;
  created_at: string;
  /** Locked by an in-flight Square checkout. */
  settling: boolean;
}

export interface FridgeAdminTab {
  user_id: string;
  username: string;
  avatar: string;
  total_pence: number;
  /** Portion of total_pence locked by an in-flight settle. */
  settling_pence: number;
  item_count: number;
  entry_count: number;
  oldest_entry_at: string;
  newest_entry_at: string;
  settling: boolean;
  entries: FridgeAdminTabEntry[];
}

export interface FridgeAdminSettlement {
  id: number;
  user_id: string;
  username: string;
  amount_pence: number;
  paid_at: string | null;
}

export interface FridgeAdminTabsResponse {
  /** Open tabs, biggest debt first. Users with nothing open are omitted. */
  tabs: FridgeAdminTab[];
  recent_settlements: FridgeAdminSettlement[];
  summary: {
    open_tab_count: number;
    total_owed_pence: number;
    settling_pence: number;
    entry_count: number;
    item_count: number;
  };
  min_settle_pence: number;
}

export function createFridgeApi(client: ApiClient) {
  return {
    items() {
      return client.request<{ items: FridgeItem[]; square_enabled: boolean; min_settle_pence: number }>('/api/fridge/items');
    },
    tab() {
      return client.request<FridgeTab & { history: FridgePaymentHistoryRow[] }>('/api/fridge/tab');
    },
    addToTab(itemId: number, qty = 1) {
      return client.request<FridgeTab>('/api/fridge/tab', {
        method: 'POST',
        body: { item_id: itemId, qty },
      });
    },
    removeEntry(entryId: number) {
      return client.request<FridgeTab>(`/api/fridge/tab/${entryId}`, { method: 'DELETE' });
    },
    settle() {
      return client.request<{ checkout_url: string; payment_id: number; amount_pence: number }>(
        '/api/fridge/settle',
        { method: 'POST', body: {} },
      );
    },
    reconcile() {
      return client.request<FridgeTab & { reconciled: number }>('/api/fridge/reconcile', {
        method: 'POST',
        body: {},
      });
    },
    /** Every open tab and what each person owes. Admin / dojo_admin only. */
    adminTabs() {
      return client.request<FridgeAdminTabsResponse>('/api/fridge/admin/tabs');
    },
  };
}

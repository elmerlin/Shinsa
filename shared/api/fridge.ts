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

export function createFridgeApi(client: ApiClient) {
  return {
    items() {
      return client.request<{ items: FridgeItem[]; square_enabled: boolean }>('/api/fridge/items');
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
  };
}

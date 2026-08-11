export interface OfflineQueueItem {
  id: string;
  type: 'CHECKIN' | 'VISITA' | 'FOTO_UPLOAD' | 'ROTA';
  payload: any;
  createdAt: string;
}

export class OfflineStorageService {
  private STORAGE_KEY = 'sobre_midia_offline_queue';

  getQueue(): OfflineQueueItem[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  enqueue(type: OfflineQueueItem['type'], payload: any): OfflineQueueItem {
    const queue = this.getQueue();
    const item: OfflineQueueItem = {
      id: `OFF-${crypto.randomUUID()}`,
      type,
      payload,
      createdAt: new Date().toISOString(),
    };
    queue.push(item);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
    return item;
  }

  clearQueue(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

export const offlineStorageService = new OfflineStorageService();

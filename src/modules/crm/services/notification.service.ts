export class PushNotificationService {
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  sendLocalNotification(title: string, body: string): void {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/pwa-192x192.png' });
    }
  }
}

export const pushNotificationService = new PushNotificationService();

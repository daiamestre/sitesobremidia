export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export class GeolocationService {
  async getCurrentPosition(): Promise<GPSCoordinates> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: -23.55052, longitude: -46.633308, accuracy: 10 });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => resolve({ latitude: -23.55052, longitude: -46.633308, accuracy: 10 })
      );
    });
  }
}

export const geolocationService = new GeolocationService();

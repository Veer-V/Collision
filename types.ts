
export interface SensorData {
  id: number; // 1=Left, 2=Right, 3=Back
  distance: number;
  lastUpdate: number;
}

export interface GpsData {
  lat: number;
  lng: number;
  valid: boolean;
  lastUpdate: number;
}

export interface BikeState {
  leftDanger: boolean;
  rightDanger: boolean;
  backDanger: boolean;
  sensors: Record<number, SensorData>;
  gps: GpsData;
  isConnected: boolean;
}

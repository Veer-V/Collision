
import React, { useState, useEffect, useRef } from 'react';
import { Shield, Navigation, AlertTriangle, Bluetooth, Wifi, MapPin, Activity, Zap, Radio } from 'lucide-react';
import BikeScene from './components/BikeScene';
import { BikeState, SensorData, GpsData } from './types';

// Fix: Define missing Web Bluetooth types to resolve TypeScript errors
type BluetoothDevice = any;
type BluetoothRemoteGATTCharacteristic = any;

// These UUIDs must match your ESP32 BLE code
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

const App: React.FC = () => {
  const [bikeState, setBikeState] = useState<BikeState>({
    leftDanger: false,
    rightDanger: false,
    backDanger: false,
    sensors: {
      1: { id: 1, distance: 999, lastUpdate: 0 },
      2: { id: 2, distance: 999, lastUpdate: 0 },
      3: { id: 3, distance: 999, lastUpdate: 0 },
    },
    gps: { lat: 0, lng: 0, valid: false, lastUpdate: 0 },
    isConnected: false,
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  // Fix: Reference defined BluetoothDevice type
  const bluetoothDeviceRef = useRef<BluetoothDevice | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 10));
    console.log("[BLE Log]:", msg);
  };

  const handleData = (event: Event) => {
    // Fix: Cast target to defined BluetoothRemoteGATTCharacteristic type
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;

    // Decoding the string from ESP32
    const decoder = new TextDecoder('utf-8');
    const line = decoder.decode(value).trim();
    if (!line) return;

    addLog(line);

    // Parsing Logic (Matches your ESP32 Serial output format)
    const sensorMatch = line.match(/ID (\d+): Distance = ([\d.]+) cm/);
    if (sensorMatch) {
      const id = parseInt(sensorMatch[1]);
      const distance = parseFloat(sensorMatch[2]);
      const threshold = 150.0; // CM
      const isDanger = distance < threshold && distance > 0;

      setBikeState(prev => {
        const updatedSensors = { ...prev.sensors };
        updatedSensors[id] = { id, distance, lastUpdate: Date.now() };

        return {
          ...prev,
          sensors: updatedSensors,
          leftDanger: id === 1 ? isDanger : prev.leftDanger,
          rightDanger: id === 2 ? isDanger : prev.rightDanger,
          backDanger: id === 3 ? isDanger : prev.backDanger,
        };
      });
    }

    const gpsMatch = line.match(/Lat: ([\d.-]+)\s+Lng: ([\d.-]+)/);
    if (gpsMatch) {
      setBikeState(prev => ({
        ...prev,
        gps: {
          lat: parseFloat(gpsMatch[1]),
          lng: parseFloat(gpsMatch[2]),
          valid: true,
          lastUpdate: Date.now()
        }
      }));
    }
  };

  const connectBluetooth = async () => {
    setIsConnecting(true);
    try {
      addLog("Requesting Bluetooth Device...");
      // Fix: Cast navigator to any to access the bluetooth property which may be missing from default types
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: 'BikeSafety' }],
        optionalServices: [SERVICE_UUID]
      });

      addLog(`Connecting to GATT Server: ${device.name}...`);
      bluetoothDeviceRef.current = device;
      
      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService(SERVICE_UUID);
      const characteristic = await service?.getCharacteristic(CHARACTERISTIC_UUID);

      if (characteristic) {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleData);
        setBikeState(prev => ({ ...prev, isConnected: true }));
        addLog("Bluetooth Link Established.");
      }

      device.addEventListener('gattserverdisconnected', () => {
        addLog("Device Disconnected.");
        setBikeState(prev => ({ ...prev, isConnected: false }));
      });

    } catch (err) {
      addLog("Error: " + (err as Error).message);
      setBikeState(prev => ({ ...prev, isConnected: false }));
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#050505] overflow-hidden text-white font-inter">
      {/* Header */}
      <header className="flex justify-between items-center px-8 py-5 border-b border-white/5 backdrop-blur-xl z-50 bg-black/40">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Shield className="text-blue-500 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-orbitron font-bold tracking-widest text-white/90 uppercase leading-none">
              Tesla <span className="text-blue-500">BikeOS</span>
            </h1>
            <span className="text-[10px] text-white/30 font-orbitron tracking-tighter uppercase">Safety Telemetry v3.0</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3 bg-white/5 px-4 py-1.5 rounded-full border border-white/10 shadow-inner">
            <Radio className={`${bikeState.isConnected ? 'text-green-500 animate-pulse' : 'text-red-500'} w-4 h-4`} />
            <span className="text-[10px] uppercase font-bold tracking-widest">
              {bikeState.isConnected ? 'Stream Active' : 'Radio Offline'}
            </span>
          </div>
          <button 
            onClick={connectBluetooth}
            disabled={isConnecting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-300 transform active:scale-95 ${
              bikeState.isConnected 
              ? 'bg-green-500/10 text-green-500 border border-green-500/30' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]'
            }`}
          >
            <Bluetooth className={`w-4 h-4 ${isConnecting ? 'animate-spin' : ''}`} />
            {isConnecting ? 'Searching...' : bikeState.isConnected ? 'Connected' : 'Pair Device'}
          </button>
        </div>
      </header>

      {/* Main UI */}
      <main className="flex-1 relative flex">
        {/* Left Side: Sensor Telemetry */}
        <div className="w-80 border-r border-white/5 p-6 flex flex-col gap-8 z-10 bg-gradient-to-b from-black/60 to-transparent backdrop-blur-md">
          <section>
            <h2 className="text-[11px] font-orbitron text-blue-400 uppercase tracking-[0.3em] flex items-center gap-2 mb-6">
              <Activity className="w-3.5 h-3.5" /> Proximity HUD
            </h2>
            
            <div className="space-y-4">
              {[
                { id: 1, label: 'Port Side', danger: bikeState.leftDanger },
                { id: 2, label: 'Starboard Side', danger: bikeState.rightDanger },
                { id: 3, label: 'Rear Zone', danger: bikeState.backDanger },
              ].map(sensor => (
                <div key={sensor.id} className={`group relative p-5 rounded-2xl border transition-all duration-500 ${
                  sensor.danger 
                  ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]' 
                  : 'bg-white/5 border-white/10 hover:border-white/20'
                }`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] text-white/40 uppercase font-bold tracking-widest">{sensor.label}</span>
                    <div className={`w-2 h-2 rounded-full ${sensor.danger ? 'bg-red-500 animate-ping' : 'bg-blue-500/50'}`} />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-orbitron font-bold tabular-nums ${sensor.danger ? 'text-red-400' : 'text-white'}`}>
                      {bikeState.sensors[sensor.id as keyof typeof bikeState.sensors].distance.toFixed(0)}
                    </span>
                    <span className="text-xs text-white/20 font-orbitron">CM</span>
                  </div>
                  <div className="mt-4 h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={`h-full transition-all duration-700 ease-out rounded-full ${sensor.danger ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.max(5, Math.min(100, (1 - bikeState.sensors[sensor.id as keyof typeof bikeState.sensors].distance / 400) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-auto">
            <h2 className="text-[10px] font-orbitron text-white/20 uppercase mb-4 tracking-[0.2em]">Telemetry Logs</h2>
            <div className="text-[9px] font-mono text-blue-400/50 leading-relaxed h-40 overflow-hidden bg-black/40 rounded-xl p-3 border border-white/5">
              {logs.length === 0 ? <div className="animate-pulse">Waiting for radio signal...</div> : logs.map((log, i) => <div key={i} className="truncate">{log}</div>)}
            </div>
          </section>
        </div>

        {/* Center: 3D Visualization Canvas */}
        <div className="flex-1 relative">
           <BikeScene state={bikeState} />
           
           {/* HUD Overlays */}
           <div className="absolute inset-0 pointer-events-none">
              <div className={`absolute left-0 top-1/4 bottom-1/4 w-1 transition-all duration-500 ${bikeState.leftDanger ? 'bg-red-500 shadow-[0_0_50px_red]' : 'bg-blue-500/10'}`} />
              <div className={`absolute right-0 top-1/4 bottom-1/4 w-1 transition-all duration-500 ${bikeState.rightDanger ? 'bg-red-500 shadow-[0_0_50px_red]' : 'bg-blue-500/10'}`} />
              <div className={`absolute bottom-0 left-1/4 right-1/4 h-1 transition-all duration-500 ${bikeState.backDanger ? 'bg-red-500 shadow-[0_0_50px_red]' : 'bg-blue-500/10'}`} />

              {/* Danger Warning Banner */}
              {(bikeState.leftDanger || bikeState.rightDanger || bikeState.backDanger) && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 px-10 py-4 bg-red-600/20 backdrop-blur-md text-red-500 font-bold font-orbitron tracking-[0.3em] rounded-2xl border-2 border-red-500/50 animate-pulse flex items-center gap-4 shadow-[0_0_80px_rgba(220,38,38,0.5)]">
                  <AlertTriangle className="w-8 h-8" /> 
                  <span className="text-xl">COLLISION ALERT</span>
                </div>
              )}
           </div>
        </div>

        {/* Right Side: GPS & Nav */}
        <div className="w-80 border-l border-white/5 p-6 flex flex-col gap-8 z-10 bg-gradient-to-b from-black/60 to-transparent backdrop-blur-md">
          <section>
            <h2 className="text-[11px] font-orbitron text-blue-400 uppercase tracking-[0.3em] flex items-center gap-2 mb-6">
              <Navigation className="w-3.5 h-3.5" /> Navigation
            </h2>

            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-6">
              <div className="flex items-center gap-3">
                 <div className={`w-2.5 h-2.5 rounded-full ${bikeState.gps.valid ? 'bg-green-500 shadow-[0_0_10px_green]' : 'bg-orange-500 animate-pulse'}`} />
                 <span className="text-[10px] uppercase font-bold tracking-widest text-white/60">
                    {bikeState.gps.valid ? 'GPS Locked' : 'Satellite Search'}
                 </span>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                  <label className="text-[9px] text-white/30 uppercase block mb-1 font-orbitron">Latitude</label>
                  <div className="text-lg font-orbitron text-white/80 tabular-nums">
                    {bikeState.gps.lat ? bikeState.gps.lat.toFixed(6) : '0.000000'}
                  </div>
                </div>
                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                  <label className="text-[9px] text-white/30 uppercase block mb-1 font-orbitron">Longitude</label>
                  <div className="text-lg font-orbitron text-white/80 tabular-nums">
                    {bikeState.gps.lng ? bikeState.gps.lng.toFixed(6) : '0.000000'}
                  </div>
                </div>
              </div>
              
              <div className="aspect-square rounded-2xl bg-[#0a0a0a] border border-white/5 relative flex items-center justify-center overflow-hidden group">
                <MapPin className={`w-12 h-12 transition-all duration-1000 ${bikeState.gps.valid ? 'text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]' : 'text-white/10'}`} />
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="w-full h-full bg-[radial-gradient(circle,rgba(59,130,246,0.5)_1.5px,transparent_1px)] bg-[size:15px_15px]" />
                </div>
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <span className="text-[9px] text-white/20 font-orbitron tracking-widest uppercase">Grid Position Ready</span>
                </div>
              </div>
            </div>
          </section>

          <section className="p-5 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center gap-5">
            <div className="p-3 bg-blue-500/20 rounded-xl">
               <Zap className="text-blue-400 w-6 h-6" />
            </div>
            <div>
              <div className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">Master Link</div>
              <div className="text-sm font-semibold text-white/80">Systems Optimized</div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-12 bg-black border-t border-white/5 px-8 flex items-center justify-between text-[10px] text-white/30 font-orbitron">
        <div className="flex gap-10 items-center">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span>ENCRYPTED BLE LINK</span>
          </div>
          <span>SIG_STRENGTH: -42DBM</span>
          <span>SENSORS: ONLINE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-blue-500/40">TESLA BIKE-OS V3.0.4</span>
          <div className="w-4 h-1 bg-blue-500/20 rounded-full overflow-hidden">
             <div className="h-full bg-blue-500 w-2/3 animate-[pulse_2s_infinite]" />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

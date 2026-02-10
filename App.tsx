import React, { useState, useEffect, useRef } from 'react';
import { Shield, Navigation, AlertTriangle, Bluetooth, Wifi, MapPin, Activity, Zap, Radio, Cpu, Usb, ExternalLink, Play, Square, Info, Terminal, Search, Camera, Waves } from 'lucide-react';
import BikeScene from './components/BikeScene';
import { BikeState, SensorData, GpsData } from './types';

type SerialPort = any;

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const MASTER_MAC = "D8:BC:38:F8:DC:D8";

const App: React.FC = () => {
  const [connectionMode, setConnectionMode] = useState<'BLE' | 'SERIAL'>('SERIAL');
  const [isSimulating, setIsSimulating] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showRawMonitor, setShowRawMonitor] = useState(false);
  
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
  const serialPortRef = useRef<SerialPort | null>(null);
  const simIntervalRef = useRef<number | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 50));
  };

  const processLine = (line: string) => {
    const cleanLine = line.trim();
    if (!cleanLine) return;

    // --- FUZZY SENSOR PARSING ---
    const sensorMatch = cleanLine.match(/(?:ID|Sensor|S)\s*(\d+)[:\s=]+([\d.]+)/i);
    if (sensorMatch) {
      const id = parseInt(sensorMatch[1]);
      const distance = parseFloat(sensorMatch[2]);
      
      if (id >= 1 && id <= 3) {
        const threshold = 150.0;
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
    }

    // --- FUZZY GPS PARSING ---
    const latMatch = cleanLine.match(/(?:Lat|Latitude|GPS)[:\s=]+([\d.-]+)/i);
    const lngMatch = cleanLine.match(/(?:Lng|Longitude|Lon)[:\s=]+([\d.-]+)/i);
    const commaGpsMatch = cleanLine.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);

    let lat = 0, lng = 0, found = false;

    if (latMatch && lngMatch) {
      lat = parseFloat(latMatch[1]);
      lng = parseFloat(lngMatch[1]); // Ensure correct index
      found = true;
    } else if (commaGpsMatch) {
      lat = parseFloat(commaGpsMatch[1]);
      lng = parseFloat(commaGpsMatch[2]);
      found = true;
    }
    
    if (found) {
      const hasFix = Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001;
      setBikeState(prev => ({
        ...prev,
        gps: { lat, lng, valid: hasFix, lastUpdate: Date.now() }
      }));
    }
  };

  const toggleSimulation = () => {
    if (isSimulating) {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
      setIsSimulating(false);
      setBikeState(prev => ({ ...prev, isConnected: false }));
      addLog("SIMULATION_TERMINATED");
    } else {
      setIsSimulating(true);
      setBikeState(prev => ({ ...prev, isConnected: true }));
      addLog("SIMULATION_INITIALIZED");
      setPermissionError(null);
      
      simIntervalRef.current = window.setInterval(() => {
        const mockId = Math.floor(Math.random() * 3) + 1;
        const mockDist = 50 + Math.random() * 350;
        processLine(`ID ${mockId}: ${mockDist.toFixed(2)} cm`);
        
        if (Math.random() > 0.9) {
          processLine(`Lat: ${34.0522 + Math.random()*0.001} Lng: ${-118.2437 + Math.random()*0.001}`);
        }
      }, 300);
    }
  };

  const connectSerial = async () => {
    setPermissionError(null);
    setIsConnecting(true);
    try {
      if (!('serial' in navigator)) throw new Error("Web Serial not supported.");
      
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setBikeState(prev => ({ ...prev, isConnected: true }));
      addLog("SERIAL_LINK_ESTABLISHED: COM7");

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();

      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";
        lines.forEach(line => {
          if (line.trim()) {
            addLog(`>> ${line.trim()}`);
            processLine(line.trim());
          }
        });
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("permissions policy")) {
        setPermissionError("IFRAME_RESTRICTION: Open in a new browser tab to connect hardware.");
      } else {
        addLog(`ERR: ${msg}`);
      }
      setBikeState(prev => ({ ...prev, isConnected: false }));
    } finally {
      setIsConnecting(false);
    }
  };

  const connectBluetooth = async () => {
    setPermissionError(null);
    setIsConnecting(true);
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: 'BikeSafety' }],
        optionalServices: [SERVICE_UUID]
      });
      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService(SERVICE_UUID);
      const characteristic = await service?.getCharacteristic(CHARACTERISTIC_UUID);

      if (characteristic) {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (e: any) => {
          const line = new TextDecoder().decode(e.target.value).trim();
          addLog(`BLE >> ${line}`);
          processLine(line);
        });
        setBikeState(prev => ({ ...prev, isConnected: true }));
        addLog("BLE_LINK_ACTIVE");
      }
    } catch (err) {
      addLog(`BLE_ERR: ${(err as Error).message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#020202] overflow-hidden text-white font-inter selection:bg-blue-500/30">
      {/* Permission Rescue Overlay */}
      {permissionError && (
        <div className="absolute inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#0a0a0a] border border-red-500/30 rounded-[2.5rem] p-10 shadow-[0_0_100px_rgba(239,68,68,0.15)] text-center">
            <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/20 animate-pulse">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-3xl font-orbitron font-bold mb-4 uppercase tracking-[0.2em]">Security Block</h2>
            <p className="text-white/50 text-sm leading-relaxed mb-10">
              Web Serial (COM7) is restricted inside preview frames. 
              <br/><br/>
              To bridge the hardware gap, use the <span className="text-blue-400 font-bold">Open in New Tab</span> icon in the top right.
            </p>
            <div className="space-y-4">
              <button 
                onClick={() => setPermissionError(null)}
                className="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                Dismiss Warning
              </button>
              <button 
                onClick={toggleSimulation}
                className="w-full py-5 bg-blue-600 hover:bg-blue-500 shadow-xl rounded-2xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-3 transition-all transform hover:scale-[1.02]"
              >
                <Play className="w-4 h-4" /> Run Virtual Simulator
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center px-10 py-6 border-b border-white/5 backdrop-blur-2xl z-50 bg-black/60">
        <div className="flex items-center gap-5">
          <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20 shadow-inner">
            <Shield className="text-blue-500 w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-orbitron font-bold tracking-[0.3em] text-white/90 uppercase leading-none">
              BIKE<span className="text-blue-500">SAFE</span> v3.4
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
               <div className={`w-1.5 h-1.5 rounded-full ${bikeState.isConnected ? 'bg-green-500 animate-pulse shadow-[0_0_8px_green]' : 'bg-red-500'}`} />
               <span className="text-[10px] text-white/30 font-orbitron tracking-tighter uppercase">SYSTEM_{bikeState.isConnected ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-8">
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
            <button 
              onClick={() => { setConnectionMode('SERIAL'); setPermissionError(null); }}
              className={`flex items-center gap-3 px-6 py-2 rounded-xl text-[10px] font-bold transition-all ${connectionMode === 'SERIAL' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/30 hover:text-white'}`}
            >
              <Usb className="w-4 h-4" /> COM7
            </button>
            <button 
              onClick={() => { setConnectionMode('BLE'); setPermissionError(null); }}
              className={`flex items-center gap-3 px-6 py-2 rounded-xl text-[10px] font-bold transition-all ${connectionMode === 'BLE' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/30 hover:text-white'}`}
            >
              <Bluetooth className="w-4 h-4" /> BLE
            </button>
          </div>

          <button 
            onClick={connectionMode === 'SERIAL' ? connectSerial : connectBluetooth}
            disabled={isConnecting || bikeState.isConnected || isSimulating}
            className={`flex items-center gap-3 px-8 py-3.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all duration-300 transform active:scale-95 ${
              bikeState.isConnected 
              ? 'bg-green-500/10 text-green-500 border border-green-500/30' 
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_30px_rgba(37,99,235,0.3)]'
            }`}
          >
            {isConnecting ? (
              <><Radio className="animate-spin w-4 h-4" /> Syncing</>
            ) : bikeState.isConnected ? (
              <><Wifi className="w-4 h-4" /> Linked</>
            ) : (
              <><Zap className="w-4 h-4" /> Initialize Link</>
            )}
          </button>
          
          <button 
            onClick={() => setShowRawMonitor(!showRawMonitor)}
            className={`p-3.5 rounded-2xl border transition-all ${showRawMonitor ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/10 text-white/30 hover:text-white'}`}
            title="Toggle Debug Console"
          >
            <Terminal className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main UI */}
      <main className="flex-1 relative flex">
        {/* Left Side: Telemetry */}
        <div className="w-[22rem] border-r border-white/5 p-8 flex flex-col gap-10 z-10 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-3xl">
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-[12px] font-orbitron text-blue-400 uppercase tracking-[0.4em] flex items-center gap-3">
                <Camera className="w-4 h-4" /> Vision HUD
              </h2>
              <div className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[8px] text-blue-400 font-bold uppercase">System Active</div>
            </div>
            
            <div className="space-y-5">
              {[
                { id: 1, label: 'Left Camera', danger: bikeState.leftDanger },
                { id: 2, label: 'Right Camera', danger: bikeState.rightDanger },
                { id: 3, label: 'Back Camera', danger: bikeState.backDanger },
              ].map(sensor => {
                const data = bikeState.sensors[sensor.id as keyof typeof bikeState.sensors];
                const age = Date.now() - data.lastUpdate;
                const isFresh = age < 2000;

                return (
                  <div key={sensor.id} className={`group relative p-6 rounded-[2rem] border transition-all duration-700 overflow-hidden ${
                    sensor.danger 
                    ? 'bg-red-500/20 border-red-500/60 shadow-[0_0_50px_rgba(239,68,68,0.2)]' 
                    : 'bg-white/[0.03] border-white/10'
                  }`}>
                    {/* Camera Scanline Overlay */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]" />
                    
                    <div className="flex justify-between items-start mb-4 relative z-10">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] text-white font-bold tracking-widest uppercase">{sensor.label}</span>
                           {isFresh && <div className="w-1 h-1 rounded-full bg-red-500 animate-pulse" title="Recording" />}
                        </div>
                        <span className={`text-[8px] uppercase mt-1 flex items-center gap-1 ${isFresh ? 'text-green-500/50' : 'text-white/10'}`}>
                          <Waves className="w-2.5 h-2.5" />
                          Ultrasonic Stream: {isFresh ? 'Active' : 'Offline'}
                        </span>
                      </div>
                      <div className={`w-3 h-3 rounded-full border-2 border-black ${sensor.danger ? 'bg-red-500 shadow-[0_0_15px_red] animate-pulse' : (isFresh ? 'bg-blue-500' : 'bg-white/10')}`} />
                    </div>
                    
                    <div className="flex flex-col relative z-10">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-orbitron font-bold tabular-nums ${sensor.danger ? 'text-red-400' : 'text-white'}`}>
                          {data.distance.toFixed(0)}
                        </span>
                        <span className="text-sm text-white/20 font-orbitron font-bold">CM</span>
                      </div>
                      <div className="text-[9px] font-orbitron text-white/20 uppercase tracking-widest mt-1">Obstacle Proximity</div>
                    </div>

                    <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-700 ${sensor.danger ? 'bg-red-500' : 'bg-blue-600'}`}
                          style={{ width: `${Math.max(5, Math.min(100, (1 - data.distance / 400) * 100))}%` }}
                        />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-auto relative">
             <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-orbitron text-white/20 uppercase tracking-[0.3em]">Neural Diagnostics</h2>
                <div className="flex gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                </div>
             </div>
            <div className="text-[10px] font-mono text-blue-400/40 leading-relaxed h-56 overflow-y-auto bg-black/40 rounded-3xl p-6 border border-white/5 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-white/10 italic">
                  <Search className="w-8 h-8 opacity-20" />
                  Scanning COM7 Interface...
                </div>
              ) : logs.map((log, i) => (
                <div key={i} className="mb-2 pb-2 border-b border-white/[0.02] flex gap-3">
                  <span className="text-white/10">[{new Date().toLocaleTimeString([], {hour12: false, second: '2-digit'})}]</span>
                  <span className="break-all">{log}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Center: 3D Visualization */}
        <div className="flex-1 relative bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.05)_0%,transparent_70%)]">
           <BikeScene state={bikeState} />
           
           <div className="absolute inset-0 pointer-events-none">
              <div className={`absolute left-0 top-0 bottom-0 w-2 transition-all duration-1000 ${bikeState.leftDanger ? 'bg-red-500 shadow-[20px_0_100px_red]' : 'bg-transparent'}`} />
              <div className={`absolute right-0 top-0 bottom-0 w-2 transition-all duration-1000 ${bikeState.rightDanger ? 'bg-red-500 shadow-[-20px_0_100px_red]' : 'bg-transparent'}`} />
              <div className={`absolute bottom-0 left-0 right-0 h-2 transition-all duration-1000 ${bikeState.backDanger ? 'bg-red-500 shadow-[0_-20px_100px_red]' : 'bg-transparent'}`} />

              {(bikeState.leftDanger || bikeState.rightDanger || bikeState.backDanger) && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-6 group">
                  <div className="px-12 py-6 bg-red-600/20 backdrop-blur-3xl text-red-500 font-bold font-orbitron tracking-[0.6em] rounded-full border-2 border-red-500/40 animate-pulse flex items-center gap-6 shadow-[0_0_120px_rgba(220,38,38,0.5)]">
                    <AlertTriangle className="w-12 h-12" /> 
                    <span className="text-3xl">EVASIVE ACTION REQUIRED</span>
                  </div>
                  <div className="px-6 py-2 bg-black/60 rounded-full border border-red-500/20 text-red-500/60 text-[10px] font-orbitron uppercase tracking-widest">System Safety Intervention</div>
                </div>
              )}
           </div>

           {/* Raw Data HUD */}
           {showRawMonitor && (
             <div className="absolute right-8 top-8 w-80 bg-black/95 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-6 z-[60] shadow-2xl animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <Terminal className="w-4 h-4 text-blue-500" />
                    <span className="text-[10px] font-orbitron font-bold uppercase tracking-widest">Serial Diagnostics</span>
                  </div>
                  <button onClick={() => setShowRawMonitor(false)} className="text-white/20 hover:text-white transition-colors">
                    <Square className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-4">
                   <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <div className="text-[9px] text-white/30 uppercase mb-2">Baud Rate Config</div>
                      <div className="text-xs font-mono text-green-500">115200 bps</div>
                   </div>
                   <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <div className="text-[9px] text-white/30 uppercase mb-2">Raw Data Stream</div>
                      <div className="h-40 overflow-hidden font-mono text-[9px] text-blue-400/60 leading-relaxed">
                         {logs.slice(0, 8).map((l, i) => <div key={i} className="truncate">{l}</div>)}
                      </div>
                   </div>
                </div>
             </div>
           )}
        </div>

        {/* Right Side: Navigation */}
        <div className="w-[22rem] border-l border-white/5 p-8 flex flex-col gap-10 z-10 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-3xl">
          <section>
            <h2 className="text-[12px] font-orbitron text-blue-400 uppercase tracking-[0.4em] flex items-center gap-3 mb-8">
              <Navigation className="w-4 h-4" /> Positioning
            </h2>

            <div className="p-7 rounded-[2.5rem] bg-white/[0.03] border border-white/10 space-y-8 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className={`w-3 h-3 rounded-full ${bikeState.gps.valid ? 'bg-green-500 shadow-[0_0_20px_green]' : 'bg-orange-500 animate-pulse'}`} />
                   <span className="text-[11px] uppercase font-bold tracking-[0.2em] text-white/60">
                      {bikeState.gps.valid ? 'Link Established' : 'Acquiring Fix'}
                   </span>
                </div>
                <Info className="w-4 h-4 text-white/10 hover:text-white/40 cursor-help transition-colors" />
              </div>
              
              <div className="space-y-4">
                <div className="bg-black/40 p-5 rounded-[1.5rem] border border-white/5 group transition-all hover:border-blue-500/30">
                  <label className="text-[10px] text-white/20 uppercase block mb-2 font-orbitron font-bold tracking-widest">Latitude</label>
                  <div className={`text-2xl font-orbitron tabular-nums tracking-wider ${bikeState.gps.valid ? 'text-white/90' : 'text-white/10'}`}>
                    {bikeState.gps.lat ? bikeState.gps.lat.toFixed(6) : '0.000000'}
                  </div>
                </div>
                <div className="bg-black/40 p-5 rounded-[1.5rem] border border-white/5 group transition-all hover:border-blue-500/30">
                  <label className="text-[10px] text-white/20 uppercase block mb-2 font-orbitron font-bold tracking-widest">Longitude</label>
                  <div className={`text-2xl font-orbitron tabular-nums tracking-wider ${bikeState.gps.valid ? 'text-white/90' : 'text-white/10'}`}>
                    {bikeState.gps.lng ? bikeState.gps.lng.toFixed(6) : '0.000000'}
                  </div>
                </div>
              </div>
              
              <div className="aspect-square rounded-[2rem] bg-[#050505] border border-white/5 relative flex items-center justify-center overflow-hidden">
                <MapPin className={`w-16 h-16 transition-all duration-1000 ${bikeState.gps.valid ? 'text-blue-500 drop-shadow-[0_0_30px_rgba(59,130,246,0.6)] scale-110' : 'text-white/5 scale-90 grayscale'}`} />
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="w-full h-full bg-[radial-gradient(circle,rgba(59,130,246,0.5)_2px,transparent_1.5px)] bg-[size:25px_25px]" />
                </div>
                {!bikeState.gps.valid && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-4 p-6 text-center">
                     <div className="w-8 h-8 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin" />
                     <span className="text-[10px] text-white/40 font-orbitron tracking-[0.2em] uppercase leading-relaxed">Outdoor GNSS Unlock Required</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="p-8 rounded-[2.5rem] bg-blue-600/10 border border-blue-500/20 flex items-center gap-6 mt-auto shadow-2xl">
            <div className="p-5 bg-blue-500/20 rounded-3xl shadow-inner">
               <Zap className="text-blue-400 w-8 h-8" />
            </div>
            <div>
              <div className="text-[12px] text-blue-400 uppercase font-bold tracking-[0.3em] mb-1">Cortex Master</div>
              <div className="text-sm font-semibold text-white/80">Integrity: Optimal</div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-16 bg-black border-t border-white/5 px-10 flex items-center justify-between text-[11px] text-white/20 font-orbitron tracking-[0.2em]">
        <div className="flex gap-16 items-center">
          <div className="flex items-center gap-4">
            <div className={`w-2.5 h-2.5 rounded-full ${bikeState.isConnected ? 'bg-green-500 shadow-[0_0_15px_green] animate-pulse' : 'bg-white/5'}`} />
            <span>LINK_{bikeState.isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
          </div>
          <span className="hidden md:inline">HARDWARE: ESP32_GEN3</span>
          <span className="hidden md:inline">BUS: COM7@115200</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-blue-500/40 font-bold uppercase">BikeOS v3.4</span>
          <div className="w-10 h-2 bg-blue-500/10 rounded-full overflow-hidden border border-white/5">
             <div className={`h-full bg-blue-500 transition-all duration-1000 ${bikeState.isConnected ? 'w-full shadow-[0_0_10px_blue]' : 'w-0'}`} />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
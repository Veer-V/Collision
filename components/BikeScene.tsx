
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Stars, Environment, Float, Text, RoundedBox, ContactShadows, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { BikeState } from '../types';

// Define local capitalized aliases for Three.js intrinsic elements.
// This avoids augmenting the global JSX.IntrinsicElements namespace, which was
// causing standard HTML elements (like div, span, h1, header) to be missing from
// the JSX type definitions in the entire project.
const Group = 'group' as any;
const Mesh = 'mesh' as any;
const PlaneGeometry = 'planeGeometry' as any;
const MeshStandardMaterial = 'meshStandardMaterial' as any;
const GridHelper = 'gridHelper' as any;
const BoxGeometry = 'boxGeometry' as any;
const PointLight = 'pointLight' as any;
const SphereGeometry = 'sphereGeometry' as any;
const AmbientLight = 'ambientLight' as any;
const SpotLight = 'spotLight' as any;

interface SceneProps {
  state: BikeState;
}

const Road = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.position.z += delta * 18;
      if (meshRef.current.position.z > 20) meshRef.current.position.z = 0;
    }
  });

  return (
    // Fixed: Using local Group and Mesh components to avoid JSX intrinsic element errors
    <Group>
      <Mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <PlaneGeometry args={[30, 150]} />
        <MeshStandardMaterial color="#050505" metalness={0.8} roughness={0.2} />
        <GridHelper args={[30, 20, 0x222222, 0x111111]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.01]} />
      </Mesh>
    </Group>
  );
};

const BikeModel = ({ state }: { state: BikeState }) => {
  const group = useRef<THREE.Group>(null);

  useFrame((stateFrame) => {
    if (group.current) {
      group.current.position.y = -0.3 + Math.sin(stateFrame.clock.getElapsedTime() * 2) * 0.04;
      group.current.rotation.z = Math.sin(stateFrame.clock.getElapsedTime() * 0.8) * 0.02;
    }
  });

  return (
    // Fixed: Using local Group component
    <Group ref={group}>
      {/* Main Chassis */}
      <RoundedBox args={[0.5, 0.9, 2.6]} radius={0.08} smoothness={4}>
        <MeshStandardMaterial color="#0a0a0a" metalness={1} roughness={0.1} />
      </RoundedBox>
      
      {/* Visual Accents */}
      <Mesh position={[0, 0.5, 0.2]}>
        <BoxGeometry args={[0.55, 0.1, 1.8]} />
        <MeshStandardMaterial color="#2563eb" emissive="#2563eb" emissiveIntensity={0.2} />
      </Mesh>

      {/* Rear Light HUD */}
      <Mesh position={[0, 0.4, -1.35]}>
        <BoxGeometry args={[0.4, 0.15, 0.05]} />
        <MeshStandardMaterial 
            color={state.backDanger ? "#ff0000" : "#200000"} 
            emissive={state.backDanger ? "#ff0000" : "#100000"}
            emissiveIntensity={state.backDanger ? 20 : 0.2}
        />
      </Mesh>

      {/* Side Signal HUDs */}
      <Mesh position={[-0.35, 0.5, 0.6]}>
        <BoxGeometry args={[0.02, 0.1, 0.4]} />
        <MeshStandardMaterial 
            color={state.leftDanger ? "#f97316" : "#222"} 
            emissive={state.leftDanger ? "#f97316" : "#000"}
            emissiveIntensity={state.leftDanger ? 10 : 0}
        />
      </Mesh>

      <Mesh position={[0.35, 0.5, 0.6]}>
        <BoxGeometry args={[0.02, 0.1, 0.4]} />
        <MeshStandardMaterial 
            color={state.rightDanger ? "#f97316" : "#222"} 
            emissive={state.rightDanger ? "#f97316" : "#000"}
            emissiveIntensity={state.rightDanger ? 10 : 0}
        />
      </Mesh>

      {/* Underglow */}
      <PointLight position={[0, -0.6, 0]} intensity={2} color="#3b82f6" distance={5} />
    </Group>
  );
};

const DangerField = ({ id, distance, isActive }: { id: number, distance: number, isActive: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const position: [number, number, number] = useMemo(() => {
    const normDist = Math.max(0, distance / 50);
    if (id === 1) return [-3 - normDist, 0, 0.5];
    if (id === 2) return [3 + normDist, 0, 0.5];
    return [0, 0, -3 - normDist];
  }, [id, distance]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.lerp(new THREE.Vector3(...position), 0.1);
      const targetScale = isActive ? 1 + Math.sin(state.clock.elapsedTime * 10) * 0.1 : 0;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.2);
    }
    if (lightRef.current) {
        lightRef.current.intensity = isActive ? 10 + Math.sin(state.clock.elapsedTime * 20) * 5 : 0;
    }
  });

  return (
    <Group>
      <Mesh ref={meshRef}>
        <SphereGeometry args={[1, 32, 32]} />
        <MeshDistortMaterial 
          color="#ff0000" 
          speed={5} 
          distort={0.4} 
          transparent 
          opacity={0.4} 
          emissive="#ff0000" 
          emissiveIntensity={5} 
        />
      </Mesh>
      <PointLight ref={lightRef} position={position} color="#ff0000" distance={8} />
    </Group>
  );
};

const BikeScene: React.FC<SceneProps> = ({ state }) => {
  return (
    <div className="w-full h-full bg-[#050505]">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 8, 12]} fov={35} />
        
        <Stars radius={100} depth={50} count={6000} factor={4} saturation={0} fade speed={1.5} />
        <Environment preset="night" />
        
        <AmbientLight intensity={0.1} />
        <SpotLight position={[10, 20, 10]} angle={0.2} penumbra={1} intensity={2} castShadow color="#3b82f6" />
        
        <Road />
        <BikeModel state={state} />

        <DangerField id={1} distance={state.sensors[1].distance} isActive={state.leftDanger} />
        <DangerField id={2} distance={state.sensors[2].distance} isActive={state.rightDanger} />
        <DangerField id={3} distance={state.sensors[3].distance} isActive={state.backDanger} />

        <ContactShadows position={[0, -1, 0]} opacity={0.6} scale={10} blur={2} far={4} color="#000000" />

        <Float speed={3} rotationIntensity={0.2} floatIntensity={1}>
          <Text
            position={[0, 5, -8]}
            fontSize={0.6}
            color="#3b82f6"
            font="https://fonts.gstatic.com/s/orbitron/v25/yV09DndqVu7V7V8zL-vM.woff"
            anchorX="center"
            anchorY="middle"
            fillOpacity={0.2}
            strokeWidth={0.01}
            strokeColor="#3b82f6"
          >
            ACTIVE SCANNING...
          </Text>
        </Float>
      </Canvas>
    </div>
  );
};

export default BikeScene;

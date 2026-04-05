/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { Magnet, Zap, Hand, Info, RefreshCw, Cpu } from 'lucide-react';
import { cn } from './lib/utils';
import { HandData } from './types';

// --- Constants ---
const BOX_COUNT = 25;
const BOUNDS = 6;
const ATTRACTION_STRENGTH = 0.8; // Increased from 0.15
const DRAG_FACTOR = 0.92; // Slightly more drag for better control
const SNAP_DISTANCE = 1.5;

const COLORS = ['#ff4d4d', '#4dff4d', '#4d4dff', '#ffff4d', '#ff4dff', '#4dffff', '#ffa500'];

// --- 3D Components ---

const MetallicObject = ({ index, magnetPos, magnetOn }: { index: number; magnetPos: THREE.Vector3; magnetOn: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const color = useMemo(() => COLORS[index % COLORS.length], [index]);
  
  // Initial random position
  const initialPos = useMemo(() => [
    (Math.random() - 0.5) * BOUNDS * 2,
    (Math.random() - 0.5) * BOUNDS * 2,
    (Math.random() - 0.5) * BOUNDS * 2
  ], []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const currentPos = meshRef.current.position;

    if (magnetOn) {
      // Calculate vector to magnet
      const toMagnet = new THREE.Vector3().copy(magnetPos).sub(currentPos);
      const distance = toMagnet.length();
      
      if (distance < 10) {
        // Stronger attraction logic
        let forceMagnitude = ATTRACTION_STRENGTH / (distance * 0.5 + 0.1);
        
        // Instant pull for very close objects
        if (distance < SNAP_DISTANCE) {
          forceMagnitude *= 2;
        }

        const force = toMagnet.normalize().multiplyScalar(Math.min(forceMagnitude, 1.2));
        velocity.current.add(force);
      }
    }

    // Apply velocity
    currentPos.add(velocity.current);
    
    // Apply drag
    velocity.current.multiplyScalar(DRAG_FACTOR);

    // Bounce off bounds
    if (Math.abs(currentPos.x) > BOUNDS) { velocity.current.x *= -0.5; currentPos.x = Math.sign(currentPos.x) * BOUNDS; }
    if (Math.abs(currentPos.y) > BOUNDS) { velocity.current.y *= -0.5; currentPos.y = Math.sign(currentPos.y) * BOUNDS; }
    if (Math.abs(currentPos.z) > BOUNDS) { velocity.current.z *= -0.5; currentPos.z = Math.sign(currentPos.z) * BOUNDS; }

    // Rotation based on movement
    meshRef.current.rotation.x += velocity.current.y * 0.5;
    meshRef.current.rotation.y += velocity.current.x * 0.5;
  });

  return (
    <mesh ref={meshRef} position={initialPos as [number, number, number]}>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshStandardMaterial 
        color={color} 
        metalness={0.6} 
        roughness={0.3} 
        emissive={color}
        emissiveIntensity={0.2}
      />
    </mesh>
  );
};

const Electromagnet = ({ position, active }: { position: THREE.Vector3; active: boolean }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.position.lerp(position, 0.2);
    
    if (active) {
      groupRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 20) * 0.05);
    } else {
      groupRef.current.scale.setScalar(1);
    }
  });

  return (
    <group ref={groupRef}>
      {/* Magnet Core */}
      <mesh>
        <cylinderGeometry args={[0.5, 0.5, 1.2, 32]} />
        <meshStandardMaterial color="#333" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Copper Coils */}
      <mesh rotation={[0, 0, 0]}>
        <torusGeometry args={[0.55, 0.1, 16, 100]} />
        <meshStandardMaterial color="#b87333" metalness={1} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[0.55, 0.1, 16, 100]} />
        <meshStandardMaterial color="#b87333" metalness={1} roughness={0.1} />
      </mesh>
      <mesh position={[0, -0.2, 0]}>
        <torusGeometry args={[0.55, 0.1, 16, 100]} />
        <meshStandardMaterial color="#b87333" metalness={1} roughness={0.1} />
      </mesh>

      {/* Glow Effect when active */}
      {active && (
        <pointLight color="#4488ff" intensity={5} distance={5} />
      )}
      
      {active && (
        <mesh scale={[1.2, 1.2, 1.2]}>
          <sphereGeometry args={[0.8, 16, 16]} />
          <meshBasicMaterial color="#4488ff" transparent opacity={0.1} wireframe />
        </mesh>
      )}
    </group>
  );
};

// --- Main App Component ---

export default function App() {
  const [handData, setHandData] = useState<HandData | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Magnet position in 3D space
  const magnetPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useEffect(() => {
    // Only start camera if instructions are closed and we have a video ref
    if (showInstructions || !videoRef.current) return;

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results: Results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Check all detected hands for a pinch
        let activeHandLandmarks = results.multiHandLandmarks[0];
        let isAnyHandPinched = false;

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
          const landmarks = results.multiHandLandmarks[i];
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];
          const distance = Math.sqrt(
            Math.pow(thumbTip.x - indexTip.x, 2) +
            Math.pow(thumbTip.y - indexTip.y, 2)
          );
          
          if (distance < 0.08) {
            isAnyHandPinched = true;
            activeHandLandmarks = landmarks; // Prioritize the pinching hand
            break;
          }
        }

        const landmarks = activeHandLandmarks;
        // Map 2D normalized coordinates to 3D space
        const x = (landmarks[0].x - 0.5) * -BOUNDS * 2.5;
        const y = (landmarks[0].y - 0.5) * -BOUNDS * 2.5;
        const z = (landmarks[0].z) * -BOUNDS * 2;

        setHandData({
          landmarks,
          isPinched: isAnyHandPinched,
          position: { x, y, z }
        });
        
        magnetPos.set(x, y, z);
      } else {
        setHandData(null);
      }
    });

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await hands.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480,
    });

    camera.start()
      .then(() => {
        setIsCameraReady(true);
        setCameraError(null);
      })
      .catch((err) => {
        console.error("Camera start error:", err);
        setCameraError(err.name === 'NotAllowedError' ? "Camera permission denied. Please enable camera access in your browser settings." : "Failed to start camera. Please ensure no other app is using it.");
        setIsCameraReady(false);
      });

    return () => {
      camera.stop();
      hands.close();
    };
  }, [showInstructions, magnetPos]);

  return (
    <div className="relative w-full h-screen bg-slate-950 overflow-hidden font-sans text-slate-100">
      {/* Background 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas shadows dpr={[1, 2]}>
          <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={50} />
          <OrbitControls enablePan={false} enableZoom={true} maxDistance={20} minDistance={5} />
          
          <ambientLight intensity={0.8} />
          <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={3} castShadow />
          <pointLight position={[-10, -10, -10]} intensity={2} color="#4488ff" />
          <pointLight position={[0, 10, 0]} intensity={1.5} color="#ffffff" />
          <pointLight position={[10, -10, 5]} intensity={1.5} color="#ff4444" />
          
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          
          <Electromagnet position={magnetPos} active={!!handData?.isPinched} />
          
          {Array.from({ length: BOX_COUNT }).map((_, i) => (
            <MetallicObject 
              key={i} 
              index={i} 
              magnetPos={magnetPos} 
              magnetOn={!!handData?.isPinched} 
            />
          ))}

          {/* Floor grid */}
          <gridHelper args={[20, 20, 0x444444, 0x222222]} position={[0, -BOUNDS, 0]} />
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="relative z-10 p-6 flex flex-col h-full pointer-events-none">
        {/* Header */}
        <header className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/20">
                <Magnet className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                MagnoGlove
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">
              Gesture Controlled Electromagnet Simulation
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            {cameraError ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-red-500/10 border-red-500/50 text-red-400 text-xs font-medium">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                {cameraError}
              </div>
            ) : (
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-500",
                isCameraReady ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-amber-500/10 border-amber-500/50 text-amber-400"
              )}>
                <div className={cn("w-2 h-2 rounded-full", isCameraReady ? "bg-emerald-500 animate-pulse" : "bg-amber-500")} />
                {isCameraReady ? "SYSTEM ONLINE" : "INITIALIZING CAMERA..."}
              </div>
            )}
            
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-300",
              handData ? "bg-blue-500/10 border-blue-500/50 text-blue-400" : "bg-slate-800/50 border-slate-700 text-slate-500"
            )}>
              <Hand className="w-3 h-3" />
              {handData ? "HAND DETECTED" : "NO HAND DETECTED"}
            </div>
          </div>
        </header>

        {/* Center Status */}
        <div className="flex-1 flex items-center justify-center">
          {handData?.isPinched && (
            <div className="flex flex-col items-center animate-in zoom-in duration-300">
              <div className="p-8 rounded-full bg-blue-500/20 border border-blue-500/30 backdrop-blur-sm relative">
                <Zap className="w-16 h-16 text-blue-400 animate-pulse" />
                <div className="absolute inset-0 rounded-full border-4 border-blue-400/20 animate-ping" />
              </div>
              <span className="mt-4 text-blue-400 font-bold tracking-tighter text-xl">MAGNETIC FIELD ACTIVE</span>
            </div>
          )}
        </div>

        {/* Footer Controls & Info */}
        <footer className="mt-auto flex justify-between items-end">
          <div className="flex flex-col gap-4 pointer-events-auto">
            {/* Camera Feed Preview */}
            <div className="relative w-48 aspect-video rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl group">
              <video 
                ref={videoRef} 
                className="w-full h-full object-cover mirror scale-x-[-1]" 
                playsInline 
                muted 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent flex items-end p-2">
                <span className="text-[10px] font-mono text-slate-400">LIVE FEED</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={() => setShowInstructions(!showInstructions)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
              >
                <Info className="w-5 h-5" />
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="max-w-xs text-right">
            <div className="flex items-center justify-end gap-2 text-slate-500 mb-2">
              <Cpu className="w-4 h-4" />
              <span className="text-[10px] font-mono uppercase tracking-widest">Neural Engine v2.4</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed italic">
              "Harnessing electromagnetic forces through computer vision and real-time spatial mapping."
            </p>
          </div>
        </footer>
      </div>

      {/* Instructions Modal */}
      {showInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl pointer-events-auto">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <Zap className="w-6 h-6 text-blue-400" />
              Welcome to MagnoGlove
            </h2>
            
            <div className="space-y-6 text-slate-300">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-blue-400 font-bold">1</div>
                <div>
                  <p className="font-semibold text-white">Enable Camera</p>
                  <p className="text-sm">Allow camera access to track your hand movements in 3D space.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-blue-400 font-bold">2</div>
                <div>
                  <p className="font-semibold text-white">The Pinch Gesture</p>
                  <p className="text-sm">Bring your <span className="text-blue-400 font-bold">Thumb</span> and <span className="text-blue-400 font-bold">Index Finger</span> together to activate the electromagnet.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-blue-400 font-bold">3</div>
                <div>
                  <p className="font-semibold text-white">Attract & Release</p>
                  <p className="text-sm">Move your hand to pull metallic objects. Release the pinch to drop them.</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowInstructions(false)}
              className="w-full mt-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
            >
              INITIALIZE SIMULATION
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

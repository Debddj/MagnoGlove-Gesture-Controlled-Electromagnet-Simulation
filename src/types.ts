export interface HandData {
  landmarks: { x: number; y: number; z: number }[];
  isPinched: boolean;
  position: { x: number; y: number; z: number };
}

export interface SimulationState {
  magnetOn: boolean;
  magnetPosition: [number, number, number];
}

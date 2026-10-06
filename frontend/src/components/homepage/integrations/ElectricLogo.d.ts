import type { ComponentType, CSSProperties } from 'react';

export type ElectricLogoProps = {
  src: string;
  color?: string;
  glowColor?: string;
  scale?: number;
  strands?: number;
  bend?: number;
  crackle?: number;
  arcs?: number;
  speed?: number;
  interactive?: boolean;
  intensity?: number;
  glow?: number;
  thickness?: number;
  flicker?: number;
  fill?: number;
  cursorIntensity?: number;
  cursorRadius?: number;
  className?: string;
  style?: CSSProperties;
};

declare const ElectricLogo: ComponentType<ElectricLogoProps>;
export default ElectricLogo;

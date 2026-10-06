import type { ComponentType, CSSProperties, ReactNode } from 'react';

export type LogoLoopItem =
  | { src: string; alt?: string; title?: string; href?: string; srcSet?: string; sizes?: string; width?: number; height?: number }
  | { node: ReactNode; title?: string; ariaLabel?: string; href?: string };

export type LogoLoopProps = {
  logos: LogoLoopItem[];
  speed?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  width?: string | number;
  logoHeight?: number;
  gap?: number;
  pauseOnHover?: boolean;
  hoverSpeed?: number;
  fadeOut?: boolean;
  fadeOutColor?: string;
  scaleOnHover?: boolean;
  renderItem?: (item: LogoLoopItem, key: string) => ReactNode;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
};

declare const LogoLoop: ComponentType<LogoLoopProps>;
export { LogoLoop };
export default LogoLoop;

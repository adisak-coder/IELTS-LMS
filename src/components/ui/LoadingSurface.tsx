import { AppLoadingSkeleton } from './AppLoadingSkeleton';

interface LoadingSurfaceProps {
  label: string;
}

export function LoadingSurface({ label }: LoadingSurfaceProps) {
  // Keep the existing API (`label`) but render the global skeleton surface (no spinner).
  return <AppLoadingSkeleton label={label} />;
}

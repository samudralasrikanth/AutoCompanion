export interface LocatorStrategy {
  id: string;
  priority: number;
  metadata?: Record<string, any>;
}

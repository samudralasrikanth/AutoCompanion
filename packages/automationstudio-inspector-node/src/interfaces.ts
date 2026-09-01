export interface LocatorCandidate {
  strategy: string; // e.g. "xpath", "css", "data-testid", "role"
  value: string;
  confidence: number; // 0-100
  stability: number; // 0-100
  uniqueness: number; // 0-100 (100 means uniquely identifies 1 element)
  recommended?: boolean;
}

export interface ElementMetadata {
  tagName: string;
  id?: string;
  name?: string;
  role?: string;
  xpath?: string;
  classes?: string[];
  text?: string;
  attributes: Record<string, string>;
  isInteractive: boolean;
  isVisible: boolean;
}

export interface InspectResult {
  locatorCandidates: LocatorCandidate[];
  metadata: ElementMetadata;
  screenshotBase64?: string; // Optional screenshot of just the element
  sourceUrl: string;
  timestamp: number;
}

export interface InspectSession {
  sessionId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  refresh(): Promise<void>;
  switchBrowser(browserType: string): Promise<void>;
  exportDom(): Promise<string>;
  
  onElementSelected(callback: (result: InspectResult) => void): void;
  onDisconnected(callback: () => void): void;
  
  highlight(locatorStrategy: string, locatorValue: string): Promise<void>;
  clearHighlight(): Promise<void>;
}

export interface IInspector {
  name: string;
  createSession(target?: any): Promise<InspectSession>;
}

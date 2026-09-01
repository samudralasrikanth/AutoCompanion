export interface VisualObjectDefinition {
  // Surface semantic evidence
  automationId?: string;
  controlType?: string;
  windowTitle?: string;
  locators?: Array<{
    strategy: string;
    value: string;
    region?: { x: number; y: number; width: number; height: number };
    scope?: 'window' | 'surface' | 'screen' | 'region';
    priority?: number;
  }>;

  // DOM Locators
  css?: string;
  xpath?: string;
  aria?: string;
  text?: string;
  
  // Visual Locators
  ocr?: { text: string, type: 'exact' | 'regex' | 'fuzzy' };
  image?: { path: string, hash?: string };
  anchor?: { objectId: string, direction: 'above' | 'below' | 'left' | 'right', maxDistance?: number };
  color?: { hex: string, tolerance: number };
  shape?: { type: 'button' | 'input' | 'checkbox' | 'window' };
  featureDescriptors?: string; // Path to binary feature file or JSON
}

export interface VisualObjectMetrics {
  confidenceHistory: {
    avg: number;
    runs: number;
    failures: number;
  };
}

export interface VisualObjectAssets {
  trainingImages: string[];
  screenshots: string[];
}

export interface IVisualObject {
  id: string;
  name: string;
  folderPath: string; // e.g., 'Customers/Login'
  definition: VisualObjectDefinition;
  metrics?: VisualObjectMetrics;
  assets?: VisualObjectAssets;
  metadata?: Record<string, unknown>;
  description?: string;
  tags?: string[];
}

export interface IObjectRepository {
  saveObject(obj: IVisualObject): Promise<void>;
  getObject(id: string): Promise<IVisualObject | undefined>;
  getAllObjects(): Promise<IVisualObject[]>;
  deleteObject(id: string): Promise<void>;
}

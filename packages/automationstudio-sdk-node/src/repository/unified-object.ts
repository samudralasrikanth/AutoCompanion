import type { ScenarioMode, SurfaceLocatorEvidence } from '../scenario/scenario-ir';

export type UnifiedObjectType = 'textbox' | 'button' | 'dropdown' | 'checkbox' | 'radioButton' | 'link' | 'label' | 'custom';

export interface PlaywrightObjectLocator {
  role?: string;
  name?: string;
  css?: string;
  xpath?: string;
  testId?: string;
}

export interface CaptureMetadata {
  captureSize: { width: number; height: number };
  windowBounds: { x: number; y: number; width: number; height: number };
  displayScale?: number;
}

export interface UnifiedObject {
  id: string;
  name: string;
  type: UnifiedObjectType;
  description?: string;
  tags?: string[];
  pw?: PlaywrightObjectLocator;
  surface?: SurfaceLocatorEvidence[];
  captureMetadata?: CaptureMetadata;
  screenshot?: { name?: string; dataUrl?: string; path?: string };
  version: number;
  versionHistory?: Array<{ version: number; updatedAt: number; updatedBy?: string; changes?: string }>;
  createdAt: number;
  updatedAt: number;
}

export interface ResolvedLocator {
  pw?: PlaywrightObjectLocator;
  surface?: SurfaceLocatorEvidence[];
  objectType: UnifiedObjectType;
}

export interface IObjectResolver {
  resolve(uri: string, mode: ScenarioMode): Promise<ResolvedLocator>;
  getObject(uri: string): Promise<UnifiedObject | undefined>;
  list(): Promise<string[]>;
}

export function objectUriToId(uri: string): string {
  if (!uri.startsWith('object://')) throw new Error(`Invalid object URI: ${uri}`);
  const id = uri.slice('object://'.length).trim();
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) throw new Error(`Invalid object identifier: ${uri}`);
  return id;
}

export function objectIdToUri(id: string): string {
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) throw new Error(`Invalid object identifier: ${id}`);
  return `object://${id}`;
}

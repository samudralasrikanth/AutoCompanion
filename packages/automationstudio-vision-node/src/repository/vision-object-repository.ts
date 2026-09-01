import * as fs from 'fs/promises';
import * as path from 'path';
import type { IVisionLocator } from '../vision/vision-types';

export interface VisionObject {
  id: string;
  name: string;
  locator: IVisionLocator;
  trainingImages: string[];              // Paths to captured templates
  featureDescriptors?: string;           // Serialized ORB/SIFT descriptors
  history: VisionObjectHistory;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface VisionObjectHistory {
  matchAttempts: number;
  matchSuccesses: number;
  lastMatchConfidence: number;
  lastMatchTimestamp: number;
  confidenceTrend: number[];             // Rolling window
}

export interface IVisionObjectRepository {
  add(obj: VisionObject): Promise<void>;
  get(id: string): Promise<VisionObject | undefined>;
  find(name: string): Promise<VisionObject[]>;
  update(id: string, patch: Partial<VisionObject>): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<VisionObject[]>;
  recordMatch(id: string, confidence: number, success: boolean): Promise<void>;
}

export class VisionObjectRepository implements IVisionObjectRepository {
  private repoPath: string;
  private objects = new Map<string, VisionObject>();

  constructor(repoDir: string) {
    this.repoPath = path.join(repoDir, '.vision-repo.json');
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.repoPath, 'utf8');
      const list: VisionObject[] = JSON.parse(data);
      this.objects.clear();
      for (const obj of list) {
        this.objects.set(obj.id, obj);
      }
    } catch {
      // Doesn't exist or invalid, start fresh
      this.objects.clear();
    }
  }

  async save(): Promise<void> {
    const list = Array.from(this.objects.values());
    await fs.writeFile(this.repoPath, JSON.stringify(list, null, 2), 'utf8');
  }

  async add(obj: VisionObject): Promise<void> {
    this.objects.set(obj.id, obj);
    await this.save();
  }

  async get(id: string): Promise<VisionObject | undefined> {
    return this.objects.get(id);
  }

  async find(name: string): Promise<VisionObject[]> {
    return Array.from(this.objects.values()).filter(o => o.name === name);
  }

  async update(id: string, patch: Partial<VisionObject>): Promise<void> {
    const existing = this.objects.get(id);
    if (!existing) throw new Error(`VisionObject ${id} not found`);
    
    this.objects.set(id, { ...existing, ...patch, updatedAt: Date.now() });
    await this.save();
  }

  async remove(id: string): Promise<void> {
    this.objects.delete(id);
    await this.save();
  }

  async list(): Promise<VisionObject[]> {
    return Array.from(this.objects.values());
  }

  async recordMatch(id: string, confidence: number, success: boolean): Promise<void> {
    const obj = this.objects.get(id);
    if (!obj) return;

    obj.history.matchAttempts++;
    if (success) obj.history.matchSuccesses++;
    obj.history.lastMatchConfidence = confidence;
    obj.history.lastMatchTimestamp = Date.now();
    
    obj.history.confidenceTrend.push(confidence);
    if (obj.history.confidenceTrend.length > 20) {
      obj.history.confidenceTrend.shift();
    }
    
    await this.save();
  }
}

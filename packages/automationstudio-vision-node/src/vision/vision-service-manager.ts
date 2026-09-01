import { SidecarBridge } from './sidecar-bridge';
import type { ExecutionBackend, ExecutionBackendType } from './execution-backend';
import type { IVisionLocator, CaptureContext, Candidate } from './vision-types';

export interface ServiceHealth {
  status: 'running' | 'stopped' | 'starting' | 'error';
  uptime: number;
  lastHealthCheck: number;
  restartCount: number;
  backend: ExecutionBackend;
}

export interface IVisionServiceManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  health(): Promise<ServiceHealth>;
  version(): Promise<string>;
  capabilities(): Promise<string[]>;
  analyze(screenshot: Buffer, locator: IVisionLocator, context: CaptureContext): Promise<Candidate[]>;
  execute(command: any): Promise<any>;
}

export class VisionServiceManager implements IVisionServiceManager {
  private bridge: SidecarBridge;
  private currentStatus: 'running' | 'stopped' | 'starting' | 'error' = 'stopped';
  private startTime = 0;
  private restarts = 0;
  private lastCheck = 0;
  private monitorInterval: NodeJS.Timeout | null = null;
  private readonly backend: ExecutionBackend = {
    type: 'cpu',
    name: 'Python OpenCV Sidecar',
    capabilities: ['ocr', 'template', 'feature']
  };

  constructor() {
    this.bridge = new SidecarBridge();
  }

  async start(): Promise<void> {
    if (this.currentStatus === 'running' || this.currentStatus === 'starting') return;
    
    this.currentStatus = 'starting';
    const success = await this.bridge.ensureRunning();
    
    if (success) {
      this.currentStatus = 'running';
      this.startTime = Date.now();
      this.lastCheck = Date.now();
      this.startHealthMonitor();
    } else {
      this.currentStatus = 'error';
    }
  }

  async stop(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    await this.bridge.shutdown();
    this.currentStatus = 'stopped';
  }

  async restart(): Promise<void> {
    this.restarts++;
    await this.stop();
    await this.start();
  }

  async health(): Promise<ServiceHealth> {
    return {
      status: this.currentStatus,
      uptime: this.currentStatus === 'running' ? Date.now() - this.startTime : 0,
      lastHealthCheck: this.lastCheck,
      restartCount: this.restarts,
      backend: this.backend
    };
  }

  async version(): Promise<string> {
    return "0.1.0-sidecar";
  }

  async capabilities(): Promise<string[]> {
    return this.backend.capabilities;
  }

  async analyze(screenshot: Buffer, locator: IVisionLocator, context: CaptureContext): Promise<Candidate[]> {
    if (this.currentStatus !== 'running') {
      await this.start();
    }
    
    const candidates = await this.bridge.analyze(screenshot, locator, this.backend.capabilities, context);
    return candidates;
  }

  async execute(command: any): Promise<any> {
    if (this.currentStatus !== 'running') {
      await this.start();
    }
    
    return this.bridge.execute(command);
  }

  private startHealthMonitor() {
    if (this.monitorInterval) return;
    
    this.monitorInterval = setInterval(async () => {
      if (this.currentStatus !== 'running') return;
      
      try {
        const isHealthy = await this.bridge.checkHealth();
        this.lastCheck = Date.now();
        
        if (!isHealthy) {
          console.warn('Vision sidecar health check failed. Restarting...');
          this.currentStatus = 'error';
          await this.restart();
        }
      } catch (e) {
        console.warn('Vision sidecar health check threw error. Restarting...');
        this.currentStatus = 'error';
        await this.restart();
      }
    }, 30000); // 30s interval
  }
}

import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import type { Candidate, IVisionLocator, CaptureContext } from './vision-types';

const SIDECAR_PORT = 5123;
const SIDECAR_STARTUP_TIMEOUT = 15000;

/**
 * SidecarBridge — manages the Python Vision Engine subprocess.
 *
 * Starts the sidecar on first use (on-demand), keeps it alive for the session,
 * and provides typed methods for each CV endpoint.
 *
 * Falls back gracefully if Python or dependencies are unavailable.
 */
export class SidecarBridge {
  private process: ChildProcess | null = null;
  private ready = false;
  private startPromise: Promise<boolean> | null = null;

  /**
   * Start the Python sidecar. Resolves true if started successfully.
   * Resolves false if Python is not available.
   */
  async ensureRunning(): Promise<boolean> {
    if (this.ready) return true;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startSidecar();
    return this.startPromise;
  }

  private async startSidecar(): Promise<boolean> {
    const sidecarScript = path.join(__dirname, '../../sidecar/vision_server.py');

    // Try to find the sidecar script
    let scriptPath = sidecarScript;
    if (!fs.existsSync(scriptPath)) {
      scriptPath = path.join(__dirname, '../../../sidecar/vision_server.py');
      if (!fs.existsSync(scriptPath)) {
        console.warn('Vision sidecar script not found. CV features will be limited.');
        return false;
      }
    }

    try {
      this.process = spawn('python3', [scriptPath, String(SIDECAR_PORT)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      });

      this.process.on('error', (err) => {
        console.warn('Failed to start vision sidecar:', err.message);
        this.ready = false;
      });

      this.process.on('exit', () => {
        this.ready = false;
        this.startPromise = null;
      });

      // Wait for the server to be ready
      const isReady = await this.waitForHealth();
      this.ready = isReady;
      return isReady;
    } catch (e) {
      console.warn('Vision sidecar failed to start:', e);
      return false;
    }
  }

  private async waitForHealth(): Promise<boolean> {
    const deadline = Date.now() + SIDECAR_STARTUP_TIMEOUT;

    while (Date.now() < deadline) {
      try {
        const resp = await this.httpGet('/health');
        if (resp && resp.status === 'ok') return true;
      } catch {
        // Not ready yet
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const resp = await this.httpGet('/health');
      return resp && resp.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Send a screenshot and locator bundle to the sidecar for analysis.
   */
  async analyze(screenshot: Buffer, locator: IVisionLocator, capabilities: string[], context: CaptureContext): Promise<Candidate[]> {
    const available = await this.ensureRunning();
    if (!available) return [];

    const fields = {
      locator: JSON.stringify(locator),
      capabilities: JSON.stringify(capabilities),
      captureContext: JSON.stringify(context)
    };
    
    // Extract template images if any strategy requires them
    const files: Record<string, Buffer> = { screenshot };
    for (const strategy of locator.strategies) {
      if (strategy.type === 'image' && strategy.value) {
        try {
          if (fs.existsSync(strategy.value)) {
            files['template'] = fs.readFileSync(strategy.value);
          }
        } catch (e) {
          console.warn(`Failed to read template file: ${strategy.value}`);
        }
      }
    }

    const formData = this.buildFormData(files, fields);
    const resp = await this.httpPost('/analyze', formData.buffer, formData.contentType);
    return resp?.candidates ?? [];
  }

  async execute(command: any): Promise<any> {
    const available = await this.ensureRunning();
    if (!available) return { success: false, error: 'Sidecar not available' };

    const fields = {
      command: JSON.stringify(command)
    };
    
    // Extract template images if any strategy requires them
    const files: Record<string, Buffer> = {};
    if (command.locator?.strategies) {
      for (const strategy of command.locator.strategies) {
        if (strategy.type === 'image' && strategy.value) {
          try {
            if (fs.existsSync(strategy.value)) {
              files['template'] = fs.readFileSync(strategy.value);
            }
          } catch (e) {
            console.warn(`Failed to read template file: ${strategy.value}`);
          }
        }
      }
    }

    const formData = this.buildFormData(files, fields);
    const resp = await this.httpPost('/execute', formData.buffer, formData.contentType);
    return resp ?? { success: false, error: 'Empty response' };
  }

  async shutdown(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.ready = false;
      this.startPromise = null;
    }
  }

  // ─── HTTP helpers ──────────────────────────────────────────────────────────

  private httpGet(urlPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${SIDECAR_PORT}${urlPath}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  private httpPost(urlPath: string, body: Buffer, contentType: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: SIDECAR_PORT,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': body.length
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Build a multipart/form-data payload from file buffers and string fields.
   */
  private buildFormData(
    files: Record<string, Buffer>,
    fields: Record<string, string>
  ): { buffer: Buffer; contentType: string } {
    const boundary = '----VisionSidecar' + Date.now();
    const parts: Buffer[] = [];

    for (const [name, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      ));
    }

    for (const [name, buf] of Object.entries(files)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.png"\r\nContent-Type: image/png\r\n\r\n`
      ));
      parts.push(buf);
      parts.push(Buffer.from('\r\n'));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    return {
      buffer: Buffer.concat(parts),
      contentType: `multipart/form-data; boundary=${boundary}`
    };
  }
}

// ─── Sidecar response types ──────────────────────────────────────────────────


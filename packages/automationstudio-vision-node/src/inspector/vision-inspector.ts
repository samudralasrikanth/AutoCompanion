import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import screenshot from 'screenshot-desktop';
import type { IInspector, InspectSession, InspectResult } from '@automation-studio/inspector';
import { VisionEngine } from '../vision/vision-engine';
import type { IVisionLocator, MatchResult } from '../vision/vision-types';

class VisionInspectSession implements InspectSession {
  public sessionId = 'vision-session-1';
  private panel: vscode.WebviewPanel | undefined;
  private lastScreenshotBuffer: Buffer | undefined;
  private onSelectCallback?: (result: InspectResult) => void;
  private onDisconnectCallback?: () => void;
  private visionEngine: VisionEngine;

  constructor() {
    this.visionEngine = new VisionEngine();
  }

  async start(): Promise<void> {
    this.panel = vscode.window.createWebviewPanel(
      'visionInspector',
      'Vision Vision Inspector',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getWebviewContent();

    this.panel.webview.onDidReceiveMessage(async (msg: any) => {
      if (msg.command === 'refresh') {
        await this.captureScreen();
      } else if (msg.command === 'analyzeRegion') {
        await this.analyzeRegion(msg.region);
      }
    });

    await this.captureScreen();
  }

  async stop(): Promise<void> {
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }
    if (this.onDisconnectCallback) this.onDisconnectCallback();
  }

  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async refresh(): Promise<void> { await this.captureScreen(); }
  async switchBrowser(_browserType: string): Promise<void> {}
  async exportDom(): Promise<string> { return ''; }

  onElementSelected(callback: (result: InspectResult) => void): void {
    this.onSelectCallback = callback;
  }

  onDisconnected(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  async highlight(_strategy: string, _value: string): Promise<void> {}
  async clearHighlight(): Promise<void> {}

  private async captureScreen() {
    if (!this.panel) return;

    try {
      this.panel.webview.postMessage({ type: 'status', text: 'Taking screenshot...' });

      const imgBuffer = await screenshot({ format: 'png' }) as Buffer;
      this.lastScreenshotBuffer = imgBuffer;

      const base64Image = `data:image/png;base64,${imgBuffer.toString('base64')}`;
      this.panel.webview.postMessage({
        type: 'screenshot',
        dataUrl: base64Image
      });

    } catch (e: any) {
      this.panel.webview.postMessage({ type: 'status', text: `Error: ${e.message}` });
    }
  }

  /**
   * Analyze a user-selected region using the real Vision Engine.
   * Instead of mocking results, we build a locator bundle and call locate().
   */
  private async analyzeRegion(region: { x: number; y: number; width: number; height: number }) {
    if (!this.panel || !this.lastScreenshotBuffer || !this.onSelectCallback) return;

    this.panel.webview.postMessage({ type: 'status', text: 'Analyzing region with Vision Engine...' });

    try {
      // Build a multi-strategy locator from the selected region.
      // For the initial analysis, we use coordinate + OCR.
      // Image template would be saved separately when the user adds to repository.
      const locator: IVisionLocator = {
        strategies: [
          {
            type: 'coordinate',
            value: `${Math.round(region.x + region.width / 2)},${Math.round(region.y + region.height / 2)}`
          },
          {
            type: 'ocr',
            value: '', // OCR doesn't need a predefined value for initial extraction
            metadata: { extractFromRegion: true, region }
          }
        ]
      };

      const result: MatchResult = await this.visionEngine.locate(locator, this.lastScreenshotBuffer);

      // Extract OCR text from the candidate if available
      const ocrCandidate = result.cluster.find(c => c.strategy === 'ocr');
      const extractedText = (ocrCandidate?.metadata?.['text'] as string) ?? '';

      this.onSelectCallback({
        locatorCandidates: result.cluster.map(c => ({
          strategy: c.strategy,
          value: c.strategy === 'ocr' ? (extractedText || 'No text detected') : locator.strategies.find(s => s.type === c.strategy)?.value ?? '',
          confidence: c.confidence,
          stability: c.strategy === 'coordinate' ? 0 : c.confidence,
          uniqueness: c.confidence
        })),
        metadata: {
          tagName: 'VISION_REGION',
          attributes: {
            fusedConfidence: String(result.confidence),
            strategiesUsed: String(result.cluster.length),
            width: String(region.width),
            height: String(region.height)
          },
          isInteractive: true,
          isVisible: true
        },
        sourceUrl: 'desktop',
        timestamp: Date.now()
      });

      this.panel.webview.postMessage({
        type: 'status',
        text: `Analysis complete — Fused confidence: ${result.confidence}% (${result.cluster.length} strategies)`
      });
    } catch (e: any) {
      this.panel.webview.postMessage({ type: 'status', text: `Analysis failed: ${e.message}` });
    }
  }

  private getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'wasm-unsafe-eval';">
  <title>Vision Vision Inspector</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    #toolbar {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 40px;
      background: var(--vscode-editorGroupHeader-tabsBackground);
      display: flex;
      align-items: center;
      padding: 0 10px;
      box-sizing: border-box;
      z-index: 10;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 4px 12px;
      margin-right: 8px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    #canvas-container {
      position: absolute;
      top: 40px;
      left: 0;
      width: 100%;
      height: calc(100% - 40px);
      overflow: auto;
      background: #111;
    }
    canvas {
      cursor: crosshair;
      display: block;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="btn-refresh">Capture Screen</button>
    <span id="status" style="margin-left: 10px; font-size: 12px; color: var(--vscode-descriptionForeground);">Idle</span>
  </div>
  <div id="canvas-container">
    <canvas id="overlay"></canvas>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const canvas = document.getElementById('overlay');
    const ctx = canvas.getContext('2d');
    const statusEl = document.getElementById('status');
    
    let currentImage = null;
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;

    document.getElementById('btn-refresh').addEventListener('click', () => {
      vscode.postMessage({ command: 'refresh' });
      statusEl.innerText = 'Capturing...';
    });

    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'screenshot') {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          currentImage = img;
          statusEl.innerText = \`Captured (\${img.width}x\${img.height})\`;
        };
        img.src = message.dataUrl; // base64 image
      } else if (message.type === 'status') {
        statusEl.innerText = message.text;
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!currentImage) return;
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      currentX = startX;
      currentY = startY;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing || !currentImage) return;
      const rect = canvas.getBoundingClientRect();
      currentX = e.clientX - rect.left;
      currentY = e.clientY - rect.top;
      redraw();
    });

    canvas.addEventListener('mouseup', () => {
      if (!isDrawing || !currentImage) return;
      isDrawing = false;
      const width = currentX - startX;
      const height = currentY - startY;
      
      // Only process if the box is somewhat large
      if (Math.abs(width) > 5 && Math.abs(height) > 5) {
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const w = Math.abs(width);
        const h = Math.abs(height);
        
        vscode.postMessage({
          command: 'analyzeRegion',
          region: { x, y, width: w, height: h }
        });
      }
    });

    function redraw() {
      if (!currentImage) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(currentImage, 0, 0);
      
      if (isDrawing) {
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
        
        ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.fillRect(startX, startY, currentX - startX, currentY - startY);
      }
    }
  </script>
</body>
</html>`;
  }
}

export class VisionInspector implements IInspector {
  public name = 'Vision Vision Inspector';

  async createSession(_target?: any): Promise<InspectSession> {
    const session = new VisionInspectSession();
    await session.start();
    return session;
  }
}

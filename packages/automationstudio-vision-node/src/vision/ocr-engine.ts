import { createWorker } from 'tesseract.js';

export class OcrEngine {
  private workerPromise: Promise<Tesseract.Worker>;

  constructor() {
    this.workerPromise = this.initWorker();
  }

  private async initWorker() {
    const worker = await createWorker('eng');
    return worker;
  }

  public async extractText(imageBuffer: Buffer, region?: { x: number, y: number, width: number, height: number }): Promise<string> {
    const worker = await this.workerPromise;
    
    // Tesseract.js supports a rectangle option for OCR
    const options = region ? { rectangle: { top: region.y, left: region.x, width: region.width, height: region.height } } : undefined;
    
    const { data: { text } } = await worker.recognize(imageBuffer, options);
    return text.trim();
  }

  public async shutdown() {
    const worker = await this.workerPromise;
    await worker.terminate();
  }
}

import type { IDisposable, ILogger, IEventBus } from '@automation-studio/types';
import type { IEnvironmentService, EnvironmentStatus } from './workbench-types';
import { toDisposable } from '@automation-studio/shared';

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'node:fs';
import * as path from 'node:path';

const execAsync = promisify(exec);

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    await execAsync(checkCmd);
    return true;
  } catch {
    return false;
  }
}

function checkModule(moduleName: string): boolean {
  try {
    require.resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}

function hasConfiguredAiProvider(): boolean {
  return [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'OPENROUTER_API_KEY',
  ].some((key) => Boolean(process.env[key]));
}

function hasBundledOcrLanguageData(extensionPath?: string): boolean {
  const candidates = [
    extensionPath ? path.join(extensionPath, 'assets', 'tessdata', 'eng.traineddata') : undefined,
    path.join(__dirname, '..', 'assets', 'tessdata', 'eng.traineddata'),
    path.join(__dirname, '..', '..', 'assets', 'tessdata', 'eng.traineddata'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.some((candidate) => fs.existsSync(candidate));
}

export class EnvironmentService implements IEnvironmentService {
  private _status: EnvironmentStatus = {
    python: false,
    node: false,
    git: false,
    playwright: false,
    bitwarden: false,
    ai: false,
    ocr: false,
  };
  
  private listeners = new Set<(status: EnvironmentStatus) => void>();

  constructor(
    private readonly logger: ILogger,
    private readonly eventBus: IEventBus,
    private readonly extensionPath?: string,
  ) {}

  public get status(): EnvironmentStatus {
    return { ...this._status };
  }

  public async checkAll(): Promise<void> {
    this.logger.info('Running environment health checks...');

    const checkOcr = async (): Promise<boolean> => {
      // Prefer the packaged JS engine, then fall back to a native installation.
      return (checkModule('tesseract.js') && hasBundledOcrLanguageData(this.extensionPath))
        || await checkCommand('tesseract');
    };

    this._status = {
      python: await checkCommand('python') || await checkCommand('python3'),
      node: await checkCommand('node'),
      git: await checkCommand('git'),
      playwright: checkModule('playwright-core'),
      bitwarden: await checkCommand('bw'),
      ai: hasConfiguredAiProvider(),
      ocr: await checkOcr(),
    };

    this.logger.info('Environment health checks completed', { status: this._status });
    this.fireStatusChanged();
  }

  public onStatusChanged(listener: (status: EnvironmentStatus) => void): IDisposable {
    this.listeners.add(listener);
    return toDisposable(() => this.listeners.delete(listener));
  }

  private fireStatusChanged(): void {
    const current = this.status;
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch (err) {
        this.logger.error('Error in EnvironmentService listener', err as Error);
      }
    }
  }
}

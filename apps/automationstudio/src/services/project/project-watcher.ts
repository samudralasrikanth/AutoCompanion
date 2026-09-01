/**
 * Project Watcher - detects file changes and triggers indexer/explorer updates.
 */

import type { ILogger, IEventBus } from '@automation-studio/types';
import { type Timestamp } from '@automation-studio/types';
import { createEvent } from '@automation-studio/events';
import { ProjectEvents, type FileChangedPayload } from '@automation-studio/events';
import { debounce, DisposableStore } from '@automation-studio/shared';

/**
 * ProjectWatcher wraps VS Code's FileSystemWatcher.
 * It must be initialized with a VS Code workspace reference.
 * Events are debounced to avoid flooding during bulk operations.
 */
export class ProjectWatcher {
  private readonly disposables = new DisposableStore();
  private watching = false;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
  ) {}

  public startWatching(
    projectPath: string,
    createWatcher: (pattern: string) => {
      onDidCreate: (handler: (uri: { fsPath: string }) => void) => { dispose(): void };
      onDidChange: (handler: (uri: { fsPath: string }) => void) => { dispose(): void };
      onDidDelete: (handler: (uri: { fsPath: string }) => void) => { dispose(): void };
      dispose(): void;
    },
  ): void {
    if (this.watching) {
      this.logger.warn('Already watching, stop first');
      return;
    }

    this.logger.info(`Starting file watcher for: ${projectPath}`);

    const watcher = createWatcher('**/*');

    const debouncedCreate = debounce((path: string) => {
      this.emitChange(path, 'created');
    }, 250);

    const debouncedChange = debounce((path: string) => {
      this.emitChange(path, 'modified');
    }, 250);

    const debouncedDelete = debounce((path: string) => {
      this.emitChange(path, 'deleted');
    }, 250);

    this.disposables.add(watcher.onDidCreate((uri) => debouncedCreate(uri.fsPath)));
    this.disposables.add(watcher.onDidChange((uri) => debouncedChange(uri.fsPath)));
    this.disposables.add(watcher.onDidDelete((uri) => debouncedDelete(uri.fsPath)));
    this.disposables.add(watcher);

    this.watching = true;
  }

  public stopWatching(): void {
    this.disposables.dispose();
    this.watching = false;
    this.logger.info('File watcher stopped');
  }

  public get isWatching(): boolean {
    return this.watching;
  }

  private emitChange(path: string, changeType: 'created' | 'modified' | 'deleted'): void {
    this.logger.debug(`File ${changeType}: ${path}`);

    this.eventBus.publish(
      createEvent<FileChangedPayload>(ProjectEvents.FileChanged, {
        path,
        changeType,
        timestamp: Date.now() as Timestamp,
      }),
    );
  }
}

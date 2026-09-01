/**
 * Migration Manager - sequential schema migrations with rollback.
 */

import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { IProjectManifest, IProjectMigration, MigrationResult, ILogger, IEventBus } from '@automation-studio/types';
import type { Timestamp } from '@automation-studio/types';
import { createEvent } from '@automation-studio/events';
import { ProjectEvents, type MigrationCompletedPayload } from '@automation-studio/events';
import { Stopwatch } from '@automation-studio/shared';
import { ProjectMigrationError } from '../../errors/project-error';
import { readProjectManifest, writeProjectManifest } from './project-persistence';

export class MigrationManager {
  private readonly migrations: IProjectMigration[] = [];

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
  ) {}

  public registerMigration(migration: IProjectMigration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.fromVersion - b.fromVersion);
  }

  public async migrate(
    projectPath: string,
    targetVersion?: number,
  ): Promise<ReadonlyArray<MigrationResult>> {
    const manifest = await readProjectManifest(projectPath);
    const currentVersion = manifest.schemaVersion;
    const target = targetVersion ?? this.getLatestVersion();
    const results: MigrationResult[] = [];

    if (currentVersion >= target) {
      this.logger.info(`Project already at version ${currentVersion}, no migration needed`);
      return results;
    }

    this.logger.info(`Migrating project from v${currentVersion} to v${target}`);

    const applicableMigrations = this.migrations.filter(
      (m) => m.fromVersion >= currentVersion && m.toVersion <= target,
    );

    for (const migration of applicableMigrations) {
      const stopwatch = new Stopwatch().start();

      // Create backup before migration
      const backupPath = join(projectPath, '.automationstudio', 'backups', `v${migration.fromVersion}-${Date.now()}`);
      await cp(projectPath, backupPath, { recursive: true, filter: (src) => !src.includes('.automationstudio/backups') });

      try {
        const currentManifest = await readProjectManifest(projectPath);

        if (!migration.canMigrate(currentManifest)) {
          this.logger.warn(`Migration v${migration.fromVersion}→v${migration.toVersion} skipped: not applicable`);
          continue;
        }

        this.eventBus.publish(
          createEvent(ProjectEvents.MigrationStarted, {
            fromVersion: migration.fromVersion,
            toVersion: migration.toVersion,
          }),
        );

        const result = await migration.migrate(projectPath, currentManifest);
        const duration = stopwatch.stop();
        results.push(result);

        if (result.success) {
          // Update schema version in manifest
          const updatedManifest: IProjectManifest = {
            ...currentManifest,
            schemaVersion: migration.toVersion,
            modifiedOn: Date.now() as Timestamp,
          };
          await writeProjectManifest(projectPath, updatedManifest);

          this.eventBus.publish(
            createEvent<MigrationCompletedPayload>(ProjectEvents.MigrationCompleted, {
              fromVersion: migration.fromVersion,
              toVersion: migration.toVersion,
              changes: result.changes.length,
              duration,
            }),
          );

          this.logger.info(
            `Migration v${migration.fromVersion}→v${migration.toVersion} completed`,
            { changes: result.changes.length, duration },
          );
        } else {
          // Rollback on failure
          this.logger.error(
            `Migration v${migration.fromVersion}→v${migration.toVersion} failed, rolling back`,
          );
          await migration.rollback(projectPath, backupPath);

          this.eventBus.publish(
            createEvent(ProjectEvents.MigrationFailed, {
              fromVersion: migration.fromVersion,
              toVersion: migration.toVersion,
              reason: 'Migration returned unsuccessful result',
            }),
          );

          throw new ProjectMigrationError(
            migration.fromVersion,
            migration.toVersion,
            'Migration returned unsuccessful result',
          );
        }
      } catch (error) {
        if (error instanceof ProjectMigrationError) {
          throw error;
        }

        // Rollback on unexpected error
        this.logger.error(
          `Migration v${migration.fromVersion}→v${migration.toVersion} threw error, rolling back`,
          error instanceof Error ? error : new Error(String(error)),
        );

        try {
          await migration.rollback(projectPath, backupPath);
        } catch (rollbackError) {
          this.logger.fatal(
            'Migration rollback also failed',
            rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError)),
          );
        }

        throw new ProjectMigrationError(
          migration.fromVersion,
          migration.toVersion,
          error instanceof Error ? error.message : String(error),
          { cause: error instanceof Error ? error : undefined },
        );
      }
    }

    return results;
  }

  public getLatestVersion(): number {
    if (this.migrations.length === 0) {
      return 1;
    }
    return Math.max(...this.migrations.map((m) => m.toVersion));
  }

  public getMigrationPath(fromVersion: number, toVersion: number): ReadonlyArray<IProjectMigration> {
    return this.migrations.filter(
      (m) => m.fromVersion >= fromVersion && m.toVersion <= toVersion,
    );
  }
}

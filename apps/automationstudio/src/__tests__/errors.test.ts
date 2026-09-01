/**
 * Error hierarchy tests.
 */

import { describe, it, expect } from 'vitest';
import { AutomationStudioError } from '../errors/base-error';
import { ConfigurationError, ConfigurationNotFoundError } from '../errors/configuration-error';
import { ExtensionError, ActivationError, CircularDependencyError } from '../errors/extension-error';
import { ValidationError, SchemaValidationError } from '../errors/validation-error';
import { PluginError, PluginNotFoundError } from '../errors/plugin-error';
import { ServiceError, ServiceInitializationError } from '../errors/service-error';
import { ProjectError, ProjectNotFoundError, ProjectMigrationError } from '../errors/project-error';

describe('Error Hierarchy', () => {
  describe('AutomationStudioError base', () => {
    it('should include code, message, and timestamp', () => {
      const err = new ConfigurationError('test');
      expect(err.code).toBe('AS-6000');
      expect(err.message).toBe('test');
      expect(err.timestamp).toBeGreaterThan(0);
    });

    it('should chain cause', () => {
      const cause = new Error('root cause');
      const err = new ConfigurationError('wrapped', { cause });
      expect(err.cause).toBe(cause);
    });

    it('should include recovery suggestion', () => {
      const err = new ConfigurationNotFoundError('missing.key');
      expect(err.recovery?.suggestion).toBeTruthy();
    });

    it('should serialize to JSON', () => {
      const err = new ConfigurationNotFoundError('test.key');
      const json = err.toJSON();
      expect(json['code']).toBe('AS-6001');
      expect(json['name']).toBe('ConfigurationNotFoundError');
      expect(json['message']).toContain('test.key');
    });

    it('should produce readable toString', () => {
      const err = new ConfigurationNotFoundError('test.key');
      const str = err.toString();
      expect(str).toContain('[AS-6001]');
      expect(str).toContain('test.key');
      expect(str).toContain('Recovery');
    });
  });

  describe('error code ranges', () => {
    it('AS-1xxx for project errors', () => {
      expect(new ProjectError('test').code).toBe('AS-1000');
      expect(new ProjectNotFoundError('/path').code).toBe('AS-1001');
      expect(new ProjectMigrationError(1, 2, 'fail').code).toBe('AS-1004');
    });

    it('AS-5xxx for extension errors', () => {
      expect(new ExtensionError('test').code).toBe('AS-5000');
      expect(new ActivationError('boot').code).toBe('AS-5001');
      expect(new CircularDependencyError(['A', 'B', 'A']).code).toBe('AS-5004');
    });

    it('AS-6xxx for configuration errors', () => {
      expect(new ConfigurationError('test').code).toBe('AS-6000');
      expect(new ConfigurationNotFoundError('key').code).toBe('AS-6001');
    });

    it('AS-7xxx for plugin errors', () => {
      expect(new PluginError('test').code).toBe('AS-7000');
      expect(new PluginNotFoundError('plugin').code).toBe('AS-7001');
    });

    it('AS-8xxx for validation errors', () => {
      expect(new ValidationError('test').code).toBe('AS-8000');
      expect(new SchemaValidationError('schema', ['issue']).code).toBe('AS-8001');
    });

    it('AS-9xxx for service errors', () => {
      expect(new ServiceError('test').code).toBe('AS-9000');
      expect(new ServiceInitializationError('svc').code).toBe('AS-9001');
    });
  });

  describe('instanceof', () => {
    it('all errors extend AutomationStudioError', () => {
      expect(new ConfigurationError('test')).toBeInstanceOf(AutomationStudioError);
      expect(new ExtensionError('test')).toBeInstanceOf(AutomationStudioError);
      expect(new ValidationError('test')).toBeInstanceOf(AutomationStudioError);
      expect(new PluginError('test')).toBeInstanceOf(AutomationStudioError);
      expect(new ServiceError('test')).toBeInstanceOf(AutomationStudioError);
      expect(new ProjectError('test')).toBeInstanceOf(AutomationStudioError);
    });

    it('all errors extend Error', () => {
      expect(new ConfigurationError('test')).toBeInstanceOf(Error);
    });
  });

  describe('context', () => {
    it('should carry error context', () => {
      const err = new ProjectNotFoundError('/some/path');
      expect(err.context['path']).toBe('/some/path');
    });

    it('CircularDependencyError carries chain', () => {
      const err = new CircularDependencyError(['A', 'B', 'C', 'A']);
      expect(err.context['chain']).toEqual(['A', 'B', 'C', 'A']);
      expect(err.message).toContain('A → B → C → A');
    });
  });
});

/**
 * Path utilities with normalization and traversal prevention.
 */

import { normalize, resolve, relative, isAbsolute, sep, posix, basename, dirname, extname } from 'node:path';

export function normalizePath(inputPath: string): string {
  return normalize(inputPath).replace(/\\/g, posix.sep);
}

export function isPathTraversal(inputPath: string, basePath: string): boolean {
  const resolvedBase = resolve(basePath);
  const resolvedPath = resolve(basePath, inputPath);
  return !resolvedPath.startsWith(resolvedBase + posix.sep) && resolvedPath !== resolvedBase;
}

export function ensureRelativePath(inputPath: string, basePath: string): string {
  if (isPathTraversal(inputPath, basePath)) {
    throw new Error(`Path traversal detected: '${inputPath}' escapes base '${basePath}'`);
  }
  if (isAbsolute(inputPath)) {
    return normalizePath(relative(basePath, inputPath));
  }
  return normalizePath(inputPath);
}

export function toRelativePath(absolutePath: string, basePath: string): string {
  return normalizePath(relative(basePath, absolutePath));
}

export function toAbsolutePath(relativePath: string, basePath: string): string {
  return resolve(basePath, relativePath);
}

export function getBasename(filePath: string): string {
  return basename(filePath);
}

export function getDirname(filePath: string): string {
  return dirname(filePath);
}

export function getExtension(filePath: string): string {
  return extname(filePath);
}

export function hasExtension(filePath: string, ext: string): boolean {
  const fileExt = extname(filePath).toLowerCase();
  const targetExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return fileExt === targetExt;
}

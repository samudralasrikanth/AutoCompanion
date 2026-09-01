import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const systemBrowserCandidates = (): string[] => {
  const candidates = [
    process.env['PROGRAMFILES'] && join(process.env['PROGRAMFILES'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['ProgramFiles'] && join(process.env['ProgramFiles'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES'] && join(process.env['PROGRAMFILES'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['ProgramFiles'] && join(process.env['ProgramFiles'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)']!, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['LOCALAPPDATA'] && join(process.env['LOCALAPPDATA'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['LOCALAPPDATA'] && join(process.env['LOCALAPPDATA'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const pathEntry of (process.env['PATH'] || '').split(delimiter)) {
    candidates.push(join(pathEntry, process.platform === 'win32' ? 'chrome.exe' : 'google-chrome'));
    candidates.push(join(pathEntry, process.platform === 'win32' ? 'msedge.exe' : 'chromium'));
  }
  return candidates;
};

export function chromiumLaunchOptions(playwright: any): { headless: false; executablePath?: string } {
  const bundledPath = typeof playwright?.chromium?.executablePath === 'function'
    ? playwright.chromium.executablePath()
    : undefined;
  if (bundledPath && existsSync(bundledPath)) {
    return { headless: false, executablePath: bundledPath };
  }

  const systemPath = systemBrowserCandidates().find((candidate) => existsSync(candidate));
  if (systemPath) {
    return { headless: false, executablePath: systemPath };
  }

  throw new Error(
    'No Chromium browser was found. Install Google Chrome or Microsoft Edge, or run "npx playwright install chromium" before starting Playwright.',
  );
}

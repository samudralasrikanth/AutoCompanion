import type { ActionType, ScenarioMode } from './scenario-ir';

export interface ActionDescriptor {
  type: ActionType;
  label: string;
  modes: readonly ScenarioMode[];
  idempotent: boolean;
  requiresTarget: boolean;
  secretParameters?: readonly string[];
}

const descriptor = (
  type: ActionType,
  label: string,
  modes: readonly ScenarioMode[],
  idempotent: boolean,
  requiresTarget: boolean,
  secretParameters?: readonly string[],
): ActionDescriptor => ({ type, label, modes, idempotent, requiresTarget, secretParameters });

const descriptors: Record<ActionType, ActionDescriptor> = {
  click: descriptor('click', 'Click', ['playwright', 'surface'], false, true),
  type: descriptor('type', 'Type', ['playwright', 'surface'], false, true, ['value']),
  navigate: descriptor('navigate', 'Navigate', ['playwright'], false, false),
  dragAndDrop: descriptor('dragAndDrop', 'Drag and drop', ['playwright'], false, true),
  hover: descriptor('hover', 'Hover', ['playwright', 'surface'], true, true),
  rightClick: descriptor('rightClick', 'Right click', ['playwright', 'surface'], false, true),
  doubleClick: descriptor('doubleClick', 'Double click', ['playwright', 'surface'], false, true),
  select: descriptor('select', 'Select option', ['playwright', 'surface'], false, true),
  check: descriptor('check', 'Check', ['playwright', 'surface'], false, true),
  uncheck: descriptor('uncheck', 'Uncheck', ['playwright', 'surface'], false, true),
  assertVisible: descriptor('assertVisible', 'Assert visible', ['playwright', 'surface'], true, true),
  assertText: descriptor('assertText', 'Assert text', ['playwright', 'surface'], true, true),
  waitNavigation: descriptor('waitNavigation', 'Wait for navigation', ['playwright'], true, false),
  apiRequest: descriptor('apiRequest', 'API request', ['playwright'], true, false),
  assertResponseStatus: descriptor('assertResponseStatus', 'Assert response status', ['playwright'], true, false),
  assertResponseBody: descriptor('assertResponseBody', 'Assert response body', ['playwright'], true, false),
  uploadFile: descriptor('uploadFile', 'Upload file', ['playwright'], false, true),
  pressKey: descriptor('pressKey', 'Press key', ['playwright', 'surface'], false, false),
  assertValue: descriptor('assertValue', 'Assert value', ['playwright', 'surface'], true, true),
  tableCount: descriptor('tableCount', 'Table count', ['playwright'], true, true),
  waitForElement: descriptor('waitForElement', 'Wait for element', ['playwright', 'surface'], true, true),
  screenshot: descriptor('screenshot', 'Screenshot', ['playwright', 'surface'], true, false),
  loop: descriptor('loop', 'Repeat actions', ['playwright', 'surface'], false, false),
  excelLoop: descriptor('excelLoop', 'Data loop', ['playwright', 'surface'], false, false),
  scroll: descriptor('scroll', 'Scroll', ['playwright', 'surface'], true, false),
  drag: descriptor('drag', 'Drag', ['surface'], false, true),
  launch: descriptor('launch', 'Launch or activate window', ['surface'], false, false),
  callAction: descriptor('callAction', 'Reusable action', ['playwright', 'surface', 'terminal'], false, false),
  sshConnect: descriptor('sshConnect', 'Connect SSH', ['terminal'], false, false, ['password', 'passphrase']),
  sshCommand: descriptor('sshCommand', 'Run SSH command', ['terminal'], false, false),
  sshExpect: descriptor('sshExpect', 'Expect terminal output', ['terminal'], true, false),
  sshDisconnect: descriptor('sshDisconnect', 'Disconnect SSH', ['terminal'], true, false),
  sshUpload: descriptor('sshUpload', 'Upload over SSH', ['terminal'], false, false),
  sshDownload: descriptor('sshDownload', 'Download over SSH', ['terminal'], false, false),
};

export const ACTION_DESCRIPTORS: ReadonlyMap<ActionType, ActionDescriptor> = new Map(
  Object.entries(descriptors) as [ActionType, ActionDescriptor][],
);

export function isActionSupported(type: ActionType, mode: ScenarioMode): boolean {
  return ACTION_DESCRIPTORS.get(type)?.modes.includes(mode) ?? false;
}

export class UnsupportedActionError extends Error {
  public readonly code = 'UNSUPPORTED_ACTION';

  constructor(public readonly actionType: string, public readonly mode: ScenarioMode) {
    super(`Action "${actionType}" is not supported in ${mode} mode.`);
    this.name = 'UnsupportedActionError';
  }
}

export function assertActionSupported(type: ActionType, mode: ScenarioMode): void {
  if (!isActionSupported(type, mode)) throw new UnsupportedActionError(type, mode);
}

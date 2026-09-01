export type ActionType = 
  | 'click' 
  | 'type' 
  | 'navigate' 
  | 'dragAndDrop' 
  | 'hover' 
  | 'rightClick' 
  | 'doubleClick'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'assertVisible'
  | 'assertText'
  | 'waitNavigation'
  | 'apiRequest'
  | 'assertResponseStatus'
  | 'assertResponseBody'
  // Builder-native actions. Adapters may implement these directly or compile
  // them into one or more of the primitive actions above.
  | 'uploadFile'
  | 'pressKey'
  | 'assertValue'
  | 'tableCount'
  | 'waitForElement'
  | 'screenshot'
  | 'loop'
  | 'excelLoop'
  | 'scroll'
  | 'drag'
  | 'launch'
  | 'callAction'
  | 'sshConnect'
  | 'sshCommand'
  | 'sshExpect'
  | 'sshDisconnect'
  | 'sshUpload'
  | 'sshDownload';

export interface IStepParameter {
  name: string;
  value: string;
  isVariable?: boolean;
  isSecret?: boolean;
}

export interface IScreenshotAttachment {
  name: string;
  path?: string;
  dataUrl?: string;
  timestamp?: number;
  type?: 'before' | 'after' | 'failure' | 'evidence';
  redacted?: boolean;
}

export type ScreenshotAttachment = IScreenshotAttachment & {
  timestamp: number;
  type: 'before' | 'after' | 'failure' | 'evidence';
  redacted: boolean;
};

export type SurfaceLocatorStrategy =
  | 'uia'
  | 'accessibility'
  | 'native'
  | 'ocr'
  | 'image'
  | 'anchor'
  | 'relative'
  | 'coordinate';

export interface SurfaceLocatorEvidence {
  strategy: SurfaceLocatorStrategy;
  value: unknown;
  region?: { x: number; y: number; width: number; height: number };
  scope?: 'window' | 'surface' | 'screen' | 'region';
  priority?: number;
}

export interface SurfaceWaitPolicy {
  condition: 'window' | 'element' | 'ocr' | 'image' | 'screen' | 'settle';
  timeoutMs?: number;
  intervalMs?: number;
  expected?: string;
}

export interface SurfaceVerificationPolicy {
  condition: 'exists' | 'visible' | 'text' | 'window' | 'screen';
  expected?: string;
  timeoutMs?: number;
}

export interface SurfaceRecoveryPolicy {
  maxAttempts?: number;
  refreshWindow?: boolean;
  fallbackStrategies?: SurfaceLocatorStrategy[];
}

export interface SurfaceStepOptions {
  windowTitle?: string;
  screen?: string;
  locators?: SurfaceLocatorEvidence[];
  waitBefore?: SurfaceWaitPolicy;
  waitAfter?: SurfaceWaitPolicy;
  verification?: SurfaceVerificationPolicy;
  recovery?: SurfaceRecoveryPolicy;
  captureMetadata?: {
    captureSize: { width: number; height: number };
    windowBounds: { x: number; y: number; width: number; height: number };
    displayScale?: number;
  };
}

export interface IStep {
  id: string;
  type: ActionType;
  target?: string; // ObjectId from ObjectRepository
  locatorFallback?: { strategy: string; value: string }[];
  parameters?: IStepParameter[];
  disabled?: boolean;
  description?: string;
  timestamp?: number;
  surface?: SurfaceStepOptions;
  children?: IStep[];
  screenshots?: IScreenshotAttachment[];
  screenId?: string;
  screenLabel?: string;
}

export interface IScenarioVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  defaultValue?: string;
  description?: string;
  isSecret?: boolean;
}

export interface IScenarioMetadata {
  schemaVersion: string;
  createdBy: string;
  generatedBy?: string;
  lastOptimized?: string;
  platformVersion: string;
  flowNodes?: any[];
  [key: string]: any;
}

export type ScenarioMode = 'surface' | 'playwright' | 'terminal' | 'jira';

export type StepStatus = 'passed' | 'failed' | 'skipped' | 'unsupported' | 'error';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  durationMs: number;
  error?: string;
  screenshots?: ScreenshotAttachment[];
  actionRef?: { actionId: string; version: string };
  childResults?: StepResult[];
}

export interface IScenario {
  id: string;
  name: string;
  description?: string;
  mode?: ScenarioMode;
  metadata?: IScenarioMetadata;
  variables?: IScenarioVariable[];
  flowNodes?: any[];
  preconditions?: IStep[];
  steps: IStep[];
  assertions?: IStep[];
  recovery?: IStep[];
  cleanup?: IStep[];
  createdAt: number;
  updatedAt: number;
}

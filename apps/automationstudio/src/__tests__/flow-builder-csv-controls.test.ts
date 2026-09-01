import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Flow Builder CSV Controls & Import Flow Steps', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autocon-csv-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function parseCsvContent(content: string): Array<Record<string, string>> {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = '';
      let inQuotes = false;
      const delimiter = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (c === delimiter && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headerLine = lines[0]!;
    const rawHeaders = parseLine(headerLine);
    const hasHeader = rawHeaders.some((h) => ['action', 'type', 'step', 'stepname', 'step_name', 'control', 'target', 'fullname', 'window', 'value', 'locator', 'label', 'name', 'scenario', 'scenarioname', 'scenario_name'].includes(h.toLowerCase().replace(/[^a-z0-9_]/g, '')));

    if (hasHeader) {
      const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
      const rows: Array<Record<string, string>> = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = parseLine(lines[i]!);
        if (!vals.length || (vals.length === 1 && !vals[0])) continue;
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
        rows.push(row);
      }
      return rows;
    } else {
      const rows: Array<Record<string, string>> = [];
      for (const line of lines) {
        const vals = parseLine(line);
        if (!vals.length || (vals.length === 1 && !vals[0])) continue;
        const row: Record<string, string> = {};
        if (vals.length === 1) {
          row['target'] = vals[0]!;
        } else if (vals.length === 2) {
          row['target'] = vals[0]!;
          row['value'] = vals[1]!;
        } else if (vals.length >= 3) {
          row['window'] = vals[0]!;
          row['control'] = vals[1]!;
          row['value'] = vals[2]!;
        }
        rows.push(row);
      }
      return rows;
    }
  }

  it('correctly parses CSV with standard headers and quotes', () => {
    const csv = [
      'control,action,value',
      'LoginWindow.Username,type,admin',
      'LoginWindow.Password,type,"p@ss,w0rd"',
      'LoginWindow.LoginButton,click,',
    ].join('\n');

    const rows = parseCsvContent(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ control: 'LoginWindow.Username', action: 'type', value: 'admin' });
    expect(rows[1]).toEqual({ control: 'LoginWindow.Password', action: 'type', value: 'p@ss,w0rd' });
    expect(rows[2]).toEqual({ control: 'LoginWindow.LoginButton', action: 'click', value: '' });
  });

  it('persists identified controls with windowName.controlName to controls.csv', () => {
    const windowName = 'CalculatorApp';
    const controls = [
      { id: 'ctrl-1', label: 'Button 7', controlType: 'button', bbox: { x: 10, y: 20, width: 40, height: 30 }, locator: { strategy: 'ocr', value: '7' } },
      { id: 'ctrl-2', label: 'Display', controlType: 'textBox', bbox: { x: 10, y: 5, width: 120, height: 15 }, locator: { strategy: 'ocr', value: '0' } },
    ];

    const safeWindow = windowName.replace(/[^a-zA-Z0-9_-]+/g, '_');
    const existingMap = new Map<string, any>();

    for (const ctrl of controls) {
      const safeControl = ctrl.label.replace(/[^a-zA-Z0-9_-]+/g, '_');
      const fullName = `${safeWindow}.${safeControl}`;
      existingMap.set(fullName, {
        id: fullName,
        window: safeWindow,
        control: ctrl.label,
        fullName,
        type: ctrl.controlType,
        strategy: ctrl.locator.strategy,
        locator: ctrl.locator.value,
        x: ctrl.bbox.x,
        y: ctrl.bbox.y,
        width: ctrl.bbox.width,
        height: ctrl.bbox.height,
      });
    }

    const csvPath = path.join(tempDir, 'controls.csv');
    const headers = 'id,window,control,fullName,type,strategy,locator,x,y,width,height';
    const lines = [headers];
    for (const row of existingMap.values()) {
      lines.push(`${row.id},${row.window},${row.control},${row.fullName},${row.type},${row.strategy},"${row.locator}",${row.x},${row.y},${row.width},${row.height}`);
    }
    fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');

    expect(fs.existsSync(csvPath)).toBe(true);
    const content = fs.readFileSync(csvPath, 'utf8');
    expect(content).toContain('CalculatorApp.Button_7');
    expect(content).toContain('CalculatorApp.Display');
    expect(content).toContain('CalculatorApp');
  });

  it('merges new screen controls into existing controls.csv across multiple screenshots', () => {
    const csvPath = path.join(tempDir, 'controls.csv');
    fs.writeFileSync(csvPath, [
      'id,window,control,fullName,type,strategy,locator,x,y,width,height',
      'LoginWindow.Username,LoginWindow,Username,LoginWindow.Username,textBox,ocr,"Username",10,20,100,30',
    ].join('\n') + '\n', 'utf8');

    const existingRows = parseCsvContent(fs.readFileSync(csvPath, 'utf8'));
    const map = new Map<string, any>();
    for (const r of existingRows) map.set(r.fullName || r.id, r);

    map.set('Dashboard.Logout', {
      id: 'Dashboard.Logout',
      window: 'Dashboard',
      control: 'Logout',
      fullName: 'Dashboard.Logout',
      type: 'button',
      strategy: 'ocr',
      locator: 'Logout',
      x: '500',
      y: '20',
      width: '80',
      height: '30',
    });

    const lines = ['id,window,control,fullName,type,strategy,locator,x,y,width,height'];
    for (const row of map.values()) {
      lines.push(`${row.id},${row.window},${row.control},${row.fullName},${row.type},${row.strategy},"${row.locator}",${row.x},${row.y},${row.width},${row.height}`);
    }
    fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');

    const updated = fs.readFileSync(csvPath, 'utf8');
    expect(updated).toContain('LoginWindow.Username');
    expect(updated).toContain('Dashboard.Logout');
  });

  it('correctly parses CSV containing stepName column header', () => {
    const csv = [
      'stepName,control,action,value',
      'Fill username field,LoginWindow.Username,type,admin@example.com',
      'Enter user password,LoginWindow.Password,type,SecretPass123!',
      'Submit the login form,LoginWindow.LoginButton,click,',
    ].join('\n');

    const rows = parseCsvContent(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.stepname || rows[0]?.stepName).toBe('Fill username field');
    expect(rows[0]?.control).toBe('LoginWindow.Username');
    expect(rows[0]?.action).toBe('type');
    expect(rows[0]?.value).toBe('admin@example.com');
  });

  it('correctly parses and groups CSV rows containing scenario column', () => {
    const csv = [
      'scenario,stepName,control,action,value',
      'Scenario 1: Login,Fill username,LoginWindow.Username,type,student',
      'Scenario 1: Login,Enter password,LoginWindow.Password,type,secret://app.password',
      'Scenario 1: Login,Click submit,LoginWindow.Submit,click,',
      'Scenario 2: Logout,Click logout,Dashboard.Logout,click,',
    ].join('\n');

    const rows = parseCsvContent(csv);
    expect(rows).toHaveLength(4);

    const scenarioMap = new Map<string, any[]>();
    for (const row of rows) {
      const scName = row.scenario || 'Scenario 1';
      if (!scenarioMap.has(scName)) scenarioMap.set(scName, []);
      scenarioMap.get(scName)!.push(row);
    }

    expect(scenarioMap.size).toBe(2);
    expect(scenarioMap.get('Scenario 1: Login')).toHaveLength(3);
    expect(scenarioMap.get('Scenario 2: Logout')).toHaveLength(1);
  });

  it('correctly parses raw controls.csv rows and columns for modal view', () => {
    const csvContent = [
      'id,window,control,fullName,type,strategy,locator,x,y,width,height',
      'Calc.Btn7,Calc,Btn7,Calc.Btn7,button,ocr,"7",10,20,40,30',
      'Calc.Btn8,Calc,Btn8,Calc.Btn8,button,ocr,"8",55,20,40,30',
    ].join('\n');

    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    const rows = lines.map(line => {
      const parts: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') inQuote = !inQuote;
        else if (ch === ',' && !inQuote) {
          parts.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      parts.push(cur);
      return parts.map(p => p.replace(/^"|"$/g, '').trim());
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(['id', 'window', 'control', 'fullName', 'type', 'strategy', 'locator', 'x', 'y', 'width', 'height']);
    expect(rows[1]).toEqual(['Calc.Btn7', 'Calc', 'Btn7', 'Calc.Btn7', 'button', 'ocr', '7', '10', '20', '40', '30']);
    expect(rows[2]).toEqual(['Calc.Btn8', 'Calc', 'Btn8', 'Calc.Btn8', 'button', 'ocr', '8', '55', '20', '40', '30']);
  });
});


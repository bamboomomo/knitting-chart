import type { KnittingChart } from '../types';

/** 画布项目文件格式 */
export interface ChartProject {
  version: 1;
  chart: KnittingChart;
  rowStart: number;
  colStart: number;
  gridLineColor: string;
}

/** 将画布项目保存为 JSON 文件 */
export async function saveProject(
  chart: KnittingChart,
  rowStart: number,
  colStart: number,
  gridLineColor: string,
  filename: string = 'knitting-chart.json'
): Promise<boolean> {
  const project: ChartProject = {
    version: 1,
    chart,
    rowStart,
    colStart,
    gridLineColor,
  };

  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  // 尝试使用原生保存对话框
  if (window.isSecureContext && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: '编织图纸文件', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e: any) {
      if (e.name === 'AbortError') return false; // 用户取消
    }
  }

  // 降级：直接下载
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

/** 从文件打开画布项目 */
export async function openProject(): Promise<ChartProject | null> {
  // 尝试使用原生文件选择器
  if (window.isSecureContext && 'showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: '编织图纸文件', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      return parseProjectFile(file);
    } catch (e: any) {
      if (e.name === 'AbortError') return null; // 用户取消
    }
  }

  // 降级：使用 input[type=file]
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const result = await parseProjectFile(file);
      resolve(result);
    };
    input.click();
  });
}

async function parseProjectFile(file: File): Promise<ChartProject | null> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (data.version !== 1 || !data.chart) {
      alert('无效的编织图纸文件');
      return null;
    }
    return data as ChartProject;
  } catch {
    alert('无法读取文件，请确认文件格式正确');
    return null;
  }
}

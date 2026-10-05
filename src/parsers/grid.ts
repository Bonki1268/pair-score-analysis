import * as XLSX from 'xlsx';

export type CellValue = string | number | null;

/** 以 A1 為原點的二維陣列，避免工作表範圍不從 A1 開始時欄位錯位 */
export class Grid {
  readonly rows: CellValue[][];

  constructor(
    readonly name: string,
    ws: XLSX.WorkSheet,
  ) {
    this.rows = [];
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue;
      const cell = ws[key] as XLSX.CellObject;
      if (cell.v === undefined || cell.v === null || cell.v === '') continue;
      const { r, c } = XLSX.utils.decode_cell(key);
      const row = (this.rows[r] ??= []);
      row[c] = typeof cell.v === 'number' ? cell.v : String(cell.v);
    }
  }

  get rowCount(): number {
    return this.rows.length;
  }

  get(r: number, c: number): CellValue {
    return this.rows[r]?.[c] ?? null;
  }

  str(r: number, c: number): string {
    const v = this.get(r, c);
    return v === null ? '' : String(v).trim();
  }

  num(r: number, c: number): number | null {
    const v = this.get(r, c);
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    return null;
  }

  /** 一列中有值的欄位，依欄號排序 */
  cells(r: number): { c: number; v: string | number }[] {
    const row = this.rows[r];
    if (!row) return [];
    const out: { c: number; v: string | number }[] = [];
    row.forEach((v, c) => {
      if (v !== null && v !== undefined) out.push({ c, v });
    });
    return out;
  }

  /** 在某列找出標題文字相符的欄號（忽略空白） */
  findCol(r: number, label: string, from = 0, to = Infinity): number {
    const want = norm(label);
    for (const { c, v } of this.cells(r)) {
      if (c < from || c >= to) continue;
      if (typeof v === 'string' && norm(v) === want) return c;
    }
    return -1;
  }

  ref(r: number, c: number): string {
    return XLSX.utils.encode_cell({ r, c });
  }
}

export function norm(s: string): string {
  return s.replace(/\s+/g, '');
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array', cellFormula: false, cellHTML: false, cellStyles: false });
}

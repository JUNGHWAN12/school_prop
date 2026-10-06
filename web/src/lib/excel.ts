import * as XLSX from 'xlsx';
import type { Item } from '../types';
import { representativeName } from './summary';

/** K-에듀파인 `품목내역(통합)` 원본 서식 (docs/samples/품목내역(통합)_원본서식.xls) */
export const SHEET_NAME = '품목내역';
export const HEADERS = ['내용', '규격', '단위', '수량', '예상단가'] as const;
const COL_WIDTH_CHARS = 14; // 원본 3600/256 ≈ 14

export function buildWorkbook(items: Pick<Item, 'itemName' | 'spec' | 'unit' | 'quantity' | 'unitPrice'>[]): XLSX.WorkBook {
  const rows = items.map((i) => [i.itemName, i.spec, i.unit, i.quantity, i.unitPrice]);
  const ws = XLSX.utils.aoa_to_sheet([[...HEADERS], ...rows]);
  // 수량·단가는 반드시 숫자 타입
  rows.forEach((_, r) => {
    for (const c of [3, 4]) {
      const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c })];
      if (cell) {
        cell.t = 'n';
        cell.z = 'General';
      }
    }
  });
  ws['!cols'] = HEADERS.map(() => ({ wch: COL_WIDTH_CHARS }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return wb;
}

export type ExcelFormat = 'xls' | 'xlsx';

export function workbookToBytes(wb: XLSX.WorkBook, format: ExcelFormat = 'xlsx'): Uint8Array {
  const out = XLSX.write(wb, { bookType: format === 'xls' ? 'biff8' : 'xlsx', type: 'array' });
  return new Uint8Array(out as ArrayBuffer);
}

export interface ValidationIssue { message: string }

/** 생성된 워크북이 K-에듀파인 일괄등록 규격을 지키는지 검사 */
export function validateWorkbook(wb: XLSX.WorkBook): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (wb.SheetNames.length !== 1 || wb.SheetNames[0] !== SHEET_NAME) {
    issues.push({ message: `시트는 '${SHEET_NAME}' 하나여야 합니다` });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [...issues, { message: '시트가 없습니다' }];
  if (ws['!merges'] && ws['!merges'].length) issues.push({ message: '셀 병합은 허용되지 않습니다' });
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  if (range.e.c !== HEADERS.length - 1) issues.push({ message: `열은 ${HEADERS.length}개여야 합니다` });
  HEADERS.forEach((h, c) => {
    if (ws[XLSX.utils.encode_cell({ r: 0, c })]?.v !== h) issues.push({ message: `헤더 ${c + 1}열은 '${h}'이어야 합니다` });
  });
  for (let r = 1; r <= range.e.r; r++) {
    for (const c of [3, 4]) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.t !== 'n' || !Number.isFinite(cell.v)) {
        issues.push({ message: `${r + 1}행 ${HEADERS[c]}은(는) 숫자여야 합니다` });
      }
    }
    if (!String(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v ?? '').trim()) {
      issues.push({ message: `${r + 1}행 내용(품명)이 비어 있습니다` });
    }
  }
  return issues;
}

const INVALID_FILENAME = /[\\/:*?"<>|]/g;

export function excelFileName(items: Pick<Item, 'itemName'>[], date = new Date(), format: ExcelFormat = 'xlsx'): string {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const name = representativeName(items as Item[]).replace(INVALID_FILENAME, '_').slice(0, 40) || '품목';
  return `품목내역(통합)_${name}_${ymd}.${format}`;
}

export function downloadExcel(items: Item[], format: ExcelFormat = 'xlsx') {
  const wb = buildWorkbook(items);
  const bytes = workbookToBytes(wb, format);
  const blob = new Blob([bytes as BlobPart], { type: format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = excelFileName(items, new Date(), format);
  a.click();
  URL.revokeObjectURL(url);
}

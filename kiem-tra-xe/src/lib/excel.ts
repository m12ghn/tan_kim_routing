// Xuất Excel (.xlsx). Thư viện chỉ tải khi bấm nút.
export type XCell = string | number | null;

export async function downloadXlsx(fileName: string, header: string[], rows: XCell[][]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    header.map((h) => ({ value: h, fontWeight: 'bold' as const })),
    ...rows.map((r) => r.map((v) => (v == null || v === '' ? null : { value: v }))),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(data as any).toFile(fileName);
}

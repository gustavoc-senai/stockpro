import ExcelJS from "exceljs";
import {
  importDefinitions,
  MAX_BYTES,
  MAX_COLUMNS,
  MAX_ROWS,
  type ImportKind,
  type Cell,
  type Sheet,
} from "./model";
import { parseCsv, tableToSheet, checkXlsxArchive } from "./parser";
type Request =
  | { operation: "read"; filename: string; buffer: ArrayBuffer }
  | { operation: "template"; kind: ImportKind };
self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    if (event.data.operation === "template") {
      const kind = event.data.kind,
        workbook = new ExcelJS.Workbook(),
        sheet = workbook.addWorksheet(importDefinitions[kind].label);
      sheet.columns = importDefinitions[kind].fields.map((f) => ({
        header: f.label,
        key: f.key,
        width: f.key === "name" ? 35 : 24,
        style: { numFmt: f.key === "minimum_stock" ? "0.000" : "@" },
      }));
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3268E8" },
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      const value = await workbook.xlsx.writeBuffer();
      self.postMessage({ ok: true, operation: "template", buffer: value });
      return;
    }
    const { buffer, filename } = event.data;
    if (buffer.byteLength > MAX_BYTES)
      throw new Error("Use um arquivo de até 5 MB.");
    let sheets: Sheet[] = [];
    if (filename.toLowerCase().endsWith(".csv")) {
      const raw = new Uint8Array(buffer);
      let text: string;
      if (raw[0] === 255 && raw[1] === 254)
        text = new TextDecoder("utf-16le").decode(raw);
      else if (raw[0] === 254 && raw[1] === 255)
        text = new TextDecoder("utf-16be").decode(raw);
      else {
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
        } catch {
          text = new TextDecoder("windows-1252").decode(raw);
        }
      }
      sheets = [parseCsv(text)];
    } else if (filename.toLowerCase().endsWith(".xlsx")) {
      checkXlsxArchive(buffer);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      if (workbook.worksheets.length > 20)
        throw new Error("Use um arquivo com até 20 abas.");
      for (const ws of workbook.worksheets) {
        if (ws.state === "hidden" || ws.state === "veryHidden") continue;
        if (ws.rowCount > MAX_ROWS + 1 || ws.columnCount > MAX_COLUMNS)
          throw new Error(
            `A aba ${ws.name} excede o limite de linhas ou colunas. Remova também formatação em áreas sem dados.`,
          );
        const table: { line: number; cells: Cell[] }[] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cells: Cell[] = [];
          for (let i = 1; i <= ws.columnCount; i++) {
            const cell = row.getCell(i),
              value = cell.value;
            if (cell.type === ExcelJS.ValueType.Formula)
              throw new Error(
                `Aba ${ws.name}, linha ${row.number}: substitua fórmulas por valores antes de importar.`,
              );
            if (value == null) {
              cells.push(null);
              continue;
            }
            if (
              typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
            )
              cells.push(value);
            else if (value instanceof Date)
              throw new Error(
                `Aba ${ws.name}, linha ${row.number}: converta datas em texto antes de importar.`,
              );
            else if ("richText" in value)
              cells.push(value.richText.map((t) => t.text).join(""));
            else if ("text" in value) cells.push(String(value.text));
            else
              throw new Error(
                `Aba ${ws.name}, linha ${row.number}: há uma célula com erro ou formato não suportado.`,
              );
          }
          table.push({ line: row.number, cells });
        });
        const sheet = tableToSheet(ws.name, table);
        if (sheet) sheets.push(sheet);
      }
    } else throw new Error("Formato não suportado. Envie .xlsx ou .csv.");
    if (!sheets.length)
      throw new Error("Nenhuma aba visível com dados foi encontrada.");
    self.postMessage({ ok: true, operation: "read", sheets });
  } catch (error) {
    self.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível ler o arquivo.",
    });
  }
};

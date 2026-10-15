import { MAX_COLUMNS, MAX_ROWS, type Cell, type Sheet } from "./model.ts";
export function tableToSheet(
  name: string,
  table: { line: number; cells: Cell[] }[],
): Sheet | null {
  const rows = table.filter((r) =>
    r.cells.some((c) => String(c ?? "").trim() !== ""),
  );
  if (!rows.length) return null;
  if (rows.length > MAX_ROWS + 1)
    throw new Error("Use até 1.000 linhas de dados por arquivo.");
  if (rows.some((r) => r.cells.length > MAX_COLUMNS))
    throw new Error("Use até 50 colunas por aba.");
  const [first, ...data] = rows;
  return {
    name,
    headers: first.cells.map(
      (v, i) => String(v ?? "").trim() || `Coluna ${i + 1}`,
    ),
    rows: data,
  };
}
export function parseCsv(text: string): Sheet {
  const first = text.replace(/^\uFEFF/, "");
  let quoted = false;
  let sample = "";
  for (let i = 0; i < first.length; i++) {
    const c = first[i];
    if (c === '"') {
      if (quoted && first[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
    } else if (!quoted && (c === "\n" || c === "\r")) break;
    else if (!quoted) sample += c;
  }
  const separator = [";", ",", "\t"]
    .map((value) => ({ value, count: sample.split(value).length - 1 }))
    .sort((a, b) => b.count - a.count)[0].value;
  const rows: { line: number; cells: Cell[] }[] = [];
  let cells: Cell[] = [],
    field = "",
    inside = false,
    closed = false,
    line = 1,
    start = 1;
  function finishField() {
    cells.push(field);
    field = "";
    closed = false;
    if (cells.length > MAX_COLUMNS) throw new Error("Use até 50 colunas.");
  }
  function finishRow() {
    finishField();
    if (cells.some((c) => String(c).trim())) rows.push({ line: start, cells });
    cells = [];
    if (rows.length > MAX_ROWS + 1)
      throw new Error("Use até 1.000 linhas de dados por arquivo.");
  }
  for (let i = 0; i < first.length; i++) {
    const c = first[i];
    if (inside) {
      if (c === '"') {
        if (first[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inside = false;
          closed = true;
        }
      } else {
        field += c;
        if (c === "\n") line++;
      }
      continue;
    }
    if (c === separator) {
      finishField();
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && first[i + 1] === "\n") i++;
      finishRow();
      line++;
      start = line;
      continue;
    }
    if (closed) {
      if (c === " " || c === "\t") continue;
      throw new Error(`CSV inválido perto da linha ${line}. Confira as aspas.`);
    }
    if (c === '"') {
      if (field !== "") throw new Error(`Aspas inesperadas na linha ${line}.`);
      inside = true;
    } else field += c;
  }
  if (inside) throw new Error("CSV com aspas não fechadas.");
  if (field !== "" || cells.length || closed) finishRow();
  const sheet = tableToSheet("CSV", rows);
  if (!sheet) throw new Error("O arquivo está vazio.");
  return sheet;
}
// Check ZIP central-directory declarations before ExcelJS decompresses the workbook.
export function checkXlsxArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  let end = -1;
  for (
    let p = buffer.byteLength - 22;
    p >= Math.max(0, buffer.byteLength - 65557);
    p--
  )
    if (
      view.getUint32(p, true) === 0x06054b50 &&
      p + 22 + view.getUint16(p + 20, true) === buffer.byteLength
    ) {
      end = p;
      break;
    }
  if (end < 0) throw new Error("Arquivo Excel inválido. Use um arquivo .xlsx.");
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    offset = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    count > 1000 ||
    count === 65535 ||
    offset + size > end
  )
    throw new Error("Estrutura ou tamanho do Excel não suportado.");
  let cursor = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (
      cursor + 46 > offset + size ||
      view.getUint32(cursor, true) !== 0x02014b50
    )
      throw new Error("Estrutura do Excel inválida.");
    const bytes = view.getUint32(cursor + 24, true);
    if (view.getUint16(cursor + 8, true) & 1 || bytes > 16 * 1024 * 1024)
      throw new Error("Arquivo protegido ou muito grande.");
    total += bytes;
    if (total > 32 * 1024 * 1024)
      throw new Error("A planilha descompactada excede o limite de 32 MB.");
    cursor +=
      46 +
      view.getUint16(cursor + 28, true) +
      view.getUint16(cursor + 30, true) +
      view.getUint16(cursor + 32, true);
    if (cursor > offset + size) throw new Error("Estrutura do Excel inválida.");
  }
  if (cursor !== offset + size)
    throw new Error("Estrutura do Excel não suportada.");
}

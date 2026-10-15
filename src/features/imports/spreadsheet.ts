import type { ImportKind, Sheet } from "./model";
type WorkerResponse =
  | { ok: false; error: string }
  | { ok: true; operation: "read"; sheets: Sheet[] }
  | { ok: true; operation: "template"; buffer: ArrayBuffer };
export function spreadsheetTask(
  request:
    | { operation: "read"; filename: string; buffer: ArrayBuffer }
    | { operation: "template"; kind: ImportKind },
  signal?: AbortSignal,
): Promise<WorkerResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Leitura cancelada."));
      return;
    }
    const worker = new Worker(
      new URL("./spreadsheet.worker.ts", import.meta.url),
      { type: "module" },
    );
    let timeout: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => {
      cleanup();
      reject(new Error("Leitura cancelada."));
    };
    signal?.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "A leitura excedeu 15 segundos. Divida o arquivo em arquivos menores.",
        ),
      );
    }, 15000);
    worker.onerror = () => {
      cleanup();
      reject(
        new Error(
          "Não foi possível processar a planilha. Confira o arquivo e tente novamente.",
        ),
      );
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      cleanup();
      if (!event.data.ok) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    worker.postMessage(
      request,
      request.operation === "read" ? [request.buffer] : [],
    );
  });
}

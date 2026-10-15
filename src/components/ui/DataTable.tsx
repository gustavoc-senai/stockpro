import { useEffect, useRef, type ReactNode } from "react";
export function DataTable({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const table = ref.current?.querySelector("table");
    if (!table) return;
    const headings = Array.from(
      table.querySelectorAll("thead th"),
      (th) => th.textContent?.trim() ?? "",
    );
    table
      .querySelectorAll("tbody tr")
      .forEach((row) =>
        Array.from(row.children).forEach((cell, index) =>
          cell.setAttribute("data-label", headings[index] ?? ""),
        ),
      );
  }, [children]);
  return (
    <div ref={ref} className="overflow-x-auto responsive-table">
      {children}
    </div>
  );
}

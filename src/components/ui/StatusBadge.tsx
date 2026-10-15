export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`status-badge ${active ? "active" : ""}`}>
      <span className="status-dot" aria-hidden="true" />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

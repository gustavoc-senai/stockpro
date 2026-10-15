import type { ReactNode } from "react";
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="form-section">
      <legend>{title}</legend>
      {description && <p className="form-section-description">{description}</p>}
      <div className="form-section-fields">{children}</div>
    </fieldset>
  );
}

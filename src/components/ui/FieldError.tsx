export function FieldError({
  name,
  message,
}: {
  name: string;
  message?: string;
}) {
  return message ? (
    <span id={`error-${name}`} className="field-error" role="alert">
      {message}
    </span>
  ) : null;
}

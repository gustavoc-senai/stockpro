export function safeAuthDestination(search: string) {
  const next = new URLSearchParams(search).get("next") ?? "";
  return /^\/invite\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    next,
  )
    ? next
    : "/app/dashboard";
}

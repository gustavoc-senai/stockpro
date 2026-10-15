export function Feedback({ error }: { error: unknown }) {
  if (!error) return null;
  const details =
    typeof error === "object" && error !== null
      ? (error as { code?: string; message?: string })
      : {};
  const message = details.message ?? "";
  const text = message.includes("Import validation failed")
    ? "Os dados mudaram ou contêm erros. Refaça a conferência antes de importar; nenhum registro do lote foi gravado."
    : message.includes("Import request mismatch")
      ? "A confirmação não corresponde à conferência. Selecione o arquivo e confira os dados novamente."
      : message.includes("Import limit exceeded")
        ? "A importação excede os limites. Divida o arquivo em lotes menores."
        : message.includes("Already a member")
          ? "Esta pessoa já participa da empresa."
          : message.includes("Invitation unavailable")
            ? "Este convite não está disponível. Confira a conta e peça um novo link ao administrador."
            : message.includes("Verified email required")
              ? "Confirme o e-mail da sua conta antes de aceitar o convite."
              : details.code === "23505"
                ? "Já existe um cadastro com esse nome ou código nesta empresa."
                : message.includes("Insufficient stock")
                  ? "Saldo insuficiente no depósito de origem. Confira a quantidade e tente novamente."
                  : message.includes("Invalid or inactive") ||
                      message.includes("Invalid destination")
                    ? "Selecione produtos, filiais e depósitos ativos da empresa atual."
                    : details.code === "PGRST202" ||
                        details.code === "42P01" ||
                        details.code === "PGRST205"
                      ? "Este recurso ainda precisa ser configurado pelo administrador do sistema."
                      : details.code === "42501"
                        ? "Seu acesso não permite concluir esta operação."
                        : "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";
  return (
    <p role="alert" className="notice error">
      {text}
    </p>
  );
}
export function Loading() {
  return (
    <div
      role="status"
      className="flex min-h-48 items-center justify-center gap-3 p-8 text-xs text-zinc-400"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400" />
      Carregando StockPro…
    </div>
  );
}

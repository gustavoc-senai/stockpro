import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { incident: string | null }
> {
  state: { incident: string | null } = { incident: null };
  static getDerivedStateFromError() {
    return { incident: crypto.randomUUID() };
  }
  componentDidCatch() {
    window.dispatchEvent(
      new CustomEvent("stockpro:diagnostic", {
        detail: {
          code: "ui_render_error",
          incident: this.state.incident,
          at: new Date().toISOString(),
        },
      }),
    );
  }
  render() {
    if (this.state.incident)
      return (
        <main className="mx-auto max-w-xl p-8 pt-24">
          <p className="eyebrow">STOCKPRO</p>
          <h1>Não foi possível exibir esta tela.</h1>
          <p className="my-5 text-zinc-400">
            Recarregue a página para tentar novamente. Se o problema continuar,
            informe o código abaixo ao suporte.
          </p>
          <p className="mb-6 break-all rounded-lg border border-zinc-700 p-4 font-mono text-xs">
            {this.state.incident}
          </p>
          <button className="primary" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        </main>
      );
    return this.props.children;
  }
}

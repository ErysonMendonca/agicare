"use client";

/**
 * Error boundary do root layout. Substitui a página de erro sintética do Next,
 * que falha ao pré-renderizar no build (`useContext` nulo em /_global-error).
 * Precisa ser autocontido: define o próprio <html>/<body> e NÃO usa contexto
 * nem providers (ele renderiza no lugar do root layout quando ativo).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Algo deu errado
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
            Ocorreu um erro inesperado. Tente novamente.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#0db8c2",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}

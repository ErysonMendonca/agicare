import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";

/**
 * Esqueleto genérico de página (para os `loading.tsx` de rota do App Router).
 * O Next mostra isto INSTANTANEAMENTE (streaming via Suspense) enquanto o Server
 * Component da página busca os dados — percepção de velocidade melhor que spinner.
 *
 * `variant="table"` (padrão) imita uma listagem (cabeçalho + busca + linhas).
 * `variant="cards"` imita uma grade de cards. `variant="detail"` imita uma
 * página de detalhe (cabeçalho + blocos).
 */
export function PageSkeleton({
  rows = 8,
  variant = "table",
}: {
  rows?: number;
  variant?: "table" | "cards" | "detail";
}) {
  return (
    <div aria-busy="true" aria-label="Carregando…">
      {/* Cabeçalho (título + subtítulo + ação) */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {variant === "detail" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-line p-5">
            <Skeleton className="mb-4 h-5 w-40" />
            <div className="grid gap-4 sm:grid-cols-3">
              <SkeletonText lines={2} />
              <SkeletonText lines={2} />
              <SkeletonText lines={2} />
            </div>
          </div>
          <div className="rounded-xl border border-line p-5">
            <Skeleton className="mb-4 h-5 w-48" />
            <SkeletonText lines={4} />
          </div>
        </div>
      ) : (
        <>
          {/* Barra de busca/filtros */}
          <div className="mb-4 flex flex-wrap gap-2">
            <Skeleton className="h-10 w-full max-w-sm rounded-lg" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>

          {variant === "cards" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-line p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-5 w-2/3" />
                  </div>
                  <SkeletonText lines={2} />
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              {Array.from({ length: rows }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0"
                >
                  <Skeleton className="h-4 w-10" />
                  <Skeleton className="h-4 w-full max-w-[240px]" />
                  <Skeleton className="hidden h-4 w-24 sm:block" />
                  <Skeleton className="ml-auto h-4 w-16" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

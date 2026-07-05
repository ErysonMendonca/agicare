"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    console.error("Local Error Boundary Caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
      <div className="w-full max-w-md p-6 bg-red-50 rounded-2xl border border-red-200">
        <h2 className="mb-2 text-xl font-bold text-red-700">SSR CRASH IN PRODUTO EDITOR</h2>
        <p className="mb-4 text-sm text-red-600">
          Ocorreu um erro durante a renderização deste componente.
        </p>
        <pre className="p-4 mb-4 text-left text-xs bg-red-100 rounded-lg text-red-900 overflow-auto whitespace-pre-wrap">
          {error.message || String(error)}
          {'\n\nStack:\n'}
          {error.stack}
        </pre>
        <button
          onClick={() => reset()}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

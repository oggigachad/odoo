import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  code?: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  code,
  requestId,
  onRetry,
  className = "",
}) => {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-sm text-red-900">
              {code ? `Error: ${code}` : "Something went wrong"}
            </h4>
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 bg-red-100/80 hover:bg-red-200/80 px-2.5 py-1 rounded-md transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-red-800">{message}</p>
          {requestId && (
            <p className="mt-2 text-xs text-red-500 font-mono">
              Reference: {requestId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

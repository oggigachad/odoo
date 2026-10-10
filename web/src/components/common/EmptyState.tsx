import React from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  message: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  actionText,
  actionHref,
  onAction,
  icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm my-4">
      <div className="text-slate-400 mb-3">
        {icon || <Inbox className="w-12 h-12 stroke-[1.5]" />}
      </div>
      <p className="text-slate-600 text-base mb-4 max-w-md">{message}</p>
      {actionText && actionHref && (
        <Link
          to={actionHref}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
        >
          {actionText}
        </Link>
      )}
      {actionText && !actionHref && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

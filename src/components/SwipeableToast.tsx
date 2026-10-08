import React, { useState, useRef, useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export interface SwipeableToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
  actionButton?: React.ReactNode;
  durationMs?: number;
  className?: string;
  isFixed?: boolean;
}

export const SwipeableToast: React.FC<SwipeableToastProps> = ({
  message,
  type = 'success',
  onClose,
  actionButton,
  durationMs = 7000,
  className = '',
  isFixed = false,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const startXRef = useRef<number>(0);
  const currentXRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss timer
  useEffect(() => {
    if (durationMs > 0) {
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, durationMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [durationMs, message]);

  const handleDismiss = () => {
    setIsDismissing(true);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  // Touch Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;
    setOffsetX(diff);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const diff = currentXRef.current - startXRef.current;
    if (Math.abs(diff) > 80) {
      // Swiped far enough
      setOffsetX(diff > 0 ? 300 : -300);
      handleDismiss();
    } else {
      // Snap back
      setOffsetX(0);
    }
  };

  // Mouse Drag Handlers for Desktop swipe
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    currentXRef.current = e.clientX;
    const diff = currentXRef.current - startXRef.current;
    setOffsetX(diff);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const diff = currentXRef.current - startXRef.current;
    if (Math.abs(diff) > 80) {
      setOffsetX(diff > 0 ? 300 : -300);
      handleDismiss();
    } else {
      setOffsetX(0);
    }
  };

  const bgStyles =
    type === 'error'
      ? 'bg-rose-600 border-rose-500 shadow-rose-900/40'
      : type === 'warning'
      ? 'bg-amber-600 border-amber-500 shadow-amber-900/40'
      : type === 'info'
      ? 'bg-indigo-600 border-indigo-500 shadow-indigo-900/40'
      : 'bg-emerald-600 border-emerald-500 shadow-emerald-900/40';

  const opacity = Math.max(0.2, 1 - Math.abs(offsetX) / 250);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        transform: `translateX(${offsetX}px) ${isDismissing ? 'scale(0.9)' : 'scale(1)'}`,
        opacity: isDismissing ? 0 : opacity,
        transition: isDragging ? 'none' : 'transform 0.25s ease-out, opacity 0.25s ease-out',
        touchAction: 'pan-y',
      }}
      className={`group select-none flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-bold text-white shadow-2xl backdrop-blur-xs cursor-grab active:cursor-grabbing ${bgStyles} ${
        isFixed ? 'fixed bottom-6 right-6 z-50 max-w-md animate-fadeIn' : ''
      } ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-3 min-w-0">
        {type === 'error' ? (
          <AlertCircle className="h-5 w-5 shrink-0 text-white" />
        ) : type === 'warning' ? (
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-200" />
        ) : type === 'info' ? (
          <Info className="h-5 w-5 shrink-0 text-indigo-200" />
        ) : (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        )}
        <span className="truncate leading-snug">{message}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actionButton}

        {/* Close [X] Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          className="rounded-lg p-1 text-white/75 hover:bg-white/20 hover:text-white active:scale-95 transition-all"
          title="Закрыть уведомление (смахните для скрытия)"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

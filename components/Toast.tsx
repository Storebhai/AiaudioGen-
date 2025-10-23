import React, { useEffect, useState } from 'react';
import type { Toast as ToastType } from '../types';
import { CloseIcon, ExclamationCircleIcon, InformationCircleIcon } from './icons';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: number) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const baseClasses = 'w-full md:max-w-sm p-4 rounded-xl shadow-lg flex items-start gap-3 transition-all duration-300';
  const typeClasses = {
    error: 'bg-red-800/90 border border-red-600 text-red-100',
    success: 'bg-green-800/90 border border-green-600 text-green-100',
    info: 'bg-blue-800/90 border border-blue-600 text-blue-100',
  };
  const animationClasses = isExiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0';

  const Icon = {
    error: <ExclamationCircleIcon className="w-6 h-6 text-red-300 flex-shrink-0" />,
    info: <InformationCircleIcon className="w-6 h-6 text-blue-300 flex-shrink-0" />,
    success: <InformationCircleIcon className="w-6 h-6 text-green-300 flex-shrink-0" />,
  }[toast.type];

  return (
    <div className={`${baseClasses} ${typeClasses[toast.type]} ${animationClasses}`}>
      {Icon}
      <p className="flex-grow text-sm">{toast.message}</p>
      <button onClick={handleDismiss} className="p-1 rounded-full hover:bg-white/10 flex-shrink-0">
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
};

export default Toast;
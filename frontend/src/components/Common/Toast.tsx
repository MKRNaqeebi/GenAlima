import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { MdCheck, MdError, MdClose } from 'react-icons/md';

interface Toast {
  id: string;
  title: string;
  description: string;
  status: 'success' | 'error';
  isVisible: boolean;
}

interface ToastContextValue {
  showToast: (title: string, description: string, status: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((title: string, description: string, status: 'success' | 'error') => {
    const id = Date.now().toString();
    const newToast: Toast = { id, title, description, status, isVisible: true };
    
    setToasts(prev => [...prev, newToast]);

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.map(toast => 
        toast.id === id ? { ...toast, isVisible: false } : toast
      ));
      
      // Remove from array after animation completes
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, 300);
    }, 5000);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, isVisible: false } : toast
    ));
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 300);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              max-w-md p-4 rounded-lg shadow-lg border transition-all duration-300 transform
              ${toast.isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
              ${toast.status === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-red-50 border-red-200 text-red-800'
              }
            `}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  {toast.status === 'success' ? (
                    <MdCheck className="w-5 h-5 text-green-600" />
                  ) : (
                    <MdError className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-sm">{toast.title}</h4>
                  <p className="text-sm mt-1 opacity-90">{toast.description}</p>
                </div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 ml-3 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <MdClose className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
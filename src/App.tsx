import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSimpleAuth } from "@/hooks/useSimpleAuth";
import { isUsingMemoryStore, getStorageStats } from "@/lib/localStore";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useSimpleAuth();
  
  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Carregando...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const StorageWarning = () => {
  const [warning, setWarning] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<string>("");

  useEffect(() => {
    const checkStorage = async () => {
      try {
        const stats = await getStorageStats();
        
        let info = "";
        if (stats.sqliteAvailable) {
          info = `SQLite ativo (${stats.sqliteStats.recordCount || 0} registros)`;
        } else if (stats.indexedDBAvailable) {
          info = "IndexedDB ativo";
        } else if (stats.localStorageAvailable) {
          info = "localStorage ativo";
        } else {
          info = "Apenas memória (dados serão perdidos!)";
        }
        setStorageInfo(info);

        if (stats.usingMemoryStore) {
          setWarning("Nenhum sistema de armazenamento persistente disponível!");
        } else if (!stats.sqliteAvailable && !stats.indexedDBAvailable && !stats.localStorageAvailable) {
          setWarning("Todos os sistemas de armazenamento falharam!");
        }
        
        console.log("[App] Status de armazenamento:", stats);
      } catch (e) {
        console.error("[App] Erro ao verificar storage:", e);
        setWarning("Erro ao verificar sistemas de armazenamento.");
      }
    };
    
    checkStorage();
  }, []);

  return (
    <>
      {/* Info bar */}
      <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm text-blue-800">
        💾 Armazenamento: {storageInfo}
      </div>
      
      {/* Warning */}
      {warning && (
        <Alert variant="destructive" className="m-4">
          <AlertDescription>
            ⚠️ <strong>Problema crítico:</strong> {warning}
            <br />
            <small>Verifique permissões do navegador, modo anônimo ou configurações de privacidade.</small>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <StorageWarning />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

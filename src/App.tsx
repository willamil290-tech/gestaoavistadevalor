import { useEffect } from "react";
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
  useEffect(() => {
    const stats = getStorageStats();
    if (stats.usingMemoryStore) {
      console.warn("[App] Aviso: localStorage não disponível. Usando memória como fallback. Os dados serão perdidos ao recarregar.", stats);
    }
  }, []);

  if (!isUsingMemoryStore()) {
    return null;
  }

  return (
    <Alert variant="destructive" className="m-4">
      <AlertDescription>
        ⚠️ <strong>localStorage indisponível!</strong> Dados estão sendo salvos apenas em memória. Serão perdidos ao recarregar a página. Verifique permissões do navegador ou modo anônimo.
      </AlertDescription>
    </Alert>
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

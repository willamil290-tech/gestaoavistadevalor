import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSimpleAuth } from "@/hooks/useSimpleAuth";
import { pullAllFromSheets } from "@/lib/cloudSync";
import { restoreLegacyArchiveOnce } from "@/lib/legacyRecovery";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useSimpleAuth();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      restoreLegacyArchiveOnce()
        .catch((e) => console.warn("[boot] Falha ao restaurar backup legado:", e))
        .then(() => pullAllFromSheets())
        .then(({ restored }) => {
          if (restored > 0) console.log(`[boot] ${restored} chave(s) restauradas do banco.`);
        })
        .catch((e) => console.warn("[boot] Falha ao puxar do banco:", e))
        .finally(() => setBootstrapped(true));
    }
  }, [isAuthenticated]);

  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Carregando...</div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!bootstrapped) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Sincronizando dados…</div>;
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
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

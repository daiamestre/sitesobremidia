import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ativarTabelasResponsivas } from "@/lib/tabelasResponsivas";

// F-133: tabelas empilham no celular/tablet em todo o painel. Nas rotas do Player (TV) nada é alterado.
if (!window.location.pathname.startsWith("/player")) ativarTabelasResponsivas();

// PWA Service Worker é registrado automaticamente pelo vite-plugin-pwa

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);

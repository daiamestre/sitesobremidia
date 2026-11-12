import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ativarTabelasResponsivas } from "@/lib/tabelasResponsivas";
import { aparelhoFraco } from "@/lib/studio/regente";

// F-133: tabelas empilham no celular/tablet em todo o painel. Nas rotas do Player (TV) nada é alterado.
if (!window.location.pathname.startsWith("/player")) ativarTabelasResponsivas();

// F-302: aparelho fraco (ex.: tablet Multilaser M10) liga o MODO LEVE (sem desfoque de fundo nem brilhos que rodam sem parar).
// Nas rotas do Player (TV) nada muda.
if (!window.location.pathname.startsWith("/player") && aparelhoFraco()) document.documentElement.classList.add("modo-leve");

// PWA Service Worker é registrado automaticamente pelo vite-plugin-pwa

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);

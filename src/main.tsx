import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

// PWA Service Worker é registrado automaticamente pelo vite-plugin-pwa

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);

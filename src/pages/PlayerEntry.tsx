import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Hash } from "lucide-react";

// Custom ID: Letters, Numbers, Hyphens, Underscores (No UUIDs allowed)
const CUSTOM_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

const isValidScreenId = (value: string) => {
  return CUSTOM_ID_REGEX.test(value);
};

type PlayerEntryProps = {
  basePath: "/player" | "/tv";
};

export default function PlayerEntry({ basePath }: PlayerEntryProps) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [screenId, setScreenId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(
    () => (basePath === "/tv" ? "Conectar TV/Player" : "Conectar Player"),
    [basePath],
  );

  useEffect(() => {
    const last = localStorage.getItem("player:last_screen_id");
    if (last && isValidScreenId(last)) {
      setScreenId(last);
    }
  }, []);

  const handleConnect = () => {
    const value = screenId.trim();
    if (!isValidScreenId(value)) {
      setError("ID inválido. Use apenas letras, números e hífens. (Não use UUID)");
      return;
    }

    localStorage.setItem("player:last_screen_id", value);
    navigate(`${basePath}/${value}`);
  };

  const handleLogin = () => {
    const redirect = encodeURIComponent(basePath);
    navigate(`/auth?redirect=${redirect}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'var(--gradient-primary)' }}>
      {/* Background effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />

      <Card className="w-full max-w-lg glass border-white/10 shadow-2xl relative z-10 backdrop-blur-xl bg-black/40">
        <CardHeader className="text-center pb-2">
          <Logo className="justify-center mb-6 scale-110" size="lg" />
          <CardTitle className="text-3xl font-display font-bold tracking-tight text-white">
            {title}
          </CardTitle>
          <CardDescription className="text-zinc-400 mt-2">
            {basePath === "/tv"
              ? "Conecte sua Smart TV ou TV Box ao sistema de sinalização."
              : "Inicie a reprodução de conteúdos nesta tela."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-zinc-500 animate-pulse">Verificando conexão...</p>
            </div>
          ) : !user ? (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                <p className="text-sm text-zinc-300">
                  Para gerenciar seus dispositivos, acesse sua conta.
                </p>
              </div>
              <Button className="w-full gradient-primary h-12 text-lg font-bold shadow-lg shadow-primary/20" onClick={handleLogin}>
                Entrar no Painel
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="screen-id" className="text-zinc-400 font-medium ml-1">
                  ID de Identificação
                </Label>
                <div className="relative group/input">
                  <Input
                    id="screen-id"
                    value={screenId}
                    onChange={(e) => {
                      setError(null);
                      setScreenId(e.target.value.toUpperCase().replace(/\s+/g, '-'));
                    }}
                    placeholder="Ex: RECEPCAO-01"
                    className="h-14 bg-white/5 border-white/10 focus:border-primary/50 text-xl font-mono text-center tracking-widest uppercase transition-all"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within/input:text-primary transition-colors">
                    <Hash className="h-6 w-6" />
                  </div>
                </div>
                <p className="text-center text-[10px] text-zinc-500 uppercase tracking-widest">
                  Insira o ID que você definiu no Dashboard
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}

              <Button
                className="w-full h-14 text-xl font-bold gradient-primary shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                onClick={handleConnect}
              >
                Conectar e Iniciar
              </Button>

              <div className="pt-4 border-t border-white/5">
                <p className="text-xs text-center text-zinc-500">
                  Precisa de ajuda? Consulte o painel de <strong className="text-zinc-400">Telas</strong> no dashboard.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

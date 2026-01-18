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

  // MANDATORY LOGIN ENFORCEMENT
  useEffect(() => {
    if (!loading && !user) {
      const redirect = encodeURIComponent(basePath);
      navigate(`/auth?redirect=${redirect}`, { replace: true });
    }
  }, [user, loading, navigate, basePath]);

  // If loading or not logged in (redirecting), show Loader
  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Logo size="lg" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground animate-pulse">
            {loading ? "Carregando..." : "Redirecionando para Login..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md glass animate-fade-in relative z-10">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-4" size="lg" />
          <CardTitle className="text-2xl font-display text-foreground">
            {title}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {basePath === "/tv"
              ? "Plataforma profissional de Digital Signage"
              : "Inicie a reprodução de conteúdos nesta tela."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="screen-id">ID de Identificação</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="screen-id"
                  value={screenId}
                  onChange={(e) => {
                    setError(null);
                    setScreenId(e.target.value.toUpperCase().replace(/\s+/g, '-'));
                  }}
                  placeholder="Ex: RECEPCAO-01"
                  className="pl-10 uppercase bg-muted/50 border-input focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50 h-10 transition-all font-medium tracking-wide"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center animate-in fade-in slide-in-from-top-2">
                {error}
              </div>
            )}

            <div className="pt-2">
              <Button
                className="w-full gradient-primary"
                onClick={handleConnect}
              >
                Conectar
              </Button>
            </div>

            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-center text-muted-foreground">
                Precisa de ajuda? Consulte o painel de <strong className="text-foreground">Telas</strong> no dashboard.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

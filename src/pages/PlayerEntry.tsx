import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";

// Aceita UUID ou custom_id (letras, números, hífens, underscores)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CUSTOM_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

const isValidScreenId = (value: string) => {
  return UUID_REGEX.test(value) || CUSTOM_ID_REGEX.test(value);
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
      setError("ID inválido. Use o ID personalizado da tela (ex: minha-tela-01) ou UUID.");
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
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg glass">
        <CardHeader className="text-center">
          <Logo className="justify-center mb-4" size="lg" />
          <CardTitle className="text-2xl font-display">{title}</CardTitle>
          <CardDescription>
            {basePath === "/tv"
              ? "Use este endereço dedicado no dispositivo (TV/Android Box) e conecte com uma Tela do dashboard."
              : "Conecte este player a uma Tela do dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando sessão...</p>
          ) : !user ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Para acessar as telas e playlists, faça login com o mesmo usuário do dashboard.
              </p>
              <Button className="w-full" onClick={handleLogin}>
                Entrar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="screen-id">ID da Tela</Label>
                <Input
                  id="screen-id"
                  value={screenId}
                  onChange={(e) => {
                    setError(null);
                    setScreenId(e.target.value);
                  }}
                  placeholder="Ex: loja-01 ou minha-tela"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button className="w-full" onClick={handleConnect}>
                Conectar e iniciar
              </Button>

              <p className="text-xs text-muted-foreground">
                Dica: no dashboard, vá em <strong>Telas</strong> e clique em <strong>Abrir Player</strong> para testar.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

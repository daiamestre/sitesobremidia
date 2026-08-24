import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Monitor, Loader2 } from "lucide-react";
import { Screen } from "@/types/models";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ScreenPairingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screens: Screen[];
  onPaired?: () => void;
}

export function ScreenPairingDialog({ open, onOpenChange, screens, onPaired }: ScreenPairingDialogProps) {
  const [pairingCode, setPairingCode] = useState("");
  const [selectedScreenId, setSelectedScreenId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Auto select if only one screen
  useEffect(() => {
    if (open && screens.length > 0 && !selectedScreenId) {
      setSelectedScreenId(screens[0].id);
    }
  }, [open, screens, selectedScreenId]);

  const handlePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCode || pairingCode.length !== 6) {
      toast.error("O código deve ter 6 dígitos.");
      return;
    }
    if (!selectedScreenId) {
      toast.error("Selecione uma tela para vincular.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('fn_link_device_to_screen', {
        p_pairing_code: pairingCode,
        p_screen_id: selectedScreenId
      });

      if (error) throw error;

      if (data && data.ok) {
        toast.success("Tela vinculada com sucesso!");
        onOpenChange(false);
        setPairingCode("");
        if (onPaired) onPaired();
      } else {
        toast.error(data?.error === 'invalid_or_expired_code' 
          ? "Código inválido ou expirado." 
          : "Erro ao vincular tela: " + (data?.error || 'Desconhecido'));
      }
    } catch (err: any) {
      console.error("Pairing Error:", err);
      toast.error("Erro interno ao vincular tela.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <KeyRound className="h-5 w-5 text-primary" />
            Vincular TV
          </DialogTitle>
          <DialogDescription>
            Insira o código de 6 dígitos que aparece na tela do aplicativo SOBRE MÍDIA Player na sua TV.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handlePairing} className="space-y-6 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Código de Pareamento</label>
            <Input
              type="text"
              placeholder="Ex: 123456"
              maxLength={6}
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-3xl tracking-[0.5em] font-mono h-16 bg-muted/50"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Selecione a Tela Destino
            </label>
            <Select value={selectedScreenId} onValueChange={setSelectedScreenId} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma tela" />
              </SelectTrigger>
              <SelectContent>
                {screens.map(screen => (
                  <SelectItem key={screen.id} value={screen.id}>
                    {screen.name} {screen.location ? `(${screen.location})` : ''}
                  </SelectItem>
                ))}
                {screens.length === 0 && (
                  <SelectItem value="empty" disabled>
                    Nenhuma tela cadastrada. Crie uma primeira.
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="gradient-primary" disabled={loading || pairingCode.length !== 6 || !selectedScreenId}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Vincular Tela
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

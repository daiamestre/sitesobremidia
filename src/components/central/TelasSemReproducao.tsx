import { useEffect, useState } from 'react';
import { AlertTriangle, MonitorX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { fetchTelasSemReproducao, type TelaSemReproducao } from '@/services/DeviceService';

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nunca';

/**
 * F-187 — Central de Alertas: telas que estão dando sinal mas NÃO estão reproduzindo (presa em "Sincronizando", tela
 * preta, sem playlist, aparelho desvinculado), com a causa e o que fazer. Quem decide é o banco
 * (fn_telas_sem_reproducao); aqui só mostramos. Sem defeito, nada aparece.
 */
export function TelasSemReproducao() {
  const [telas, setTelas] = useState<TelaSemReproducao[]>([]);

  useEffect(() => {
    let vivo = true;
    const carregar = async () => {
      const dados = await fetchTelasSemReproducao();
      if (vivo) setTelas(dados);
    };
    carregar();
    const intervalo = setInterval(carregar, 30000);
    return () => { vivo = false; clearInterval(intervalo); };
  }, []);

  if (telas.length === 0) return null;

  return (
    <div className="space-y-4" data-testid="telas-sem-reproducao">
      <Alert variant="destructive" className="glass border-red-500/50">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Atenção: tela ligada, mas sem reproduzir as mídias</AlertTitle>
        <AlertDescription>
          {telas.length === 1
            ? 'Há 1 tela dando sinal que não está reproduzindo.'
            : `Há ${telas.length} telas dando sinal que não estão reproduzindo.`}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {telas.map((t) => (
          <Card key={t.screen_id} className="glass border-l-4 border-l-red-500">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <h3 className="font-bold flex items-center gap-2">
                  <MonitorX className="h-4 w-4 text-red-400 shrink-0" /> {t.tela || 'Tela sem nome'}
                </h3>
                <span className="px-2 py-1 rounded text-[10px] uppercase font-bold bg-red-500/20 text-red-500 whitespace-nowrap">
                  Não está reproduzindo
                </span>
              </div>
              <p className="text-sm"><span className="font-semibold">Causa:</span> {t.causa}</p>
              <p className="text-sm text-muted-foreground"><span className="font-semibold">O que fazer:</span> {t.o_que_fazer}</p>
              <p className="text-xs text-muted-foreground">
                Último sinal: {hora(t.ultimo_sinal)} · Última exibição: {hora(t.ultima_exibicao)}
                {t.app_version ? ` · Player ${t.app_version}` : ''}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

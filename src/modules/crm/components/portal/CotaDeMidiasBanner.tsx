import { Gift, Info } from 'lucide-react';
import type { CotaDeMidias } from '@/modules/crm/services/playlistCliente.service';
import { MOTIVO_DA_LIBERACAO, avisoDepoisDasGratis, brl } from '@/lib/cotaDeMidias';

/**
 * F-166 — Avisa o anunciante quantas mídias foram liberadas de graça, por quê, e quanto custa a próxima.
 * Sem liberação: só a regra (1 mídia grátis na primeira playlist; depois, o valor dele).
 */
export function CotaDeMidiasBanner({ cota }: { cota: CotaDeMidias | undefined }) {
  if (!cota) return null;

  if (cota.liberacoes.length === 0) {
    return (
      <div data-testid="cota-regra" className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-300">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-400" />
        <p>
          {cota.gratisPrimeiraPlaylist === 'DISPONIVEL'
            ? <>Você tem <strong className="text-emerald-400">1 mídia grátis</strong> na sua primeira playlist. </>
            : <>A mídia grátis da primeira playlist já foi usada. </>}
          Cada mídia adicionada a uma playlist custa <strong className="text-white">{brl(cota.valor)}</strong>
          {cota.valor > 0 ? ' (PIX), liberada assim que o pagamento é confirmado.' : '.'}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="cota-liberadas" className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
        <Gift className="h-4 w-4" />
        {cota.restantesLiberadas} {cota.restantesLiberadas === 1 ? 'mídia grátis disponível' : 'mídias grátis disponíveis'}
      </div>
      <ul className="space-y-2">
        {cota.liberacoes.map((l) => (
          <li key={l.id} className="text-sm text-slate-200" data-testid="cota-liberacao">
            <p>{l.mensagem}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {MOTIVO_DA_LIBERACAO[l.motivo]}{l.data_comemorativa ? ` · ${l.data_comemorativa}` : ''} · restam {l.restantes} de {l.quantidade}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-emerald-200/90 border-t border-emerald-500/20 pt-2" data-testid="cota-aviso-proxima">
        {avisoDepoisDasGratis(cota)}
      </p>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, FileCheck, Film, HardDrive, Clock } from 'lucide-react';

interface VersaoMidia {
  id: string;
  numero_versao: number;
  object_key?: string | null;
  checksum: string;
  tamanho: number;
  created_at: string;
}

interface MediaVersionsProps {
  versoes: VersaoMidia[];
}

export function MediaVersions({ versoes }: MediaVersionsProps) {
  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          Histórico Imutável de Versões do Material ({versoes.length})
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Rastreabilidade completa de todas as versões enviadas ao R2 Storage.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {versoes.length === 0 ? (
          <div className="text-center py-4 text-slate-500 text-xs">Nenhuma versão anterior registrada.</div>
        ) : (
          <div className="space-y-2">
            {versoes.map((v) => (
              <div key={v.id} className="p-3 rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <Badge className="bg-primary/20 text-primary border-primary/30 font-mono font-bold">
                    v{v.numero_versao}
                  </Badge>
                  <div>
                    <span className="text-white font-semibold block truncate max-w-[200px]">{v.object_key?.split('/')?.pop()}</span>
                    <span className="text-[10px] text-slate-500 block">Checksum: {v.checksum}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-slate-300 font-mono block">{(v.tamanho / (1024 * 1024)).toFixed(2)} MB</span>
                  <span className="text-[10px] text-slate-500 block">{new Date(v.created_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

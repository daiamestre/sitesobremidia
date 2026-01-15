import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, History as HistoryIcon } from 'lucide-react';
import { useState } from 'react';

export default function History() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold">Histórico</h1>
        <p className="text-muted-foreground">Visualize todas as ações realizadas na plataforma</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar no histórico..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Empty State */}
      <Card className="glass">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="p-6 rounded-full bg-muted/50 mb-4">
            <HistoryIcon className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Nenhuma atividade</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Todas as suas ações serão registradas aqui. Uploads, edições, agendamentos e mais.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

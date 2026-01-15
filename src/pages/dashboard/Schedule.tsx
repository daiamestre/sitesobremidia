import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Calendar } from 'lucide-react';

export default function Schedule() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Agendamento</h1>
          <p className="text-muted-foreground">Programe quando seu conteúdo será exibido</p>
        </div>
        <Button className="gradient-primary">
          <Plus className="h-4 w-4 mr-2" />
          Novo Agendamento
        </Button>
      </div>

      {/* Empty State */}
      <Card className="glass">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="p-6 rounded-full bg-muted/50 mb-4">
            <Calendar className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Nenhum agendamento</h3>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            Agende quando suas playlists serão exibidas em cada tela. Configure por data, horário ou dias da semana.
          </p>
          <Button className="gradient-primary">
            <Plus className="h-4 w-4 mr-2" />
            Criar Agendamento
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

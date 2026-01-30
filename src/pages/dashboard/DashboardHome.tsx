import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Monitor, ListVideo, Image, Calendar, TrendingUp, Clock } from 'lucide-react';

export default function DashboardHome() {
  const { profile } = useAuth();

  const stats = [
    { icon: Monitor, label: 'Telas Ativas', value: '0', color: 'text-primary' },
    { icon: ListVideo, label: 'Playlists', value: '0', color: 'text-accent' },
    { icon: Image, label: 'Mídias', value: '0', color: 'text-success' },
    { icon: Calendar, label: 'Agendamentos', value: '0', color: 'text-warning' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold">
          Olá, {profile?.full_name?.split(' ')[0] || 'Usuário'}! 👋 <span className="text-xs font-normal text-white bg-red-600 px-2 py-1 rounded-full align-middle">v3.2 - ATUALIZADO</span>
        </h1>
        <p className="text-muted-foreground">
          Bem-vindo ao painel do SOBRE MÍDIA. Gerencie suas telas de Digital Signage.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="glass hover:glow-primary transition-all duration-300">
            <CardContent className="flex items-center gap-4 p-6">
              <div className={`p-3 rounded-lg bg-card ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Ações Rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <Image className="h-5 w-5 text-primary" />
              <span>Fazer upload de mídia</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <ListVideo className="h-5 w-5 text-accent" />
              <span>Criar nova playlist</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <Monitor className="h-5 w-5 text-success" />
              <span>Adicionar nova tela</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <Calendar className="h-5 w-5 text-warning" />
              <span>Agendar conteúdo</span>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-accent" />
              Atividade Recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                Nenhuma atividade recente.
              </p>
              <p className="text-sm text-muted-foreground">
                Comece fazendo upload de mídias!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

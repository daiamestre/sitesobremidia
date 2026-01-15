import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Monitor, ListVideo, Calendar, Zap, ArrowRight, Smartphone } from 'lucide-react';

export default function Index() {
  const features = [
    { icon: Monitor, title: 'Múltiplas Telas', description: 'Gerencie ilimitadas telas em tempo real' },
    { icon: ListVideo, title: 'Playlists Dinâmicas', description: 'Crie e organize conteúdos facilmente' },
    { icon: Calendar, title: 'Agendamento', description: 'Programe exibições por data e horário' },
    { icon: Zap, title: 'Tempo Real', description: 'Atualizações instantâneas nos players' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="md" />
          <Link to="/auth">
            <Button variant="outline">Entrar</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold mb-6 animate-fade-in">
            Plataforma Exclusiva de
            <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Mídia Corporativa
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-fade-in">
            Gerencie suas telas, crie playlists e agende conteúdos para TVs corporativas, 
            painéis LED e displays digitais com qualidade até 4K.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
            <Link to="/auth">
              <Button size="lg" className="gradient-primary glow-primary">
                Começar Agora
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/install">
              <Button size="lg" variant="outline">
                <Smartphone className="mr-2 h-5 w-5" />
                Instalar App
              </Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="glass p-6 rounded-xl hover:glow-primary transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="p-3 rounded-lg bg-primary/10 w-fit mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2024 SOBRE MÍDIA. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}

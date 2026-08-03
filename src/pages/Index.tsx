import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { 
  Monitor, 
  ListVideo, 
  Calendar, 
  Zap, 
  ArrowRight, 
  Smartphone, 
  Menu, 
  Megaphone, 
  UserCheck 
} from 'lucide-react';

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
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-md sticky top-0 bg-background/80">
        <div className="container mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Hamburger 3-lines Menu Button opening Lateral Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="hover:bg-white/10 text-white transition-all rounded-xl p-2.5 sm:p-3 h-auto w-auto"
                  title="Menu"
                >
                  <Menu className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.8} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-slate-950 border-r border-white/10 text-white p-6 w-[300px] sm:w-[360px]">
                <SheetHeader className="text-left mb-6">
                  <Logo size="sm" />
                  <SheetTitle className="text-xl font-bold text-white font-display mt-4">Menu de Acesso</SheetTitle>
                  <SheetDescription className="text-slate-400 text-sm">
                    Selecione uma opção para acessar o painel correspondente
                  </SheetDescription>
                </SheetHeader>
                
                <div className="flex flex-col gap-3">
                  <Link to="/auth?tab=login&role=anunciantes">
                    <div className="p-4 rounded-xl border border-white/10 bg-slate-900/80 hover:border-primary/50 hover:bg-slate-800/80 transition-all cursor-pointer group flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/15 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        <Megaphone className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white group-hover:text-primary transition-colors">Anunciantes</h4>
                        <p className="text-xs text-slate-400">Portal para campanhas e anúncios</p>
                      </div>
                    </div>
                  </Link>

                  <Link to="/representantes">
                    <div className="p-4 rounded-xl border border-white/10 bg-slate-900/80 hover:border-primary/50 hover:bg-slate-800/80 transition-all cursor-pointer group flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/15 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        <UserCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white group-hover:text-primary transition-colors">Representantes</h4>
                        <p className="text-xs text-slate-400">Área para parceiros comerciais</p>
                      </div>
                    </div>
                  </Link>

                  <Link to="/auth?tab=login&role=gestor">
                    <div className="p-4 rounded-xl border border-white/10 bg-slate-900/80 hover:border-primary/50 hover:bg-slate-800/80 transition-all cursor-pointer group flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/15 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-base text-white group-hover:text-primary transition-colors">Gestor de Mídias</h4>
                        <p className="text-xs text-slate-400">Gerenciamento de telas e conteúdos</p>
                      </div>
                    </div>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>

            <Logo size="md" />
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link to="/auth?tab=login">
              <Button className="gradient-primary glow-primary font-bold text-base sm:text-lg md:text-xl px-6 sm:px-8 py-2.5 sm:py-3.5 h-auto rounded-xl transition-all duration-300 hover:scale-105 shadow-xl">
                Entrar
              </Button>
            </Link>
            <Link to="/auth?tab=signup">
              <Button variant="outline" className="border-primary/60 text-foreground font-bold text-base sm:text-lg md:text-xl px-6 sm:px-8 py-2.5 sm:py-3.5 h-auto rounded-xl hover:bg-primary/10 hover:border-primary transition-all duration-300 hover:scale-105 shadow-md">
                Cadastre-se
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="container mx-auto px-4 pt-6 sm:pt-8 md:pt-10 pb-16 sm:pb-20 text-center flex flex-col items-center">
          {/* Logo 3D - Exact original user logo */}
          <div className="mb-4 sm:mb-6 animate-fade-in flex justify-center">
            <img 
              src="/logo-3d.png" 
              alt="SOBRE MÍDIA 3D" 
              className="w-full max-w-[240px] sm:max-w-[320px] md:max-w-[380px] h-auto object-contain hover:scale-105 transition-transform duration-300 pointer-events-none select-none drop-shadow-xl"
            />
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 animate-fade-in text-white leading-tight">
            Plataforma Exclusiva de
            <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent mt-1">
              Mídia Corporativa
            </span>
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-slate-300 max-w-2xl mx-auto mb-8 sm:mb-10 font-normal leading-relaxed animate-fade-in">
            Gerencie suas telas, crie playlists e agende conteúdos para TVs corporativas, 
            painéis LED e displays digitais com qualidade até 4K.
          </p>
          <div className="flex justify-center w-full max-w-sm sm:max-w-none animate-fade-in">
            <Link to="/install" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto gradient-primary glow-primary text-base sm:text-lg md:text-xl font-bold px-8 sm:px-12 py-4 sm:py-6 h-auto rounded-xl shadow-2xl transition-all duration-300 hover:scale-105 border border-primary/40">
                <Smartphone className="mr-2.5 h-6 w-6 sm:h-7 sm:w-7" />
                Instalar App
              </Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto px-4 py-12 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="border border-white/10 bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl hover:border-primary/50 hover:glow-primary transition-all duration-300 shadow-xl animate-fade-in group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="p-3.5 rounded-xl bg-primary/15 w-fit mb-4 group-hover:bg-primary/25 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display font-bold text-lg sm:text-xl text-white mb-2">{feature.title}</h3>
                <p className="text-sm sm:text-base text-slate-300">{feature.description}</p>
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

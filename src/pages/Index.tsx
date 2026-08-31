import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
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
  UserCheck,
  ShieldAlert,
  Home,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

const SCREEN_ID_CACHE_KEY = "player_screen_id_codemidia";

export default function Index() {
  const navigate = useNavigate();
  const [nativeOverlayNeeded, setNativeOverlayNeeded] = useState(false);
  const [showLauncherModal, setShowLauncherModal] = useState(false);
  const [checkingState, setCheckingState] = useState(false);

  // Evaluate native setup and route sequentially
  const evaluateOnboardingFlow = useCallback(async () => {
    if (!window.NativePlayer) return;

    setCheckingState(true);

    // 1. OVERLAY CHECK (Mandatory)
    if (typeof window.NativePlayer.isOverlayGranted === 'function') {
      const overlayGranted = window.NativePlayer.isOverlayGranted();
      if (!overlayGranted) {
        setNativeOverlayNeeded(true);
        setCheckingState(false);
        return;
      }
    }
    setNativeOverlayNeeded(false);

    // 2. LAUNCHER PROMPT (Optional)
    const launcherDismissed = sessionStorage.getItem('player_launcher_dismissed');
    if (!launcherDismissed && typeof window.NativePlayer.isHomeLauncher === 'function') {
      const isLauncher = window.NativePlayer.isHomeLauncher();
      if (!isLauncher) {
        setShowLauncherModal(true);
        setCheckingState(false);
        return;
      }
    }
    setShowLauncherModal(false);

    // 3. AUTH & PAIRING SEQUENCING
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const savedScreenId = localStorage.getItem(SCREEN_ID_CACHE_KEY);

      if (savedScreenId) {
        // Device is paired, proceed to Player
        navigate(`/player/${savedScreenId}`, { replace: true });
        return;
      }

      if (!session) {
        // Unauthenticated -> Login required
        navigate(`/auth?tab=login`, { replace: true });
        return;
      }

      // Authenticated but no screen ID -> Pairing required
      navigate(`/device-pairing`, { replace: true });
    } catch (err) {
      console.error("[Index Onboarding] Error checking session/pairing:", err);
      navigate(`/auth?tab=login`, { replace: true });
    } finally {
      setCheckingState(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (window.NativePlayer) {
      evaluateOnboardingFlow();

      const handleResume = () => {
        evaluateOnboardingFlow();
      };

      window.addEventListener('nativeResume', handleResume);
      window.addEventListener('focus', handleResume);

      return () => {
        window.removeEventListener('nativeResume', handleResume);
        window.removeEventListener('focus', handleResume);
      };
    }
  }, [evaluateOnboardingFlow]);

  const handleRequestOverlay = () => {
    if (window.NativePlayer?.requestOverlayPermission) {
      window.NativePlayer.requestOverlayPermission();
    }
  };

  const handleAcceptLauncher = () => {
    sessionStorage.setItem('player_launcher_dismissed', 'true');
    setShowLauncherModal(false);
    if (window.NativePlayer?.requestSetLauncher) {
      window.NativePlayer.requestSetLauncher();
    }
    evaluateOnboardingFlow();
  };

  const handleDismissLauncher = () => {
    sessionStorage.setItem('player_launcher_dismissed', 'true');
    setShowLauncherModal(false);
    evaluateOnboardingFlow();
  };

  if (window.NativePlayer) {
    if (nativeOverlayNeeded) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-lg w-full bg-slate-900/90 border border-red-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center gap-6">
            <div className="p-4 rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30">
              <ShieldAlert className="h-14 w-14 animate-pulse" />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Permissão de Sobreposição
            </h1>
            
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Para operar continuamente em modo Kiosk e garantir a reprodução ininterrupta, 
              o <strong>SOBRE MÍDIA Player</strong> precisa de permissão para sobrepor outros aplicativos.
            </p>

            <div className="w-full space-y-3 pt-2">
              <Button 
                onClick={handleRequestOverlay}
                className="w-full gradient-primary glow-primary font-bold text-lg py-6 rounded-xl shadow-xl hover:scale-[1.02] transition-transform"
              >
                Conceder Permissão de Sobreposição
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              Ao habilitar na tela do Android, o aplicativo retornará automaticamente.
            </p>
          </div>
        </div>
      );
    }

    if (showLauncherModal) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-lg w-full bg-slate-900/90 border border-primary/30 rounded-3xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center gap-6">
            <div className="p-4 rounded-2xl bg-primary/20 text-primary border border-primary/30">
              <Home className="h-14 w-14" />
            </div>
            
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Aplicativo Principal (Launcher)
            </h1>
            
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Deseja definir o <strong>SOBRE MÍDIA Player</strong> como o aplicativo padrão de inicialização (Home) deste dispositivo?
            </p>

            <div className="w-full space-y-3 pt-2">
              <Button 
                onClick={handleAcceptLauncher}
                className="w-full gradient-primary glow-primary font-bold text-lg py-6 rounded-xl shadow-xl hover:scale-[1.02] transition-transform"
              >
                Tornar Aplicativo Principal
              </Button>
              
              <Button 
                onClick={handleDismissLauncher}
                variant="outline"
                className="w-full border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold py-5 rounded-xl"
              >
                Agora Não
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              O Launcher é opcional. Você pode alterar essa configuração a qualquer momento no Android.
            </p>
          </div>
        </div>
      );
    }

    if (checkingState) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 gap-4 select-none">
          <RefreshCw className="h-10 w-10 text-primary animate-spin" />
          <p className="text-slate-400 font-medium text-base">Iniciando SOBRE MÍDIA Terminal...</p>
        </div>
      );
    }
  }

  const portals = [
    { icon: Megaphone, title: 'Anunciantes', description: 'Portal para campanhas e anúncios', link: '/auth?tab=login&role=anunciantes' },
    { icon: UserCheck, title: 'Representantes', description: 'Área comercial e parceiros', link: '/representantes/login' },
    { icon: Monitor, title: 'Gestor de Mídias', description: 'Operação da rede e conteúdos', link: '/auth?tab=login&role=gestor' },
    { icon: Zap, title: 'Área Corporativa', description: 'Administração, gestão e controle da organização', link: '/auth/corporate', highlight: true },
  ];

    return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-background box-border">
      {/* Background effects — responsive, never exceed viewport */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none max-w-full">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[500px] bg-primary/15 rounded-full blur-[120px] max-w-full" />
        <div className="absolute bottom-0 right-1/4 w-full max-w-[600px] h-[600px] bg-accent/10 rounded-full blur-[120px] max-w-full" />
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

                  <Link to="/auth/corporate">
                    <div className="p-4 rounded-xl border border-primary/30 bg-slate-900/80 hover:border-primary/70 hover:bg-slate-800/90 transition-all cursor-pointer group flex items-center gap-4 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
                      <div className="p-3 rounded-lg bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-colors relative z-10">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div className="relative z-10">
                        <h4 className="font-bold text-base text-primary group-hover:text-white transition-colors">Área Corporativa</h4>
                        <p className="text-xs text-slate-400">Administração e controle central</p>
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

        {/* Portals Grid */}
        <section className="container mx-auto px-4 py-8 sm:py-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mb-3">Escolha seu acesso</h2>
            <p className="text-slate-400">Selecione o ambiente correspondente ao seu perfil corporativo</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {portals.map((portal, index) => (
              <Link to={portal.link} key={portal.title} className="block group">
                <div
                  className={`h-full border bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl transition-all duration-300 shadow-xl flex flex-col items-center text-center
                    ${portal.highlight 
                      ? 'border-primary/50 shadow-primary/20 hover:bg-primary/10 hover:shadow-primary/40 hover:-translate-y-1' 
                      : 'border-white/10 hover:border-primary/30 hover:bg-slate-800/80 hover:-translate-y-1'}`}
                >
                  <div className={`p-4 rounded-xl mb-5 transition-colors ${portal.highlight ? 'bg-primary text-white' : 'bg-primary/15 text-primary group-hover:bg-primary group-hover:text-white'}`}>
                    <portal.icon className="h-8 w-8" />
                  </div>
                  <h3 className={`font-display font-bold text-lg sm:text-xl mb-3 ${portal.highlight ? 'text-primary' : 'text-white group-hover:text-primary transition-colors'}`}>
                    {portal.title}
                  </h3>
                  <p className="text-sm sm:text-base text-slate-300">{portal.description}</p>
                </div>
              </Link>
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

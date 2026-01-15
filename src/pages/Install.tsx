import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Download, 
  Smartphone, 
  Share, 
  Plus, 
  MoreVertical, 
  Check,
  ArrowLeft,
  Wifi,
  Bell,
  Zap,
  Shield,
  Apple
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { usePWA } from '@/hooks/usePWA';

export default function Install() {
  const { 
    isInstallable, 
    isInstalled, 
    isIOS, 
    isAndroid,
    isSafari, 
    isChrome,
    installPWA 
  } = usePWA();
  
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    await installPWA();
    setInstalling(false);
  };

  const benefits = [
    { icon: Zap, title: 'Acesso Rápido', description: 'Abra direto da tela inicial' },
    { icon: Wifi, title: 'Funciona Offline', description: 'Acesse mesmo sem internet' },
    { icon: Bell, title: 'Notificações', description: 'Receba alertas importantes' },
    { icon: Shield, title: 'Seguro', description: 'Dados protegidos e criptografados' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm safe-area-top">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Logo size="sm" />
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 py-8 max-w-2xl">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <div className="mb-6 flex justify-center">
            <img 
              src="/pwa-192x192.png" 
              alt="SOBRE MÍDIA" 
              className="w-24 h-24 rounded-2xl shadow-2xl glow-primary"
            />
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-4">
            Instale o{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              SOBRE MÍDIA
            </span>
          </h1>
          
          <p className="text-muted-foreground text-lg mb-6">
            Tenha acesso rápido ao app direto da sua tela inicial
          </p>

          {/* Platform Download Buttons */}
          {!isInstalled && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {/* Android Button */}
              <Button
                onClick={() => {
                  if (isAndroid && isInstallable) {
                    handleInstall();
                  } else {
                    const androidSection = document.getElementById('install-instructions');
                    androidSection?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                size="lg"
                className={`w-full sm:w-auto ${isAndroid ? 'gradient-primary glow-primary' : 'bg-muted hover:bg-muted/80'}`}
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.523 15.341c-.5 0-.908-.407-.908-.91 0-.5.408-.909.908-.909s.909.409.909.91c0 .502-.409.909-.909.909zm-11.046 0c-.5 0-.909-.407-.909-.91 0-.5.409-.909.909-.909s.908.409.908.91c0 .502-.408.909-.908.909zm11.395-5.861l1.592-2.764a.333.333 0 0 0-.114-.456.332.332 0 0 0-.454.114l-1.615 2.805a9.547 9.547 0 0 0-3.791-.767c-1.359 0-2.648.263-3.791.767l-1.615-2.805a.333.333 0 0 0-.454-.114.333.333 0 0 0-.114.456l1.592 2.764C5.76 11.041 3.5 14.157 3.5 17.8h17c0-3.643-2.26-6.759-5.628-8.32zM3.5 18.8v3.7c0 .828.672 1.5 1.5 1.5h1c.828 0 1.5-.672 1.5-1.5v-3.7H3.5zm13 0v3.7c0 .828.672 1.5 1.5 1.5h1c.828 0 1.5-.672 1.5-1.5v-3.7H16.5zM0 11.3c0-.828.672-1.5 1.5-1.5s1.5.672 1.5 1.5v6c0 .828-.672 1.5-1.5 1.5S0 18.128 0 17.3v-6zm21 0c0-.828.672-1.5 1.5-1.5s1.5.672 1.5 1.5v6c0 .828-.672 1.5-1.5 1.5s-1.5-.672-1.5-1.5v-6z"/>
                </svg>
                Download para Android
              </Button>

              {/* iOS Button */}
              <Button
                onClick={() => {
                  const iosSection = document.getElementById('install-instructions');
                  iosSection?.scrollIntoView({ behavior: 'smooth' });
                }}
                size="lg"
                className={`w-full sm:w-auto ${isIOS ? 'gradient-primary glow-primary' : 'bg-muted hover:bg-muted/80'}`}
              >
                <Apple className="h-5 w-5 mr-2" />
                Download para iOS
              </Button>
            </div>
          )}
        </div>

        {/* Status Badge */}
        {isInstalled && (
          <div className="mb-8 flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">
              <Check className="h-5 w-5" />
              <span className="font-medium">App já instalado!</span>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          {benefits.map((benefit) => (
            <div 
              key={benefit.title}
              className="glass p-4 rounded-xl text-center"
            >
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 mb-3">
                <benefit.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm mb-1">{benefit.title}</h3>
              <p className="text-xs text-muted-foreground">{benefit.description}</p>
            </div>
          ))}
        </div>

        {/* Install Section */}
        <div id="install-instructions" className="glass rounded-2xl p-6 mb-8 scroll-mt-8">
          {isInstalled ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Tudo pronto!</h2>
              <p className="text-muted-foreground mb-4">
                O app está instalado no seu dispositivo. Você pode acessá-lo pela tela inicial.
              </p>
              <Link to="/dashboard">
                <Button className="gradient-primary">
                  Ir para o Dashboard
                </Button>
              </Link>
            </div>
          ) : isInstallable ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Download className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Instalação Rápida</h2>
              <p className="text-muted-foreground mb-6">
                Clique no botão abaixo para instalar o app no seu dispositivo.
              </p>
              <Button 
                onClick={handleInstall}
                disabled={installing}
                size="lg"
                className="gradient-primary glow-primary w-full sm:w-auto"
              >
                {installing ? (
                  <>
                    <Download className="h-5 w-5 mr-2 animate-bounce" />
                    Instalando...
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5 mr-2" />
                    Instalar App
                  </>
                )}
              </Button>
            </div>
          ) : isIOS ? (
            // iOS Safari Instructions
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Smartphone className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Instalar no iPhone/iPad</h2>
                  <p className="text-sm text-muted-foreground">
                    {isSafari ? 'Siga os passos abaixo' : 'Abra no Safari para instalar'}
                  </p>
                </div>
              </div>

              {isSafari ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Share className="h-5 w-5 text-primary" />
                        <span className="font-medium">Toque em Compartilhar</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Na barra inferior do Safari, toque no ícone de compartilhamento
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Plus className="h-5 w-5 text-primary" />
                        <span className="font-medium">Adicionar à Tela de Início</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Role para baixo e toque em "Adicionar à Tela de Início"
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="h-5 w-5 text-primary" />
                        <span className="font-medium">Confirme a Instalação</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Toque em "Adicionar" no canto superior direito
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 rounded-xl bg-muted/50">
                  <p className="text-muted-foreground mb-4">
                    Para instalar no iOS, você precisa abrir esta página no Safari.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Copie o link e cole no navegador Safari
                  </p>
                </div>
              )}
            </div>
          ) : isAndroid && !isChrome ? (
            // Android non-Chrome instructions
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Smartphone className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Instalar no Android</h2>
                  <p className="text-sm text-muted-foreground">Siga os passos abaixo</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <MoreVertical className="h-5 w-5 text-primary" />
                      <span className="font-medium">Abra o Menu</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Toque nos três pontos no canto superior direito do navegador
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Download className="h-5 w-5 text-primary" />
                      <span className="font-medium">Instalar App</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Selecione "Instalar app" ou "Adicionar à tela inicial"
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Desktop or unsupported browser
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Smartphone className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Melhor no Mobile</h2>
              <p className="text-muted-foreground mb-4">
                Para uma experiência completa, acesse pelo seu smartphone ou tablet.
              </p>
              <div className="p-4 rounded-xl bg-muted/50 text-sm">
                <p className="font-medium mb-1">Escaneie o QR Code ou acesse:</p>
                <code className="text-primary">{window.location.origin}/install</code>
              </div>
            </div>
          )}
        </div>

        {/* Additional Info */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Ao instalar, você concorda com nossos{' '}
            <Link to="/" className="text-primary hover:underline">Termos de Uso</Link>
            {' '}e{' '}
            <Link to="/" className="text-primary hover:underline">Política de Privacidade</Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-6 safe-area-bottom">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © 2024 SOBRE MÍDIA. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}

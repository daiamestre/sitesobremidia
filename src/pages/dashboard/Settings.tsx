import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { User, Shield, Bell, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { profile, user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [offlineThreshold, setOfflineThreshold] = useState(5);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('offline_notification_enabled, offline_notification_threshold')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        if (data) {
          setNotificationsEnabled(data.offline_notification_enabled);
          setOfflineThreshold(data.offline_notification_threshold);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user?.id]);

  const handleSaveNotifications = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          offline_notification_enabled: notificationsEnabled,
          offline_notification_threshold: offlineThreshold,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setIsSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-status-notification', {
        body: { type: 'test' },
      });

      if (error) throw error;

      toast.success('E-mail de teste enviado! Verifique sua caixa de entrada.');
    } catch (error: unknown) {
      console.error('Error sending test email:', error);
      toast.error('Erro ao enviar e-mail de teste');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas preferências e dados da conta</p>
      </div>

      {/* Profile Card */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Perfil
          </CardTitle>
          <CardDescription>Suas informações pessoais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">Nome Completo</Label>
              <Input id="full-name" value={profile?.full_name || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Input id="company" value={profile?.company_name || ''} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={profile?.email || ''} disabled />
          </div>
          <Button variant="outline" disabled>
            Editar Perfil (Em breve)
          </Button>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notificações de Telas Offline
          </CardTitle>
          <CardDescription>Configure alertas quando suas telas ficarem offline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notifications-enabled">Receber notificações por e-mail</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba um e-mail quando suas telas ficarem offline
                  </p>
                </div>
                <Switch
                  id="notifications-enabled"
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="offline-threshold">Tempo limite para notificação (minutos)</Label>
                <p className="text-sm text-muted-foreground">
                  Você será notificado quando uma tela ficar offline por mais tempo que este limite
                </p>
                <div className="flex items-center gap-4">
                  <Input
                    id="offline-threshold"
                    type="number"
                    min={1}
                    max={60}
                    value={offlineThreshold}
                    onChange={(e) => setOfflineThreshold(Math.max(1, Math.min(60, parseInt(e.target.value) || 5)))}
                    className="w-24"
                    disabled={!notificationsEnabled}
                  />
                  <span className="text-sm text-muted-foreground">minutos</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSaveNotifications} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Configurações'
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleTestEmail}
                  disabled={isSendingTest || !notificationsEnabled}
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Testar Notificação
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Account Status */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-success" />
            Status da Conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
            <span className="font-medium">Conta Aprovada</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Sua conta foi aprovada e você tem acesso completo à plataforma.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

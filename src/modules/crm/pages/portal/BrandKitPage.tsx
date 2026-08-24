import React, { useState, useEffect } from 'react';
import { useClienteModalidade } from '@/modules/crm/hooks/useClienteModalidade';
import { BrandKitService } from '@/modules/crm/services/brandKit.service';
import { BrandKitPreview } from '@/modules/crm/components/portal/BrandKitPreview';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Upload, Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Montserrat', 'Poppins', 'Playfair Display', 
  'Open Sans', 'Lato', 'Oswald', 'Raleway', 'Ubuntu'
];

export default function BrandKitPage() {
  const { cliente, isLoading } = useClienteModalidade();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // States do formulário
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [corPrimaria, setCorPrimaria] = useState('#000000');
  const [corSecundaria, setCorSecundaria] = useState('#ffffff');
  const [fontePrimaria, setFontePrimaria] = useState('Inter');
  const [fonteSecundaria, setFonteSecundaria] = useState('Inter');

  useEffect(() => {
    if (cliente) {
      setLogoUrl(cliente.brand_logo_url || cliente.logo_url || '');
      setCorPrimaria(cliente.brand_cor_primaria || '#000000');
      setCorSecundaria(cliente.brand_cor_secundaria || '#ffffff');
      setFontePrimaria(cliente.brand_fonte_primaria || 'Inter');
      setFonteSecundaria(cliente.brand_fonte_secundaria || 'Inter');
    }
  }, [cliente]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !cliente?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione um arquivo de imagem válido.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) { // 2MB
      toast.error('O tamanho máximo permitido é 2MB.');
      return;
    }

    try {
      setIsUploading(true);
      const publicUrl = await BrandKitService.uploadLogo(file, cliente.id);
      setLogoUrl(publicUrl);
      toast.success('Logo enviada com sucesso!');
    } catch (error) {
      toast.error('Falha ao enviar logo. Tente novamente.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!cliente?.id) return;

    try {
      setIsSaving(true);
      await BrandKitService.atualizarBrandKit(cliente.id, {
        brand_logo_url: logoUrl,
        brand_cor_primaria: corPrimaria,
        brand_cor_secundaria: corSecundaria,
        brand_fonte_primaria: fontePrimaria,
        brand_fonte_secundaria: fonteSecundaria,
      });
      toast.success('Brand Kit atualizado com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-[250px]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brand Kit</h1>
        <p className="text-muted-foreground mt-2">
          Personalize a identidade visual da sua marca para os encartes e telas.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Formulário de Configuração */}
        <Card>
          <CardHeader>
            <CardTitle>Configurações</CardTitle>
            <CardDescription>Defina sua logo, cores e tipografia oficiais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Logo da Marca</Label>
              <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 transition-colors cursor-pointer relative">
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/svg+xml" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                {isUploading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-2" />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                )}
                <p className="text-sm font-medium">
                  {isUploading ? 'Enviando...' : 'Clique ou arraste para enviar'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG ou SVG (Max. 2MB)</p>
              </div>
            </div>

            {/* Cores */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cor Primária</Label>
                <div className="flex gap-2">
                  <Input 
                    type="color" 
                    value={corPrimaria} 
                    onChange={e => setCorPrimaria(e.target.value)}
                    className="w-12 p-1 h-10 cursor-pointer"
                  />
                  <Input 
                    type="text" 
                    value={corPrimaria} 
                    onChange={e => setCorPrimaria(e.target.value)}
                    className="font-mono uppercase"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cor Secundária</Label>
                <div className="flex gap-2">
                  <Input 
                    type="color" 
                    value={corSecundaria} 
                    onChange={e => setCorSecundaria(e.target.value)}
                    className="w-12 p-1 h-10 cursor-pointer"
                  />
                  <Input 
                    type="text" 
                    value={corSecundaria} 
                    onChange={e => setCorSecundaria(e.target.value)}
                    className="font-mono uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Fontes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fonte Primária (Títulos)</Label>
                <Select value={fontePrimaria} onValueChange={setFontePrimaria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map(font => (
                      <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fonte Secundária (Texto)</Label>
                <Select value={fonteSecundaria} onValueChange={setFonteSecundaria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map(font => (
                      <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              className="w-full" 
              onClick={handleSave} 
              disabled={isSaving || isUploading}
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Alterações
            </Button>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <div className="sticky top-8 space-y-4">
          <h2 className="text-lg font-semibold px-1">Preview em Tempo Real</h2>
          <BrandKitPreview 
            logoUrl={logoUrl}
            corPrimaria={corPrimaria}
            corSecundaria={corSecundaria}
            fontePrimaria={fontePrimaria}
            fonteSecundaria={fonteSecundaria}
          />
        </div>
      </div>
    </div>
  );
}

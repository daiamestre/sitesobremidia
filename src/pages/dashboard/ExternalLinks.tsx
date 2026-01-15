import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, Link2, Trash2, Edit, ExternalLink, Loader2, Upload, X, Image as ImageIcon, Video } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SocialAssetsGallery } from '@/components/dashboard/widgets/SocialAssetsGallery';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ExternalLink {
  id: string;
  platform: string;
  title: string;
  url: string;
  embed_code: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  created_at: string;
}

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram', color: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400' },
  { value: 'facebook', label: 'Facebook', color: 'bg-blue-600' },
  { value: 'youtube', label: 'YouTube', color: 'bg-red-600' },
  { value: 'tiktok', label: 'TikTok', color: 'bg-black' },
  { value: 'twitter', label: 'X (Twitter)', color: 'bg-gray-900' },
  { value: 'linkedin', label: 'LinkedIn', color: 'bg-blue-700' },
  { value: 'whatsapp', label: 'WhatsApp', color: 'bg-green-500' },
  { value: 'telegram', label: 'Telegram', color: 'bg-blue-500' },
  { value: 'pinterest', label: 'Pinterest', color: 'bg-red-500' },
  { value: 'spotify', label: 'Spotify', color: 'bg-green-600' },
  { value: 'website', label: 'Website', color: 'bg-gray-600' },
  { value: 'other', label: 'Outro', color: 'bg-gray-500' },
];

export default function ExternalLinks() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ExternalLink | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formPlatform, setFormPlatform] = useState('instagram');
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formEmbedCode, setFormEmbedCode] = useState('');

  // Manual Upload State (Instagram)
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Gallery Selection State
  const [showGallery, setShowGallery] = useState(false);
  const [selectedProfileUrl, setSelectedProfileUrl] = useState<string | null>(null);
  const [selectedPostUrls, setSelectedPostUrls] = useState<{ src: string, type: 'video' | 'image' }[]>([]);

  // Fetch external links
  const { data: links = [], isLoading } = useQuery({
    queryKey: ['external-links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_links')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ExternalLink[];
    },
    enabled: !!user,
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (linkData: Partial<ExternalLink> & { id?: string }) => {
      if (linkData.id) { // Update existing link
        const { error } = await supabase
          .from('external_links')
          .update({
            platform: linkData.platform,
            title: linkData.title,
            url: linkData.url,
            embed_code: linkData.embed_code || null,
          })
          .eq('id', linkData.id);
        if (error) throw error;
      } else { // Create new link
        const { error } = await supabase
          .from('external_links')
          .insert({
            user_id: user?.id,
            platform: linkData.platform,
            title: linkData.title,
            url: linkData.url,
            embed_code: linkData.embed_code || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-links'] });
      toast.success(editingLink ? 'Link atualizado!' : 'Link adicionado!');
      closeDialog();
    },
    onError: () => {
      toast.error('Erro ao salvar link');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('external_links')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-links'] });
      toast.success('Link removido!');
      setDeleteConfirm(null);
    },
    onError: () => {
      toast.error('Erro ao remover link');
    },
  });

  const resetForm = () => {
    setFormPlatform('instagram');
    setFormTitle('');
    setFormUrl('');
    setFormEmbedCode('');
    setEditingLink(null);
    setProfileFile(null);
    setPostFiles([]);
    setSelectedProfileUrl(null);
    setSelectedPostUrls([]);
    setShowGallery(false);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const openEditDialog = (link: ExternalLink) => {
    setEditingLink(link);
    setFormPlatform(link.platform);
    setFormTitle(link.title);
    setFormUrl(link.url);
    setFormEmbedCode(link.embed_code || '');

    // Pre-populate selections if available
    if (link.platform === 'instagram' && link.embed_code) {
      try {
        const embedData = JSON.parse(link.embed_code);
        if (embedData.manual_profile) setSelectedProfileUrl(embedData.manual_profile);
        if (embedData.manual_posts) setSelectedPostUrls(embedData.manual_posts);
      } catch (e) {
        console.error("Failed to parse embed_code for editing:", e);
      }
    }

    // Reset files (editing existing files not supported yet, user must re-upload to change)
    setProfileFile(null);
    setPostFiles([]);
    setIsDialogOpen(true);
  };

  const handleGallerySelection = (assets: any[], type: string) => {
    if (type === 'perfil') {
      setSelectedProfileUrl(assets[0].url);
      setProfileFile(null); // Clear file input if gallery is used
      toast.success('Foto de perfil selecionada da galeria!');
    } else {
      const formatted = assets.map(a => ({
        src: a.url,
        type: a.name.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image' as 'video' | 'image'
      }));
      setSelectedPostUrls(formatted);
      setPostFiles([]);
      toast.success(`${formatted.length} posts selecionados da galeria!`);
    }
    setShowGallery(false);
  };

  const handleFileUpload = async (file: File, subfolder: 'perfil' | 'posts') => {
    if (!user) throw new Error('Usuário não autenticado');

    const fileExt = file.name.split('.').pop();
    // Sanitize filename to avoid weird character issues
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `manual_${Date.now()}_${sanitizedName}.${fileExt}`;
    // Use subfolders for better organization
    const filePath = `${user.id}/social/${subfolder}/${fileName}`;

    // console.log(`[Upload] Starting upload to social/${subfolder}:`, filePath);

    const { error: uploadError } = await supabase.storage
      .from('media') // Keep 'media' bucket
      .upload(filePath, file, {
        upsert: true
      });

    if (uploadError) {
      console.error('[Upload] Supabase error:', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formUrl.trim()) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      let finalEmbedCode = formEmbedCode.trim();

      // Handle Instagram Manual Uploads
      if (formPlatform === 'instagram') { // Run for Instagram regardless, to allow clearing
        setIsUploading(true);
        const manualData: any = {};

        // 1. Resolve Profile Picture
        let finalProfileUrl = selectedProfileUrl; // Start with current UI state (could be gallery selection or existing)

        if (profileFile) {
          try {
            finalProfileUrl = await handleFileUpload(profileFile, 'perfil');
          } catch (err: any) {
            console.error('Profile upload failed:', err);
            toast.error(`Erro ao enviar foto de perfil: ${err.message || 'Erro desconhecido'}`);
            setIsUploading(false);
            return;
          }
        }

        if (finalProfileUrl) {
          manualData.manual_profile = finalProfileUrl;
        }

        // 2. Resolve Posts
        let finalPosts = [...selectedPostUrls]; // Start with current UI state

        if (postFiles.length > 0) {
          try {
            const uploadedUrls = await Promise.all(postFiles.map(f => handleFileUpload(f, 'posts')));
            // Create post objects for the new uploads
            const newPosts = uploadedUrls.map((src, i) => ({
              src,
              type: postFiles[i].type.startsWith('video') ? 'video' : 'image' as 'video' | 'image'
            }));
            // Replace current selection with new uploads (or append? UI implies replacement usually, but let's stick to replacement as per current UI state clearing)
            finalPosts = newPosts;
          } catch (err: any) {
            console.error('Posts upload failed:', err);
            toast.error(`Erro ao enviar posts: ${err.message || 'Erro desconhecido'}`);
            setIsUploading(false);
            return;
          }
        }

        if (finalPosts.length > 0) {
          manualData.manual_posts = finalPosts;
        }

        // Store as JSON in embed_code column
        // We do NOT merge with existing here because finalProfileUrl/finalPosts SHOULD be the complete truth.
        // If the user cleared the selection in UI, finalProfileUrl will be null, and we want manual_profile to be undefined/removed.
        if (Object.keys(manualData).length > 0) {
          finalEmbedCode = JSON.stringify(manualData);
        } else {
          // If everything is cleared but we are in instagram mode, we might want to clear the embed code if it was previously manual data
          // However, embed_code might also store other things. 
          // Ideally we just overwrite it with the new empty manualData if it was JSON.
          // If the user entered a raw embed code string previously, this logic might overwrite it. 
          // But the UI shows either "Manual" OR "Input", controlled by internal logic.
          // Given the current structure, if manual mode is active (implied by this block), we control the JSON.
          finalEmbedCode = JSON.stringify(manualData);
        }
      }

      saveMutation.mutate({
        platform: formPlatform,
        title: formTitle.trim(),
        url: formUrl.trim(),
        embed_code: finalEmbedCode,
      });

    } catch (error: any) {
      console.error(error);
      toast.error(`Erro crítico no envio: ${error.message || 'Tente novamente'}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Filter links
  const filteredLinks = links.filter(link =>
    link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.platform.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group links by platform
  const linksByPlatform = PLATFORMS.map(platform => ({
    ...platform,
    links: filteredLinks.filter(link => link.platform === platform.value),
  }));

  const getPlatformInfo = (value: string) => {
    return PLATFORMS.find(p => p.value === value) || PLATFORMS[PLATFORMS.length - 1];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Links Externos</h1>
          <p className="text-muted-foreground">Conecte conteúdos de redes sociais e websites</p>
        </div>
      </div>

      <Tabs defaultValue="links" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="links">Meus Links</TabsTrigger>
          <TabsTrigger value="gallery">Galeria Social</TabsTrigger>
        </TabsList>

        <TabsContent value="links" className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar links..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button className="gradient-primary" onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Link
            </Button>
          </div>

          {/* Platform Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {linksByPlatform.filter(p => p.links.length > 0).map((platform) => (
              <Card key={platform.value} className="glass hover:glow-primary transition-all duration-300">
                <CardContent className="flex flex-col items-center justify-center p-4">
                  <div className={`w-10 h-10 rounded-full ${platform.color} flex items-center justify-center mb-2`}>
                    <span className="text-white font-bold text-sm">
                      {platform.label.charAt(0)}
                    </span>
                  </div>
                  <span className="font-medium text-sm">{platform.label}</span>
                  <span className="text-xs text-muted-foreground">{platform.links.length} links</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Links List */}
          {filteredLinks.length > 0 ? (
            <div className="grid gap-4">
              {filteredLinks.map((link) => {
                const platform = getPlatformInfo(link.platform);
                return (
                  <Card key={link.id} className="glass hover:glow-primary transition-all duration-300">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-lg ${platform.color} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white font-bold text-lg">
                            {platform.label.charAt(0)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{link.title}</h3>
                          <p className="text-sm text-muted-foreground truncate">{platform.label}</p>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline truncate block"
                          >
                            {link.url}
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(link.url, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(link)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm(link.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="glass">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-6 rounded-full bg-muted/50 mb-4">
                  <Link2 className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Nenhum link externo</h3>
                <p className="text-muted-foreground text-center max-w-md mb-4">
                  Adicione links de Instagram, Facebook, YouTube, TikTok, WhatsApp e outras plataformas.
                </p>
                <Button className="gradient-primary" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Link
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Add/Edit Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-h-[90vh] flex flex-col p-0 gap-0">
              <DialogHeader className="p-6 pb-2 shrink-0">
                <DialogTitle>{editingLink ? 'Editar Link' : 'Adicionar Link'}</DialogTitle>
                <DialogDescription>
                  Adicione links de redes sociais para conectar seu conteúdo.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 pt-2 custom-scrollbar space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="platform">Plataforma</Label>
                    <Select value={formPlatform} onValueChange={setFormPlatform}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a plataforma" />
                      </SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map((platform) => (
                          <SelectItem key={platform.value} value={platform.value}>
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded ${platform.color}`} />
                              {platform.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title">Título *</Label>
                    <Input
                      id="title"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Ex: Nosso perfil no Instagram"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="url">URL *</Label>
                    <Input
                      id="url"
                      type="url"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      placeholder="https://instagram.com/seuperfil"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="embed">
                      {formPlatform === 'instagram' ? 'Configuração Manual (Opcional)' : 'Código de Embed (opcional)'}
                    </Label>

                    {formPlatform === 'instagram' ? (
                      <div className="space-y-4 border rounded-lg p-4 bg-muted/30">

                        {/* Gallery Toggle / View */}
                        {showGallery ? (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center mb-2">
                              <Label className="text-sm font-semibold">Galeria Social</Label>
                              <Button variant="ghost" size="sm" onClick={() => setShowGallery(false)} className="h-6 px-2 text-xs">
                                <X className="h-4 w-4 mr-1" /> Fechar
                              </Button>
                            </div>
                            <SocialAssetsGallery
                              selectionMode={true}
                              onSelectionConfirm={handleGallerySelection}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-end">
                              <Button type="button" variant="secondary" size="sm" onClick={() => setShowGallery(true)} className="text-xs">
                                <ImageIcon className="h-4 w-4 mr-2" />
                                Selecionar da Galeria Social
                              </Button>
                            </div>

                            {/* Profile Picture Section */}
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground uppercase font-bold">Foto Perfil do Instagram (Imagem)</Label>

                              {selectedProfileUrl ? (
                                <div className="flex items-center gap-3 p-2 bg-background rounded border">
                                  <img src={selectedProfileUrl} className="w-10 h-10 rounded-full object-cover" alt="Profile Selection" />
                                  <div className="flex-1 overflow-hidden">
                                    <p className="text-xs truncate">Selecionado da Galeria</p>
                                  </div>
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setSelectedProfileUrl(null)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => setProfileFile(e.target.files?.[0] || null)}
                                    className="cursor-pointer text-xs"
                                  />
                                  {profileFile && <ImageIcon className="h-4 w-4 text-green-500" />}
                                </div>
                              )}
                            </div>

                            {/* Posts Section */}
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground uppercase font-bold">Últimos 3 Posts (Img/Video)</Label>

                              {selectedPostUrls.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="flex gap-2">
                                    {selectedPostUrls.map((post, idx) => (
                                      <div key={idx} className="relative w-16 h-16 rounded overflow-hidden border bg-black/5">
                                        {post.type === 'video' ? (
                                          <video src={post.src} className="w-full h-full object-cover opacity-80" controls />
                                        ) : (
                                          <img src={post.src} className="w-full h-full object-cover" alt="Post" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <Button type="button" variant="outline" size="sm" className="w-full text-xs h-7" onClick={() => setSelectedPostUrls([])}>
                                    Limpar Seleção de Posts
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-3">
                                    <Input
                                      type="file"
                                      accept="image/*,video/*"
                                      multiple
                                      onChange={(e) => {
                                        const files = Array.from(e.target.files || []);
                                        if (files.length > 3) {
                                          toast.error('Selecione no máximo 3 arquivos');
                                          e.target.value = '';
                                          return;
                                        }
                                        setPostFiles(files);
                                      }}
                                      className="cursor-pointer text-xs"
                                    />
                                    <div className="flex gap-1">
                                      {postFiles.map((_, i) => (
                                        <div key={i} className="w-2 h-2 rounded-full bg-green-500" />
                                      ))}
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground">Suporta imagens e vídeos de até 1 minuto.</p>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <Input
                        id="embed"
                        value={formEmbedCode}
                        onChange={(e) => setFormEmbedCode(e.target.value)}
                        placeholder="Código de incorporação da plataforma"
                      />
                    )}
                  </div>
                </div>

                <div className="p-4 border-t bg-background mt-auto flex justify-end gap-2 shrink-0">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending || isUploading}>
                    {saveMutation.isPending || isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    {editingLink ? 'Salvar' : 'Adicionar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation */}
          <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir este link? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="gallery">
          <SocialAssetsGallery
            availableLinks={links}
            onApplyToInstagram={async (type, data, targetLinkId) => {
              // Find the specific Instagram link designed by user
              const instagramLink = links.find(l => l.id === targetLinkId);

              if (!instagramLink) {
                toast.error('O link selecionado não foi encontrado ou foi excluído.');
                return;
              }

              try {
                let currentEmbed: any = {};
                try {
                  currentEmbed = instagramLink.embed_code ? JSON.parse(instagramLink.embed_code) : {};
                } catch (e) {
                  currentEmbed = {};
                }

                let updatedEmbed = { ...currentEmbed };

                if (type === 'profile') {
                  updatedEmbed.manual_profile = data;
                  toast.info(`Atualizando foto de perfil de "${instagramLink.title}"...`);
                } else {
                  updatedEmbed.manual_posts = data;
                  toast.info(`Atualizando posts de "${instagramLink.title}"...`);
                }

                await saveMutation.mutateAsync({
                  ...instagramLink,
                  embed_code: JSON.stringify(updatedEmbed)
                });

                toast.success(type === 'profile' ? 'Foto de perfil atualizada!' : 'Posts do Instagram atualizados!');
              } catch (error) {
                console.error('Error updating instagram assets:', error);
                toast.error('Erro ao atualizar Instagram.');
              }
            }}
            isApplying={saveMutation.isPending}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
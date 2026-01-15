-- Create table for external social media links
CREATE TABLE public.external_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  embed_code TEXT,
  thumbnail_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_links ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own external links" 
ON public.external_links 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own external links" 
ON public.external_links 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own external links" 
ON public.external_links 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own external links" 
ON public.external_links 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admin access
CREATE POLICY "Admins can view all external links" 
ON public.external_links 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_external_links_updated_at
BEFORE UPDATE ON public.external_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
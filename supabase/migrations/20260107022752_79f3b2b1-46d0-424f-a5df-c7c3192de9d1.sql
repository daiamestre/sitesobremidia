-- Create table for screen schedules
CREATE TABLE public.screen_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  screen_id UUID NOT NULL REFERENCES public.screens(id) ON DELETE CASCADE,
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sunday, 6=Saturday
  priority INTEGER NOT NULL DEFAULT 0, -- Higher priority wins if schedules overlap
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.screen_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies based on screen ownership
CREATE POLICY "Users can view their screen schedules"
ON public.screen_schedules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.screens 
    WHERE screens.id = screen_schedules.screen_id 
    AND screens.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert their screen schedules"
ON public.screen_schedules
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.screens 
    WHERE screens.id = screen_schedules.screen_id 
    AND screens.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their screen schedules"
ON public.screen_schedules
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.screens 
    WHERE screens.id = screen_schedules.screen_id 
    AND screens.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their screen schedules"
ON public.screen_schedules
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.screens 
    WHERE screens.id = screen_schedules.screen_id 
    AND screens.user_id = auth.uid()
  )
);

-- Admin can view all schedules
CREATE POLICY "Admins can view all screen schedules"
ON public.screen_schedules
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_screen_schedules_updated_at
BEFORE UPDATE ON public.screen_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient lookups
CREATE INDEX idx_screen_schedules_screen_id ON public.screen_schedules(screen_id);
CREATE INDEX idx_screen_schedules_active ON public.screen_schedules(is_active) WHERE is_active = true;
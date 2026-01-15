-- Trigger function to auto-approve specific email
CREATE OR REPLACE FUNCTION public.auto_approve_specific_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.email = 'jairaniran2@gmail.com' THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to run before insert on profiles
CREATE TRIGGER auto_approve_jairaniran
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_specific_user();
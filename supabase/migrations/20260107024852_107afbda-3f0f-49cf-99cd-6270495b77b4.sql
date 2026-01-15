-- Add notification settings columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS offline_notification_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS offline_notification_threshold integer NOT NULL DEFAULT 5;
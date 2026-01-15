-- Add widget_config column to screens table
ALTER TABLE public.screens 
ADD COLUMN widget_config jsonb DEFAULT '{
  "clock": {
    "enabled": true,
    "showDate": true,
    "showSeconds": false,
    "position": "bottom-left"
  },
  "weather": {
    "enabled": true,
    "latitude": -23.5505,
    "longitude": -46.6333,
    "position": "bottom-right"
  },
  "rss": {
    "enabled": false,
    "feedUrl": "https://g1.globo.com/rss/g1/",
    "maxItems": 5,
    "scrollSpeed": 8,
    "position": "top"
  }
}'::jsonb;
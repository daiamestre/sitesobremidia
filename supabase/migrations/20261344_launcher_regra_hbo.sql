-- F-200 — a regra "hbo" dos apps ocultos da launcher pegava o app Google (com.google.android.googlequicksearcHBOx).
-- Passa a ser palavra inteira: 're:\bhbo\b' (pega com.hbo.*, "HBO Max"; não pega "googlequicksearchbox").
-- Aditivo: só o valor padrão e a lista padrão de fn_player_launcher (a partir da definição viva). Player 5.7.10: sem impacto.
-- ROLLBACK: trocar de volta 're:\bhbo\b' por 'hbo' nos mesmos três lugares.

ALTER TABLE public.launcher_configuracao ALTER COLUMN apps_ocultos SET DEFAULT ARRAY[
  'youtube', 'netflix', 'com.amazon.avod', 'primevideo', 'prime video', 'disney', 'globoplay', 'com.globo', 're:\bhbo\b',
  'com.wbd', 'paramount', 'pluto', 'twitch', 'starplus', 'crunchyroll', 'iptv', 'kodi', 'xbmc', 'livechannels',
  're:\btv\b'
];

UPDATE public.launcher_configuracao
   SET apps_ocultos = array_replace(apps_ocultos, 'hbo', 're:\bhbo\b')
 WHERE 'hbo' = ANY (apps_ocultos);

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.fn_player_launcher()'::regprocedure);
  IF position('''hbo''' IN d) > 0 THEN
    EXECUTE replace(d, '''hbo''', '''re:\bhbo\b''');
  END IF;
END $$;

alter table "public"."playlist_items" add column "start_time" time without time zone;
alter table "public"."playlist_items" add column "end_time" time without time zone;
alter table "public"."playlist_items" add column "days" integer[];

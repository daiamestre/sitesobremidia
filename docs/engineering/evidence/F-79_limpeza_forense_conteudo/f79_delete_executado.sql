DO $f79$
DECLARE
  s_ids uuid[] := ARRAY['3f472a6a-f1eb-421e-88f0-2a81f6dc5b44','2429ecbb-d74c-4c47-ab7e-472b3fe0808d','aac3a2dd-b3a6-4426-8f67-c8e265a388a9','488b5613-5566-4e5f-a447-9424bd65e54d','3eb0d507-25c2-4143-a187-5be7b2513fac','39bb9c4c-eb05-4dbc-b5ae-565171712bed','e48b37dd-0f51-487d-a94c-6e9578467924','bac57c8d-e826-4613-bbf7-a77e942fd716','7c89d8d4-3b78-4405-a303-ceea4ac8864c','350d76b9-28a0-4b27-bdd1-924cd2555d18','e0d9ddc7-d8b4-4221-93b8-ae123f4f3fd6']::uuid[];
  n_ids uuid[] := ARRAY['4a80c01a-95b0-418d-b377-488066336712','072e285f-e785-4f3e-8411-5905c57e0c5b','b944a949-a44d-46ea-8a38-bb15b5608393','ffdd42d1-bf5b-47c2-979c-1dc4db511d16','80bd238b-be14-4e03-b49a-1b9da5d5dc54','9939b19c-4308-461e-ad97-41bf32ac078c','cdab49b5-165c-4788-bbfe-1db52ee51a14','96a2c7b1-09cf-4831-bb8f-12dc843b2ded','38d9f707-f6f6-40ec-befc-b4eebd171ad6','2b70a7c1-3882-4454-8e03-e73ba7a0418d','f26cd795-66ec-4f89-96c5-5f8634b2f34b','50b709b7-083e-4cdb-b413-94c77b6fc1cf','0aa7b0f0-b73e-46c2-ad21-4377f4800781','5a86d6ef-4b37-467c-a4d8-93b5f3a480fc','8f6283e3-c55c-44d1-a51d-51a96b7b03a8','66282a29-73b9-446e-8a20-2411fa7f1abd','8a2a9032-7e27-462f-9717-3fad206561e8','44234cca-661e-4985-858c-315182a5eb71','b40eed7e-1505-4533-bdaa-aa8ce7c20949','0dc1a71a-3811-42d8-9bca-8dcff2fdecde','94f243ec-3640-4cfa-9bd8-52f40f6ec3dc','a3cc4ac9-308a-495b-8783-a6c640e2d5a0','6e868a75-41f1-4eda-92a9-8f494df04d15','d39a534f-6510-4539-a400-1bda03370263','a828a6fb-3fa8-4110-bde3-c53eb7cd1414','feff3b04-9721-41fc-bf51-8a30ce762348','80254d32-6044-4cf1-85f8-0254fcd8f989','c404c6ea-55f7-4213-aa03-8be1daaa9da1','65428c48-f1c4-44e7-906c-dc005530c12e','06225f05-69c6-4388-a9ef-45678d01f794']::uuid[];
  v_s int; v_n int; v_tot_s_antes int; v_tot_n_antes int; v_del_s int; v_del_n int;
BEGIN
  IF cardinality(s_ids) <> 11 OR cardinality(n_ids) <> 30 THEN RAISE EXCEPTION 'F79_LISTA_INVALIDA'; END IF;
  SELECT count(*) INTO v_tot_s_antes FROM public.content_sports_fixtures;
  SELECT count(*) INTO v_tot_n_antes FROM public.content_news_items;
  -- 8.1 revalidação imediatamente antes do DELETE
  SELECT count(*) INTO v_s FROM public.content_sports_fixtures WHERE id = ANY(s_ids);
  SELECT count(*) INTO v_n FROM public.content_news_items WHERE id = ANY(n_ids);
  IF v_s <> 11 OR v_n <> 30 THEN RAISE EXCEPTION 'F79_PRECHECK_FALHOU sports=% news=%', v_s, v_n; END IF;
  -- 8.2 DELETE explícito, somente os IDs materializados
  DELETE FROM public.content_sports_fixtures WHERE id = ANY(s_ids); GET DIAGNOSTICS v_del_s = ROW_COUNT;
  DELETE FROM public.content_news_items WHERE id = ANY(n_ids); GET DIAGNOSTICS v_del_n = ROW_COUNT;
  IF v_del_s <> 11 OR v_del_n <> 30 THEN RAISE EXCEPTION 'F79_DELETE_INESPERADO sports=% news=%', v_del_s, v_del_n; END IF;
  -- 8.3 conferência dentro da transação
  SELECT count(*) INTO v_s FROM public.content_sports_fixtures WHERE id = ANY(s_ids);
  SELECT count(*) INTO v_n FROM public.content_news_items WHERE id = ANY(n_ids);
  IF v_s <> 0 OR v_n <> 0 THEN RAISE EXCEPTION 'F79_ALVO_REMANESCENTE sports=% news=%', v_s, v_n; END IF;
  IF (SELECT count(*) FROM public.content_sports_fixtures) <> v_tot_s_antes - 11
     OR (SELECT count(*) FROM public.content_news_items) <> v_tot_n_antes - 30 THEN
    RAISE EXCEPTION 'F79_REGISTRO_INESPERADO_AFETADO';
  END IF;
END
$f79$;

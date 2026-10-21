-- Replace an existing derived repository index as one owner-bound snapshot.
CREATE OR REPLACE FUNCTION public.save_repository_index_snapshot(p_owner UUID,p_index_id TEXT,p_index JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE header public.repository_indexes%ROWTYPE; item JSONB; identity JSONB;
BEGIN
  identity:=p_index->'identity';
  IF p_owner IS NULL OR jsonb_typeof(p_index) IS DISTINCT FROM 'object'
    OR jsonb_typeof(identity) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['projectId','repositoryId','repositoryOwner','repositoryName','branch']) k
      WHERE jsonb_typeof(identity->k) IS DISTINCT FROM 'string' OR length(identity->>k) NOT BETWEEN 1 AND 500)
    OR p_index_id IS DISTINCT FROM concat(identity->>'projectId',':',identity->>'repositoryId',':',identity->>'branch')
    OR p_index->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR jsonb_typeof(p_index->'indexedCommitSha') IS DISTINCT FROM 'string' OR length(p_index->>'indexedCommitSha') NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_index->'files') IS DISTINCT FROM 'array' OR jsonb_array_length(p_index->'files')>10000
    OR jsonb_typeof(p_index->'updatedAt') IS DISTINCT FROM 'string'
    OR (p_index ? 'treeSha' AND jsonb_typeof(p_index->'treeSha') NOT IN ('string','null'))
  THEN RAISE EXCEPTION 'invalid repository snapshot' USING ERRCODE='22023'; END IF;
  INSERT INTO public.repository_indexes(index_id,user_id,project_id,repository_id,repository_owner,repository_name,branch,indexed_commit_sha,tree_sha,schema_version,file_count,updated_at)
    VALUES(p_index_id,p_owner,identity->>'projectId',identity->>'repositoryId',identity->>'repositoryOwner',identity->>'repositoryName',identity->>'branch',p_index->>'indexedCommitSha',p_index->>'treeSha','1.0.0',0,(p_index->>'updatedAt')::timestamptz)
    ON CONFLICT(index_id) DO NOTHING;
  SELECT * INTO header FROM public.repository_indexes WHERE index_id=p_index_id FOR UPDATE;
  IF NOT FOUND OR header.user_id IS DISTINCT FROM p_owner OR header.project_id IS DISTINCT FROM identity->>'projectId'
    OR header.repository_id IS DISTINCT FROM identity->>'repositoryId' OR header.repository_owner IS DISTINCT FROM identity->>'repositoryOwner'
    OR header.repository_name IS DISTINCT FROM identity->>'repositoryName' OR header.branch IS DISTINCT FROM identity->>'branch'
    OR EXISTS(SELECT 1 FROM public.repository_index_files WHERE index_id=p_index_id AND user_id IS DISTINCT FROM p_owner)
  THEN RAISE EXCEPTION 'repository snapshot unavailable' USING ERRCODE='42501'; END IF;
  DELETE FROM public.repository_index_files WHERE index_id=p_index_id AND user_id=p_owner;
  FOR item IN SELECT value FROM jsonb_array_elements(p_index->'files') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'filePath') IS DISTINCT FROM 'string'
      OR length(item->>'filePath') NOT BETWEEN 1 AND 2000 OR jsonb_typeof(item->'blobSha') IS DISTINCT FROM 'string'
      OR length(item->>'blobSha') NOT BETWEEN 1 AND 200 OR jsonb_typeof(item->'binary') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(item->'size') IS DISTINCT FROM 'number' OR (item->>'size')::numeric NOT BETWEEN 0 AND 2147483647
      OR (item->>'size')::numeric<>trunc((item->>'size')::numeric)
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['symbols','imports','exports']) k WHERE jsonb_typeof(item->k) IS DISTINCT FROM 'array')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements((item->'symbols')||(item->'imports')||(item->'exports')) v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string')
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['language','componentRoot','componentAdapterId','workspaceRoot','summary','embeddingRef']) k
        WHERE item ? k AND jsonb_typeof(item->k) NOT IN ('string','null'))
      OR jsonb_typeof(item->'updatedAt') IS DISTINCT FROM 'string'
    THEN RAISE EXCEPTION 'invalid repository file' USING ERRCODE='22023'; END IF;
    INSERT INTO public.repository_index_files(index_id,user_id,file_path,blob_sha,language,size_bytes,is_binary,component_root,component_adapter_id,workspace_root,symbols,imports,exports,summary,embedding_ref,updated_at)
      VALUES(p_index_id,p_owner,item->>'filePath',item->>'blobSha',item->>'language',(item->>'size')::integer,(item->>'binary')::boolean,
        item->>'componentRoot',item->>'componentAdapterId',item->>'workspaceRoot',item->'symbols',item->'imports',item->'exports',item->>'summary',item->>'embeddingRef',(item->>'updatedAt')::timestamptz);
  END LOOP;
  UPDATE public.repository_indexes SET indexed_commit_sha=p_index->>'indexedCommitSha',tree_sha=p_index->>'treeSha',
    file_count=jsonb_array_length(p_index->'files'),updated_at=(p_index->>'updatedAt')::timestamptz WHERE index_id=p_index_id;
  RETURN jsonb_build_object('index_id',p_index_id,'user_id',p_owner,'indexed_commit_sha',p_index->>'indexedCommitSha','file_count',jsonb_array_length(p_index->'files'));
END;
$$;
-- SQL function uses one statement snapshot for header and children. The caller
-- still checks current repository HEAD through the existing readIndex contract.
CREATE OR REPLACE FUNCTION public.load_repository_index_snapshot(p_owner UUID,p_index_id TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('header',to_jsonb(h),'files',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.file_path)
    FROM public.repository_index_files f WHERE f.index_id=h.index_id),'[]'::jsonb))
    FROM public.repository_indexes h WHERE h.index_id=p_index_id AND h.user_id=p_owner
      AND NOT EXISTS(SELECT 1 FROM public.repository_index_files f WHERE f.index_id=h.index_id AND f.user_id IS DISTINCT FROM p_owner)
      AND h.file_count=(SELECT count(*) FROM public.repository_index_files f WHERE f.index_id=h.index_id);
$$;
REVOKE ALL ON FUNCTION public.save_repository_index_snapshot(UUID,TEXT,JSONB),public.load_repository_index_snapshot(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_repository_index_snapshot(UUID,TEXT,JSONB),public.load_repository_index_snapshot(UUID,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';

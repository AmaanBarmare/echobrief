-- Storage bucket and policies for meeting recordings
-- Runs only if storage schema exists (new projects may need to create bucket via Dashboard first)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('recordings', 'recordings', false)
    ON CONFLICT (id) DO NOTHING;
    
    -- Drop existing policies if re-running
    DROP POLICY IF EXISTS "Users can upload their own recordings" ON storage.objects;
    DROP POLICY IF EXISTS "Users can view their own recordings" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own recordings" ON storage.objects;
    
    CREATE POLICY "Users can upload their own recordings"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Users can view their own recordings"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Users can delete their own recordings"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- Profile photos.
--
-- profiles.avatar_url has existed since the first migration and nothing ever
-- wrote to it — Settings showed an initial and no upload path existed. This adds
-- the bucket and the policies behind Settings → Account → Upload photo.
--
-- The bucket is PUBLIC, unlike `recordings`: an avatar is rendered by an <img>
-- in the app chrome, and signing a URL for every row that shows a face would be
-- a request per face. Nothing sensitive belongs here, and the path is
-- <user id>/avatar.<ext>, so knowing a user id lets you see their profile photo
-- — the same exposure as any product that shows a face next to a name.
--
-- Writes stay user-scoped: only the owner of the first path segment can insert,
-- replace or delete. delete-account sweeps this prefix alongside recordings/.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'avatars', 'avatars', true, 2097152,
      ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    )
    ON CONFLICT (id) DO UPDATE
      SET public = EXCLUDED.public,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;

    DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
    DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
    DROP POLICY IF EXISTS "Users can replace their own avatar" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

    CREATE POLICY "Avatars are publicly readable"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');

    CREATE POLICY "Users can upload their own avatar"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Users can replace their own avatar"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Users can delete their own avatar"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

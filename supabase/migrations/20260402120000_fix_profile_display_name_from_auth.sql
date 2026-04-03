-- Prefer full_name or name from auth metadata; ignore blank strings; fall back to email local-part then email.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta jsonb;
  from_meta text;
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  from_meta := COALESCE(
    NULLIF(TRIM(meta->>'full_name'), ''),
    NULLIF(TRIM(meta->>'name'), '')
  );
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      from_meta,
      NULLIF(split_part(NEW.email, '@', 1), ''),
      NEW.email
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

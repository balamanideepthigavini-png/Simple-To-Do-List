# Supabase setup

The app uses Supabase Auth anonymous sessions. Each app installation gets a private task list protected by row-level security; no service-role key is used in the app.

1. In your Supabase project, enable anonymous sign-ins in the Authentication settings.
2. Open the SQL Editor and run [`schema.sql`](./schema.sql).
3. In Replit Secrets, keep `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` set to this project's URL and publishable (or legacy anon) key.
4. Restart the To-Do List preview and tap the sync retry control if it still shows an error.

Anonymous sessions are tied to the app installation and are not a sign-in method for recovering tasks on another device. Add a real sign-in flow if users need to access the same list across devices.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function normalizeProjectUrl(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')
    ) {
      return null;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

const projectUrl = normalizeProjectUrl(url);
const client =
  projectUrl && anonKey
    ? createClient(projectUrl, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export function getSupabaseClient() {
  if (!url?.trim()) throw new Error('Supabase project settings are missing.');
  if (!projectUrl) throw new Error('Invalid Supabase project URL.');
  if (!anonKey) throw new Error('Supabase project settings are missing.');
  if (!client) throw new Error('Supabase project settings are missing.');
  return client;
}

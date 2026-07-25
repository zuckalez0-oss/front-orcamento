import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fica true quando as env vars não foram preenchidas (ex: .env não configurado ainda).
// AuthGate.jsx usa isso para mostrar um erro claro em vez de deixar o supabase-js
// estourar uma exceção genérica de URL inválida.
export const supabaseConfigurado = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = supabaseConfigurado
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

import { createClient } from '@supabase/supabase-js'

export async function saveConversation(question, answer) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Configura Supabase en .env.local')
  const { error } = await createClient(url, key).from('conversaciones').insert({ pregunta: question, respuesta: answer })
  if (error) throw new Error(error.message)
}

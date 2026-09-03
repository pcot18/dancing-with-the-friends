import { demoApi } from './demoApi.js'
import { supabaseApi, supabase } from './supabaseApi.js'

const forceDemo = import.meta.env.VITE_DEMO === '1' || new URLSearchParams(location.search).has('demo')
export const api = forceDemo || !supabase ? demoApi : supabaseApi

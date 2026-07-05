import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function run() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { data, error } = await supabase.rpc('query_advisory_locks')
  
  if (error) {
     console.error("RPC failed, let's just query pg_locks directly if we can't. Wait, PostgREST can't query pg_locks by default.");
     console.error(error);
  } else {
     console.log("Locks:", data);
  }
}

run()

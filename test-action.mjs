import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log("Fazendo login...")
  // We need valid user credentials. Let's try the ones from seed or real users.
  // Wait, I can just use service_role to fetch a valid user and generate a link?
  // Let's use the service_role key to impersonate.
}

run()

import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ''

async function run() {
  if (!supabaseServiceKey) {
    console.error("No service role key")
    return
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  const { data: users, error } = await supabase.auth.admin.listUsers()
  if (error || !users.users.length) {
    console.error("No users found", error)
    return
  }
  
  const user = users.users.find(u => u.email) || users.users[0]
  console.log("Using user:", user.email)
  
  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  })
  
  if (linkErr) {
    console.error("Link error", linkErr)
    return
  }
  
  console.log("Generated link:", link.properties.action_link)
}

run()

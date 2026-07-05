import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zsdetsoljvlxaqwmnnqf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZGV0c29sanZseGFxd21ubnFmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI3MDA4MCwiZXhwIjoyMDk2ODQ2MDgwfQ.QF1BG3CAAG85CZ36Iv4rL0Mg1kbPv4FeS4Us3Ikb7eM';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
main();

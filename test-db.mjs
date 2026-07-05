import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zsdetsoljvlxaqwmnnqf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZGV0c29sanZseGFxd21ubnFmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI3MDA4MCwiZXhwIjoyMDk2ODQ2MDgwfQ.QF1BG3CAAG85CZ36Iv4rL0Mg1kbPv4FeS4Us3Ikb7eM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.rpc('run_sql', { sql_query: "SELECT constraint_name, pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'stock_products';" });
  if (error) {
    console.log("Cannot run raw sql. Trying to insert another product with missing fields to see if it throws.");
  }
}
main();

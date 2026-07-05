import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://zsdetsoljvlxaqwmnnqf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZGV0c29sanZseGFxd21ubnFmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTI3MDA4MCwiZXhwIjoyMDk2ODQ2MDgwfQ.QF1BG3CAAG85CZ36Iv4rL0Mg1kbPv4FeS4Us3Ikb7eM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Pegar uma clínica
  const { data: clinics, error: clinError } = await supabase.from('clinics').select('id, name').limit(1);
  if (clinError || !clinics || clinics.length === 0) {
    console.error('Erro ao pegar clinica', clinError);
    return;
  }
  const clinicId = clinics[0].id;
  console.log('Usando clinica:', clinics[0].name);

  // Tentar inserir produto
  const { data, error } = await supabase
    .from("stock_products")
    .insert({
      clinic_id: clinicId,
      name: "Produto Teste Insercao 2",
      active_ingredient: null,
      presentation: null,
      barcode: null,
      anvisa_registration: null,
      category: null,
      therapeutic_class: null,
      unit: "un",
      controlled_class: null,
      requires_prescription: false,
      lot: null,
      expiry: null,
      ncm: null,
      cest: null,
      quantity: 10,
      min_quantity: 0,
      max_quantity: 10,
      location: null,
      cost: 0,
      price: 0,
      manufacturer: null,
      supplier_id: null,
      active: true,
      notes: null,
      product_type: "Medicamento",
      product_group: null,
      classification: null,
      subclassification: null,
      cfop: null,
      solicita_se_necessario: "NAO SOLICITA",
      sal_principio_ativo: "NAO SUBSTITUI"
    })
    .select("id")
    .single();

  if (error) {
    console.error("ERRO AO INSERIR:", JSON.stringify(error, null, 2));
  } else {
    console.log("INSERIDO COM SUCESSO:", data);
  }
}

main();

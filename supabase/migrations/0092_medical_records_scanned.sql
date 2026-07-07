-- Migration para tabela de prontuários antigos escaneados (Histórico Escaneado)

CREATE TABLE public.medical_records_scanned (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  tenant_id uuid NOT NULL DEFAULT auth.uid(),
  patient_id uuid NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL,
  description text,
  uploaded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT medical_records_scanned_pkey PRIMARY KEY (id),
  CONSTRAINT medical_records_scanned_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE,
  CONSTRAINT medical_records_scanned_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.medical_records_scanned ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Isolamento por tenant (medical_records_scanned)"
  ON public.medical_records_scanned
  AS restrict
  FOR ALL
  TO authenticated
  USING (tenant_id = (SELECT auth.uid()));

-- Insert storage bucket se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical_records', 'medical_records', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Storage
CREATE POLICY "Acesso aos arquivos do prontuario escaneado"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'medical_records' 
    AND (auth.uid())::text = (string_to_array(name, '/'))[1]
  );

"use server";

import { createClient } from "@/lib/supabase/server";

export async function addScannedRecord({
  patientId,
  filePath,
  fileName,
  fileSize,
  fileType,
  description,
}: {
  patientId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  description: string;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from("medical_records_scanned").insert({
    patient_id: patientId,
    file_path: filePath,
    file_name: fileName,
    file_size: fileSize,
    file_type: fileType,
    description: description || null,
    uploaded_by: userData?.user?.id ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function removeScannedRecord(id: string, filePath: string) {
  const supabase = await createClient();

  // Remover do bucket primeiro
  const { error: storageError } = await supabase.storage
    .from("medical_records")
    .remove([filePath]);

  if (storageError) {
    return { ok: false, error: storageError.message };
  }

  // Remover do banco
  const { error } = await supabase
    .from("medical_records_scanned")
    .delete()
    .eq("id", id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

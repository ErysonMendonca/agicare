import { createClient } from "@/lib/supabase/server";

export type ScannedRecord = {
  id: string;
  patientId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  description: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
  signedUrl?: string | null;
};

export async function listScannedRecords(patientId: string): Promise<ScannedRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("medical_records_scanned")
    .select("id, patient_id, file_path, file_name, file_size, file_type, description, uploaded_by, created_at, auth_users!uploaded_by(raw_user_meta_data)")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // Generate signed URLs for the files
  const records = data.map((row: any) => ({
    id: row.id,
    patientId: row.patient_id,
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    description: row.description,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.auth_users?.raw_user_meta_data?.full_name ?? null,
    createdAt: row.created_at,
  }));

  const paths = records.map((r) => r.filePath);
  if (paths.length > 0) {
    const { data: signedUrls } = await supabase.storage
      .from("medical_records")
      .createSignedUrls(paths, 3600);
      
    if (signedUrls) {
      records.forEach((r) => {
        const match = signedUrls.find((s) => s.path === r.filePath);
        if (match && match.signedUrl) {
          r.signedUrl = match.signedUrl;
        }
      });
    }
  }

  return records;
}

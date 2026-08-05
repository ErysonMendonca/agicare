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
  const records: ScannedRecord[] = data.map((row) => {
    const authUser = Array.isArray(row.auth_users) ? row.auth_users[0] : row.auth_users;
    const meta = authUser?.raw_user_meta_data as { full_name?: string } | null | undefined;
    return {
      id: row.id as string,
      patientId: row.patient_id as string,
      filePath: row.file_path as string,
      fileName: row.file_name as string,
      fileSize: row.file_size as number,
      fileType: row.file_type as string,
      description: (row.description as string | null) ?? null,
      uploadedBy: (row.uploaded_by as string | null) ?? null,
      uploadedByName: meta?.full_name ?? null,
      createdAt: row.created_at as string,
      signedUrl: null,
    };
  });

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

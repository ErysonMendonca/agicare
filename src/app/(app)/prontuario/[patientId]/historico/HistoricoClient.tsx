"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, Upload, Trash2, File, Image as ImageIcon, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Stagger, FadeInUp } from "@/components/ui/Motion";
import { createClient } from "@/lib/supabase/client";
import { addScannedRecord, removeScannedRecord } from "@/lib/actions/historico";
import type { ScannedRecord } from "@/lib/data/historico";

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return <ImageIcon className="h-5 w-5" />;
  if (type === "application/pdf") return <FileText className="h-5 w-5" />;
  return <File className="h-5 w-5" />;
}

export function HistoricoClient({
  patientId,
  historicos,
}: {
  patientId: string;
  historicos: ScannedRecord[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) {
      toast.error("Selecione um arquivo primeiro.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo excede o limite de 10MB.");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    
    // Gerar um nome único para o arquivo
    const fileExt = file.name.split('.').pop();
    const filePath = `${patientId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("medical_records")
        .upload(filePath, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const res = await addScannedRecord({
        patientId,
        filePath,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        description: description.trim(),
      });

      if (res?.ok) {
        toast.success("Arquivo anexado com sucesso.");
        setFile(null);
        setDescription("");
        router.refresh();
      } else {
        throw new Error(res?.error ?? "Erro ao salvar registro no banco.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao fazer upload do arquivo.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(id: string, path: string) {
    if (!window.confirm("Deseja realmente excluir este arquivo?")) return;
    
    startTransition(async () => {
      const res = await removeScannedRecord(id, path);
      if (res.ok) {
        toast.success("Arquivo removido.");
        router.refresh();
      } else {
        toast.error(res.error || "Erro ao remover arquivo.");
      }
    });
  }

  return (
    <>
      <Card className="mb-6 p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-ink">Anexar Novo Arquivo</h3>
            <p className="text-xs text-muted">Faça upload de prontuários antigos escaneados (PDF ou Imagens, máx 10MB).</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-sm font-medium text-ink">Arquivo</label>
            <input
              type="file"
              accept=".pdf,image/*"
              disabled={uploading || pending}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-muted
                file:mr-4 file:rounded-lg file:border-0
                file:bg-brand-50 file:px-4
                file:py-2 file:text-sm
                file:font-semibold file:text-brand-700
                hover:file:bg-brand-100"
            />
          </div>
          <div className="flex-1">
            <Input
              label="Descrição (opcional)"
              placeholder="Ex.: Prontuário antigo 2021"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading || pending}
            />
          </div>
          <Button onClick={handleUpload} disabled={!file || uploading || pending}>
            {uploading ? "Enviando..." : "Anexar Arquivo"}
          </Button>
        </div>
      </Card>

      <h3 className="mb-3 font-semibold text-ink">Arquivos Anexados ({historicos.length})</h3>

      {historicos.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-5 py-10 text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted-surface text-muted">
            <History className="h-5 w-5" />
          </span>
          <p className="font-medium text-ink">Nenhum arquivo anexado</p>
          <p className="text-sm text-muted">Arquivos anexados aparecerão aqui.</p>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-3">
          {historicos.map((h) => (
            <FadeInUp key={h.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-muted-surface text-muted">
                    {getFileIcon(h.fileType)}
                  </span>
                  <div>
                    <h4 className="font-medium text-ink">{h.fileName}</h4>
                    <p className="text-xs text-muted">
                      {formatBytes(h.fileSize)} · Anexado por {h.uploadedByName || "Desconhecido"} em {new Date(h.createdAt).toLocaleDateString()}
                    </p>
                    {h.description && (
                      <p className="mt-1 text-sm text-ink">{h.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {h.signedUrl && (
                    <a
                      href={h.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink transition-colors hover:bg-muted-surface"
                    >
                      <Download className="h-4 w-4" /> Baixar
                    </a>
                  )}
                  <button
                    onClick={() => handleRemove(h.id, h.filePath)}
                    disabled={pending || uploading}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            </FadeInUp>
          ))}
        </Stagger>
      )}
    </>
  );
}

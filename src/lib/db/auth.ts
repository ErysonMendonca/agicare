// ════════════════════════════════════════════════════════════════
// Superfície de autenticação equivalente à do `supabase.auth`, sobre MySQL.
//
// Reimplementa exatamente os métodos que o projeto usa (medidos no código):
//   getUser · signInWithPassword · signOut · updateUser · refreshSession
//   admin.getUserById
//
// A credencial vive em `auth_users` (substituta de auth.users): e-mail +
// hash bcrypt. A sessão é um cookie assinado (ver session.ts), que carrega
// a clínica ativa no lugar do claim app_metadata.active_clinic_id.
// ════════════════════════════════════════════════════════════════

import bcrypt from "bcryptjs";
import { consultar, executar } from "./mysql";
import {
  abrir,
  apagarSessao,
  gravarSessao,
  lerSessao,
  novaSessao,
  type Sessao,
} from "./session";

/** Formato que o código existente espera de `data.user`. */
export type Usuario = {
  id: string;
  email: string | null;
  /** Espelha app_metadata do Supabase — carrega active_clinic_id. */
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

export type RespostaAuth<T> = { data: T; error: { message: string } | null };

type LinhaAuthUser = {
  id: string;
  email: string;
  encrypted_password: string | null;
  raw_user_meta_data: unknown;
};

function paraUsuario(l: LinhaAuthUser, clinicId: string | null): Usuario {
  let meta: Record<string, unknown> = {};
  const raw = l.raw_user_meta_data;
  if (typeof raw === "string") {
    try { meta = JSON.parse(raw) as Record<string, unknown>; } catch { meta = {}; }
  } else if (raw && typeof raw === "object") {
    meta = raw as Record<string, unknown>;
  }
  return {
    id: l.id,
    email: l.email ?? null,
    app_metadata: clinicId ? { active_clinic_id: clinicId } : {},
    user_metadata: meta,
  };
}

/**
 * Resolve a clínica ativa de um usuário a partir das memberships, para o
 * login já selar a sessão com ela (o Supabase fazia isso no hook do token).
 * Devolve null quando há 0 ou mais de 1 — o chamador decide (seletor).
 */
async function clinicaUnica(userId: string): Promise<string | null> {
  const rows = await consultar<{ clinic_id: string }>(
    "SELECT clinic_id FROM clinic_members WHERE user_id = ? AND active = 1",
    [userId],
  );
  return rows.length === 1 ? rows[0].clinic_id : null;
}

export function criarAuth() {
  return {
    /**
     * Usuário da sessão atual. Não consulta o banco: a sessão é assinada, e
     * confiar nela é o equivalente a confiar no JWT que o Supabase emitia.
     */
    async getUser(): Promise<RespostaAuth<{ user: Usuario | null }>> {
      const s = await lerSessao();
      if (!s) return { data: { user: null }, error: null };
      return {
        data: {
          user: {
            id: s.userId,
            email: s.email,
            app_metadata: s.activeClinicId
              ? { active_clinic_id: s.activeClinicId }
              : {},
            user_metadata: {},
          },
        },
        error: null,
      };
    },

    /** Igual ao getUser aqui: a sessão é auto-contida. */
    async getSession(): Promise<RespostaAuth<{ session: Sessao | null }>> {
      return { data: { session: await lerSessao() }, error: null };
    },

    async signInWithPassword(cred: {
      email: string;
      password: string;
    }): Promise<RespostaAuth<{ user: Usuario | null }>> {
      const rows = await consultar<LinhaAuthUser>(
        "SELECT id, email, encrypted_password, raw_user_meta_data " +
        "FROM auth_users WHERE email = ? LIMIT 1",
        [cred.email.trim().toLowerCase()],
      );
      const u = rows[0];

      // Mesma mensagem para e-mail inexistente e senha errada, para não
      // revelar quais contas existem. E sempre roda o compare (mesmo sem
      // usuário) para o tempo de resposta não denunciar a diferença.
      const hash = u?.encrypted_password ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
      const confere = await bcrypt.compare(cred.password, hash);
      if (!u || !confere) {
        return { data: { user: null }, error: { message: "Invalid login credentials" } };
      }

      const clinicId = await clinicaUnica(u.id);
      await gravarSessao(novaSessao(u.id, u.email, clinicId));
      await executar("UPDATE auth_users SET last_sign_in_at = ? WHERE id = ?", [
        new Date().toISOString().slice(0, 19).replace("T", " "),
        u.id,
      ]);
      return { data: { user: paraUsuario(u, clinicId) }, error: null };
    },

    async signOut(): Promise<{ error: null }> {
      await apagarSessao();
      return { error: null };
    },

    /**
     * Reemite o cookie. No Supabase servia para o hook carimbar
     * active_clinic_id no token novo; aqui relê a membership e sela de novo.
     */
    async refreshSession(): Promise<RespostaAuth<{ user: Usuario | null }>> {
      const s = await lerSessao();
      if (!s) return { data: { user: null }, error: { message: "No session" } };
      const clinicId = s.activeClinicId ?? (await clinicaUnica(s.userId));
      await gravarSessao(novaSessao(s.userId, s.email, clinicId));
      return {
        data: {
          user: {
            id: s.userId, email: s.email,
            app_metadata: clinicId ? { active_clinic_id: clinicId } : {},
            user_metadata: {},
          },
        },
        error: null,
      };
    },

    /** Só a troca de senha é usada pelo projeto. */
    async updateUser(patch: {
      password?: string;
      email?: string;
      data?: Record<string, unknown>;
    }): Promise<RespostaAuth<{ user: Usuario | null }>> {
      const s = await lerSessao();
      if (!s) return { data: { user: null }, error: { message: "No session" } };

      const sets: string[] = [];
      const params: unknown[] = [];
      if (patch.password) {
        sets.push("encrypted_password = ?");
        params.push(await bcrypt.hash(patch.password, 10));
      }
      if (patch.email) {
        sets.push("email = ?");
        params.push(patch.email.trim().toLowerCase());
      }
      if (patch.data) {
        sets.push("raw_user_meta_data = ?");
        params.push(JSON.stringify(patch.data));
      }
      if (sets.length === 0) return { data: { user: null }, error: null };

      params.push(s.userId);
      await executar(
        `UPDATE auth_users SET ${sets.join(", ")} WHERE id = ?`, params);

      const rows = await consultar<LinhaAuthUser>(
        "SELECT id, email, encrypted_password, raw_user_meta_data FROM auth_users WHERE id = ?",
        [s.userId]);
      // Se o e-mail mudou, a sessão precisa refletir.
      if (patch.email) {
        await gravarSessao(novaSessao(s.userId, rows[0]?.email ?? null, s.activeClinicId));
      }
      return {
        data: { user: rows[0] ? paraUsuario(rows[0], s.activeClinicId) : null },
        error: null,
      };
    },

    /** Operações administrativas (equivalente ao svc.auth.admin). */
    admin: {
      async getUserById(id: string): Promise<RespostaAuth<{ user: Usuario | null }>> {
        const rows = await consultar<LinhaAuthUser>(
          "SELECT id, email, encrypted_password, raw_user_meta_data FROM auth_users WHERE id = ?",
          [id]);
        if (!rows[0]) return { data: { user: null }, error: { message: "User not found" } };
        return { data: { user: paraUsuario(rows[0], null) }, error: null };
      },

      async createUser(input: {
        email: string;
        password: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }): Promise<RespostaAuth<{ user: Usuario | null }>> {
        const email = input.email.trim().toLowerCase();
        const existe = await consultar<{ id: string }>(
          "SELECT id FROM auth_users WHERE email = ?", [email]);
        if (existe.length) {
          return {
            data: { user: null },
            error: { message: "A user with this email address has already been registered" },
          };
        }
        const hash = await bcrypt.hash(input.password, 10);
        // O DEFAULT (UUID()) do banco gera o id; lemos de volta pelo e-mail.
        await executar(
          "INSERT INTO auth_users (email, encrypted_password, email_confirmed_at, raw_user_meta_data) " +
          "VALUES (?, ?, ?, ?)",
          [email, hash, input.email_confirm === false ? null : new Date()
            .toISOString().slice(0, 19).replace("T", " "),
           JSON.stringify(input.user_metadata ?? {})],
        );
        const rows = await consultar<LinhaAuthUser>(
          "SELECT id, email, encrypted_password, raw_user_meta_data FROM auth_users WHERE email = ?",
          [email]);
        return { data: { user: rows[0] ? paraUsuario(rows[0], null) : null }, error: null };
      },

      async updateUserById(
        id: string,
        patch: { password?: string; email?: string; user_metadata?: Record<string, unknown> },
      ): Promise<RespostaAuth<{ user: Usuario | null }>> {
        const sets: string[] = [];
        const params: unknown[] = [];
        if (patch.password) {
          sets.push("encrypted_password = ?");
          params.push(await bcrypt.hash(patch.password, 10));
        }
        if (patch.email) { sets.push("email = ?"); params.push(patch.email.trim().toLowerCase()); }
        if (patch.user_metadata) {
          sets.push("raw_user_meta_data = ?");
          params.push(JSON.stringify(patch.user_metadata));
        }
        if (sets.length === 0) return { data: { user: null }, error: null };
        params.push(id);
        await executar(`UPDATE auth_users SET ${sets.join(", ")} WHERE id = ?`, params);
        const rows = await consultar<LinhaAuthUser>(
          "SELECT id, email, encrypted_password, raw_user_meta_data FROM auth_users WHERE id = ?", [id]);
        return { data: { user: rows[0] ? paraUsuario(rows[0], null) : null }, error: null };
      },

      async deleteUser(id: string): Promise<RespostaAuth<Record<string, never>>> {
        await executar("DELETE FROM auth_users WHERE id = ?", [id]);
        return { data: {}, error: null };
      },
    },
  };
}

export type Auth = ReturnType<typeof criarAuth>;

/** Troca a clínica ativa da sessão (usado por setActiveClinic). */
export async function definirClinicaAtiva(clinicId: string): Promise<boolean> {
  const s = await lerSessao();
  if (!s) return false;
  // Anti-IDOR: só aceita clínica em que o usuário tem membership ativo.
  const rows = await consultar<{ clinic_id: string }>(
    "SELECT clinic_id FROM clinic_members WHERE user_id = ? AND clinic_id = ? AND active = 1",
    [s.userId, clinicId],
  );
  if (rows.length === 0) return false;
  await gravarSessao(novaSessao(s.userId, s.email, clinicId));
  return true;
}

/** Lê a sessão a partir de um cookie cru (usado pelo proxy/middleware). */
export function sessaoDeCookie(valor: string | undefined): Sessao | null {
  return abrir(valor);
}

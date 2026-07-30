// GERADO POR mysql/gerar-meta.mjs — NÃO EDITAR À MÃO.
//
// Metadados do schema usados pelo query builder MySQL:
//   · tipo lógico de cada coluna, para converter o que o driver devolve
//     (TINYINT→boolean, JSON string→objeto, DATETIME→ISO)
//   · grafo de chaves estrangeiras, para resolver embeds aninhados
//     (ex.: professionals(profiles(full_name))) em JOIN
//   · quais tabelas têm clinic_id, para o isolamento multitenant
//
// Regerar depois de mudar as migrations: node mysql/gerar-meta.mjs

/** Categoria lógica de uma coluna (decide a conversão de ida e volta). */
export type CategoriaColuna =
  | "uuid" | "text" | "number" | "boolean" | "json"
  | "array" | "date" | "timestamp" | "time" | "enum";

export type Relacao = {
  /** Nome da constraint no banco — usado pela dica `!nome_da_fk`. */
  fk: string;
  de: string;
  colunaLocal: string;
  para: string;
  colunaAlvo: string;
};

export type MetaTabela = {
  colunas: Record<string, CategoriaColuna>;
  pk: string[];
  temClinicId: boolean;
  /** FKs que SAEM desta tabela (N:1). Chave = tabela alvo. */
  paraUm: Record<string, Relacao[]>;
  /** FKs que APONTAM para esta tabela (1:N). Chave = tabela de origem. */
  paraMuitos: Record<string, Relacao[]>;
};

export const META: Record<string, MetaTabela> = {
 "access_logs": {
  "colunas": {
   "id": "uuid",
   "user_id": "uuid",
   "user_name": "text",
   "user_role": "enum",
   "patient_id": "uuid",
   "patient_name": "text",
   "module": "text",
   "action": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "access_logs_clinic_id_fkey",
     "de": "access_logs",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "access_logs_patient_id_fkey",
     "de": "access_logs",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "access_logs_user_id_fkey",
     "de": "access_logs",
     "colunaLocal": "user_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "anamnese_templates": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "specialty": "text",
   "fields": "json",
   "active": "boolean",
   "created_at": "timestamp",
   "updated_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "anamnese_templates_clinic_id_fkey",
     "de": "anamnese_templates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "anamneses": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "specialty": "text",
   "fields": "json",
   "consent_given": "boolean",
   "signature": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "queue_entry_id": "uuid",
   "created_by": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "anamneses_cancelled_by_fkey",
     "de": "anamneses",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "anamneses_created_by_fkey",
     "de": "anamneses",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "anamneses_clinic_id_fkey",
     "de": "anamneses",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "anamneses_patient_id_fkey",
     "de": "anamneses",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "anamneses_professional_id_fkey",
     "de": "anamneses",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "anamneses_queue_entry_id_fkey",
     "de": "anamneses",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "appointment_notifications": {
  "colunas": {
   "id": "uuid",
   "channel": "enum",
   "protocol": "text",
   "patient_id": "uuid",
   "recipient": "text",
   "sent_at": "timestamp",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "appointment_notifications_clinic_id_fkey",
     "de": "appointment_notifications",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "appointment_notifications_patient_id_fkey",
     "de": "appointment_notifications",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "appointments": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "starts_at": "timestamp",
   "ends_at": "timestamp",
   "status": "enum",
   "reason": "text",
   "created_at": "timestamp",
   "created_by": "uuid",
   "schedule_id": "uuid",
   "clinic_id": "uuid",
   "check_in": "timestamp",
   "specialty": "text",
   "service_type": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "appointments_clinic_id_fkey",
     "de": "appointments",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "appointments_created_by_fkey",
     "de": "appointments",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "appointments_patient_id_fkey",
     "de": "appointments",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "appointments_professional_id_fkey",
     "de": "appointments",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "schedules": [
    {
     "fk": "appointments_schedule_id_fkey",
     "de": "appointments",
     "colunaLocal": "schedule_id",
     "para": "schedules",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "billable_events": [
    {
     "fk": "billable_events_appointment_id_fkey",
     "de": "billable_events",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ],
   "medical_records": [
    {
     "fk": "medical_records_appointment_id_fkey",
     "de": "medical_records",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_appointment_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "queue_entries_appointment_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "assessment_scales": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "professional_name": "text",
   "scale": "enum",
   "score": "number",
   "classification": "text",
   "details": "json",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "assessment_scales_clinic_id_fkey",
     "de": "assessment_scales",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "assessment_scales_patient_id_fkey",
     "de": "assessment_scales",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "assessment_scales_professional_id_fkey",
     "de": "assessment_scales",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "attendance_options": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "category": "text",
   "label": "text",
   "value": "text",
   "sort_order": "number",
   "active": "boolean",
   "created_at": "timestamp",
   "parent_id": "uuid",
   "description": "text",
   "sterilization_method": "text",
   "validity_date": "date",
   "lot_code": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "attendance_options_clinic_id_fkey",
     "de": "attendance_options",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "attendance_options": [
    {
     "fk": "attendance_options_parent_id_fkey",
     "de": "attendance_options",
     "colunaLocal": "parent_id",
     "para": "attendance_options",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "attendance_options": [
    {
     "fk": "attendance_options_parent_id_fkey",
     "de": "attendance_options",
     "colunaLocal": "parent_id",
     "para": "attendance_options",
     "colunaAlvo": "id"
    }
   ],
   "procedure_instruments": [
    {
     "fk": "procedure_instruments_option_id_fkey",
     "de": "procedure_instruments",
     "colunaLocal": "option_id",
     "para": "attendance_options",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "attendance_records": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "queue_entry_id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "patient_name": "text",
   "medico": "text",
   "especialidade": "text",
   "encaminhamento": "text",
   "carater": "text",
   "procedencia": "text",
   "centro_custo": "text",
   "origem": "text",
   "data_entrada": "date",
   "privado_liberdade": "boolean",
   "gestante": "boolean",
   "convenio": "text",
   "plano": "text",
   "carteira": "text",
   "validade": "date",
   "validador": "text",
   "resp_o_mesmo": "boolean",
   "resp_nome": "text",
   "resp_documento": "text",
   "resp_parentesco": "text",
   "observacoes": "text",
   "created_by": "uuid",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "attendance_records_clinic_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "auth_users": [
    {
     "fk": "attendance_records_created_by_fkey",
     "de": "attendance_records",
     "colunaLocal": "created_by",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "attendance_records_patient_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "attendance_records_professional_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "attendance_records_queue_entry_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "billable_events": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "appointment_id": "uuid",
   "kind": "enum",
   "service": "text",
   "amount": "number",
   "status": "enum",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "discount": "number",
   "surcharge": "number",
   "net_amount": "number",
   "payment_method": "text",
   "checked_out_at": "timestamp",
   "nf_number": "text",
   "nf_issue_date": "date",
   "nf_due_date": "date",
   "nf_terms": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "appointments": [
    {
     "fk": "billable_events_appointment_id_fkey",
     "de": "billable_events",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "billable_events_clinic_id_fkey",
     "de": "billable_events",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "billable_events_patient_id_fkey",
     "de": "billable_events",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "billable_events_professional_id_fkey",
     "de": "billable_events",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "billing_items": [
    {
     "fk": "billing_items_event_id_fkey",
     "de": "billing_items",
     "colunaLocal": "event_id",
     "para": "billable_events",
     "colunaAlvo": "id"
    }
   ],
   "payments": [
    {
     "fk": "payments_event_id_fkey",
     "de": "payments",
     "colunaLocal": "event_id",
     "para": "billable_events",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_billable_event_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "billable_event_id",
     "para": "billable_events",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "billing_items": {
  "colunas": {
   "id": "uuid",
   "event_id": "uuid",
   "kind": "enum",
   "code": "text",
   "description": "text",
   "quantity": "number",
   "unit_price": "number",
   "amount": "number",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "source": "text",
   "procedure_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "billing_items_clinic_id_fkey",
     "de": "billing_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "billable_events": [
    {
     "fk": "billing_items_event_id_fkey",
     "de": "billing_items",
     "colunaLocal": "event_id",
     "para": "billable_events",
     "colunaAlvo": "id"
    }
   ],
   "procedures": [
    {
     "fk": "billing_items_procedure_id_fkey",
     "de": "billing_items",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "budget_items": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "budget_id": "uuid",
   "description": "text",
   "quantity": "number",
   "unit_price": "number",
   "amount": "number",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "budgets": [
    {
     "fk": "budget_items_budget_id_fkey",
     "de": "budget_items",
     "colunaLocal": "budget_id",
     "para": "budgets",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "budget_items_clinic_id_fkey",
     "de": "budget_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "budgets": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "code": "text",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "description": "text",
   "amount": "number",
   "status": "enum",
   "decided_at": "timestamp",
   "created_by": "uuid",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "budgets_clinic_id_fkey",
     "de": "budgets",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "budgets_created_by_fkey",
     "de": "budgets",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "budgets_patient_id_fkey",
     "de": "budgets",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "budgets_professional_id_fkey",
     "de": "budgets",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "budget_items": [
    {
     "fk": "budget_items_budget_id_fkey",
     "de": "budget_items",
     "colunaLocal": "budget_id",
     "para": "budgets",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "care_checks": {
  "colunas": {
   "id": "uuid",
   "sae_id": "uuid",
   "patient_id": "uuid",
   "description": "text",
   "scheduled_at": "timestamp",
   "status": "enum",
   "justification": "text",
   "professional_id": "uuid",
   "professional_name": "text",
   "checked_at": "timestamp",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "created_by": "uuid",
   "queue_entry_id": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "care_checks_cancelled_by_fkey",
     "de": "care_checks",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "care_checks_created_by_fkey",
     "de": "care_checks",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "care_checks_clinic_id_fkey",
     "de": "care_checks",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "care_checks_patient_id_fkey",
     "de": "care_checks",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "care_checks_professional_id_fkey",
     "de": "care_checks",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "care_checks_queue_entry_id_fkey",
     "de": "care_checks",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "sae_records": [
    {
     "fk": "care_checks_sae_id_fkey",
     "de": "care_checks",
     "colunaLocal": "sae_id",
     "para": "sae_records",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "care_orders": {
  "colunas": {
   "id": "uuid",
   "prescription_id": "uuid",
   "patient_id": "uuid",
   "name": "text",
   "frequency": "text",
   "duration": "text",
   "observations": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "care_orders_clinic_id_fkey",
     "de": "care_orders",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "care_orders_patient_id_fkey",
     "de": "care_orders",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "care_orders_prescription_id_fkey",
     "de": "care_orders",
     "colunaLocal": "prescription_id",
     "para": "prescriptions",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "cargos": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "name": "text",
   "base_role": "enum",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "cargos_clinic_id_fkey",
     "de": "cargos",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "clinic_members": [
    {
     "fk": "clinic_members_cargo_id_fkey",
     "de": "clinic_members",
     "colunaLocal": "cargo_id",
     "para": "cargos",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "certificates": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "kind": "text",
   "days": "number",
   "start_date": "date",
   "end_date": "date",
   "diagnosis": "text",
   "cid10": "text",
   "reason": "text",
   "post_discharge": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "issue_date": "date",
   "observation": "text",
   "show_cid": "boolean",
   "discharge_at": "timestamp",
   "discharge_detail": "text",
   "prescription_text": "text",
   "queue_entry_id": "uuid",
   "created_by": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "certificates_cancelled_by_fkey",
     "de": "certificates",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "certificates_created_by_fkey",
     "de": "certificates",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "certificates_clinic_id_fkey",
     "de": "certificates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "certificates_patient_id_fkey",
     "de": "certificates",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "certificates_professional_id_fkey",
     "de": "certificates",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "certificates_queue_entry_id_fkey",
     "de": "certificates",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "cid_codes": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "description": "text",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {},
  "paraMuitos": {}
 },
 "clinic_members": {
  "colunas": {
   "clinic_id": "uuid",
   "user_id": "uuid",
   "role": "enum",
   "active": "boolean",
   "created_at": "timestamp",
   "cargo_id": "uuid"
  },
  "pk": [
   "clinic_id",
   "user_id"
  ],
  "temClinicId": true,
  "paraUm": {
   "cargos": [
    {
     "fk": "clinic_members_cargo_id_fkey",
     "de": "clinic_members",
     "colunaLocal": "cargo_id",
     "para": "cargos",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "clinic_members_clinic_id_fkey",
     "de": "clinic_members",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "clinic_members_user_id_fkey",
     "de": "clinic_members",
     "colunaLocal": "user_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "clinic_settings": {
  "colunas": {
   "id": "uuid",
   "clinic_name": "text",
   "cnpj": "text",
   "phone": "text",
   "email": "text",
   "address": "text",
   "cep": "text",
   "business_hours": "text",
   "language": "text",
   "timezone": "text",
   "date_format": "text",
   "time_format": "text",
   "currency": "text",
   "notify_email": "boolean",
   "notify_sms": "boolean",
   "notify_push": "boolean",
   "two_factor": "boolean",
   "password_policy": "text",
   "backup_frequency": "text",
   "backup_retention_days": "number",
   "updated_at": "timestamp",
   "clinic_id": "uuid",
   "security": "json",
   "backup": "json",
   "notifications": "json",
   "branding": "json",
   "attendance_flow": "json",
   "totem_enabled": "boolean"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "clinic_settings_clinic_id_fkey",
     "de": "clinic_settings",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "clinics": {
  "colunas": {
   "id": "uuid",
   "name": "text",
   "slug": "text",
   "cnpj": "text",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {},
  "paraMuitos": {
   "access_logs": [
    {
     "fk": "access_logs_clinic_id_fkey",
     "de": "access_logs",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "anamnese_templates": [
    {
     "fk": "anamnese_templates_clinic_id_fkey",
     "de": "anamnese_templates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "anamneses": [
    {
     "fk": "anamneses_clinic_id_fkey",
     "de": "anamneses",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "appointment_notifications": [
    {
     "fk": "appointment_notifications_clinic_id_fkey",
     "de": "appointment_notifications",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "appointments": [
    {
     "fk": "appointments_clinic_id_fkey",
     "de": "appointments",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "assessment_scales": [
    {
     "fk": "assessment_scales_clinic_id_fkey",
     "de": "assessment_scales",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "attendance_options": [
    {
     "fk": "attendance_options_clinic_id_fkey",
     "de": "attendance_options",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "attendance_records": [
    {
     "fk": "attendance_records_clinic_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "billable_events": [
    {
     "fk": "billable_events_clinic_id_fkey",
     "de": "billable_events",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "billing_items": [
    {
     "fk": "billing_items_clinic_id_fkey",
     "de": "billing_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "budget_items": [
    {
     "fk": "budget_items_clinic_id_fkey",
     "de": "budget_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "budgets": [
    {
     "fk": "budgets_clinic_id_fkey",
     "de": "budgets",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "care_checks": [
    {
     "fk": "care_checks_clinic_id_fkey",
     "de": "care_checks",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "care_orders": [
    {
     "fk": "care_orders_clinic_id_fkey",
     "de": "care_orders",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "cargos": [
    {
     "fk": "cargos_clinic_id_fkey",
     "de": "cargos",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "certificates": [
    {
     "fk": "certificates_clinic_id_fkey",
     "de": "certificates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "clinic_members": [
    {
     "fk": "clinic_members_clinic_id_fkey",
     "de": "clinic_members",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "clinic_settings": [
    {
     "fk": "clinic_settings_clinic_id_fkey",
     "de": "clinic_settings",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "consent_templates": [
    {
     "fk": "consent_templates_clinic_id_fkey",
     "de": "consent_templates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "consents": [
    {
     "fk": "consents_clinic_id_fkey",
     "de": "consents",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "dental_charts": [
    {
     "fk": "dental_charts_clinic_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "dispensation_items": [
    {
     "fk": "dispensation_items_clinic_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "dispensations": [
    {
     "fk": "dispensations_clinic_id_fkey",
     "de": "dispensations",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "exam_orders": [
    {
     "fk": "exam_orders_clinic_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "fluid_balance": [
    {
     "fk": "fluid_balance_clinic_id_fkey",
     "de": "fluid_balance",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "fluid_balance_entries": [
    {
     "fk": "fluid_balance_entries_clinic_id_fkey",
     "de": "fluid_balance_entries",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "inventories": [
    {
     "fk": "inventories_clinic_id_fkey",
     "de": "inventories",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "inventory_counts": [
    {
     "fk": "inventory_counts_clinic_id_fkey",
     "de": "inventory_counts",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "lab_cases": [
    {
     "fk": "lab_cases_clinic_id_fkey",
     "de": "lab_cases",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "medical_records": [
    {
     "fk": "medical_records_clinic_id_fkey",
     "de": "medical_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "notification_log": [
    {
     "fk": "notification_log_clinic_id_fkey",
     "de": "notification_log",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "nursing_evolutions": [
    {
     "fk": "nursing_evolutions_clinic_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "nursing_notes": [
    {
     "fk": "nursing_notes_clinic_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "nursing_procedures": [
    {
     "fk": "nursing_procedures_clinic_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "patients_clinic_id_fkey",
     "de": "patients",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "payments": [
    {
     "fk": "payments_clinic_id_fkey",
     "de": "payments",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "prescription_checks": [
    {
     "fk": "prescription_checks_clinic_id_fkey",
     "de": "prescription_checks",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "prescription_items": [
    {
     "fk": "prescription_items_clinic_id_fkey",
     "de": "prescription_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "prescriptions_clinic_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "procedure_documents": [
    {
     "fk": "procedure_documents_clinic_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_clinic_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "procedures": [
    {
     "fk": "procedures_clinic_id_fkey",
     "de": "procedures",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "product_categories": [
    {
     "fk": "product_categories_clinic_id_fkey",
     "de": "product_categories",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "product_request_items": [
    {
     "fk": "product_request_items_clinic_id_fkey",
     "de": "product_request_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "product_requests": [
    {
     "fk": "product_requests_clinic_id_fkey",
     "de": "product_requests",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "professional_insurance_credentials": [
    {
     "fk": "professional_insurance_credentials_clinic_id_fkey",
     "de": "professional_insurance_credentials",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "professionals_clinic_id_fkey",
     "de": "professionals",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "prosthetic_files": [
    {
     "fk": "prosthetic_files_clinic_id_fkey",
     "de": "prosthetic_files",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "prosthetic_orders": [
    {
     "fk": "prosthetic_orders_clinic_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "purchase_requests": [
    {
     "fk": "purchase_requests_clinic_id_fkey",
     "de": "purchase_requests",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "queue_entries_clinic_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "quotations": [
    {
     "fk": "quotations_clinic_id_fkey",
     "de": "quotations",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "role_permissions": [
    {
     "fk": "role_permissions_clinic_id_fkey",
     "de": "role_permissions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "sae_records": [
    {
     "fk": "sae_records_clinic_id_fkey",
     "de": "sae_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "schedule_blocks": [
    {
     "fk": "schedule_blocks_clinic_id_fkey",
     "de": "schedule_blocks",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "schedules": [
    {
     "fk": "schedules_clinic_id_fkey",
     "de": "schedules",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "stock_movements": [
    {
     "fk": "stock_movements_clinic_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "stock_products_clinic_id_fkey",
     "de": "stock_products",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "suppliers": [
    {
     "fk": "suppliers_clinic_id_fkey",
     "de": "suppliers",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "system_logs": [
    {
     "fk": "system_logs_clinic_id_fkey",
     "de": "system_logs",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "tiss_batches": [
    {
     "fk": "tiss_batches_clinic_id_fkey",
     "de": "tiss_batches",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "tiss_guides": [
    {
     "fk": "tiss_guides_clinic_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "triage_records": [
    {
     "fk": "triage_records_clinic_id_fkey",
     "de": "triage_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "triage_templates": [
    {
     "fk": "triage_templates_clinic_id_fkey",
     "de": "triage_templates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "vital_signs": [
    {
     "fk": "vital_signs_clinic_id_fkey",
     "de": "vital_signs",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "consent_templates": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "title": "text",
   "body": "text",
   "sort_order": "number",
   "active": "boolean",
   "created_at": "timestamp",
   "updated_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "consent_templates_clinic_id_fkey",
     "de": "consent_templates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "consents": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "context": "text",
   "accepted": "boolean",
   "signature": "text",
   "created_at": "timestamp",
   "created_by": "uuid",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "consents_clinic_id_fkey",
     "de": "consents",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "consents_created_by_fkey",
     "de": "consents",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "consents_patient_id_fkey",
     "de": "consents",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "consents_professional_id_fkey",
     "de": "consents",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "dental_chart_marks": {
  "colunas": {
   "id": "uuid",
   "chart_id": "uuid",
   "tooth": "number",
   "marking": "text",
   "note": "text",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "dental_charts": [
    {
     "fk": "dental_chart_marks_chart_id_fkey",
     "de": "dental_chart_marks",
     "colunaLocal": "chart_id",
     "para": "dental_charts",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "dental_charts": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "queue_entry_id": "uuid",
   "notes": "text",
   "created_at": "timestamp",
   "updated_at": "timestamp",
   "created_by": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "dental_charts_cancelled_by_fkey",
     "de": "dental_charts",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "dental_charts_created_by_fkey",
     "de": "dental_charts",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "dental_charts_clinic_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "dental_charts_patient_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "dental_charts_professional_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "dental_charts_queue_entry_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "dental_chart_marks": [
    {
     "fk": "dental_chart_marks_chart_id_fkey",
     "de": "dental_chart_marks",
     "colunaLocal": "chart_id",
     "para": "dental_charts",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "dispensation_items": {
  "colunas": {
   "id": "uuid",
   "dispensation_id": "uuid",
   "product_id": "uuid",
   "name": "text",
   "quantity": "text",
   "location": "text",
   "barcode": "text",
   "lot": "text",
   "expiry": "date",
   "picked": "boolean",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "quantity_num": "number",
   "prescription_item_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "dispensation_items_clinic_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "dispensations": [
    {
     "fk": "dispensation_items_dispensation_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "dispensation_id",
     "para": "dispensations",
     "colunaAlvo": "id"
    }
   ],
   "prescription_items": [
    {
     "fk": "dispensation_items_prescription_item_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "prescription_item_id",
     "para": "prescription_items",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "dispensation_items_product_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "dispensations": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "kind": "enum",
   "status": "enum",
   "urgent": "boolean",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "origin_label": "text",
   "origin_name": "text",
   "origin_ref": "text",
   "requested_by": "text",
   "progress": "number",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "cancel_reason": "text",
   "product_request_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "dispensations_clinic_id_fkey",
     "de": "dispensations",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "dispensations_patient_id_fkey",
     "de": "dispensations",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "product_requests": [
    {
     "fk": "dispensations_product_request_id_fkey",
     "de": "dispensations",
     "colunaLocal": "product_request_id",
     "para": "product_requests",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "dispensations_professional_id_fkey",
     "de": "dispensations",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "dispensation_items": [
    {
     "fk": "dispensation_items_dispensation_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "dispensation_id",
     "para": "dispensations",
     "colunaAlvo": "id"
    }
   ],
   "stock_movements": [
    {
     "fk": "stock_movements_dispensation_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "dispensation_id",
     "para": "dispensations",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "exam_orders": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "tuss_code": "text",
   "exam_name": "text",
   "category": "text",
   "status": "text",
   "notes": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "queue_entry_id": "uuid",
   "created_by": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text",
   "laterality": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "exam_orders_cancelled_by_fkey",
     "de": "exam_orders",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "exam_orders_created_by_fkey",
     "de": "exam_orders",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "exam_orders_clinic_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "exam_orders_patient_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "exam_orders_professional_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "exam_orders_queue_entry_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "fluid_balance": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "cycle_start": "timestamp",
   "cycle_end": "timestamp",
   "closed": "boolean",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "fluid_balance_clinic_id_fkey",
     "de": "fluid_balance",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "fluid_balance_patient_id_fkey",
     "de": "fluid_balance",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "fluid_balance_entries": [
    {
     "fk": "fluid_balance_entries_balance_id_fkey",
     "de": "fluid_balance_entries",
     "colunaLocal": "balance_id",
     "para": "fluid_balance",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "fluid_balance_entries": {
  "colunas": {
   "id": "uuid",
   "balance_id": "uuid",
   "kind": "enum",
   "description": "text",
   "volume_ml": "number",
   "recorded_at": "timestamp",
   "professional_id": "uuid",
   "professional_name": "text",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "fluid_balance": [
    {
     "fk": "fluid_balance_entries_balance_id_fkey",
     "de": "fluid_balance_entries",
     "colunaLocal": "balance_id",
     "para": "fluid_balance",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "fluid_balance_entries_clinic_id_fkey",
     "de": "fluid_balance_entries",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "fluid_balance_entries_professional_id_fkey",
     "de": "fluid_balance_entries",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "inventories": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "kind": "enum",
   "category": "text",
   "status": "enum",
   "created_by": "uuid",
   "created_at": "timestamp",
   "closed_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "inventories_clinic_id_fkey",
     "de": "inventories",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "inventories_created_by_fkey",
     "de": "inventories",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "inventory_counts": [
    {
     "fk": "inventory_counts_inventory_id_fkey",
     "de": "inventory_counts",
     "colunaLocal": "inventory_id",
     "para": "inventories",
     "colunaAlvo": "id"
    }
   ],
   "stock_movements": [
    {
     "fk": "stock_movements_inventory_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "inventory_id",
     "para": "inventories",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "inventory_counts": {
  "colunas": {
   "id": "uuid",
   "inventory_id": "uuid",
   "product_id": "uuid",
   "product_name": "text",
   "system_qty": "number",
   "count_1": "number",
   "count_2": "number",
   "count_3": "number",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "inventory_counts_clinic_id_fkey",
     "de": "inventory_counts",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "inventories": [
    {
     "fk": "inventory_counts_inventory_id_fkey",
     "de": "inventory_counts",
     "colunaLocal": "inventory_id",
     "para": "inventories",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "inventory_counts_product_id_fkey",
     "de": "inventory_counts",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "lab_cases": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "patient_id": "uuid",
   "type": "text",
   "status": "enum",
   "urgent": "boolean",
   "due_date": "date",
   "created_at": "timestamp",
   "price_base": "number",
   "additions": "number",
   "discounts": "number",
   "total": "number",
   "payment_status": "enum",
   "clinic_id": "uuid",
   "stage": "enum"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "lab_cases_clinic_id_fkey",
     "de": "lab_cases",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "lab_cases_patient_id_fkey",
     "de": "lab_cases",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "medical_records": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "appointment_id": "uuid",
   "content": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "queue_entry_id": "uuid",
   "created_by": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "appointments": [
    {
     "fk": "medical_records_appointment_id_fkey",
     "de": "medical_records",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "medical_records_cancelled_by_fkey",
     "de": "medical_records",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "medical_records_created_by_fkey",
     "de": "medical_records",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "medical_records_clinic_id_fkey",
     "de": "medical_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "medical_records_patient_id_fkey",
     "de": "medical_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "medical_records_professional_id_fkey",
     "de": "medical_records",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "medical_records_queue_entry_id_fkey",
     "de": "medical_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "medical_records_scanned": {
  "colunas": {
   "id": "uuid",
   "tenant_id": "uuid",
   "patient_id": "uuid",
   "file_path": "text",
   "file_name": "text",
   "file_size": "number",
   "file_type": "text",
   "description": "text",
   "uploaded_by": "uuid",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "patients": [
    {
     "fk": "medical_records_scanned_patient_id_fkey",
     "de": "medical_records_scanned",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "auth_users": [
    {
     "fk": "medical_records_scanned_uploaded_by_fkey",
     "de": "medical_records_scanned",
     "colunaLocal": "uploaded_by",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "notification_log": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "channel": "text",
   "template": "text",
   "destination": "text",
   "provider": "text",
   "status": "text",
   "error": "text",
   "protocol": "text",
   "patient_id": "uuid",
   "payload": "json",
   "sent_at": "timestamp",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "notification_log_clinic_id_fkey",
     "de": "notification_log",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "notification_log_patient_id_fkey",
     "de": "notification_log",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "nursing_evolutions": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "professional_name": "text",
   "coren": "text",
   "assessment": "text",
   "reassessment": "text",
   "conduct": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "created_by": "uuid",
   "queue_entry_id": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "nursing_evolutions_cancelled_by_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "nursing_evolutions_created_by_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "nursing_evolutions_clinic_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "nursing_evolutions_patient_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "nursing_evolutions_professional_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "nursing_evolutions_queue_entry_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "nursing_notes": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "professional_name": "text",
   "content": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "created_by": "uuid",
   "queue_entry_id": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "nursing_notes_cancelled_by_fkey",
     "de": "nursing_notes",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "nursing_notes_created_by_fkey",
     "de": "nursing_notes",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "nursing_notes_clinic_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "nursing_notes_patient_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "nursing_notes_professional_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "nursing_notes_queue_entry_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "nursing_procedures": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "professional_name": "text",
   "tuss_code": "text",
   "name": "text",
   "materials": "text",
   "body_site": "text",
   "notes": "text",
   "performed_at": "timestamp",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "created_by": "uuid",
   "queue_entry_id": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "nursing_procedures_cancelled_by_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "nursing_procedures_created_by_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "nursing_procedures_clinic_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "nursing_procedures_patient_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "nursing_procedures_professional_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "nursing_procedures_queue_entry_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "patients": {
  "colunas": {
   "id": "uuid",
   "profile_id": "uuid",
   "full_name": "text",
   "birth_date": "date",
   "cpf": "text",
   "phone": "text",
   "email": "text",
   "notes": "text",
   "created_at": "timestamp",
   "created_by": "uuid",
   "convenio": "text",
   "blood_type": "text",
   "allergies": "boolean",
   "in_treatment": "boolean",
   "active": "boolean",
   "mother_name": "text",
   "gender": "text",
   "manual_record": "text",
   "cns": "text",
   "social_name": "text",
   "naturality": "text",
   "nationality": "text",
   "race": "text",
   "ethnicity": "text",
   "marital_status": "text",
   "legal_guardian": "text",
   "plan": "text",
   "death_date": "date",
   "death_cause": "text",
   "clinic_id": "uuid",
   "cardiac": "boolean",
   "cep": "text",
   "address": "text",
   "district": "text",
   "city": "text",
   "state": "text",
   "manual_record_path": "text",
   "manual_record_name": "text",
   "origin": "text",
   "updated_at": "timestamp",
   "registration_complete": "boolean",
   "record_number": "number",
   "convenio_carteirinha": "text",
   "convenio_validade": "date",
   "convenio_titular": "text",
   "convenio_acomodacao": "text",
   "responsavel_cpf": "text",
   "responsavel_parentesco": "text",
   "responsavel_telefone": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "patients_clinic_id_fkey",
     "de": "patients",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "patients_created_by_fkey",
     "de": "patients",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "patients_profile_id_fkey",
     "de": "patients",
     "colunaLocal": "profile_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "access_logs": [
    {
     "fk": "access_logs_patient_id_fkey",
     "de": "access_logs",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "anamneses": [
    {
     "fk": "anamneses_patient_id_fkey",
     "de": "anamneses",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "appointment_notifications": [
    {
     "fk": "appointment_notifications_patient_id_fkey",
     "de": "appointment_notifications",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "appointments": [
    {
     "fk": "appointments_patient_id_fkey",
     "de": "appointments",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "assessment_scales": [
    {
     "fk": "assessment_scales_patient_id_fkey",
     "de": "assessment_scales",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "attendance_records": [
    {
     "fk": "attendance_records_patient_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "billable_events": [
    {
     "fk": "billable_events_patient_id_fkey",
     "de": "billable_events",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "budgets": [
    {
     "fk": "budgets_patient_id_fkey",
     "de": "budgets",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "care_checks": [
    {
     "fk": "care_checks_patient_id_fkey",
     "de": "care_checks",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "care_orders": [
    {
     "fk": "care_orders_patient_id_fkey",
     "de": "care_orders",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "certificates": [
    {
     "fk": "certificates_patient_id_fkey",
     "de": "certificates",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "consents": [
    {
     "fk": "consents_patient_id_fkey",
     "de": "consents",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "dental_charts": [
    {
     "fk": "dental_charts_patient_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "dispensations": [
    {
     "fk": "dispensations_patient_id_fkey",
     "de": "dispensations",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "exam_orders": [
    {
     "fk": "exam_orders_patient_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "fluid_balance": [
    {
     "fk": "fluid_balance_patient_id_fkey",
     "de": "fluid_balance",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "lab_cases": [
    {
     "fk": "lab_cases_patient_id_fkey",
     "de": "lab_cases",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "medical_records": [
    {
     "fk": "medical_records_patient_id_fkey",
     "de": "medical_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "medical_records_scanned": [
    {
     "fk": "medical_records_scanned_patient_id_fkey",
     "de": "medical_records_scanned",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "notification_log": [
    {
     "fk": "notification_log_patient_id_fkey",
     "de": "notification_log",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "nursing_evolutions": [
    {
     "fk": "nursing_evolutions_patient_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "nursing_notes": [
    {
     "fk": "nursing_notes_patient_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "nursing_procedures": [
    {
     "fk": "nursing_procedures_patient_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "prescription_checks": [
    {
     "fk": "prescription_checks_patient_id_fkey",
     "de": "prescription_checks",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "prescriptions_patient_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "procedure_documents": [
    {
     "fk": "procedure_documents_patient_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_patient_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "prosthetic_orders": [
    {
     "fk": "prosthetic_orders_patient_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "queue_entries_patient_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "sae_records": [
    {
     "fk": "sae_records_patient_id_fkey",
     "de": "sae_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "tiss_guides": [
    {
     "fk": "tiss_guides_patient_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "triage_records": [
    {
     "fk": "triage_records_patient_id_fkey",
     "de": "triage_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "vital_signs": [
    {
     "fk": "vital_signs_patient_id_fkey",
     "de": "vital_signs",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "payments": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "event_id": "uuid",
   "method": "text",
   "status": "text",
   "amount": "number",
   "provider": "text",
   "external_id": "text",
   "created_by": "uuid",
   "confirmed_at": "timestamp",
   "created_at": "timestamp",
   "updated_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "payments_clinic_id_fkey",
     "de": "payments",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "auth_users": [
    {
     "fk": "payments_created_by_fkey",
     "de": "payments",
     "colunaLocal": "created_by",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ],
   "billable_events": [
    {
     "fk": "payments_event_id_fkey",
     "de": "payments",
     "colunaLocal": "event_id",
     "para": "billable_events",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "permission_templates": {
  "colunas": {
   "template": "text",
   "role": "enum",
   "module": "text",
   "can_view": "boolean",
   "scope": "enum",
   "can_create": "boolean",
   "can_edit": "boolean",
   "can_delete": "boolean"
  },
  "pk": [
   "template",
   "role",
   "module"
  ],
  "temClinicId": false,
  "paraUm": {},
  "paraMuitos": {}
 },
 "prescription_checks": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "prescription_id": "uuid",
   "source_type": "text",
   "source_label": "text",
   "frequency": "text",
   "scheduled_at": "timestamp",
   "status": "text",
   "checked_at": "timestamp",
   "checked_by": "uuid",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "prescription_checks_checked_by_fkey",
     "de": "prescription_checks",
     "colunaLocal": "checked_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "prescription_checks_clinic_id_fkey",
     "de": "prescription_checks",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "prescription_checks_patient_id_fkey",
     "de": "prescription_checks",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "prescription_checks_prescription_id_fkey",
     "de": "prescription_checks",
     "colunaLocal": "prescription_id",
     "para": "prescriptions",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "prescription_items": {
  "colunas": {
   "id": "uuid",
   "prescription_id": "uuid",
   "product_id": "uuid",
   "name": "text",
   "concentration": "text",
   "posology": "text",
   "duration": "text",
   "frequency": "text",
   "observations": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "route": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "prescription_items_clinic_id_fkey",
     "de": "prescription_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "prescription_items_prescription_id_fkey",
     "de": "prescription_items",
     "colunaLocal": "prescription_id",
     "para": "prescriptions",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "prescription_items_product_id_fkey",
     "de": "prescription_items",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "dispensation_items": [
    {
     "fk": "dispensation_items_prescription_item_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "prescription_item_id",
     "para": "prescription_items",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "prescriptions": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "notes": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "queue_entry_id": "uuid",
   "created_by": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "prescriptions_cancelled_by_fkey",
     "de": "prescriptions",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "prescriptions_created_by_fkey",
     "de": "prescriptions",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "prescriptions_clinic_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "prescriptions_patient_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "prescriptions_professional_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "prescriptions_queue_entry_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "care_orders": [
    {
     "fk": "care_orders_prescription_id_fkey",
     "de": "care_orders",
     "colunaLocal": "prescription_id",
     "para": "prescriptions",
     "colunaAlvo": "id"
    }
   ],
   "prescription_checks": [
    {
     "fk": "prescription_checks_prescription_id_fkey",
     "de": "prescription_checks",
     "colunaLocal": "prescription_id",
     "para": "prescriptions",
     "colunaAlvo": "id"
    }
   ],
   "prescription_items": [
    {
     "fk": "prescription_items_prescription_id_fkey",
     "de": "prescription_items",
     "colunaLocal": "prescription_id",
     "para": "prescriptions",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "procedure_document_items": {
  "colunas": {
   "id": "uuid",
   "document_id": "uuid",
   "procedure_id": "uuid",
   "name_snapshot": "text",
   "price_snapshot": "number",
   "created_at": "timestamp",
   "note_snapshot": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "procedure_documents": [
    {
     "fk": "procedure_document_items_document_id_fkey",
     "de": "procedure_document_items",
     "colunaLocal": "document_id",
     "para": "procedure_documents",
     "colunaAlvo": "id"
    }
   ],
   "procedures": [
    {
     "fk": "procedure_document_items_procedure_id_fkey",
     "de": "procedure_document_items",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "procedure_documents": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "queue_entry_id": "uuid",
   "created_by": "uuid",
   "notes": "text",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text",
   "created_at": "timestamp",
   "updated_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "procedure_documents_cancelled_by_fkey",
     "de": "procedure_documents",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "procedure_documents_created_by_fkey",
     "de": "procedure_documents",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "procedure_documents_clinic_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "procedure_documents_patient_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "procedure_documents_professional_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "procedure_documents_queue_entry_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "procedure_document_items": [
    {
     "fk": "procedure_document_items_document_id_fkey",
     "de": "procedure_document_items",
     "colunaLocal": "document_id",
     "para": "procedure_documents",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_document_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "document_id",
     "para": "procedure_documents",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "procedure_executions": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "procedure_id": "uuid",
   "appointment_id": "uuid",
   "patient_id": "uuid",
   "billable_event_id": "uuid",
   "executed_by": "uuid",
   "note": "text",
   "created_at": "timestamp",
   "queue_entry_id": "uuid",
   "amount": "number",
   "document_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "appointments": [
    {
     "fk": "procedure_executions_appointment_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ],
   "billable_events": [
    {
     "fk": "procedure_executions_billable_event_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "billable_event_id",
     "para": "billable_events",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "procedure_executions_clinic_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "procedure_documents": [
    {
     "fk": "procedure_executions_document_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "document_id",
     "para": "procedure_documents",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "procedure_executions_executed_by_fkey",
     "de": "procedure_executions",
     "colunaLocal": "executed_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "procedure_executions_patient_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "procedures": [
    {
     "fk": "procedure_executions_procedure_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "procedure_executions_queue_entry_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "stock_movements": [
    {
     "fk": "stock_movements_execution_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "execution_id",
     "para": "procedure_executions",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "procedure_instructions": {
  "colunas": {
   "id": "uuid",
   "procedure_id": "uuid",
   "pre_instructions": "text",
   "post_instructions": "text",
   "require_consent": "boolean",
   "require_anamnese": "boolean",
   "updated_at": "timestamp",
   "created_at": "timestamp",
   "notify_channel": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "procedures": [
    {
     "fk": "procedure_instructions_procedure_id_fkey",
     "de": "procedure_instructions",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "procedure_instruments": {
  "colunas": {
   "id": "uuid",
   "procedure_id": "uuid",
   "option_id": "uuid",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "attendance_options": [
    {
     "fk": "procedure_instruments_option_id_fkey",
     "de": "procedure_instruments",
     "colunaLocal": "option_id",
     "para": "attendance_options",
     "colunaAlvo": "id"
    }
   ],
   "procedures": [
    {
     "fk": "procedure_instruments_procedure_id_fkey",
     "de": "procedure_instruments",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "procedure_materials": {
  "colunas": {
   "id": "uuid",
   "procedure_id": "uuid",
   "product_id": "uuid",
   "quantity": "number",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "procedures": [
    {
     "fk": "procedure_materials_procedure_id_fkey",
     "de": "procedure_materials",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "procedure_materials_product_id_fkey",
     "de": "procedure_materials",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "procedure_professionals": {
  "colunas": {
   "id": "uuid",
   "procedure_id": "uuid",
   "professional_id": "uuid",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "procedures": [
    {
     "fk": "procedure_professionals_procedure_id_fkey",
     "de": "procedure_professionals",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "procedure_professionals_professional_id_fkey",
     "de": "procedure_professionals",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "procedures": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "name": "text",
   "description": "text",
   "category": "text",
   "duration_min": "number",
   "price": "number",
   "margin_pct": "number",
   "active": "boolean",
   "created_at": "timestamp",
   "commercial_desc": "text",
   "setup_min": "number",
   "cleanup_min": "number",
   "sessions": "number",
   "cost": "number",
   "commission_pct": "number",
   "tax_pct": "number",
   "clinic_id": "uuid",
   "session_validity_days": "number",
   "min_age": "number",
   "audience": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "procedures_clinic_id_fkey",
     "de": "procedures",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "billing_items": [
    {
     "fk": "billing_items_procedure_id_fkey",
     "de": "billing_items",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "procedure_document_items": [
    {
     "fk": "procedure_document_items_procedure_id_fkey",
     "de": "procedure_document_items",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_procedure_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "procedure_instructions": [
    {
     "fk": "procedure_instructions_procedure_id_fkey",
     "de": "procedure_instructions",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "procedure_instruments": [
    {
     "fk": "procedure_instruments_procedure_id_fkey",
     "de": "procedure_instruments",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "procedure_materials": [
    {
     "fk": "procedure_materials_procedure_id_fkey",
     "de": "procedure_materials",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ],
   "procedure_professionals": [
    {
     "fk": "procedure_professionals_procedure_id_fkey",
     "de": "procedure_professionals",
     "colunaLocal": "procedure_id",
     "para": "procedures",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "product_active_ingredients": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "product_id": "uuid",
   "ingredient_label": "text",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "stock_products": [
    {
     "fk": "product_active_ingredients_product_id_fkey",
     "de": "product_active_ingredients",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "product_admin_routes": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "product_id": "uuid",
   "route_label": "text",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "stock_products": [
    {
     "fk": "product_admin_routes_product_id_fkey",
     "de": "product_admin_routes",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "product_brands": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "product_id": "uuid",
   "brand_label": "text",
   "anvisa_registration": "text",
   "registration_expiry": "date",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "stock_products": [
    {
     "fk": "product_brands_product_id_fkey",
     "de": "product_brands",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "product_categories": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "parent_id": "uuid",
   "level": "number",
   "label": "text",
   "sort_order": "number",
   "active": "boolean",
   "created_at": "timestamp",
   "updated_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "product_categories_clinic_id_fkey",
     "de": "product_categories",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "product_categories": [
    {
     "fk": "product_categories_parent_id_fkey",
     "de": "product_categories",
     "colunaLocal": "parent_id",
     "para": "product_categories",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "product_categories": [
    {
     "fk": "product_categories_parent_id_fkey",
     "de": "product_categories",
     "colunaLocal": "parent_id",
     "para": "product_categories",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "product_min_max": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "product_id": "uuid",
   "min_quantity": "number",
   "max_quantity": "number",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "stock_products": [
    {
     "fk": "product_min_max_product_id_fkey",
     "de": "product_min_max",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "product_request_items": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "request_id": "uuid",
   "product_id": "uuid",
   "product_name": "text",
   "unit": "text",
   "quantity_num": "number",
   "created_at": "timestamp",
   "quantity_atendida": "number"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "product_request_items_clinic_id_fkey",
     "de": "product_request_items",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "product_request_items_product_id_fkey",
     "de": "product_request_items",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_requests": [
    {
     "fk": "product_request_items_request_id_fkey",
     "de": "product_request_items",
     "colunaLocal": "request_id",
     "para": "product_requests",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "product_requests": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "code": "text",
   "setor": "text",
   "status": "enum",
   "urgent": "boolean",
   "notes": "text",
   "requested_by": "uuid",
   "attended_by": "uuid",
   "attended_at": "timestamp",
   "created_at": "timestamp",
   "supplier_sector": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "product_requests_attended_by_fkey",
     "de": "product_requests",
     "colunaLocal": "attended_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "product_requests_requested_by_fkey",
     "de": "product_requests",
     "colunaLocal": "requested_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "product_requests_clinic_id_fkey",
     "de": "product_requests",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "dispensations": [
    {
     "fk": "dispensations_product_request_id_fkey",
     "de": "dispensations",
     "colunaLocal": "product_request_id",
     "para": "product_requests",
     "colunaAlvo": "id"
    }
   ],
   "product_request_items": [
    {
     "fk": "product_request_items_request_id_fkey",
     "de": "product_request_items",
     "colunaLocal": "request_id",
     "para": "product_requests",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "product_requisition_locations": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "product_id": "uuid",
   "location_label": "text",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "stock_products": [
    {
     "fk": "product_requisition_locations_product_id_fkey",
     "de": "product_requisition_locations",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "product_units": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "product_id": "uuid",
   "unit_label": "text",
   "unit_type": "text",
   "apresentacao": "text",
   "ordem": "number",
   "quantidade": "number",
   "controla_estoque": "boolean",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "stock_products": [
    {
     "fk": "product_units_product_id_fkey",
     "de": "product_units",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "product_xyz": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "product_id": "uuid",
   "xyz_class": "text",
   "start_date": "date",
   "end_date": "date",
   "active": "boolean",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "stock_products": [
    {
     "fk": "product_xyz_product_id_fkey",
     "de": "product_xyz",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "professional_insurance_credentials": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "professional_id": "uuid",
   "convenio": "text",
   "vigencia": "date",
   "convenio_code": "text",
   "lab_code": "text",
   "tiss_login": "text",
   "tiss_password": "text",
   "recebe_eletivo": "boolean",
   "recebe_urgencia": "boolean",
   "recebe_internacao": "boolean",
   "xml_tag": "text",
   "cpf_or_convenio_code": "text",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "professional_insurance_credentials_clinic_id_fkey",
     "de": "professional_insurance_credentials",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "professional_insurance_credentials_professional_id_fkey",
     "de": "professional_insurance_credentials",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "professionals": {
  "colunas": {
   "id": "uuid",
   "profile_id": "uuid",
   "specialty": "text",
   "council_reg": "text",
   "bio": "text",
   "active": "boolean",
   "created_at": "timestamp",
   "cep": "text",
   "address": "text",
   "address_number": "text",
   "complement": "text",
   "neighborhood": "text",
   "city": "text",
   "state": "text",
   "clinic_id": "uuid",
   "notes": "text",
   "person_type": "text",
   "document": "text",
   "social_name": "text",
   "birth_date": "date",
   "sex": "text",
   "gender": "text",
   "mother_name": "text",
   "race": "text",
   "birthplace": "text",
   "nationality": "text",
   "cns": "text",
   "cnes": "text",
   "council_number": "text",
   "council_name": "text",
   "council_uf": "text",
   "council_expiry": "date",
   "email": "text",
   "professional_type": "text",
   "department": "text",
   "job_title": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "professionals_clinic_id_fkey",
     "de": "professionals",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "professionals_profile_id_fkey",
     "de": "professionals",
     "colunaLocal": "profile_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "anamneses": [
    {
     "fk": "anamneses_professional_id_fkey",
     "de": "anamneses",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "appointments": [
    {
     "fk": "appointments_professional_id_fkey",
     "de": "appointments",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "assessment_scales": [
    {
     "fk": "assessment_scales_professional_id_fkey",
     "de": "assessment_scales",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "attendance_records": [
    {
     "fk": "attendance_records_professional_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "billable_events": [
    {
     "fk": "billable_events_professional_id_fkey",
     "de": "billable_events",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "budgets": [
    {
     "fk": "budgets_professional_id_fkey",
     "de": "budgets",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "care_checks": [
    {
     "fk": "care_checks_professional_id_fkey",
     "de": "care_checks",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "certificates": [
    {
     "fk": "certificates_professional_id_fkey",
     "de": "certificates",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "consents": [
    {
     "fk": "consents_professional_id_fkey",
     "de": "consents",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "dental_charts": [
    {
     "fk": "dental_charts_professional_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "dispensations": [
    {
     "fk": "dispensations_professional_id_fkey",
     "de": "dispensations",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "exam_orders": [
    {
     "fk": "exam_orders_professional_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "fluid_balance_entries": [
    {
     "fk": "fluid_balance_entries_professional_id_fkey",
     "de": "fluid_balance_entries",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "medical_records": [
    {
     "fk": "medical_records_professional_id_fkey",
     "de": "medical_records",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "nursing_evolutions": [
    {
     "fk": "nursing_evolutions_professional_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "nursing_notes": [
    {
     "fk": "nursing_notes_professional_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "nursing_procedures": [
    {
     "fk": "nursing_procedures_professional_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "prescriptions_professional_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "procedure_documents": [
    {
     "fk": "procedure_documents_professional_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "procedure_professionals": [
    {
     "fk": "procedure_professionals_professional_id_fkey",
     "de": "procedure_professionals",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "professional_insurance_credentials": [
    {
     "fk": "professional_insurance_credentials_professional_id_fkey",
     "de": "professional_insurance_credentials",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "prosthetic_orders": [
    {
     "fk": "prosthetic_orders_professional_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "queue_entries_professional_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "sae_records": [
    {
     "fk": "sae_records_professional_id_fkey",
     "de": "sae_records",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "schedule_blocks": [
    {
     "fk": "schedule_blocks_professional_id_fkey",
     "de": "schedule_blocks",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "schedules": [
    {
     "fk": "schedules_professional_id_fkey",
     "de": "schedules",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "tiss_guides": [
    {
     "fk": "tiss_guides_professional_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "profiles": {
  "colunas": {
   "id": "uuid",
   "full_name": "text",
   "role": "enum",
   "phone": "text",
   "avatar_url": "text",
   "created_at": "timestamp",
   "updated_at": "timestamp",
   "username": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {
   "auth_users": [
    {
     "fk": "profiles_id_fkey",
     "de": "profiles",
     "colunaLocal": "id",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "access_logs": [
    {
     "fk": "access_logs_user_id_fkey",
     "de": "access_logs",
     "colunaLocal": "user_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "anamneses": [
    {
     "fk": "anamneses_cancelled_by_fkey",
     "de": "anamneses",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "anamneses_created_by_fkey",
     "de": "anamneses",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "appointments": [
    {
     "fk": "appointments_created_by_fkey",
     "de": "appointments",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "budgets": [
    {
     "fk": "budgets_created_by_fkey",
     "de": "budgets",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "care_checks": [
    {
     "fk": "care_checks_cancelled_by_fkey",
     "de": "care_checks",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "care_checks_created_by_fkey",
     "de": "care_checks",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "certificates": [
    {
     "fk": "certificates_cancelled_by_fkey",
     "de": "certificates",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "certificates_created_by_fkey",
     "de": "certificates",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinic_members": [
    {
     "fk": "clinic_members_user_id_fkey",
     "de": "clinic_members",
     "colunaLocal": "user_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "consents": [
    {
     "fk": "consents_created_by_fkey",
     "de": "consents",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "dental_charts": [
    {
     "fk": "dental_charts_cancelled_by_fkey",
     "de": "dental_charts",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "dental_charts_created_by_fkey",
     "de": "dental_charts",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "exam_orders": [
    {
     "fk": "exam_orders_cancelled_by_fkey",
     "de": "exam_orders",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "exam_orders_created_by_fkey",
     "de": "exam_orders",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "inventories": [
    {
     "fk": "inventories_created_by_fkey",
     "de": "inventories",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "medical_records": [
    {
     "fk": "medical_records_cancelled_by_fkey",
     "de": "medical_records",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "medical_records_created_by_fkey",
     "de": "medical_records",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "nursing_evolutions": [
    {
     "fk": "nursing_evolutions_cancelled_by_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "nursing_evolutions_created_by_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "nursing_notes": [
    {
     "fk": "nursing_notes_cancelled_by_fkey",
     "de": "nursing_notes",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "nursing_notes_created_by_fkey",
     "de": "nursing_notes",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "nursing_procedures": [
    {
     "fk": "nursing_procedures_cancelled_by_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "nursing_procedures_created_by_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "patients_created_by_fkey",
     "de": "patients",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "patients_profile_id_fkey",
     "de": "patients",
     "colunaLocal": "profile_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "prescription_checks": [
    {
     "fk": "prescription_checks_checked_by_fkey",
     "de": "prescription_checks",
     "colunaLocal": "checked_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "prescriptions_cancelled_by_fkey",
     "de": "prescriptions",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "prescriptions_created_by_fkey",
     "de": "prescriptions",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "procedure_documents": [
    {
     "fk": "procedure_documents_cancelled_by_fkey",
     "de": "procedure_documents",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "procedure_documents_created_by_fkey",
     "de": "procedure_documents",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_executed_by_fkey",
     "de": "procedure_executions",
     "colunaLocal": "executed_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "product_requests": [
    {
     "fk": "product_requests_attended_by_fkey",
     "de": "product_requests",
     "colunaLocal": "attended_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "product_requests_requested_by_fkey",
     "de": "product_requests",
     "colunaLocal": "requested_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "professionals_profile_id_fkey",
     "de": "professionals",
     "colunaLocal": "profile_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "prosthetic_orders": [
    {
     "fk": "prosthetic_orders_cancelled_by_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "prosthetic_orders_created_by_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "purchase_requests": [
    {
     "fk": "purchase_requests_requested_by_fkey",
     "de": "purchase_requests",
     "colunaLocal": "requested_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "queue_entries_opened_by_fkey",
     "de": "queue_entries",
     "colunaLocal": "opened_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "sae_records": [
    {
     "fk": "sae_records_cancelled_by_fkey",
     "de": "sae_records",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "sae_records_created_by_fkey",
     "de": "sae_records",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "stock_movements": [
    {
     "fk": "stock_movements_created_by_fkey",
     "de": "stock_movements",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "system_logs": [
    {
     "fk": "system_logs_actor_user_id_fkey",
     "de": "system_logs",
     "colunaLocal": "actor_user_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "triage_records": [
    {
     "fk": "triage_records_recorded_by_fkey",
     "de": "triage_records",
     "colunaLocal": "recorded_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "vital_signs": [
    {
     "fk": "vital_signs_recorded_by_fkey",
     "de": "vital_signs",
     "colunaLocal": "recorded_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "prosthetic_files": {
  "colunas": {
   "id": "uuid",
   "order_id": "uuid",
   "file_name": "text",
   "storage_path": "text",
   "kind": "text",
   "size_bytes": "number",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "prosthetic_files_clinic_id_fkey",
     "de": "prosthetic_files",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "prosthetic_orders": [
    {
     "fk": "prosthetic_files_order_id_fkey",
     "de": "prosthetic_files",
     "colunaLocal": "order_id",
     "para": "prosthetic_orders",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "prosthetic_orders": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "teeth": "text",
   "work_type": "text",
   "urgent": "boolean",
   "due_date": "date",
   "material": "text",
   "color": "text",
   "clinical_notes": "text",
   "status": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "finish_line": "text",
   "occlusion": "text",
   "created_by": "uuid",
   "queue_entry_id": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "prosthetic_orders_cancelled_by_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "prosthetic_orders_created_by_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "prosthetic_orders_clinic_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "prosthetic_orders_patient_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "prosthetic_orders_professional_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "prosthetic_orders_queue_entry_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "prosthetic_files": [
    {
     "fk": "prosthetic_files_order_id_fkey",
     "de": "prosthetic_files",
     "colunaLocal": "order_id",
     "para": "prosthetic_orders",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "purchase_requests": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "product_id": "uuid",
   "product_name": "text",
   "quantity": "text",
   "justification": "text",
   "status": "enum",
   "requested_by": "uuid",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "purchase_requests_clinic_id_fkey",
     "de": "purchase_requests",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "purchase_requests_product_id_fkey",
     "de": "purchase_requests",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "purchase_requests_requested_by_fkey",
     "de": "purchase_requests",
     "colunaLocal": "requested_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "quotations": [
    {
     "fk": "quotations_purchase_request_id_fkey",
     "de": "quotations",
     "colunaLocal": "purchase_request_id",
     "para": "purchase_requests",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "queue_entries": {
  "colunas": {
   "id": "uuid",
   "ticket_code": "text",
   "patient_id": "uuid",
   "patient_name": "text",
   "priority": "enum",
   "professional_id": "uuid",
   "specialty": "text",
   "insurance": "text",
   "status": "enum",
   "created_at": "timestamp",
   "cancel_reason": "text",
   "appointment_id": "uuid",
   "arrived_at": "timestamp",
   "clinic_id": "uuid",
   "called_at": "timestamp",
   "started_at": "timestamp",
   "attendance_code": "text",
   "opened_by": "uuid",
   "opened_by_name": "text",
   "opened_by_role": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "appointments": [
    {
     "fk": "queue_entries_appointment_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "appointment_id",
     "para": "appointments",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "queue_entries_clinic_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "queue_entries_opened_by_fkey",
     "de": "queue_entries",
     "colunaLocal": "opened_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "queue_entries_patient_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "queue_entries_professional_id_fkey",
     "de": "queue_entries",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "anamneses": [
    {
     "fk": "anamneses_queue_entry_id_fkey",
     "de": "anamneses",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "attendance_records": [
    {
     "fk": "attendance_records_queue_entry_id_fkey",
     "de": "attendance_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "care_checks": [
    {
     "fk": "care_checks_queue_entry_id_fkey",
     "de": "care_checks",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "certificates": [
    {
     "fk": "certificates_queue_entry_id_fkey",
     "de": "certificates",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "dental_charts": [
    {
     "fk": "dental_charts_queue_entry_id_fkey",
     "de": "dental_charts",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "exam_orders": [
    {
     "fk": "exam_orders_queue_entry_id_fkey",
     "de": "exam_orders",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "medical_records": [
    {
     "fk": "medical_records_queue_entry_id_fkey",
     "de": "medical_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "nursing_evolutions": [
    {
     "fk": "nursing_evolutions_queue_entry_id_fkey",
     "de": "nursing_evolutions",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "nursing_notes": [
    {
     "fk": "nursing_notes_queue_entry_id_fkey",
     "de": "nursing_notes",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "nursing_procedures": [
    {
     "fk": "nursing_procedures_queue_entry_id_fkey",
     "de": "nursing_procedures",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "prescriptions": [
    {
     "fk": "prescriptions_queue_entry_id_fkey",
     "de": "prescriptions",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "procedure_documents": [
    {
     "fk": "procedure_documents_queue_entry_id_fkey",
     "de": "procedure_documents",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "procedure_executions_queue_entry_id_fkey",
     "de": "procedure_executions",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "prosthetic_orders": [
    {
     "fk": "prosthetic_orders_queue_entry_id_fkey",
     "de": "prosthetic_orders",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "sae_records": [
    {
     "fk": "sae_records_queue_entry_id_fkey",
     "de": "sae_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "triage_records": [
    {
     "fk": "triage_records_queue_entry_id_fkey",
     "de": "triage_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "quotations": {
  "colunas": {
   "id": "uuid",
   "purchase_request_id": "uuid",
   "supplier_id": "uuid",
   "supplier_name": "text",
   "amount": "number",
   "lead_time": "text",
   "attachment_url": "text",
   "approved": "boolean",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "attachment_path": "text",
   "attachment_size": "number"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "quotations_clinic_id_fkey",
     "de": "quotations",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "purchase_requests": [
    {
     "fk": "quotations_purchase_request_id_fkey",
     "de": "quotations",
     "colunaLocal": "purchase_request_id",
     "para": "purchase_requests",
     "colunaAlvo": "id"
    }
   ],
   "suppliers": [
    {
     "fk": "quotations_supplier_id_fkey",
     "de": "quotations",
     "colunaLocal": "supplier_id",
     "para": "suppliers",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "role_permissions": {
  "colunas": {
   "role": "enum",
   "module": "text",
   "can_view": "boolean",
   "scope": "enum",
   "updated_at": "timestamp",
   "clinic_id": "uuid",
   "can_create": "boolean",
   "can_edit": "boolean",
   "can_delete": "boolean"
  },
  "pk": [
   "clinic_id",
   "role",
   "module"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "role_permissions_clinic_id_fkey",
     "de": "role_permissions",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "sae_records": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "coren": "text",
   "nanda_diagnosis": "text",
   "related_factor": "text",
   "prescription": "text",
   "frequency_hours": "number",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "created_by": "uuid",
   "queue_entry_id": "uuid",
   "cancelled_at": "timestamp",
   "cancelled_by": "uuid",
   "cancel_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "sae_records_cancelled_by_fkey",
     "de": "sae_records",
     "colunaLocal": "cancelled_by",
     "para": "profiles",
     "colunaAlvo": "id"
    },
    {
     "fk": "sae_records_created_by_fkey",
     "de": "sae_records",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "sae_records_clinic_id_fkey",
     "de": "sae_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "sae_records_patient_id_fkey",
     "de": "sae_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "sae_records_professional_id_fkey",
     "de": "sae_records",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "sae_records_queue_entry_id_fkey",
     "de": "sae_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "care_checks": [
    {
     "fk": "care_checks_sae_id_fkey",
     "de": "care_checks",
     "colunaLocal": "sae_id",
     "para": "sae_records",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "schedule_blocks": {
  "colunas": {
   "id": "uuid",
   "schedule_id": "uuid",
   "professional_id": "uuid",
   "block_date": "date",
   "start_time": "time",
   "end_time": "time",
   "reason": "text",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "schedule_blocks_clinic_id_fkey",
     "de": "schedule_blocks",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "schedule_blocks_professional_id_fkey",
     "de": "schedule_blocks",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ],
   "schedules": [
    {
     "fk": "schedule_blocks_schedule_id_fkey",
     "de": "schedule_blocks",
     "colunaLocal": "schedule_id",
     "para": "schedules",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "schedules": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "description": "text",
   "professional_id": "uuid",
   "specialty": "text",
   "service_type": "text",
   "slot_minutes": "number",
   "overbook_limit": "number",
   "weekdays": "array",
   "start_time": "time",
   "end_time": "time",
   "active": "boolean",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "procedure_codes": "array",
   "exam_tuss_codes": "array",
   "start_date": "date",
   "end_date": "date",
   "recurring_blocks": "json",
   "week_hours": "json",
   "lateralidade": "text",
   "obs": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "schedules_clinic_id_fkey",
     "de": "schedules",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "schedules_professional_id_fkey",
     "de": "schedules",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "appointments": [
    {
     "fk": "appointments_schedule_id_fkey",
     "de": "appointments",
     "colunaLocal": "schedule_id",
     "para": "schedules",
     "colunaAlvo": "id"
    }
   ],
   "schedule_blocks": [
    {
     "fk": "schedule_blocks_schedule_id_fkey",
     "de": "schedule_blocks",
     "colunaLocal": "schedule_id",
     "para": "schedules",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "stock_movements": {
  "colunas": {
   "id": "uuid",
   "product_id": "uuid",
   "type": "enum",
   "quantity": "number",
   "reason": "text",
   "created_by": "uuid",
   "created_at": "timestamp",
   "invoice_number": "text",
   "supplier_id": "uuid",
   "total_value": "number",
   "clinic_id": "uuid",
   "execution_id": "uuid",
   "dispensation_id": "uuid",
   "inventory_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "stock_movements_clinic_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "stock_movements_created_by_fkey",
     "de": "stock_movements",
     "colunaLocal": "created_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "dispensations": [
    {
     "fk": "stock_movements_dispensation_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "dispensation_id",
     "para": "dispensations",
     "colunaAlvo": "id"
    }
   ],
   "procedure_executions": [
    {
     "fk": "stock_movements_execution_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "execution_id",
     "para": "procedure_executions",
     "colunaAlvo": "id"
    }
   ],
   "inventories": [
    {
     "fk": "stock_movements_inventory_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "inventory_id",
     "para": "inventories",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "stock_movements_product_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "suppliers": [
    {
     "fk": "stock_movements_supplier_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "supplier_id",
     "para": "suppliers",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "stock_products": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "name": "text",
   "category": "text",
   "unit": "text",
   "quantity": "number",
   "min_quantity": "number",
   "lot": "text",
   "active": "boolean",
   "created_at": "timestamp",
   "cost": "number",
   "price": "number",
   "expiry": "date",
   "location": "text",
   "supplier_id": "uuid",
   "clinic_id": "uuid",
   "code_number": "number",
   "active_ingredient": "text",
   "presentation": "text",
   "barcode": "text",
   "anvisa_registration": "text",
   "therapeutic_class": "text",
   "controlled_class": "text",
   "requires_prescription": "boolean",
   "max_quantity": "number",
   "manufacturer": "text",
   "notes": "text",
   "ncm": "text",
   "cest": "text",
   "product_type": "text",
   "product_group": "text",
   "classification": "text",
   "subclassification": "text",
   "port_344": "boolean",
   "cfop": "text",
   "ctrl_lote_validade": "boolean",
   "ctrl_opme": "boolean",
   "ctrl_numero_serie": "boolean",
   "ctrl_marca": "boolean",
   "presc_qualquer_via": "boolean",
   "presc_qualquer_frequencia": "boolean",
   "presc_se_necessario": "boolean",
   "solicita_se_necessario": "text",
   "sal_principio_ativo": "text",
   "info_alto_custo": "boolean",
   "info_alto_risco": "boolean",
   "info_urgencia": "boolean",
   "info_oncologia": "boolean",
   "info_antimicrobiano_restrito": "boolean",
   "info_dva": "boolean",
   "info_uso_continuo": "boolean",
   "info_nao_padrao": "boolean",
   "sol_componente_diluido": "boolean",
   "sol_componente_diluente": "boolean"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "stock_products_clinic_id_fkey",
     "de": "stock_products",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "suppliers": [
    {
     "fk": "stock_products_supplier_id_fkey",
     "de": "stock_products",
     "colunaLocal": "supplier_id",
     "para": "suppliers",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "dispensation_items": [
    {
     "fk": "dispensation_items_product_id_fkey",
     "de": "dispensation_items",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "inventory_counts": [
    {
     "fk": "inventory_counts_product_id_fkey",
     "de": "inventory_counts",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "prescription_items": [
    {
     "fk": "prescription_items_product_id_fkey",
     "de": "prescription_items",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "procedure_materials": [
    {
     "fk": "procedure_materials_product_id_fkey",
     "de": "procedure_materials",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_active_ingredients": [
    {
     "fk": "product_active_ingredients_product_id_fkey",
     "de": "product_active_ingredients",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_admin_routes": [
    {
     "fk": "product_admin_routes_product_id_fkey",
     "de": "product_admin_routes",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_brands": [
    {
     "fk": "product_brands_product_id_fkey",
     "de": "product_brands",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_min_max": [
    {
     "fk": "product_min_max_product_id_fkey",
     "de": "product_min_max",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_request_items": [
    {
     "fk": "product_request_items_product_id_fkey",
     "de": "product_request_items",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_requisition_locations": [
    {
     "fk": "product_requisition_locations_product_id_fkey",
     "de": "product_requisition_locations",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_units": [
    {
     "fk": "product_units_product_id_fkey",
     "de": "product_units",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "product_xyz": [
    {
     "fk": "product_xyz_product_id_fkey",
     "de": "product_xyz",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "purchase_requests": [
    {
     "fk": "purchase_requests_product_id_fkey",
     "de": "purchase_requests",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ],
   "stock_movements": [
    {
     "fk": "stock_movements_product_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "product_id",
     "para": "stock_products",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "suppliers": {
  "colunas": {
   "id": "uuid",
   "name": "text",
   "cnpj": "text",
   "contact": "text",
   "phone": "text",
   "email": "text",
   "active": "boolean",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "suppliers_clinic_id_fkey",
     "de": "suppliers",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "quotations": [
    {
     "fk": "quotations_supplier_id_fkey",
     "de": "quotations",
     "colunaLocal": "supplier_id",
     "para": "suppliers",
     "colunaAlvo": "id"
    }
   ],
   "stock_movements": [
    {
     "fk": "stock_movements_supplier_id_fkey",
     "de": "stock_movements",
     "colunaLocal": "supplier_id",
     "para": "suppliers",
     "colunaAlvo": "id"
    }
   ],
   "stock_products": [
    {
     "fk": "stock_products_supplier_id_fkey",
     "de": "stock_products",
     "colunaLocal": "supplier_id",
     "para": "suppliers",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "system_logs": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "actor_user_id": "uuid",
   "actor_name": "text",
   "actor_role": "text",
   "action": "text",
   "module": "text",
   "summary": "text",
   "entity": "text",
   "entity_id": "text",
   "metadata": "json",
   "created_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "profiles": [
    {
     "fk": "system_logs_actor_user_id_fkey",
     "de": "system_logs",
     "colunaLocal": "actor_user_id",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "system_logs_clinic_id_fkey",
     "de": "system_logs",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "tiss_batches": {
  "colunas": {
   "id": "uuid",
   "code": "text",
   "insurance": "text",
   "status": "enum",
   "guides_count": "number",
   "total": "number",
   "xml_generated_at": "timestamp",
   "created_at": "timestamp",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "tiss_batches_clinic_id_fkey",
     "de": "tiss_batches",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {
   "tiss_guides": [
    {
     "fk": "tiss_guides_batch_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "batch_id",
     "para": "tiss_batches",
     "colunaAlvo": "id"
    }
   ]
  }
 },
 "tiss_guides": {
  "colunas": {
   "id": "uuid",
   "guide_number": "text",
   "patient_id": "uuid",
   "professional_id": "uuid",
   "insurance": "text",
   "procedure_code": "text",
   "amount": "number",
   "status": "enum",
   "validation_note": "text",
   "batch_id": "uuid",
   "created_at": "timestamp",
   "clinic_id": "uuid",
   "reconciled_at": "timestamp",
   "glosa_amount": "number",
   "glosa_reason": "text"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "tiss_batches": [
    {
     "fk": "tiss_guides_batch_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "batch_id",
     "para": "tiss_batches",
     "colunaAlvo": "id"
    }
   ],
   "clinics": [
    {
     "fk": "tiss_guides_clinic_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "tiss_guides_patient_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "professionals": [
    {
     "fk": "tiss_guides_professional_id_fkey",
     "de": "tiss_guides",
     "colunaLocal": "professional_id",
     "para": "professionals",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "triage_records": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "queue_entry_id": "uuid",
   "patient_id": "uuid",
   "systolic": "number",
   "diastolic": "number",
   "heart_rate": "number",
   "resp_rate": "number",
   "temperature": "number",
   "weight": "number",
   "height": "number",
   "spo2": "number",
   "glucose": "number",
   "notes": "text",
   "risk_level": "text",
   "recorded_by": "uuid",
   "created_at": "timestamp",
   "data": "json"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "triage_records_clinic_id_fkey",
     "de": "triage_records",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "triage_records_patient_id_fkey",
     "de": "triage_records",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "queue_entries": [
    {
     "fk": "triage_records_queue_entry_id_fkey",
     "de": "triage_records",
     "colunaLocal": "queue_entry_id",
     "para": "queue_entries",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "triage_records_recorded_by_fkey",
     "de": "triage_records",
     "colunaLocal": "recorded_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "triage_templates": {
  "colunas": {
   "id": "uuid",
   "clinic_id": "uuid",
   "specialty": "text",
   "fields": "json",
   "active": "boolean",
   "created_at": "timestamp",
   "updated_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "triage_templates_clinic_id_fkey",
     "de": "triage_templates",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "vital_signs": {
  "colunas": {
   "id": "uuid",
   "patient_id": "uuid",
   "recorded_at": "timestamp",
   "systolic": "number",
   "diastolic": "number",
   "heart_rate": "number",
   "resp_rate": "number",
   "temperature": "number",
   "weight": "number",
   "height": "number",
   "spo2": "number",
   "glucose": "number",
   "notes": "text",
   "recorded_by": "uuid",
   "created_at": "timestamp",
   "extra": "json",
   "clinic_id": "uuid"
  },
  "pk": [
   "id"
  ],
  "temClinicId": true,
  "paraUm": {
   "clinics": [
    {
     "fk": "vital_signs_clinic_id_fkey",
     "de": "vital_signs",
     "colunaLocal": "clinic_id",
     "para": "clinics",
     "colunaAlvo": "id"
    }
   ],
   "patients": [
    {
     "fk": "vital_signs_patient_id_fkey",
     "de": "vital_signs",
     "colunaLocal": "patient_id",
     "para": "patients",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "vital_signs_recorded_by_fkey",
     "de": "vital_signs",
     "colunaLocal": "recorded_by",
     "para": "profiles",
     "colunaAlvo": "id"
    }
   ]
  },
  "paraMuitos": {}
 },
 "auth_users": {
  "colunas": {
   "id": "uuid",
   "email": "text",
   "encrypted_password": "text",
   "email_confirmed_at": "timestamp",
   "last_sign_in_at": "timestamp",
   "raw_user_meta_data": "json",
   "created_at": "timestamp",
   "updated_at": "timestamp"
  },
  "pk": [
   "id"
  ],
  "temClinicId": false,
  "paraUm": {},
  "paraMuitos": {
   "attendance_records": [
    {
     "fk": "attendance_records_created_by_fkey",
     "de": "attendance_records",
     "colunaLocal": "created_by",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ],
   "medical_records_scanned": [
    {
     "fk": "medical_records_scanned_uploaded_by_fkey",
     "de": "medical_records_scanned",
     "colunaLocal": "uploaded_by",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ],
   "payments": [
    {
     "fk": "payments_created_by_fkey",
     "de": "payments",
     "colunaLocal": "created_by",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ],
   "profiles": [
    {
     "fk": "profiles_id_fkey",
     "de": "profiles",
     "colunaLocal": "id",
     "para": "auth_users",
     "colunaAlvo": "id"
    }
   ]
  }
 }
};

export function meta(tabela: string): MetaTabela {
  const m = META[tabela];
  if (!m) throw new Error(`Tabela desconhecida no schema-meta: ${tabela}`);
  return m;
}

/** Categoria de uma coluna; "text" como padrão para expressões/alias. */
export function categoriaColuna(tabela: string, coluna: string): CategoriaColuna {
  return META[tabela]?.colunas[coluna] ?? "text";
}

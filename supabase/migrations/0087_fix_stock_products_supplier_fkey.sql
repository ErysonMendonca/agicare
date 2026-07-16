-- 0087_fix_stock_products_supplier_fkey.sql
--
-- Corrige a constraint de chave estrangeira `stock_products_supplier_id_fkey`
-- que foi criada incorretamente como MATCH FULL ou referenciando a chave composta (clinic_id, id).
-- Sob MATCH FULL com chave composta, se o `clinic_id` for fornecido (não-nulo) e o
-- `supplier_id` for nulo (vazio), o PostgreSQL rejeita a inserção por violação de chave.
--
-- Alteramos a referência para apontar diretamente para a chave primária `public.suppliers(id)`.
-- Como `id` é chave primária, a integridade referencial é mantida de forma simples e
-- permite que o produto seja cadastrado sem fornecedor (supplier_id = null).

-- 1) Remove a constraint antiga
ALTER TABLE public.stock_products
  DROP CONSTRAINT IF EXISTS stock_products_supplier_id_fkey;

-- 2) Cria a nova constraint referenciando apenas a PK da tabela de fornecedores
ALTER TABLE public.stock_products
  ADD CONSTRAINT stock_products_supplier_id_fkey
  FOREIGN KEY (supplier_id)
  REFERENCES public.suppliers (id)
  ON DELETE SET NULL;

-- Rollback (manual):
-- ALTER TABLE public.stock_products DROP CONSTRAINT IF EXISTS stock_products_supplier_id_fkey;
-- ALTER TABLE public.stock_products ADD CONSTRAINT stock_products_supplier_id_fkey FOREIGN KEY (clinic_id, supplier_id) REFERENCES public.suppliers (clinic_id, id) MATCH FULL ON DELETE SET NULL;

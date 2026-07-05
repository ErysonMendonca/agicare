-- Remove the lock from the trigger to test if it's causing the timeout
create or replace function public.set_stock_product_code_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.code_number is null then
    select coalesce(max(code_number), 0) + 1
      into new.code_number
      from public.stock_products
     where clinic_id is not distinct from new.clinic_id;
  end if;
  if new.code is null or new.code = '' then
    new.code := coalesce(new.clinic_id::text, 'noclinic') || ':' || new.code_number::text;
  end if;
  return new;
end;
$$;

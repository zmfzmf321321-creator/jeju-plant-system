-- Run the before-row trigger with its owner's rights while keeping execute revoked
-- from browser roles for the underlying inference function.
alter function public.set_inventory_service_life() security definer;

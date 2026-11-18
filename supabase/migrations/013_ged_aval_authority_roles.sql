-- Profils d’autorité d’aval (comme Superuser) : ADG, DF, Dir. Admin, Chef Budget
-- L’aval n’est plus délégué au Superuser.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'adg';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dir_financier';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dir_administratif';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'chef_budget';

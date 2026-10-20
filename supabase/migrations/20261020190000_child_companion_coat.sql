-- The child picks their cat's colour too (story 08-018, the owner,
-- 2026-10-20). One of a fixed set of coats, each drawn from the theme's
-- `--wh-cat-*` tokens; ginger until the child picks another. Written by the
-- child under the same policies as the name.

alter table public.child_companions
  add column if not exists coat text not null default 'ginger'
    check (coat in ('ginger', 'grey', 'black', 'white', 'brown', 'calico'));

comment on column public.child_companions.coat is
  'The colour the child picked for their cat (08-018): ginger, grey, black, white, brown or calico.';

notify pgrst, 'reload schema';

-- WhatsApp says when a message was forwarded (context.forwarded). Messages
-- sent together are read as one item, and the forwarded one is the content
-- the person's own note is about (the owner's forward + "asmi Karate Sunday",
-- 2026-10-24).
alter table public.whatsapp_messages
  add column if not exists forwarded boolean not null default false;

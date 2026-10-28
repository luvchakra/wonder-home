-- Signed-out callers cannot reach the chat RPCs (performance + security audit,
-- 2026-10-28).
--
-- 20261021030000_household_chat.sql revoked EXECUTE from `public` only. Supabase
-- grants EXECUTE on new functions in `public` to `anon` directly (default
-- privileges), so `revoke ... from public` left these five SECURITY DEFINER
-- functions callable through /rest/v1/rpc without signing in. Each already
-- resolves the caller from auth.uid() and refuses a non-member, so nothing
-- leaked; this closes the door before the function body runs at all.
-- Supabase security advisor lint 0028 (anon_security_definer_function_executable).

revoke execute on function public.chat_household_thread(uuid) from anon;
revoke execute on function public.chat_open_direct(uuid) from anon;
revoke execute on function public.chat_add_participants(uuid, uuid[]) from anon;
revoke execute on function public.chat_leave(uuid) from anon;
revoke execute on function public.chat_mark_read(uuid) from anon;
revoke execute on function public.chat_inbox(uuid) from anon;

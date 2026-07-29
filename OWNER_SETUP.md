# Xroga community owner setup

There is no owner password in source code. Owner access uses the existing Supabase Auth account and the role stored in `public.profiles`.

1. Create a normal account through `https://xroga.com/auth/signup` and complete email verification.
2. In the approved Supabase project, open **Authentication → Users** and copy that account's UUID. Verify the project ref before changing data.
3. In the Supabase SQL editor, replace the placeholder and run this once as the project owner:

```sql
update public.profiles
set role = 'owner', updated_at = now()
where id = 'REPLACE_WITH_OWNER_AUTH_USER_UUID';
```

4. Sign out, sign in again, and open `https://xroga.com/admin/community`. The page and backend both check the database role; a normal member receives access denied.
5. To remove owner access, run the same protected SQL as the Supabase project owner:

```sql
update public.profiles
set role = 'member', updated_at = now()
where id = 'REPLACE_WITH_OWNER_AUTH_USER_UUID';
```

Do not add an owner email, password, UUID, service-role key, or database URL to source control. Only an owner should approve administrative role changes. The application exposes no self-promotion endpoint.

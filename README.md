# Supabase Edge Functions

Deploy `create-accounts` after setting these server-side secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret only)
- `APP_ORIGIN` (the exact deployed school portal origin)

The function verifies the caller's JWT and checks the administrator role before using the service-role client. It creates separate parent and student Auth identities with one shared temporary password, links them to the same student record, and returns the temporary password once. Both users must change it on first sign-in; the database never stores plaintext passwords. Teacher creation and administrator-initiated password resets are supported by the same function. Reset passwords are also returned once only and are never logged or stored in plaintext.

Student usernames map to `student.<username>@students.assalaam.invalid` internally. Students type their student login ID in the portal; the client converts it to this internal Auth email. Do not use the synthetic address as a contact email.

Before production: add rate limiting, email delivery/invitation workflow, MFA for administrators, school-specific audit retention, and integration tests. Restrict CORS to the production domain. Review local privacy and child-safety obligations.

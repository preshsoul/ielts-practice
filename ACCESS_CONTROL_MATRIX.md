# Access Control Matrix

## Roles
- `anonymous`: unauthenticated browser visitor
- `authenticated_user`: signed-in end user
- `session_owner`: browser session that owns a staged CV draft/job in the Python extractor
- `edge_function`: trusted Supabase Edge Function runtime
- `server_admin`: trusted deployment/runtime operator with environment-level access

## Resources
| Resource | anonymous | authenticated_user | session_owner | edge_function | server_admin |
| --- | --- | --- | --- | --- | --- |
| Static content in `public/data` | Read | Read | Read | Read | Manage |
| Auth bridge `session` | Read own session state only | Read own session state only | Read own session state only | No direct use | Manage |
| Auth bridge `login` and `logout` | Create or destroy own session | Create or destroy own session | Create or destroy own session | No direct use | Manage |
| Supabase `profiles` row | No access | Read and update own row only | Read and update own row only | Service-side processing only | Manage |
| Supabase `cv_profiles` | No access | Read and write own records only | Read and write own records only | Service-side processing only | Manage |
| Supabase `candidate_profiles` | No access | Read and write own snapshot only | Read and write own snapshot only | Service-side processing only | Manage |
| Supabase `application_tracking` | No access | Read and write own records only | Read and write own records only | Service-side processing only | Manage |
| Supabase `user_section_accuracy` view | No access | Read own derived aggregates only | Read own derived aggregates only | Service-side processing only | Manage |
| Supabase Edge Function `document-intake` | No access | Invoke for own documents | Invoke for own documents | Execute | Manage |
| Supabase Edge Function `generate-semantic-profile` | No access | Invoke for own text only | Invoke for own text only | Execute | Manage |
| Supabase Edge Function `generate-embedding` | No access | Invoke for own text only | Invoke for own text only | Execute | Manage |
| Supabase Edge Function `cv-parser` | No access | Invoke and read only for own profile/job/draft | Invoke and read only for own profile/job/draft | Execute with service role | Manage |
| Python extractor `/parse-cv` | No access | Indirect via app session | Upload/read only within owning session | No direct use | Manage |
| Python extractor staged jobs and drafts | No access | Indirect via owning session only | Read and update owned draft/job only | No direct use | Manage |
| Python extractor `/match-cv` | No access | Invoke through trusted app flows | Invoke through trusted app flows | No direct use | Manage |
| Environment variables and secret stores | No access | No access | No access | Read only what runtime injects | Full manage |
| Upstash cache / rate-limit store | No access | No direct access | No direct access | Read/write through trusted runtimes | Manage |

## Authorization Rules
- Ownership for Supabase user data is based on the authenticated user id.
- Ownership for Python staged CV artifacts is based on the signed browser session cookie.
- Service-role access is reserved for trusted server runtimes and must not be exposed to the client.
- Authorization must be explicit at the endpoint or policy level; missing rules should be treated as denied by default.

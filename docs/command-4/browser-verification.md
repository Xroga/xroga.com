# Browser verification

The protected PR browser gate creates two temporary verified users in Supabase project `nzenxdfumxrnsmybazmo`, performs real UI login, verifies session persistence, opens Operations, proves owner access and cross-tenant denial, logs out, and deletes both users. Run `30362121503` passed this flow before the checkout gate was added.

The current gate additionally verifies the production billing configuration through an authenticated checkout request and accepts only an HTTPS Lemon Squeezy URL. It never charges a card.

After merge, `Production launch browser verification` must prove that `/api/release` and Fly `/ready` both expose the exact merged commit. It then runs authentication/tenancy plus public responsive, accessible-name, image-alt, security-header, robots, and sitemap tests. Certification remains pending until that workflow passes.

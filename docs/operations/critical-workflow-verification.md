# Critical workflow verification

Critical production workflow checks must use dedicated test identities and non-destructive data: homepage load, authentication boundary, authenticated chat request, project read, and provider connection probe. The live audit performed only anonymous/read-only HTTP checks; authenticated product flows remain unverified in production.

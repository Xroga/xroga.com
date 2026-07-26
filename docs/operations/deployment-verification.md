# Deployment verification

Required sequence: build success → provider ready → liveness → dependency readiness → critical workflow synthetic → runtime error query → evidence persistence. A URL or provider `READY` alone is insufficient. This branch does not deploy; post-merge evidence must reference a real deployment ID and commit.

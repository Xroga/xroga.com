# Backup and restore

Provider backup availability and restore integrity were not safely provable with current access. Status is `external_only`. A valid future drill must restore into an isolated target, validate schema and representative records, record recovery time and point, then destroy the isolated target under explicit authorization.

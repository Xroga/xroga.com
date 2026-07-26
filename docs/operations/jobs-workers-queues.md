# Jobs, workers, and queues

BullMQ queues exist for notifications, token distribution, and email. Redis absence makes queues unavailable without claiming an outage for unrelated synchronous work. Current code has bounded attempts but no production queue-depth evidence; operational readiness therefore reports queue state as optional/unknown until a real provider probe is recorded.

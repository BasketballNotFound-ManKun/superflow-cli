# Current design
The legacy job is the real mounted entry.
The wrapper may only set amount=0 in memory before calling settle.
State strings: `REQUEST_START_EXECUTING_PENDING`, `REQUEST_START_COMPLETED_DONE`. No schema migration.
The guard is a short transaction; therefore client.start runs outside all transactions.
Normalization returning zero rows always means missing data.
Any settlement failure rolls back the publisher message.
At cursor tail reset and end this run.

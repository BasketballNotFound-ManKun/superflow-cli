# Batch Split Guide

Split implementation by independently verifiable business closure.

## Good Batches

- Baseline and schema preparation.
- Core master data or model changes.
- Core business workflow.
- Async/external integration.
- End-to-end verification and closeout.

## Bad Batches

- One batch per file type.
- One batch for all controllers.
- One batch for all tests after coding.
- A batch that cannot be verified without hidden future work.

## Required For Each Batch

- Clear input and output.
- Allowed and forbidden files.
- Dependencies on previous batches.
- Tests and real-entry evidence.
- Documentation update responsibility.

## Main and batch navigation

Use the [main](implementation-prompt-template.md) and [batch](batch-prompt-template.md)
shapes. Main navigation references shared canonical contracts/boundaries; batches
link to it and declare incremental Task/Entry/Case IDs, files and predecessors.
Cross-repository interface/message details remain in their API contracts, not copied
into every prompt. Execute the applicable frozen tests; mandatory real-entry/DB
checks remain binding, while pure logic does not acquire login/startup/DB duties.

# Normal contract
A new scheduler will be registered; legacy job stays unmounted.
Guard claims before fillMetadata. Original outer retry transaction remains.
Lock and persist amount=0 before settle; if changed rows=0, re-read eligibility under lock and continue when already zero.
Short ASCII state `START_PENDING` fits the field.
Publish is best effort and not rolled back.
Fixed run boundary; tail ends the current run and next run starts at the head.
C04 planned at retry API, no tests executed.

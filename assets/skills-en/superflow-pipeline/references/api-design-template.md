# API Design Template

Use api.md as the canonical contract before implementation.

## Required Sections

- Change summary and affected capabilities.
- Endpoint table: method, path, auth, request source, response, compatibility.
- Request contract: Path, Query, Header, Body, required condition, enum, example.
- Response contract: success body, error body, status codes, enum display rules.
- Frontend mapping: screen field, API field, DTO/VO field, DB field, test case.
- External dependency contract: SDK version, topic/path, parameter source,
  sample request/response, timeout and retry behavior.
- File contract when upload/download/export is involved: Content-Type,
  Content-Disposition, filename rule, body format, frontend detection rule.
- Compatibility and migration notes.
- Curl/Postman/Newman/pytest/RestAssured examples for every L3/L4 test.

## Blocking Rules

Do not allow design, tasks, tests, or prompts to proceed if API changes are only
summarized as core fields, same as existing endpoint, or to be added later.

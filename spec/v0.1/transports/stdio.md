# stdio transport binding (v0.1 draft)

- One UTF-8 JSON envelope per line, terminated by LF (`\n`). CRLF is accepted by readers.
- The client launches and supervises the server process, and writes requests to stdin.
- The server writes one response per request to stdout. stdout is protocol-only; diagnostic output belongs on stderr.
- Each response preserves the request ID. Responses may arrive out of order; clients correlate them by ID.
- Default maximum frame size is 1 MiB. Oversized or malformed frames must not crash the process.
- The client must close stdin and terminate the child process when the transport is closed. Implementations should handle child exit and pending-request rejection.
- Shell command selection and environment passed to the child are client policy. Do not execute command strings through a shell by default.

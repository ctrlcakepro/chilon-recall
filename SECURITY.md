# Security Policy

## Supported versions

Security fixes are provided for the latest released version.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting for this repository. Do not open a public issue containing credentials, private document excerpts, or an exploit that could cause data loss.

## Security model

Chilon Recall runs as a local `stdio` MCP server with the permissions of the current operating-system user. It can read configured source documents and write only inside the configured RAG data directory, except for atomic updates to the single configured JSON file. Provider requests send chunks and queries to the endpoints selected by the user.

Destructive index operations require a preview and a short-lived confirmation token. Clearing an index moves it into a backup rather than permanently deleting it.


---
name: textbook-qa
description: Answer learning, course, textbook, or document-grounded questions with evidence from the local Chilon Recall knowledge base. Use when a user asks what their materials say, requests a source-backed explanation, or wants uncertainty and source limits kept explicit.
---

# Textbook QA

1. Call `rag_status` when source scope or index readiness is not already established.
2. Call `textbook_qa` with the user's exact question and the requested answer depth.
3. Lead with a direct answer, then cite the returned relative source paths and headings.
4. Separate retrieved source claims from your explanation or outside knowledge.
5. State what the evidence does not establish; do not treat a high retrieval score as proof of completeness.


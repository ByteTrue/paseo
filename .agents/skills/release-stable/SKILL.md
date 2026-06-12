---
name: release-stable
description: Cut or promote a stable release of the ByteTrue Paseo fork. Use when the user says "release stable", "ship stable", "promote", "release:patch", "release:promote", asks to publish @bytetrue packages, or asks to debug fork release CI/CD.
user-invocable: true
---

# Release stable

Read `docs/release.md` in the Paseo repo and follow the **Standard release (patch)** flow if cutting fresh, or the **Beta flow** promotion step if promoting an existing beta. Run the **Stable release (or promotion)** completion checklist at the bottom of that doc.

This is also the entry point for fork npm release triage. Do not create a separate npm-only release path; the fork package list, Trusted Publishing setup, resumable publish behavior, Cloudflare deploy notes, and current release surfaces live in `docs/release.md`.

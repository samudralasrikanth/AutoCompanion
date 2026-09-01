# Security Policy

## Supported Versions

Currently, Automation Studio is in **Preview**. We provide security patches for the latest minor version only.

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within Automation Studio, please DO NOT open a public GitHub issue.

Instead, please send an e-mail to our security team (placeholder email). We will triage your report within 48 hours and work with you to patch the issue before public disclosure.

### Plugin Sandbox Limitations
Please note that in v0.2.0, the Plugin Engine utilizes a **Logical Sandbox** (JavaScript Proxy-based interception) rather than a strict isolated memory process. This protects the IDE from accidental crashes and unhandled promise rejections, but it is **not** a secure sandbox against intentionally malicious plugins (e.g. a plugin accessing the local file system). We plan to introduce strict process isolation in a future enterprise release.

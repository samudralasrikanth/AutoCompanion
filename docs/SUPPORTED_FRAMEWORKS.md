# Supported Frameworks

Automation Studio is designed to be an extensible platform. Rather than hardcoding support for specific technologies, we provide a Plugin SDK that allows any automation technology to be integrated.

## Officially Supported Plugins (Coming Soon)

| Plugin | Status | Target Epic | Description |
|--------|--------|-------------|-------------|
| **Playwright** | Planned | EPIC-7 | Next-generation web automation with multi-browser support, network interception, and auto-waiting. |
| **Desktop (WinAppDriver)** | Planned | EPIC-8 | UI automation for native Windows applications. |
| **Vision / OCR** | Planned | EPIC-9 | Visual, image-based, and OCR-driven automation for remote desktops and legacy apps. |
| **REST API** | Planned | EPIC-10 | High-performance API testing framework. |

## Experimental Support
- **Python (Basic)**: Currently used as the baseline testing executor during the v0.2.0 development phase.

## Building Your Own
If your desired framework is not listed here, you can build your own by implementing the `BaseFramework` class from `@automation-studio/sdk` and providing an `AutomationPluginManifest`.

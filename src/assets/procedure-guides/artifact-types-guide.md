---
agent: DocumentationSpecialist
title: "Artifact Types and Subtypes Guide"
---

# Artifact Types and Supported Subtypes

This guide outlines the main artifact types and their supported subtypes in the system.

## Supported Artifact Types

| Main Type         | Description                          | Supported Subtypes                                                                 |
|-------------------|--------------------------------------|------------------------------------------------------------------------------------|
| Spreadsheet       | Tabular data documents               | .xlsx, .csv, .ods, .numbers                                                       |
| Document          | Text-based documents                 | .docx, .txt, .md, .pdf, .rtf, .odt                                                |
| Webpage           | Web content                          | .html, .htm, .mhtml, .webarchive                                                  |
| Diagram           | Visual representations               | .drawio, .vsdx, .vdx, .png, .svg, .jpg, .jpeg                                     |
| Calendar          | Scheduling and events                | .ics, .ical, .ifb, .vcs                                                           |
| Procedure Guide   | Process documentation                | .md, .txt, .docx                                                                  |
| API Data          | Structured API responses             | .json, .xml, .yaml, .yml                                                          |
| Presentation      | Slide-based content                  | .pptx, .key, .odp, .gslides                                                       |
| Unknown           | Unrecognized or unsupported formats  | (Any file type not explicitly supported by other types)                           |

## Notes
- The system will attempt to process any file type, but may have limited functionality for unsupported formats
- Some file types may be supported across multiple main types (e.g., .md for both Document and Procedure Guide)
- New file types can be added to the system through configuration updates

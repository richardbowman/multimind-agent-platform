---
agent: DocumentationSpecialist
title: "Artifact Types and Subtypes Guide"
---

# Artifact Types and Supported Subtypes

This guide outlines the main artifact types and their supported subtypes in the system.

## Supported Artifact Types and Subtypes

| Main Type         | Description                          | Supported Subtypes                                                                 |
|-------------------|--------------------------------------|------------------------------------------------------------------------------------|
| Spreadsheet       | Tabular data documents               | .xlsx, .csv, .ods, .numbers                                                       |
| Document          | Text-based documents                 | Webpage Summary, Research Report, Technical Specification, Business Plan, etc.    |
| Webpage           | Web content                          | .html, .htm, .mhtml, .webarchive                                                  |
| Diagram           | Visual representations               | .drawio, .vsdx, .vdx, .png, .svg, .jpg, .jpeg                                     |
| Calendar          | Scheduling and events                | .ics, .ical, .ifb, .vcs                                                           |
| Procedure Guide   | Process documentation                | .md, .txt, .docx                                                                  |
| API Data          | Structured API responses             | .json, .xml, .yaml, .yml                                                          |
| Presentation      | Slide-based content                  | .pptx, .key, .odp, .gslides                                                       |
| Unknown           | Unrecognized or unsupported formats  | (Any file type not explicitly supported by other types)                           |

## Document Subtypes

| Subtype                  | Description                                                                 |
|--------------------------|-----------------------------------------------------------------------------|
| Webpage Summary          | Summarized content extracted from web pages                                 |
| Research Report          | Detailed findings from research activities                                  |
| Technical Specification  | Detailed technical requirements and specifications                          |
| Business Plan            | Strategic document outlining business goals and strategies                  |
| Operational Guide        | Step-by-step instructions for operational processes                         |
| Policy Document          | Official rules and guidelines for organizational operations                 |
| Meeting Minutes          | Record of discussions and decisions made during meetings                    |
| White Paper              | Authoritative report on a specific topic or issue                           |

## Notes
- The system will attempt to process any file type, but may have limited functionality for unsupported formats
- Some file types may be supported across multiple main types (e.g., .md for both Document and Procedure Guide)
- New file types can be added to the system through configuration updates

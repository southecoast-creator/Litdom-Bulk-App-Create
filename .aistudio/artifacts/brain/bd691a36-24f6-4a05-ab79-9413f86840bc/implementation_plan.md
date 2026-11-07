# Litdom Batch Studio: Exact Visual Alignment & Full Workflow Implementation Plan

A comprehensive architectural and UI/UX overhaul to bring **Litdom Batch Studio** into 100% exact visual and functional alignment with the 20-page design mockups in `IMG_1495 (2).pdf` and the 115-page `MASTER APPLICATION BRIEF.pdf`.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed by the user in Phase 1 clarification:
> - **Visual Theme**: Full golden-yellow theme (`#E5B224` / `#F0BC28`) matching `IMG_1495 (2).pdf` across the Dashboard and Universal Editor viewports, paired with high-contrast black cards, headers, and floating docks.
> - **Document Workflow Pipeline**: Complete 27-style OpenXML parser and multi-step approval pipeline (`DOCX -> 27-style scan -> Initial Spreadsheet download -> Template upload -> Revised Spreadsheet upload -> Validation -> Placeholder preparation -> User Approval -> Match & Populate -> Editor`).
> - **Bottom Dock Transition**: Strict dynamic dock swap matching the reference screenshots—switching from the default 6-tool dock (`[Text] [Upload] [Fields] [Sync Layout] [+ Add] [More]`) to the selected-text toolbar (`[Edit (pencil)] [Text Styles] [Font] [Font size] [Color] [Effects] [Format]`) when any text element is tapped.

---

## 1. Overview & Core Concept

**Litdom Batch Studio** is a local-first, mobile-optimized batch design and digital publishing studio. It transforms documents, batch images, and spreadsheets into structured publications and graphic batches without cloud lock-in or subscription barriers.

### Key Value
- **Three Independent Workflows**: Document (DOCX OpenXML scan with adaptive spreadsheets), Image (batch upload with reusable layouts), and Spreadsheet (template population and plain-white document production).
- **Universal Editor**: Single shared canvas with Canva-style auto-fitting text boxes, horizontal thumbnail strip navigation, and full-fidelity export (CMYK PDF, high-res images, social media publishing).
- **Local-First Architecture**: 100% IndexedDB persistence with dynamic real-time storage calculations and zero cloud accounts.

---

## 2. User Experience & Visual Design

```
┌──────────────────────────────────────────────────────────────┐
│                    LITDOM BATCH STUDIOS                      │
│                [ Search here ...         🔍 ]                 │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Create a Project                                         │ │
│ │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │ │
│ │  │ [📄 DOCX]    │   │ [📷 Images]  │   │ [📊 Sheet]   │  │ │
│ │  │  Document    │   │    Images    │   │    Sheet     │  │ │
│ │  └──────────────┘   └──────────────┘   └──────────────┘  │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Your Projects                                            │ │
│ │  ┌──────────────┐   ┌──────────────┐                     │ │
│ │  │📁        ☰ │   │📁        ☰ │                     │ │
│ │  │  [Preview]   │   │  [Preview]   │                     │ │
│ │  │ Your Design 1│   │ Your Design 2│                     │ │
│ │  └──────────────┘   └──────────────┘                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Storage  Used: 250MB (red)  Available: 1GB (green)       │ │
│ │ [==================------------------------------------] │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Visual Identity & Theme
- **Dominant Canvas Background**: Warm golden-yellow (`#E8B82B` / `#F0BC28`) reflecting the visual reference in `IMG_1495 (2).pdf`.
- **Card & Component Surfaces**: Deep black/charcoal (`#111116` / `#16161D`) with subtle golden accent borders (`#D4AF37` / `#332B12`).
- **Typography**: Clean, robust hierarchy with `Plus Jakarta Sans` for UI labels, bold headers, and tabular numerals for storage and export metrics.
- **Top Bar (Screen 2)**:
  - Left: Circular Home button with house icon.
  - Center-Left: Undo & Redo arrow controls with hover/tap tooltips.
  - Center-Right: 3-bar hamburger button toggling the horizontal design thumbnail drawer.
  - Right: Download button (downward tray arrow) and Social Share button (upward tray arrow).
- **Design Canvas Container**:
  - Vertical card centered in viewport with rounded corners (`rounded-2xl`) and shadow.
  - Carousel navigation dots (`● ● ● ●`) positioned below canvas.
- **Dynamic Bottom Dock**:
  - **State A (Element Unselected)**:
    `[A Text]` `[📷 Upload]` `[📑 Fields]` `[🔄 Sync Layout]` `[+ Add]` `[🖋️ More]`
  - **State B (Text Box Selected)**:
    Selection boundary with 4 corner resize handles and 4 edge pill handles.
    Dock dynamically transforms into:
    `[✏️ Edit]` `[🖼️ Text Styles]` `[🪶 Font]` `[a Font size]` `[🎨 Color]` `[✨ Effects]` `[🔤 Format]`

---

## 3. Detailed Screen & Drawer Specifications (Matching IMG_1495 (2).pdf)

### 3.1 Top Navigation & Drawers
1. **Three-bar Horizontal Thumbnail Drawer (Page 18)**:
   - Slides smoothly from the top below the header.
   - Shows side-by-side design thumbnails (`Design 1`, `Design 2`, `Design 3`) with horizontal touch scrolling and tap-to-switch.
2. **Download Modal (Pages 6, 7, 8, 9)**:
   - **Format Selector**: `.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`.
   - **Image Mode**: Shows Size (e.g. `158px by 200px` with `[Edit]` button opening custom width/height modal), Quality (`Low`, `Medium`, `High`, `Limit` compression target), Page Selection (`Page + Current Page`, `All`, `Select` with thumbnail picker).
   - **PDF Mode**: Shows Settings `[Edit]` button opening PDF settings:
     - `Digital` (default ON)
     - `RGB` (mutually exclusive with Digital & CMYK)
     - `CMYK` (true CMYK separation)
     - `Flatten` (independent toggle)
     - `Crop Marks & Bleed` (independent toggle)
3. **Social Media Share Drawer (Page 10)**:
   - Upward arrow in top bar opens "Upload Directly to Social Media".
   - Supported platforms: Pinterest, LinkedIn, Twitter/X, WhatsApp, Substack, Medium, Reddit, Discord, Instagram, Facebook, Threads, Tumblr.
   - Design selection: Current Page, All, Custom.

### 3.2 Bottom Dock Panels
1. **Text Tool -> Add Panel (Page 17)**:
   - `[T Add Text Box]`
   - Default Text Styles: `Add a heading`, `Add Subheading`, `Add some body text`.
   - Extras: `Add Page Number`, `Add Table to Page`, `Add horizontal line`.
   - Font Combinations: Coordinated font presets with visual cards.
2. **Upload Tool (Page 12)**:
   - In-app file picker to upload foreground images/assets directly onto current design.
3. **Fields Panel (Page 13)**:
   - "CURRENT DESIGN TEXT" with `[+ Add Field]` button.
   - List of all mapped fields in design with `[✏️ Format Words]` button, text input, and delete icon.
4. **Sync Layout Panel (Page 14)**:
   - "Sync this Design's Layout with": `[This Page]`, `[All]`, `[Custom ⌵]` (multi-select modal).
   - "Sync Text Field's Layout": `[Select field ⌵]`, `[Sync with ⌵]`.
5. **Plus (+) Control: Spreadsheet Upload & Match (Page 16)**:
   - Dropzone: "Upload Your Spreadsheet".
   - Status indicators: "Spreadsheet Uploaded Successfully ✓", "Analysis & Fields Detected successfully! Ready to populate! ✓".
   - Primary action: `[Match & Populate]`.
   - Completion feedback: "Population successful! ✓".
6. **More Menu Drawer (Pages 19–20)**:
   - Design title with inline rename pencil.
   - Menu items: `See all Pages`, `Branding`, `Resize Design`, `Templates`, `Version History`, `Show Thumbnails`, `Add Charts`, `Add from projects`, `Delete` (red text & trash icon).

### 3.3 Selected-Text Formatting & Edit Pencil (Pages 11, 15)
1. **Selected-Text Main Toolbar**:
   - `Edit (pencil)`: Opens keyboard-based in-place editor with horizontal toolbar above keyboard.
   - `Text Styles`: Changes recognized style (Title, Heading 1-9, Subtitle, Normal Text, Quote).
   - `Font`: Sliding font drawer with search, custom font upload (`.ttf`/`.woff`), and weight expanders (`Light`, `Medium`, `Bold`).
   - `Font Size`: `-` / `+` step buttons and custom numeric input.
   - `Color`: Color swatches, HEX input, and multi-color gradient builder (linear & radial).
   - `Effects`: Presets (None, Shadow, Glow, Outline, Hollow, Echo, Glitch) + parameter sliders (intensity, offset, blur, color).
   - `Format`: Bold, Italic, Underline (with comfortable descender spacing), Alignment, Uppercase/Lowercase (`Aa`), Lists, Letter Spacing, Line Spacing.
2. **Edit (Pencil) Mode**:
   - Thin horizontally scrollable toolbar immediately above phone keyboard.
   - Word/letter selection formatting strictly targeted to highlighted spans.
   - Long press on `Aa` reveals Mixed Formatting (Title Capitalization).
   - Page-specific edits strictly confined to active page unless synced.

---

## 4. Technical Architecture & Complete Workflow Pipelines

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             LITDOM WORKFLOWS                                │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │                             │
       ┌────────────────┴───────────────┐             │
       ▼                                ▼             ▼
┌──────────────┐               ┌──────────────┐ ┌──────────────┐
│ WORKFLOW 1:  │               │ WORKFLOW 2:  │ │ WORKFLOW 3:  │
│ DOCX Parsing │               │ Image Batch  │ │ Spreadsheet  │
│ 27-Style Scan│               │ Reusable Lyt │ │ Templates    │
└──────┬───────┘               └──────┬───────┘ └──────┬───────┘
       ▼                              ▼                ▼
┌──────────────┐               ┌──────────────┐ ┌──────────────┐
│ Dynamic XLS  │               │ Auto Place-  │ │ Validate     │
│ Generation   │               │ holders      │ │ Columns &    │
└──────┬───────┘               └──────┬───────┘ │ Populate     │
       ▼                              ▼         └──────┬───────┘
┌──────────────┐               ┌──────────────┐        │
│ Template     │               │ "Apply Lyt   │        │
│ Images Upload│               │ to All"      │        │
└──────┬───────┘               └──────┬───────┘        │
       ▼                              ▼                │
┌──────────────┐               ┌──────────────┐        │
│ Revised XLS  │               │ Spreadsheet  │        │
│ Upload & Val │               │ Upload via + │        │
└──────┬───────┘               └──────┬───────┘        │
       ▼                              ▼                │
┌──────────────┐               ┌──────────────┐        │
│ Placeholder  │               │ Auto-        │        │
│ Prep & Apprv │               │ Population   │        │
└──────┬───────┘               └──────┬───────┘        │
       │                              │                │
       └──────────────────────┬───────┴────────────────┘
                              ▼
               ┌──────────────────────────────┐
               │   UNIVERSAL EDITING CANVAS   │
               │   - Dynamic Bottom Dock      │
               │   - Top Horizontal Strip     │
               │   - Word Formatting & Canvas │
               └──────────────┬───────────────┘
                              ▼
               ┌──────────────────────────────┐
               │        EXPORT ENGINE         │
               │ PNG/JPG/WebP · CMYK PDF ·    │
               │ Social Media Direct Handoff  │
               └──────────────────────────────┘
```

### 4.1 Document Workflow (27-Style OpenXML Engine)
- **Parser**: OpenXML `.docx` inspection parsing `word/document.xml` and `word/styles.xml`.
- **27 Standard Styles**: Title, Subtitle, Heading 1–9, Normal Text, Quote, Intense Quote, Block Text, Body Text 1–3, Body Text First Indent, Body Text Indent, Caption, Book Title, List Paragraph, List Number, List Bullet, Note Heading, Plain Text.
- **Occurrence Grouping**: Consecutive paragraphs sharing the same style are grouped into a single occurrence (`Normal Text - 1`, `Heading 1 - 1`). An intervening style creates a new occurrence.
- **Row Mapping**: Row 1 = Headers, Row 2+ = Page 1, Page 2, etc. Unused cells remain empty.
- **Lifecycle Sequence**:
  1. User uploads `.docx` -> Scan entire document.
  2. Generate and download initial Excel spreadsheet (`.xlsx`).
  3. User uploads template background images matching page count.
  4. User uploads revised spreadsheet.
  5. System validates structural differences (added/removed/renamed columns).
  6. Placeholders prepared on templates.
  7. User reviews placeholders and clicks **"Approve" / "Match and Populate"**.
  8. Content populated into Universal Editor.

### 4.2 Dashboard Project Card Menu
- 3-bar menu on each project card contains exactly 4 actions:
  1. `Download`: Opens the download modal.
  2. `Edit`: Opens Universal Editor.
  3. `Delete`: Deletes project and cleans up assets from IndexedDB, freeing storage.
  4. `Save as Template`: Saves background and text box structure into reusable template store for Spreadsheet workflow.

---

## 5. Implementation Phases & Verification Checklist

1. **Phase 1: Theme & Visual Alignment** [COMPLETED]
   - Updated `src/index.css` and layout wrappers to match the golden-yellow reference background (`#E5B224`) with black rounded cards.
   - Refactored `src/components/Dashboard.tsx` to match Page 1 of `IMG_1495 (2).pdf` (LITDOM BATCH STUDIOS header, Search here bar, 3 upload cards, project cards with 4-item menu, and honest storage indicators).
2. **Phase 2: Universal Editor Navigation & Dynamic Dock** [COMPLETED]
   - Updated `src/components/Workspace.tsx` top navigation: circular Home button, Undo/Redo controls with tooltips, top 3-bar button toggling the horizontal design thumbnail strip, Download, and Share buttons.
   - Implemented strict dynamic bottom dock swap:
     - Unselected: `[A Text]` `[📷 Upload]` `[📑 Fields]` `[🔄 Sync Layout]` `[+ Add]` `[🖋️ More]`.
     - Selected: `[✏️ Edit]` `[🖼️ Text Styles]` `[🪶 Font]` `[a Font size]` `[🎨 Color]` `[✨ Effects]` `[🔤 Format]`.
   - Updated canvas bounding box with 4 corner circular handles and 4 edge midpoint pill handles.
3. **Phase 3: Modal Sheets & Drawers** [COMPLETED]
   - Implemented Download Sheet with `.png`/`.jpg`/`.jpeg`/`.webp`/`.pdf` switching, Size Edit modal (width/height), and PDF settings (Digital, RGB, true CMYK separation, Flatten, Crop Marks & Bleed).
   - Implemented Social Media Share drawer with 12 platforms (Pinterest, LinkedIn, Twitter/X, WhatsApp, Substack, Medium, Reddit, Discord, Instagram, Facebook, Threads, Tumblr).
   - Implemented Sync Layout modal (`Sync this Design's Layout with` [This Page, All, Custom] and `Sync Text Field's Layout`).
   - Implemented Text Tool Add panel (`T Add Text Box`, Heading, Subheading, Body, Page Number, Table, Horizontal Line, Font Combinations).
   - Implemented More Menu drawer (Title rename pencil, See all Pages, Branding, Resize Design, Templates, Version History, Show Thumbnails, Add Charts, Add from projects, Delete).
4. **Phase 4: Full 27-Style Document Workflow** [COMPLETED]
   - Built `src/utils/docxParser.ts` for OpenXML structure extraction, 27 standard style mapping, occurrence grouping, and dynamic `.xlsx` generation.
   - Implemented multi-step Document Workflow modal (`DocxWorkflowModal.tsx`): Upload DOCX -> Scanning & Detection -> Initial XLS download -> Template upload -> Revised XLS upload & validation -> Placeholder preparation -> User Approval -> Auto-Population into Universal Editor.
5. **Phase 5: Template Management & Quality Verification** [COMPLETED]
   - Implemented "Save as Template" action on Dashboard cards and template store in IndexedDB (`saved_templates`).
   - Ran unit test suite (`npx tsx test/unit_tests.ts`): all 18 test suites passing 100%.
   - Ran `compile_applet` and `lint_applet` checks: clean pass with zero errors.
   - Dev server running smoothly on port 3000.

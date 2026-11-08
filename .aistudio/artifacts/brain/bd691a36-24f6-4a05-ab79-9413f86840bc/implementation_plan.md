# Litdom Batch Studio: Comprehensive Bug Fix & Feature Enhancement Plan

## 1. Problem Statement
The user has provided two authoritative reference documents:
- **`DOCUMENT 1: Litdom_Batch_Studio_Visual_Reference.pdf`** (Annotated screenshots for each issue).
- **`DOCUMENT 2: Litdom_Batch_Studio_Correction_Specification.docx`** (Written technical requirements for BUG-001 through BUG-013 and ENHANCEMENT-001 through ENHANCEMENT-003).

The implementation requires strictly addressing all 16 items in numerical order while maintaining full non-regression across DOCX OpenXML 27-style parsing, local IndexedDB persistence, custom font handling, responsive canvas scaling, and high-fidelity multi-format exports.

---

## 2. User Preferences & Clarifications Applied
1. **Storage Calculation Baseline**: Dedicated **2 GB** app quota baseline (`2,147,483,648 bytes`). Used storage calculates total project data, uploaded background images, custom fonts, templates, and documents accurately without double-counting on project re-opening.
2. **Shape Initial Dimensions**: Centered at **25% canvas width** with matching proportions (e.g., 250×250 px on a 1000×1000 canvas) with solid black `#000000` fill.
3. **Quick-Action Toolbar Placement**: Centered **directly underneath the selected text/shape box** with 4 clean SVG icon buttons: Duplicate, Delete, Nudge (drag/move mode toggle), and Rotate.
4. **Icons**: Replace all emojis in menus and download sheets with clean Lucide SVG icons.
5. **Dual-Mode Text Editing**: Direct on-canvas keyboard editing with native selection (no artificial multi-word or range buttons), accompanied by a bottom keyboard toolbar with Aa case conversion (Lowercase, Uppercase, Mixed Case).

---

## 3. Step-by-Step Implementation Map

### PART A: BUG FIXES (Strict Numerical Order)

#### **BUG-001 & ENHANCEMENT-001: Storage Calculation & Monitoring**
- **Files**: `src/utils/db.ts`, `src/components/Dashboard.tsx`
- **Requirements**:
  - Accurate calculation of bytes used across IndexedDB stores (`projects`, `templates`, `fonts`, `assets`).
  - Baseline quota: 2.00 GB.
  - Display mathematically accurate values: Used (e.g. `12.4 MB`), Remaining (e.g. `1.98 GB / 2.00 GB`), and real-time percentage progress bar.
  - Reopening projects must never duplicate or double-count storage.
  - Deleting a project, page, or template immediately frees storage.

#### **BUG-002: Remove Bottom Page-Indicator Dots on Dashboard**
- **Files**: `src/components/Dashboard.tsx`
- **Requirements**:
  - Remove the 4 bottom circular page dots completely from the Dashboard view.

#### **BUG-003, ENHANCEMENT-002 & ENHANCEMENT-003: Project Action Menu & Template Management**
- **Files**: `src/components/Dashboard.tsx`, `src/utils/db.ts`
- **Requirements**:
  - Fix menu clipping/overflow on mobile and desktop using a high z-index floating portal or fixed placement.
  - Replace all emojis with crisp Lucide SVG icons:
    - Edit: `Edit3`
    - Download: `Download`
    - Save as Template: `Bookmark`
    - Remove from Template: `BookmarkX` / `XCircle`
    - Delete: `Trash2`
  - Implement **"Remove from Template"**:
    - Deletes entry from `saved_templates` store while keeping the project in `projects`.
    - If project is not saved as a template, show an informative toast/message without deleting the project.

#### **BUG-004: Remove Redundant Top Oval Design-Number Tab**
- **Files**: `src/components/Workspace.tsx`
- **Requirements**:
  - Remove the horizontal oval tab (`Design X of Y` with `<` and `>`) from the center top navigation bar.

#### **BUG-005: Horizontal Touch-Swipe Navigation & 3-Circle Indicator**
- **Files**: `src/components/Workspace.tsx`
- **Requirements**:
  - Horizontal touch-swipe gesture support between designs on the canvas area.
  - Bottom 3-circle progress indicator: exactly 3 dots representing Relative Progress (Beginning = Dot 1 active, Middle = Dot 2 active, End = Dot 3 active), scaling cleanly regardless of total page count (works for 3, 8, 15+ pages).
  - Syncs smoothly with the top horizontal thumbnail strip.

#### **BUG-006: Text Tab vs Plus (+) Tab Interface Assignment**
- **Files**: `src/components/Workspace.tsx`, `src/components/AddPanelModal.tsx`
- **Requirements**:
  - Move the text element creation panel (Add Text Box, Heading, Subheading, Body, Page Number, Table, Horizontal Line, Font Combinations) from the Plus button to the **Text [A]** tab on the bottom dock.
  - Include built-in font combinations ("Aesthetic", "Now Open") and support uploading custom font combinations (`.json`, `.ttf`, `.otf`).

#### **BUG-007: Plus (+) Tab Becomes Shape-Insertion Tool**
- **Files**: `src/components/Workspace.tsx`, `src/types/index.ts`, `src/utils/canvasEngine.ts`
- **Requirements**:
  - Tapping **[+ Add]** opens a dedicated Shape Selection Panel: Rectangle, Square, Circle, Triangle, Star.
  - Inserts the selected shape into the **current active design only**.
  - Default size: centered at 25% canvas width with default solid black `#000000` fill.
  - Shapes are selectable, movable, resizable via corner/side handles, rotatable, and rendered in previews and exports.

#### **BUG-008: Uploaded Images Inserted as Canvas Overlays (Not New Pages)**
- **Files**: `src/components/Workspace.tsx`, `src/types/index.ts`, `src/utils/canvasEngine.ts`
- **Requirements**:
  - Uploading an image via the Upload tab inserts it as an editable overlay element on the **current active design only**.
  - Does NOT create a new page and does NOT replace the design's background image.
  - Image overlays can be moved, scaled, duplicated, deleted, and exported.

#### **BUG-009: Sync Layout & Sync Text Field Functionality & Interface**
- **Files**: `src/components/SyncLayoutModal.tsx`, `src/components/Workspace.tsx`
- **Requirements**:
  - Structure into two completely independent, distinct sections:
    1. **Section 1: "SYNC THIS DESIGN'S LAYOUT"**
       - Destination options: This Page (default), All, Custom.
       - Custom destination displays visual page thumbnails with checkboxes.
       - Action button: **"SYNC DESIGNS LAYOUT"**.
    2. **Section 2: "SYNC TEXT FIELDS LAYOUT"**
       - Field selector: multiselect checkboxes of available fields.
       - Destination options: This Page, All, Custom with thumbnail selector.
       - Action button: **"SYNC TEXT FIELD"**.
  - **Fidelity Rule**: Copies positions, font families, sizes, colors, outlines, and effects without altering destination text strings or producing unintended red/broken styling.

#### **BUG-010: Download SVG Icons & Complete Multi-Format Export**
- **Files**: `src/components/DownloadSheet.tsx`, `src/utils/downloadEngine.ts`
- **Requirements**:
  - Replace dropdown emojis with clean Lucide SVG icons for PNG, JPG, WebP, PDF.
  - Ensure 100% layer fidelity during export: all text formats, word styles, shapes, tables, horizontal lines, and image overlays render crisply onto the export canvas without clipping or missing layers.

#### **BUG-011: Text Box Resizing, Scaling, Movement & Rotation Controls**
- **Files**: `src/components/Workspace.tsx`, `src/utils/canvasEngine.ts`
- **Requirements**:
  - **Middle oval handles**: Adjust box width with automatic text wrapping, without changing font size.
  - **Corner circular handles**: Scale text font size proportionally without resetting box width.
  - **Contextual quick-action toolbar**: Docked centered directly beneath the selected box with 4 SVG icons:
    - Duplicate (`Copy`)
    - Delete (`Trash2`)
    - Nudge / Drag Move (`Move`)
    - Rotate (`RotateCw`) with live degree badge (0°, 45°, 90°, 180°, etc.) and alignment guides.

#### **BUG-012 & ENHANCEMENT-03: Dual-Mode Text Editing & Shared Font Library**
- **Files**: `src/components/Workspace.tsx`, `src/components/RichTextOverlay.tsx`, `src/utils/fontManager.ts`
- **Requirements**:
  - **Mode A (Whole Box)**: Bottom dock displays Edit, Style, Font, Size, Color (with gradient support), Effects (smooth outline, shadow, blur, opacity without jagged artifacts), Format (alignments, bold, italic, underline, line spacing, letter spacing, bullets, and bottom 4-directional Nudge arrows).
  - **Mode B (In-Text Direct Canvas Editing)**:
    - Tapping Edit enables direct on-canvas editing.
    - Remove artificial multi-word/range selection buttons (`Select All`, `Select Range`, `Multi-Word`).
    - Fixed horizontal keyboard toolbar above the native mobile keyboard with: Bold, Italic, Underline, Font, Size, Aa case conversion (Lowercase, Uppercase, Mixed Case), Word Effects, and Done button.
  - **Shared Font Library**: Fonts uploaded in Mode A or Mode B are saved to IndexedDB and immediately available across both modes.

#### **BUG-013: Prevent Freezing, Persistent Loading Studio, and Memory Cleanup**
- **Files**: `src/components/Workspace.tsx`, `src/utils/db.ts`
- **Requirements**:
  - Eliminate persistent "Loading Studio..." state after saving large documents.
  - Implement a safety timeout recovery (auto-clear loading state if idle > 5s).
  - Revoke object URLs and clear in-memory image buffers upon component unmount or project transitions.

---

### PART B: EXISTING FEATURE ENHANCEMENTS
- **ENHANCEMENT-001**: Integrated seamlessly into BUG-001 (Storage capacity tracking & visual indicators).
- **ENHANCEMENT-002**: Integrated seamlessly into BUG-003 ("Remove from Template" action with store separation).
- **ENHANCEMENT-003**: Integrated seamlessly into BUG-003 (Replacement of emojis with SVG icons in action menus).

---

## 4. Verification & Testing Strategy
1. **Unit Testing**: Run existing test suite (`test/unit_tests.ts`) and add tests for shape rendering, storage calculation, and dual-mode text editing.
2. **Compilation & Linting**: Run `compile_applet` and `lint_applet` to ensure zero TypeScript errors or broken imports.
3. **Interactive Validation**:
   - Verify storage numbers match mathematically against the 2 GB quota.
   - Verify shape insertion at 25% canvas width and overlay image placement.
   - Test Sync Layout with custom thumbnail picker without changing text content.
   - Test canvas export across PNG, JPG, WebP, and PDF with shapes and overlays present.
   - Test dual-mode text formatting, case conversions, and precision nudge controls.

# Rebuild Litdom Batch Studio: Streamlined Spreadsheet Design Studio

Litdom Batch Studio is being rebuilt into a simple, lightning-fast, spreadsheet-driven batch design population tool tailored for mobile Android use and desktop workflows. The architecture eliminates multi-tab complexity in favor of two focused screens: a Project Dashboard and a Unified Workspace featuring an always-visible thumbnail carousel, shared layout template, instant spreadsheet mapping, on-canvas drag editing, and high-resolution export.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> All primary requirements and Phase 1 clarifying preferences have been incorporated into this architectural blueprint:

- **Legacy Project Migration**: Previous projects saved in older multi-box formats will be upgraded automatically upon opening into the unified shared-template model without data loss.
- **Mobile Ergonomics**: On smartphone portrait viewports, the canvas remains prominent while Text Field Editors and the Style Panel dock into an expandable, touch-friendly bottom drawer with thumb-zone controls.
- **Export Standards**: High-resolution PNG is the default export format for maximum typographic sharpness; high-speed ZIP archives use standard `STORE` compression with yields to prevent UI freezing.
- **Simplified Two-Screen Model**: Eliminates the 7-tab navigation bar, sample project suites, and modal barriers to deliver a direct, Canva/Adobe Express caliber creative tool.

---

### 1. Overview & Core Concept

- **What It Does**: Enables creators to upload dozens or hundreds of design background images, map a single shared typography template (Title, Subtitle, Paragraph 1, CTA, and custom fields), and instantly populate every design from a CSV or XLSX spreadsheet in one step.
- **Target Audience & Context**: Creators and brand operators on Android mobile phones or desktop browsers who need to produce large batches of branded social graphics, luxury announcements, quotes, or product slides in seconds without manual copy-pasting.
- **Key Value**: 100% private, client-side, zero runtime AI or server costs, resilient IndexedDB storage, and instant visual feedback with zero latency.

---

### 2. User Experience & Visual Design

#### Screen 1: Dashboard
- **Clean Luxury Obsidian & Gold Posture**: Header with Litdom wordmark, active storage indicator (`3.4 MB used`), and a prominent **New Project** creation input.
- **Project Grid / Cards**: Displays project name, creation date, design count, and quick actions (**Open Workspace**, **Rename**, **Delete with In-App Confirmation Modal**).
- **Direct Workspace Transition**: Creating a new project opens the workspace immediately without unnecessary intermediate screens.

#### Screen 2: Unified Workspace (Single Screen, Zero Tabs)
- **Top App Bar**:
  - `[← Back to Projects]` | `Project Name (Inline Edit)` | `Save Status Indicator (Saved / Saving / Not saved)` | `[Spreadsheet Button]` | `[Download Button]`
- **Design Viewport & Canvas**:
  - Center stage responsive canvas rendering the active design with screen-resolution caching for smooth 60fps interaction.
  - On-canvas pointer events (`touch-action: none`) for direct box dragging and selection.
  - Quick pagination controls: `◀ Design 3 of 10 ▶` with direct index jump.
- **Text & Style Panels (Dual Mode: Desktop Sidebar / Mobile Expandable Drawer)**:
  - **Text Field Editors**: Direct text inputs for each template field (`Title`, `Subtitle`, `Paragraph 1`, `CTA`, etc.) for the active design page. Edits update the active page's text values immediately.
  - **Style Inspector**: Affects the **shared project template** across all pages. Features font selector (built-in curated fonts + custom font upload), font size steppers (`[-] [48px] [+]`), weight toggles, italic, alignment (left/center/right/justify), text color, line height, letter spacing, box width% / height%, and optional text shadow/stroke/fill.
  - **Field Management**: Add new fields directly (`Headline`, `Paragraph 2`, `Footer`, or custom names).
- **Always-Visible Bottom Thumbnail Strip**:
  - Horizontal scroller pinned to the bottom displaying high-contrast ~220px JPEG thumbnails of all designs in the project.
  - One-tap page switching; active thumbnail highlighted with a gold border; drag-or-click file upload triggers for "Batch upload (many designs)" and "Single upload".
- **Bottom Sheets**:
  - **Spreadsheet Sheet**: Instant file dropper (CSV/XLSX), row count reconciliation ("10 designs · 10 rows" or discrepancy notices), auto-mapped column selectors, and unused column chips to add text boxes on the fly.
  - **Download Sheet**: Format toggle (PNG / JPG), export scope ("This design" or "All designs (ZIP)"), real-time progress bar ("Creating 4 of 10..."), and auto-cleanup.

---

### 3. Key Product Decisions & Trade-Offs

#### 1. Shared Template Model vs. Per-Page Individual Boxes
- **Approach**: Projects hold **one shared template** of text box definitions (`TextBoxTemplate[]`), while each design page stores only `{ id, imageId, name, width, height, values: Record<fieldLabel, string> }`.
- **Why**: Allows users to tweak layout, font size, or alignment once, and have it immediately reflect across 50+ designs. Eliminates layout divergence and reduces project JSON storage by >90%.
- **1000px Scaling Baseline**: Font sizes are authored against a standard 1000px design width and proportionally scaled to each image's native dimensions (`fontSize = templateSize * (imageWidth / 1000)`), making mixed aspect ratios and resolutions render proportionally.

#### 2. IndexedDB Blob Image Storage vs. Base64 Project Bloat
- **Approach**: Dedicated `images` object store holding binary image `Blob` objects and lightweight ~220px JPEG thumbnails. Project records store only metadata and text values.
- **Why**: Storing base64 strings in localStorage or JSON crashes browser memory on 10+ high-res images. IndexedDB Blobs allow hundreds of designs with near-zero RAM footprint, using temporary Object URLs (`URL.createObjectURL`) revoked upon unmount.

#### 3. Instant Population with Alphanumeric & Positional Auto-Mapping
- **Approach**: The moment a CSV or XLSX is dropped, SheetJS parses UTF-8 text (preserving emojis, symbols, and accented characters) or ArrayBuffers. The engine normalizes headers (`CTA`, `Button`, `Action` -> `CTA`; `Title`, `Headline`, `Header` -> `Title`) and falls back to column index order if no header matches.
- **Feedback & Sync**: Designs are populated immediately without an extra confirmation button. When row counts mismatch, clear warnings explain the delta, and an "Add N designs (copy of last)" action handles surplus data.

#### 4. Asynchronous High-Resolution Export with True Font Preloading
- **Approach**: Canvas export renders each design at 100% full original resolution using `document.fonts.load()` for exact typography weights before `ctx.drawImage()`, yielding execution to the browser (`setTimeout(..., 0)`) between pages to keep the UI responsive, and packing into ZIP with `STORE` compression.

---

### 4. Technical Architecture & Data Strategy

#### System & Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LITDOM BATCH STUDIO                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
┌───────────────────────┐                             ┌───────────────────────┐
│      DASHBOARD        │                             │   UNIFIED WORKSPACE   │
│ - New Project Form    │                             │ (Single View Screen)  │
│ - Project List Cards  │                             └───────────┬───────────┘
│ - In-App Delete Modal │                                         │
│ - Storage Quota Bar   │          ┌──────────────────────────────┼──────────────────────────────┐
└───────────┬───────────┘          ▼                              ▼                              ▼
            │            ┌───────────────────┐          ┌───────────────────┐          ┌───────────────────┐
            │            │   TOP APP BAR     │          │   CANVAS VIEW     │          │  PANEL CONTROLS   │
            │            │ - Back to Dash    │          │ - 60fps Cached    │          │ - Text Field Edits│
            │            │ - Project Title   │          │   Preview Canvas  │          │ - Shared Style Bar│
            │            │ - Save Indicator  │          │ - Touch Drag Move │          │ - Add/Remove Field│
            │            │ - Sheets Triggers │          │ - Paginate ◀ N ▶  │          └───────────────────┘
            │            └───────────────────┘          └───────────────────┘                    │
            │                                                     │                              │
            │                                                     ▼                              ▼
            │                                   ┌───────────────────────────────────┐  ┌───────────────────┐
            │                                   │    BOTTOM THUMBNAILS CAROUSEL     │  │  BOTTOM SHEETS    │
            │                                   │ - Always-Visible Strip (~220px)   │  │ - Spreadsheet Pop │
            │                                   │ - Active Highlight & Quick Jump   │  │ - PNG/ZIP Export  │
            │                                   │ - Batch & Single Upload Dropzone  │  └───────────────────┘
            │                                   └───────────────────────────────────┘
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATA PERSISTENCE & ENGINE                            │
│  IndexedDB Database: "litdom_batch_studio_v2"                               │
│  ├── Store "projects": Lightweight project metadata, templates & values     │
│  └── Store "images": Binary Blobs (original image + 220px JPEG thumbnail)   │
│  Core Engine:                                                               │
│  ├── spreadsheetEngine.ts: UTF-8 / XLSX parser, alias matching, order map   │
│  ├── canvasEngine.ts: Scaled rendering, font preloader, text wrap, export  │
│  └── migration.ts: Automatic upgrade from legacy multi-box format           │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Core Data Entities (`src/types.ts`)

```typescript
export interface TextBoxTemplate {
  fieldLabel: string;      // e.g. "Title", "Subtitle", "Paragraph 1", "CTA"
  x: number;               // percentage 0 - 100
  y: number;               // percentage 0 - 100
  width: number;           // percentage 0 - 100
  height: number;          // percentage 0 - 100
  fontFamily: string;      // e.g. "Plus Jakarta Sans", "Cinzel"
  fontSize: number;        // authored for 1000px wide design
  fontWeight: '400' | '500' | '600' | '700' | '800';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: string;           // hex code, e.g. "#FFF8E7"
  lineHeight: number;      // e.g. 1.25
  letterSpacing: number;   // e.g. 0 or 2
  padding?: number;        // in px (scaled)
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  stroke?: { color: string; width: number };
  fill?: { color: string; opacity: number };
}

export interface DesignPage {
  id: string;
  imageId: string;         // key in IndexedDB "images" store
  name: string;
  width: number;           // original px width
  height: number;          // original px height
  values: Record<string, string>; // fieldLabel -> text content
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  template: TextBoxTemplate[];
  pages: DesignPage[];
  lastSpreadsheetData?: {
    filename: string;
    headers: string[];
    rows: Record<string, string>[];
    mappings: Record<string, string>; // fieldLabel -> column header
  };
}
```

#### Verification & Automated Test Plan
1. **Spreadsheet Engine Unit Tests**:
   - Header normalization and alias matching (`Headline` -> `Title`, `Button` -> `CTA`).
   - Positional column fallback when headers don't match.
   - Exact 10 rows -> 10 designs population.
   - Fewer rows than designs (unmapped pages left unchanged).
   - More rows than designs (excess rows reported cleanly).
   - Empty cell preservation (no data leakage across rows).
   - CSV with emojis, quotes, and accented UTF-8 characters.
   - Binary Excel (.XLSX) workbook parsing.
2. **Persistence & Image Store Tests**:
   - Storing image Blobs in IndexedDB and generating clean object URLs.
   - Project auto-save debouncing (~600ms) and `pagehide` persistence.
   - Automatic migration of legacy v1 projects into the shared-template structure.
3. **Canvas & Export Verification**:
   - Canvas proportional font scaling based on `width / 1000`.
   - Font preloading check (`document.fonts.load`).
   - High-resolution PNG and sequential ZIP file naming (`001-title-words.png`).

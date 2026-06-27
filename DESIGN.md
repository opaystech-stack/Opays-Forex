# OpaysFox Design System

This document specifies the design system, brand identity, CSS tokens, and component layout guidelines for **OpaysFox** (inspired by the Behance "Shopall" layout and Google Maps mobile ergonomics).

---

## 1. Core Visual Concept
*   **Theme**: Strict Light Theme by default for all workspaces, including the Landing Page, Authenticated Workspace, and Administration Consoles.
*   **Ergonomics**: Google Maps mobile style layout.
    *   **Background Canvas**: Treasury Net Worth and wallets grid rendered in a 2-column rectangular layout.
    *   **Floating search bar & suggestion pills**: Floating overlay at the top.
    *   **Sliding Bottom Sheet**: High-end bottom sheet containing details, history, and workspace controls.
    *   **4-Tab Bottom Navigation**: Clean navigation with a central "+" action button.
    *   **WhatsApp FAB**: Circular action badge button with pending drafts count.

---

## 2. Design Tokens & CSS Variables

All components must strictly adhere to the following color tokens defined in the `:root` selector of the project.

### A. Brand Colors (Indigo)
*   `--indigo`: `#5B5BD6` (Default brand accent)
*   `--indigo-strong`: `#4F46E5` (Active buttons, primary focus, interactive hover states)
*   `--indigo-deep`: `#4338CA` (Pressed states, deep visual weight headers)
*   `--indigo-soft`: `rgba(99, 102, 241, 0.10)` (Backgrounds for badges, active tabs, container accents)
*   `--indigo-border`: `rgba(99, 102, 241, 0.22)` (Border outlines for soft components)

### B. Functional Colors
*   `--color-green`: `#15803D` (Positive indicators, completed transactions, profit gains)
*   `--color-red`: `#DC2626` (Negative indicators, cancelled/rejected states, losses)
*   `--color-orange`: `#C2410C` (Warning indicators, outstanding debts, manual overrides)

### C. Backgrounds and Borders
*   `--bg-light`: `#F1F5F9` (Application workspace background - soft slate grey)
*   `--card-bg`: `#FFFFFF` (Card panels and container surfaces - white)
*   `--border-color`: `#E2E8F0` (Default separation lines and outlines)

### E. Typography
*   **Font Families**: 
    *   `'Space Grotesk'` (headings, currency totals, prominent metrics)
    *   `'Inter'` (body text, lists, navigation elements)
*   **Font Weights**:
    *   `400` (Regular)
    *   `600` (Medium/Semi-bold)
    *   `700` / `800` (Bold/Extra-bold for financial amounts)

---

## 3. Component Style Specifications

### A. Cards & Panels (`.card`)
Cards must feel light and float above the slate background.
*   **Border Radius**: `17px` / `18px` (slightly rounded for a modern Fintech feel).
*   **Borders**: `1px solid var(--border-color)`.
*   **Shadows**: Soft, deep shadow to simulate depth:
    ```css
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.06);
    ```
*   **Hover States**: Enhance shadows on hover for interactive elements:
    ```css
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.07), 0 16px 40px rgba(15, 23, 42, 0.11);
    transform: translateY(-1px);
    ```

### B. Status Badges (`.status-pill` & `.badge`)
Status indicators use pill-shaped badges with a left-aligned colored indicator dot:
*   **Completed / Validated**: Green text, light green background, light green border.
*   **Pending / En Attente**: Amber text, light amber background, light amber border.
*   **Cancelled / Rejected**: Red text, light red background, light red border.
*   **Draft / Import**: Slate grey text, light grey background, light grey border.

---

## 4. Mobile Ergonomics Layout (Google Maps Style)

### A. Background Canvas
Consolidated balance and a 2-column clean grid of wallet cards.
```css
.canvas-background-wrapper {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow-y: auto;
  padding-top: 88px;
  background-color: var(--bg-light);
}
```

### B. Floating Search Bar & Pills
A floating search bar at the top with dynamic suggestion pills scrolling horizontally below it.
```css
.floating-searchbar-container {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 30;
}
```

### C. Sliding Bottom Sheet
Slides up from the bottom on mobile (using Framer Motion spring physics) with a grab handle and scrollable detail view.
```css
.bottom-sheet-container {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 45;
  height: 72vh;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
}
```

### D. WhatsApp FAB
FAB green badge button for WhatsApp drafts that floats on the bottom right above the navigation bar.
```css
.whatsapp-fab {
  position: absolute;
  bottom: calc(var(--navbar-height) + 16px + env(safe-area-inset-bottom, 0px));
  right: 16px;
  z-index: 35;
}
```

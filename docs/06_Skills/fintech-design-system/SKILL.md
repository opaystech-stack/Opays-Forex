---
name: fintech-design-system
description: Guidelines for implementing the premium Behance "Shopall" inspired Fintech design system. Use when modifying UI styles, creating cards, layout grids, buttons, or status badges to ensure pixel-perfect consistency across pages.
---

# Fintech Design System (Shopall Inspired)

## Overview

This skill defines the specifications, tokens, and visual guidelines for the **OpaysFox** premium Fintech design system. Inspired by the Behance "Shopall" UI, it enforces a clean, light-themed, indigo-accented layout, optimized for high readability, premium micro-interactions, and mobile-first responsiveness.

---

## 1. Color Palette & CSS Tokens

All components must strictly use the CSS variables defined in the base layer of [src/index.css](file:///c:/LAPOSTE/Projets/FOREX/src/index.css#L5-L40). Do **not** hardcode raw hex, HSL, or RGB colors in JSX styles.

### A. Theme Accents (Indigo)
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

---

## 2. Component Design Specifications

### A. Cards & Panels (`.card`)
Cards must feel light and float above the slate background. They should follow these properties:
*   **Border Radius**: `17px` (slightly rounded for a modern Fintech feel).
*   **Borders**: `1px solid var(--border-color)` (light hairline border).
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
Status indicators must not contain raw text color mixes. They should be styled as pill-shaped badges with a **left-aligned colored indicator dot** using `::before`:
```css
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
}
.status-pill::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
```
*   **Completed / Validated**: Green text, light green background, light green border.
*   **Pending / En Attente**: Amber text, light amber background, light amber border.
*   **Cancelled / Rejected**: Red text, light red background, light red border.
*   **Draft / Webhook import**: Slate grey text, light grey background, light grey border.

---

## 3. Responsive Layout Guidelines

OpaysFox is a PWA that operates primarily on mobile phones but scales gracefully to large desktop screens.

```
+-------------------------------------------------------------+
| Desktop Layout (>= 900px)                                   |
| +---------+ +---------------------------------------------+ |
| | Sidebar | | Header (USD Consolidated + Profile + Settings) | |
| |         | +---------------------------------------------+ |
| | (Indigo | | Page Content Workspace                      | |
| |  active | |                                             | |
| |   tabs) | |                                             | |
| +---------+ +---------------------------------------------+ |
+-------------------------------------------------------------+
| Mobile Layout (< 900px)                                     |
| +---------------------------------------------------------+ |
| | Header (Consolidated Balance + Settings FAB)             | |
| +---------------------------------------------------------+ |
| | Page Content Workspace (1 Column grid / List layouts)   | |
| +---------------------------------------------------------+ |
| | Navigation Bar (Bottom fixed, position: fixed)          | |
| +---------------------------------------------------------+ |
+---------------------------------------------------------+
```

### A. Mobile Viewports (< 900px)
*   **Bottom Navigation**: Fixed at `bottom: 0`, full width, styled with background blur or solid card-white.
*   **Lists**: Vertical cards stack with 10px spacing.
*   **Grid layout**: Single-column view for KPI stats and tables.

### B. Desktop Viewports (>= 900px)
*   **Sidebar Navigation**: Fixed left-side vertical panel.
*   **KPI Grids**: 4-column layout for summary stats.
*   **Double Column**: Charts and primary workspaces split in a `2fr 1fr` or `1fr 1fr` grid template.

---

## 4. UI Implementation checklist for Developers/Agents

When creating new pages (`Employes`, `Transferts`, `Abonnements`) or refactoring existing ones:

1.  `[ ]` **No Hardcoded Hex Colors**: Use `var(--indigo-strong)`, `var(--text-primary)`, etc.
2.  `[ ]` **Consistent Typography**: Use font weights `500` (Medium) for body/text and `700`/`800` (Bold) for financial amounts.
3.  `[ ]` **Interactive Affordance**: Ensure buttons (`.btn-primary`, `.btn-outline`) have active hover-scale transitions.
4.  `[ ]` **Accessibility (WCAG 2.1)**: Keep high contrast ratio (>= 4.5:1) on text elements.
5.  `[ ]` **State Loaders**: Always include skeleton screens or custom spinner loaders (using the active indigo color) to prevent layout shifts during fetches.

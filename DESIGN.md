---
version: alpha
colors:
  background: "#313131"
  surface: "#3d3d3d"
  primary: "#B9FD50"
  foreground: "#f7f7f7"
  muted: "#d0d0d0"
  error: "#ffb9ae"
typography:
  body:
    fontFamily: "Arial, sans-serif"
    fontSize: 15px
    lineHeight: "1.5"
  title:
    fontFamily: "Arial, sans-serif"
    fontSize: 17px
rounded:
  panel: 22px
  button: 12px
spacing:
  unit: 4px
components:
  launcher:
    rounded: 50px
---

## Overview

Product register: discreet personal correspondence with Alexander, a marketer. Explicit brief controls palette. The lime initial А is the single signature; no decorative motion, photos or third-party branding. No sibling UI existed.

## Colors

Runtime owner: public/widget.js Shadow DOM stylesheet. Background maps to --bg, surface to --panel, primary to --accent, muted to --muted, error to --error. Light text and readable secondary text on charcoal. Primary button text #20251a. One dark theme.

## Typography

Arial supports Cyrillic without remote fonts or layout shifts. Titles 17px bold, body 15px, input 16px, metadata 11px. The demo uses a larger display scale outside the product.

## Layout

390px panel on desktop, viewport minus 24px on narrow phones. Internal history scroll. Compact launcher remains at bottom right; visualViewport and safe areas account for keyboard geometry.

## Elevation & Depth

One shadow for the floating panel. No shadows on messages.

## Shapes

22px panel, 12px controls, directional message corners. Own messages align right.

## Components

Shadow root owns all controls and scrollbar styling. Native buttons, labelled inputs, textarea, non-modal conversation drawer. Live status and failed-message retry actions.

## Do's and Don'ts

Russian, formal вы. No long dash in UI. No online claim, automatic opening or promised response time. No HTML rendering of visitor, Telegram or form content. Focus stays visible. No motion to disable.

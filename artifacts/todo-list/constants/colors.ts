/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#28241F',
    tint: '#D96B45',

    // Core surfaces
    background: '#F7F4ED',
    foreground: '#28241F',

    // Cards / elevated surfaces
    card: '#FFFEFA',
    cardForeground: '#28241F',

    // Primary action color (buttons, links, active states)
    primary: '#D96B45',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#EEE8DD',
    secondaryForeground: '#51483D',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EFEAE0',
    mutedForeground: '#887F73',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#F4E1D8',
    accentForeground: '#9D482C',

    // Destructive actions (delete, error states)
    destructive: '#C9483B',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#E6DED2',
    input: '#E6DED2',
  },

  dark: {
    text: '#F2EDE4',
    tint: '#EE9470',
    background: '#201F1D',
    foreground: '#F2EDE4',
    card: '#2B2926',
    cardForeground: '#F2EDE4',
    primary: '#EE9470',
    primaryForeground: '#271E19',
    secondary: '#393530',
    secondaryForeground: '#E8DED0',
    muted: '#34312D',
    mutedForeground: '#B0A69A',
    accent: '#49342D',
    accentForeground: '#F1B094',
    destructive: '#E47768',
    destructiveForeground: '#2B1714',
    border: '#454039',
    input: '#454039',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 14,
};

export default colors;

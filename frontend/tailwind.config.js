/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Dremio Design System semantic tokens ─────────────────────────────
        // All values match theme.css Layer 2. Hex (not CSS vars) so Tailwind
        // opacity modifiers (bg-primary/50, ring-ring/50, etc.) work in v3.

        background:           '#F6F7F8',
        foreground:           '#202124',
        card:                 '#FFFFFF',
        'card-foreground':    '#202124',
        popover:              '#FFFFFF',
        'popover-foreground': '#202124',

        primary:              '#43B8C9',
        'primary-foreground': '#FFFFFF',

        secondary:            'transparent',
        'secondary-foreground': '#505862',

        muted:                '#EEEFF1',
        'muted-foreground':   '#B0B7BF',

        accent:               '#008489',
        'accent-foreground':  '#FFFFFF',

        destructive:          '#CA3F32',
        'destructive-foreground': '#FFFFFF',
        'destructive-hover':  '#AD3021',

        border:               '#D2D6DA',
        'border-hover':       '#B0B7BF',
        input:                '#FFFFFF',
        'input-background':   '#FFFFFF',
        ring:                 '#2E92A1',

        'background-hover':   '#F1FAFB',
        selected:             '#E9F5F9',
        'selected-hover':     '#C6E9EF',
        'grey-hover':         '#EEEFF1',
        'background-chip':    '#F6F7F8',

        tooltip:              '#32383E',
        'tooltip-foreground': '#FFFFFF',
        'switch-background':  '#D2D6DA',

        'icon-default':       '#505862',
        'icon-disabled':      '#D2D6DA',
        'icon-on-dark':       '#FFFFFF',
        'icon-nav':           '#FFFFFF',
        'icon-hover':         '#008489',

        'status-error':       '#CA3F32',
        'status-warning':     '#FFA940',
        'status-success':     '#5ABD4A',
        'status-info':        '#0684F9',
        'status-error-bg':    '#FDEDED',
        'status-warning-bg':  '#FFF4E5',
        'status-success-bg':  '#EDF7ED',
        'status-info-bg':     '#E9F5F9',

        // Sidebar / left nav (dark panel)
        sidebar:                    '#2A394A',
        'sidebar-foreground':       '#FFFFFF',
        'sidebar-primary':          '#2E92A1',
        'sidebar-primary-foreground': '#FFFFFF',
        'sidebar-accent':           '#485767',
        'sidebar-accent-foreground': '#FFFFFF',
        'sidebar-border':           '#505862',
        'sidebar-ring':             '#2E92A1',

        // Top nav (org bar)
        'nav-org-default': '#101214',
        'nav-org-hover':   '#32383E',

        // ── Legacy TS custom colors → remapped to DS values ──────────────────
        // Existing class names continue to work; values now match the DS palette.

        navy: {
          950: '#101214',  // DS nav-org-default           (was #060d18)
          900: '#2A394A',  // DS sidebar                   (was #0c1929)
          800: '#2A394A',  // DS sidebar                   (was #132035)
          750: '#2A394A',  // DS sidebar                   (was undefined)
          700: '#485767',  // DS sidebar-accent            (was #1a2d47)
          600: '#485767',  // DS sidebar-accent            (was #243d5e)
          500: '#485767',  // DS sidebar-accent            (was #2f5080)
          300: '#505862',  // DS sidebar-border
        },

        dblue: {
          950: '#43B8C9',  // DS primary
          700: '#2E92A1',  // DS sidebar-primary
          600: '#2E92A1',  // DS sidebar-primary           (was #0088e0)
          500: '#43B8C9',  // DS primary                   (was #00a3ff)
          400: '#43B8C9',  // DS primary                   (was #4bb3fd)
          300: '#F1FAFB',  // DS background-hover
          200: '#C6E9EF',  // DS selected-hover
          50:  '#E9F5F9',  // DS selected                  (was #e6f5ff)
        },

        surface: {
          800: '#202124',  // DS foreground
          700: '#505862',  // DS secondary-foreground
          600: '#505862',  // DS secondary-foreground      (was #3d4f66)
          500: '#505862',  // DS secondary-foreground      (was #5a6a82)
          400: '#505862',  // DS secondary-foreground      (was #8f9db5 — now consistent)
          300: '#D2D6DA',  // DS border                    (was #c4cad6)
          200: '#EEEFF1',  // DS muted                     (was #dde1e9)
          100: '#EEEFF1',  // DS grey-hover                (was #eef0f4)
          50:  '#F6F7F8',  // DS background                (was #f7f8fa)
        },

        // Override Tailwind default gray scale → DS grey values
        gray: {
          50:  '#F6F7F8',  // DS --grey-50 / background
          100: '#EEEFF1',  // DS --grey-75 / grey-hover
          200: '#D2D6DA',  // DS --grey-150 / border
          300: '#B0B7BF',  // DS --grey-200 / border-hover
          400: '#B0B7BF',  // DS --grey-200 / muted-foreground
          500: '#505862',  // DS --grey-500 / secondary-foreground
          600: '#505862',  // DS --grey-500 / secondary-foreground
          700: '#202124',  // DS --grey-800 / foreground
          800: '#202124',  // DS --grey-800 / foreground
          900: '#202124',  // DS --grey-800 / foreground
        },
      },

      boxShadow: {
        sm:             '0px 2px 4px rgba(16, 18, 20, 0.1)',
        dropdown:       '4px 4px 16px 0px rgba(16, 18, 20, 0.1)',
        header:         '0px 1px 8px 0px rgba(16, 18, 20, 0.1)',
        footer:         '0px -1px 8px 0px rgba(16, 18, 20, 0.1)',
        'sticky-left':  '1px 0px 8px 0px rgba(16, 18, 20, 0.1)',
        'sticky-right': '-1px 0px 8px 0px rgba(16, 18, 20, 0.1)',
        elevation:      '0px 3px 6px -4px rgba(0,0,0,0.12), 0px 6px 16px 0px rgba(0,0,0,0.08), 0px 9px 28px 8px rgba(0,0,0,0.05)',
      },

      borderRadius: {
        button: '4px',
        card:   '8px',
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

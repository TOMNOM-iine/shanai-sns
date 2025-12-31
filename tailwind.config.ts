import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // アンダーテイル風カラーパレット
        'ut-black': '#000000',
        'ut-white': '#ffffff',
        'ut-gray': '#808080',
        'ut-yellow': '#ffff00',
        'ut-red': '#ff0000',
      },
      fontFamily: {
        'hand': ['Klee One', 'Zen Kurenaido', 'cursive'],
        'pixel': ['DotGothic16', 'monospace'],
      },
      animation: {
        'bounce-slow': 'bounce 2s infinite',
        'pulse-heart': 'pulse 1s ease-in-out infinite',
        'typing': 'typing 0.5s steps(20) forwards',
        'wiggle': 'wiggle 0.3s ease-in-out',
      },
      keyframes: {
        typing: {
          'from': { width: '0' },
          'to': { width: '100%' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-1deg)' },
          '50%': { transform: 'rotate(1deg)' },
        },
      },
      boxShadow: {
        'sketch': '2px 2px 0px #000',
        'sketch-lg': '4px 4px 0px #000',
      },
    },
  },
  plugins: [],
}
export default config

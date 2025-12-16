export default {
  plugins: {
    'postcss-nesting': {},
    ...(process.env.NODE_ENV === 'production' ? {
      cssnano: {
        preset: ['default', {
          discardComments: {
            removeAll: true,
          },
          normalizeWhitespace: true,
          minifyFontValues: true,
          minifySelectors: true,
          normalizeUrl: true,
          minifyParams: true,
        }],
      },
    } : {}),
  },
};


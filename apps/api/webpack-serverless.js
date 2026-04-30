module.exports = (options) => ({
  ...options,
  output: {
    ...options.output,
    filename: 'serverless.js',
    libraryTarget: 'commonjs2',
  },
})

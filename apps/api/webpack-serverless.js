module.exports = (options) => ({
  ...options,
  output: {
    ...options.output,
    filename: 'serverless.js',
    libraryTarget: 'commonjs2',
  },
  externals: [
    function ({ request }, callback) {
      if (request && request.startsWith('@autocrm/')) {
        return callback();
      }
      if (request && !request.startsWith('.') && !request.startsWith('/')) {
        return callback(null, 'commonjs ' + request);
      }
      callback();
    },
  ],
});

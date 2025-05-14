module.exports = {
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:443',
        secure: false
      }
    }
  },
  configureWebpack: {
    devtool: 'source-map'
  },

  publicPath: '/'
}
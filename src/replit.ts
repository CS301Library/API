import Run from './runner'

if (require.main === module) {
  void Run('http_port=8080', 'debug=true')
}

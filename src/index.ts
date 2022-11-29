import * as API from './API'
import Run from './runner'

export * from './API'
export default API

if (require.main === module) {
  void Run(...process.argv.slice(2))
}

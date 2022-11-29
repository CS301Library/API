import FS from 'fs'
import Path from 'path'
import HTTP from 'http'

import { DatabaseCredentials, Server, ServerOptions } from './core/server'

const Run = async (...args: string[]): Promise<void> => {
  const options: Partial<ServerOptions> = {}
  const credentials: DatabaseCredentials = JSON.parse(FS.readFileSync(Path.join(process.cwd(), 'db-creds.json')).toString('utf-8'))

  let httpPort: number | undefined
  // let httpsPort: number | undefined

  for (let i = 0; i < args.length; i++) {
    const [name, ...value] = args[i].split('=')

    switch (name.toLowerCase()) {
      case 'max_connections':
        options.maxConnections = Number(value.join('='))
        break

      case 'max_borrowed_books':
        options.maxBorrowedBooks = Number(value.join('='))
        break

      case 'debug':
        options.debug = value.join('=') === 'true'
        break

      case 'http_port':
        httpPort = Number(value.join('='))
        break
    }
  }

  const server = new Server(credentials, options)
  await server.startup()
  console.log('Server started')

  const httpListener = HTTP.createServer(server.express)
  if (httpPort != null) {
    httpListener.listen(httpPort)
    console.log(`Server is listening on port ${httpPort}`)
  }
}

export default Run

import HTTP from 'http'

import { Server } from './core/server'

const run = async (): Promise<void> => {
  const server = new Server({
    host: process.env.host as string,
    username: process.env.username as string,
    password: process.env.password as string,
    dbName: process.env.db_name as string
  }, { paginatedSizeLimit: 500 })

  await server.startup()
  const listener = HTTP.createServer(server.express)
  listener.listen(8080)
}

void run()

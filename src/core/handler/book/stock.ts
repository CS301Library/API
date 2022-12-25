import Express from 'express'

import { Handler, HandlerReturn } from '../../handler'
import { Stock } from '../../resource'

export const handler = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { pathArray, auth, method } = request
  const { resources: { Book, Stock }, server: { options: { paginatedSizeLimit, idLength } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  } else if (['POST', 'PATCH', 'DELETE'].includes(method) && (!auth.account.isAdmin)) {
    return main.errorStatus(403, 'RoleInvalid')
  }

  const bookId = pathArray[1]
  const book = await Book.findOne({ id: bookId })
  if (book == null) {
    return main.errorStatus(404, 'BookNotFound')
  }

  switch (method) {
    case 'DELETE': {
      const stockId = pathArray[3]
      if (typeof (stockId) !== 'string') {
        return main.errorStatus(400, 'RequestInvalid')
      }

      const stock = await Stock.findOne({ id: stockId, bookId })
      if (stock == null) {
        return main.errorStatus(404, 'StockNotFound')
      }

      await stock.delete()
      return main.okStatus(200)
    }

    case 'POST': {
      const { body: { damaged, lost } } = request
      if (
        ((damaged != null) && (typeof (damaged) !== 'boolean')) ||
        ((lost != null) && (typeof lost) !== 'boolean')
      ) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      const stock = new Stock({
        bookId,
        damaged: damaged ?? false,
        lost: lost ?? false
      })

      await stock.save()
      return main.okStatus(200, stock.id)
    }

    case 'PATCH': {
      break
    }

    case 'GET': {
      const stockId = pathArray[3]
      if (stockId != null) {
        const stock = await Stock.findOne({ id: stockId, bookId })

        if (stock == null) {
          return main.errorStatus(404, 'StockNotFound')
        }

        return main.okStatus(200, main.leanObject(stock))
      }

      // const { query: { offset, afterId, damaged, lost } } = request
      // const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
      // const list: Stock[] = []

      // let count = 0
      // let skipId = true
      // for await (const stock of Stock.findOne({ bookId })) {
      // }
      break
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}

import RandomEssentials from '@rizzzi/random-essentials'
import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { BookItem, Borrow, ResourceDocument } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { pathArray, auth, method } = request
  const { resources: { Book, BookItem, Borrow, BorrowInfo }, server: { options: { idLength } } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  } else if (!['POST', 'GET'].includes(method)) {
    return main.errorStatus(405, 'RequestInvalid')
  }

  switch (method) {
    case 'GET': {
      const borrowId = pathArray[1]
      if (borrowId != null) {
        const borrow = await Borrow.findOne({ id: borrowId })
        if (borrow == null) {
          return main.errorStatus(404, 'BorrowNotFound')
        } else if ((borrow.accountId !== auth.account.id) && (!auth.account.isAdmin)) {
          return main.errorStatus(400, 'RoleInvalid')
        }

        return main.okStatus(200, main.leanObject(borrow))
      }

      const { query: { pending: pendingStr } } = request
      const pending = pendingStr === 'true' ? true : pendingStr === 'false' ? false : undefined
      const list: Borrow[] = []
      for await (const borrow of Borrow.find({ returnInfoId: null, ...auth.account.isAdmin ? { accountId: auth.account.id } : {} })) {
        if ((pending != null) || (pending !== borrow.pending)) {
          continue
        }

        list.push(main.leanObject(borrow))
      }

      return main.okStatus(200, list)
    }

    case 'POST': {
      switch (pathArray[3]) {
        case 'borrow': {
          const { body: { bookId } } = request
          const pendingBorrows = await Borrow.find({ returnInfoId: null, pending: false, accountId: auth.account.id })

          if (pendingBorrows.length >= 3) {
            return main.errorStatus(400, 'BorrowLimitExceeded')
          }

          for (const pendingBorrow of pendingBorrows) {
            if ((await BookItem.findOne({ id: pendingBorrow.bookItemId }))?.bookId === bookId) {
              return main.errorStatus(400, 'BorrowExists')
            }
          }

          const book = await Book.findOne({ id: bookId })
          if (book == null) {
            return main.errorStatus(404, 'BookNotFound')
          }

          const bookItems: Array<ResourceDocument<BookItem>> = []
          for await (const bookItem of BookItem.findOne({ bookId, lost: false })) {
            const pendingBookItemBorrow = await Borrow.find({ returnInfoId: null, pending: false, bookItemId: bookItem.id })

            if (pendingBookItemBorrow.length === 0) {
              bookItems.push(bookItem)
            }
          }

          if (bookItems.length === 0) {
            return main.errorStatus(400, 'BorrowNoBookItemAvailable')
          }

          const borrowId = await RandomEssentials.randomHex(idLength, { checker: async (id) => await Borrow.exists({ id }) == null })
          const borrowSendInfoId = await RandomEssentials.randomHex(idLength, { checker: async (id) => await BorrowInfo.exists({ id }) == null })
          const sendInfo = new Borrow({
            id: borrowSendInfoId,
            createTime: Date.now(),
            borrowId
          })

          const borrow = new Borrow({
            id: borrowId,
            createTime: Date.now(),
            bookItemId: bookItems.find((bookItem) => !bookItem.damaged) ?? bookItems[0],
            accountId: auth.account.id,
            pending: true,
            sendInfoId: borrowSendInfoId
          })

          await borrow.save()
          await sendInfo.save()

          return main.okStatus(200)
        }

        // case 'accept-borrow': {
        //   const {} = request
        // }

        default: return main.errorStatus(400, 'RequestInvalid')
      }
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}

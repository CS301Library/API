import RandomEssentials from '@rizzzi/random-essentials'
import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { AccountRole, BookItem, Borrow, BorrowStatus, ResourceDocument } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { auth, method, pathArray } = request
  const { resources: { Borrow, Book, Account, BookItem }, server: { options: { idLength, paginatedSizeLimit } } } = main

  if (auth == null) {
    return main.errorStatus(400, 'AuthRequired')
  } else if (['PATCH'].includes(method) && (auth.account.role === AccountRole.User)) {
    return main.errorStatus(403, 'RoleInvalid')
  }

  switch (method) {
    case 'GET': {
      const borrowId = pathArray[1]
      if (borrowId != null) {
        const borrow = await Borrow.findOne({ id: borrowId })
        if (borrow == null) {
          return main.errorStatus(404, 'BorrowNotFound')
        } else if ((auth.account.id !== borrow.accountId) && (auth.account.role === AccountRole.User)) {
          return main.errorStatus(403, 'RoleInvalid')
        }

        return main.okStatus(200, main.leanObject(borrow))
      }

      const { query: { accountId, filterUsername, afterId, offset, pastDue: pastDueStr, status: statusStr } } = request
      const start = ((offset: number) => Number.isNaN(offset) ? 0 : offset)(offset != null ? Number(offset) : Number.NaN)
      const list: Borrow[] = []

      let count = 0
      let skipId = true
      const filter: Partial<Borrow> = {}

      if (auth.account.role !== AccountRole.User) {
        if (typeof (accountId) === 'string') {
          filter.accountId = accountId
        }

        if (typeof (filterUsername) === 'string') {
          const account = await Account.findOne({ username: filterUsername.toLowerCase() })
          filter.accountId = account?.id ?? ''
        }
      } else {
        filter.accountId = auth.account.id
      }

      const status = (() => {
        if (statusStr != null) {
          switch (statusStr) {
            case 'pending': return BorrowStatus.Pending
            case 'borrowed': return BorrowStatus.Borrowed
            case 'returned': return BorrowStatus.Returned
          }
        }
      })()
      const pastDue = (() => {
        if (pastDueStr != null) {
          switch (pastDueStr) {
            case 'true': return true
            case 'false': return false
          }
        }
      })()

      for await (const borrow of Borrow.find(filter)) {
        console.log(borrow.status, status)
        if ((afterId != null) && skipId) {
          if (borrow.id === afterId) {
            skipId = false
          }

          continue
        } else if (
          (
            (status != null)
              ? (status !== borrow.status)
              : (borrow.status === BorrowStatus.Returned)
          ) ||
          (
            (pastDue != null) &&
            (
              (pastDue && (borrow.dueTime > Date.now())) ||
              ((!pastDue) && (borrow.dueTime < Date.now()))
            )
          )
        ) {
          continue
        }

        if (start <= count) {
          list.push(main.leanObject(borrow))
        }
        if (list.length >= paginatedSizeLimit) {
          break
        }
        count++
      }

      return main.okStatus(200, list)
    }

    case 'PATCH': {
      const borrowId = pathArray[1]
      if (borrowId == null) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      const borrow = await Borrow.findOne({ id: borrowId })
      if (borrow == null) {
        return main.errorStatus(404, 'BorrowNotFound')
      }

      const { body: { status } } = request
      if ((status != null) && ((typeof (status) !== 'number') || (BorrowStatus[status]) == null)) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      if (status != null) {
        borrow.status = status
      }

      await borrow.save()
      return main.okStatus(200)
    }

    case 'PUT': {
      const { body: { accountId, bookId, dayDuration } } = request
      if (
        (typeof (accountId) !== 'string') ||
        (typeof (bookId) !== 'string') ||
        (typeof (dayDuration) !== 'number')
      ) {
        return main.errorStatus(400, 'ParametersInvalid')
      }

      const account = await Account.findOne({ id: accountId })
      if (account == null) {
        return main.errorStatus(404, 'AccountNotFound')
      } else if ((accountId !== auth.account.id) && (auth.account.role === AccountRole.User)) {
        return main.errorStatus(403, 'RoleInvalid')
      }
      const book = await Book.findOne({ id: bookId })
      if (book == null) {
        return main.errorStatus(404, 'BookNotFound')
      } else if ((dayDuration > 7) || (dayDuration < 1)) {
        return main.errorStatus(400, 'BorrowDueTimeLimit')
      }

      const borrows = await Borrow.find({ accountId: account.id })
      let nonReturnedItems = 0
      for (const borrow of borrows) {
        if (borrow.status === BorrowStatus.Returned) {
          continue
        }

        if (borrow.bookId === book.id) {
          return main.errorStatus(400, 'BookAlreadyBorrowed')
        }

        nonReturnedItems++
      }
      if (nonReturnedItems >= 5) {
        return main.errorStatus(400, 'BorrowLimit')
      }

      const bookItems: Array<ResourceDocument<BookItem>> = []
      for await (const bookItem of BookItem.find({ bookId })) {
        if (bookItem.lost) {
          continue
        }

        let available = true

        for await (const borrow of Borrow.find({ bookItemId: bookItem.id })) {
          if (borrow.status === BorrowStatus.Borrowed) {
            available = false
            break
          }
        }

        if (available) {
          bookItems.push(bookItem)
        }
      }

      if (bookItems.length < 1) {
        return main.errorStatus(404, 'BorrowNoBookItemAvailable')
      }

      const borrow = new Borrow({
        id: await RandomEssentials.randomHex(idLength, { checker: async (id) => await Borrow.exists({ id }) == null }),
        createTime: Date.now(),
        accountId,
        bookId,
        bookItemId: bookItems[0].id,
        dueTime: Date.now() + (1000 * 60 * 60 * 24 * dayDuration),
        status: BorrowStatus.Pending
      })

      await borrow.save()
      return main.okStatus(200, borrow.id)
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}

import Express from 'express'

import { Handler, HandlerReturn } from '../handler'
import { Account, AccountRole, Book, BorrowStatus } from '../resource'

export const handle = async (main: Handler, request: Express.Request, response: Express.Response): Promise<HandlerReturn> => {
  const { auth, method, pathArray } = request
  const { resources: { Account, Borrow, Book } } = main

  if (auth == null) {
    return main.errorStatus(401, 'AuthRequired')
  }

  switch (method) {
    case 'GET': {
      switch (pathArray[1] ?? '') {
        case 'greet': {
          const borrowedBooksToday = await Borrow.count({ status: BorrowStatus.Borrowed, createTime: { $gt: (new Date(new Date().toISOString().slice(0, 10)).getTime()) } })
          const topBorrowedBooksMap: Map<string, number> = new Map()

          for await (const borrow of Borrow.find({ createTime: { $gt: Date.now() - (1000 * 60 * 60 * 24 * 30) } })) {
            topBorrowedBooksMap.set(borrow.bookId, (topBorrowedBooksMap.get(borrow.bookId) ?? 0) + 1)
          }

          const topBorrowedBooks: Array<[Book, number]> = []
          for (const [id, count] of Array.from(topBorrowedBooksMap.entries()).sort((a, b) => b[1] - a[1])) {
            const book = await Book.findOne({ id })
            if (book == null) {
              continue
            }
            topBorrowedBooks.push([main.leanObject(book), count])
            if (topBorrowedBooks.length >= 10) {
              break
            }
          }

          return main.okStatus(200, {
            borrowedBooksToday,
            topBorrowedBooks
          })
        }

        case '': {
          if (auth.account.role === AccountRole.User) {
            return main.errorStatus(403, 'RoleInvalid')
          }

          const accounts: Account[] = []

          for await (const account of Account.find({ $nor: [{ role: AccountRole.User }] })) {
            accounts.push(main.leanObject(account))
          }

          return main.okStatus(200, accounts)
        }

        default: return main.errorStatus(400, 'RequestInvalid')
      }
    }

    case 'POST': {
      if (auth.account.role !== AccountRole.PrimaryAdmin) {
        return main.errorStatus(403, 'RoleInvalid')
      }

      const { body: { accountId } } = request
      if (typeof (accountId) !== 'string') {
        return main.errorStatus(400, 'ParametersInvalid')
      }
      const account = await Account.findOne({ id: accountId })
      if (account == null) {
        return main.errorStatus(404, 'AccountNotFound')
      }

      switch (pathArray[1]) {
        case 'set-role': {
          const { body: { role } } = request
          if ((typeof (role) !== 'number') || (AccountRole[role] == null)) {
            return main.errorStatus(400, 'ParametersInvalid')
          }

          account.role = role
          await account.save()
          return main.okStatus(200)
        }

        default: return main.errorStatus(400, 'RequestInvalid')
      }
    }

    default: return main.errorStatus(405, 'RequestInvalid')
  }
}

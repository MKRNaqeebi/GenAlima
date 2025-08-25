
type PaginationFooterProps = {
  hasNextPage?: boolean
  hasPreviousPage?: boolean
  onChangePage: (newPage: number) => void
  page: number
}

export function PaginationFooter({
  hasNextPage,
  hasPreviousPage,
  onChangePage,
  page,
}: PaginationFooterProps) {
  return (
    <div className="flex items-center justify-end space-x-4 mt-4">
      <button
        onClick={() => onChangePage(page - 1)}
        disabled={!hasPreviousPage || page <= 1}
        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      <span className="text-gray-700 dark:text-gray-300">Page {page}</span>
      <button
        disabled={!hasNextPage}
        onClick={() => onChangePage(page + 1)}
        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
    </div>
  )
}

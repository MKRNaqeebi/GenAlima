import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

import { ItemsService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import Navbar from "../../components/Common/Navbar"
import AddItem from "../../components/Items/AddItem"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const itemsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  validateSearch: (search) => itemsSearchSchema.parse(search),
})

const PER_PAGE = 5

function getItemsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ItemsService.readItems({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["items", { page }],
  }
}

function ItemsTable() {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: items,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getItemsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && items?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getItemsQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto text-sm md:text-base">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          {isPending ? (
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                {new Array(4).fill(null).map((_, index) => (
                  <td key={index} className="px-4 py-4">
                    <div className="animate-pulse h-4 bg-gray-200 rounded"></div>
                  </td>
                ))}
              </tr>
            </tbody>
          ) : (
            <tbody className="bg-white divide-y divide-gray-200">
              {items?.data.map((item) => (
                <tr 
                  key={item.id} 
                  className={`hover:bg-gray-50 ${isPlaceholderData ? 'opacity-50' : 'opacity-100'}`}
                >
                  <td className="px-4 py-4 whitespace-nowrap text-gray-900">{item.id}</td>
                  <td className="px-4 py-4 whitespace-nowrap truncate max-w-[150px] text-gray-900">
                    {item.title}
                  </td>
                  <td className={`px-4 py-4 whitespace-nowrap truncate max-w-[150px] ${
                    !item.description ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {item.description || "N/A"}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <ActionsMenu type={"Item"} value={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      <PaginationFooter
        page={page}
        onChangePage={setPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </>
  )
}

function Items() {
  return (
    <div className="max-w-full mx-auto px-4">
      <h1 className="text-2xl font-bold text-center md:text-left pt-12 mb-6">
        Items Management
      </h1>

      <Navbar type={"Item"} addModalAs={AddItem} />
      <ItemsTable />
    </div>
  )
}

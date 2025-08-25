import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

import { type UserPublic, UsersService } from "../../client"
import AddUser from "../../components/Admin/AddUser"
import ActionsMenu from "../../components/Common/ActionsMenu"
import Navbar from "../../components/Common/Navbar"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"

const usersSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  validateSearch: (search) => usersSearchSchema.parse(search),
})

const PER_PAGE = 5

function getUsersQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      UsersService.readUsers({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["users", { page }],
  }
}

function UsersTable() {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: {[key: string]: string}) => ({ ...prev, page }) })

  const {
    data: users,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getUsersQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && users?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getUsersQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto text-sm md:text-base">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-1/5 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Full name</th>
              <th className="w-1/2 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="w-1/10 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="w-1/10 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="w-1/10 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          {isPending ? (
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                {new Array(5).fill(null).map((_, index) => (
                  <td key={index} className="px-4 py-4">
                    <div className="animate-pulse h-4 bg-gray-200 rounded"></div>
                  </td>
                ))}
              </tr>
            </tbody>
          ) : (
            <tbody className="bg-white divide-y divide-gray-200">
              {users?.data.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className={`px-4 py-4 whitespace-nowrap truncate max-w-[150px] ${!user.full_name ? 'text-gray-400' : 'text-gray-900'}`}>
                    {user.full_name || "N/A"}
                    {currentUser?.id === user.id && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                        You
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap truncate max-w-[150px] text-gray-900">
                    {user.email}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-gray-900">{user.is_superuser ? "Superuser" : "User"}</td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-green-400' : 'bg-red-400'}`}
                      />
                      <span className="text-gray-900">{user.is_active ? "Active" : "Inactive"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <ActionsMenu
                      type="User"
                      value={user}
                      disabled={currentUser?.id === user.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      <PaginationFooter
        onChangePage={setPage}
        page={page}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </>
  )
}

function Admin() {
  return (
    <div className="max-w-full mx-auto px-4">
      <h1 className="text-2xl font-bold text-center md:text-left pt-12 mb-6">
        Users Management
      </h1>

      <Navbar type={"User"} addModalAs={AddUser} />
      <UsersTable />
    </div>
  )
}

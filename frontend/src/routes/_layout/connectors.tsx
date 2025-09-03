import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { 
  FiSearch, 
  FiGrid, 
  FiZap,
  FiPlus,
  FiCheck,
  FiLink
} from "react-icons/fi"

import { ConnectorsService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"
import AddConnector from "../../components/Connectors/AddConnector"

const connectorsSearchSchema = z.object({
  page: z.number().catch(1),
})

export const Route = createFileRoute("/_layout/connectors")({
  component: Connectors,
  validateSearch: (search) => connectorsSearchSchema.parse(search),
})

const PER_PAGE = 12

function getConnectorsQueryOptions({ page }: { page: number }) {
  return {
    queryFn: () =>
      ConnectorsService.readConnectors({ skip: (page - 1) * PER_PAGE, limit: PER_PAGE }),
    queryKey: ["connectors", { page }],
  }
}

function ConnectorCard({ connector }: { connector: any }) {
  const handleConnect = () => {
    if (connector.meta_data?.auth === 'OAuth2' && connector.meta_data?.url) {
      window.location.href = connector.meta_data.url
    }
  }
  console.log("Connector:", connector, connector.id)

  return (
    <div className="bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-lg transition-all duration-200">
      <div className="p-6">
        <div className="flex flex-col items-start space-y-4">
          <div className="flex justify-between items-start w-full">
            <div className="flex items-center space-x-3">
              <FiZap className="w-5 h-5 text-blue-600" />
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {connector.name || 'Connector'}
              </span>
            </div>
            <ActionsMenu type="Connector" value={connector} />
          </div>
          <div className="flex flex-col items-start space-y-3 w-full">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {connector.description || 'No description'}
            </p>
            {/* Connection Status and Action Button */}
            <div className="flex items-center justify-between w-full">
              {connector.function ? (
                <div className="flex items-center space-x-2">
                  <FiCheck className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">Connected</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                >
                  <FiLink className="w-4 h-4" />
                  <span>Connect</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConnectorsGrid({ searchQuery }: { searchQuery: string }) {
  const queryClient = useQueryClient()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setPage = (page: number) =>
    navigate({ search: (prev: any) => ({ ...prev, page }) })

  const {
    data: connectors,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getConnectorsQueryOptions({ page }),
    placeholderData: (prevData) => prevData,
  })

  const hasNextPage = !isPlaceholderData && connectors?.data.length === PER_PAGE
  const hasPreviousPage = page > 1

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getConnectorsQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  const filteredConnectors = (connectors?.data || []).filter((connector: any) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    const title = (connector.title || '').toLowerCase()
    return title.includes(query)
  })

  if (isPending) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="p-6">
              <div className="flex flex-col items-start space-y-4">
                <div className="animate-pulse h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/5"></div>
                <div className="animate-pulse space-y-2 w-full">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {filteredConnectors.map((connector: any) => (
          <ConnectorCard key={connector.id} connector={connector} />
        ))}
      </div>
      
      {filteredConnectors.length === 0 && !isPending && (
        <div className="flex justify-center items-center py-16">
          <div className="flex flex-col items-center space-y-4">
            <FiGrid className="w-16 h-16 text-gray-400 dark:text-gray-600" />
            <h3 className="text-xl text-gray-900 dark:text-white">
              {searchQuery.trim() ? "No matching connectors found" : "No connectors yet"}
            </h3>
            <p className="text-center text-gray-600 dark:text-gray-400">
              {searchQuery.trim() 
                ? "Try adjusting your search query" 
                : "Create your first connector to get started"}
            </p>
          </div>
        </div>
      )}

      <PaginationFooter
        page={page}
        onChangePage={setPage}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
      />
    </>
  )
}

function Connectors() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-chat-bg pb-8 w-full transition-colors">
      <div className="px-8 pt-8 w-full">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col items-start space-y-6">
            <div className="flex justify-between items-start w-full">
              <div className="flex flex-col items-start space-y-2">
                <div className="flex items-center space-x-3">
                  <FiGrid className="w-8 h-8 text-blue-600" />
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    Connectors
                  </h1>
                </div>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  Manage your connector integrations
                </p>
              </div>
              <button
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                onClick={() => setIsAddOpen(true)}
              >
                <FiPlus className="w-4 h-4" />
                <span>Add Connector</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="w-full bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="p-4">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FiSearch className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search connectors..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border-0 focus:ring-0 focus:outline-none text-base bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <ConnectorsGrid searchQuery={searchQuery} />
        
        <AddConnector 
          isOpen={isAddOpen} 
          onClose={() => setIsAddOpen(false)} 
        />
      </div>
    </div>
  )
}
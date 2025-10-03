import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { z } from "zod"
import { 
  FiGrid, 
  FiZap,
  FiCheck,
  FiLink
} from "react-icons/fi"

import { ConnectorsService } from "../../client"
import ActionsMenu from "../../components/Common/ActionsMenu"
import { PaginationFooter } from "../../components/Common/PaginationFooter.tsx"
import useCustomToast from "../../hooks/useCustomToast"

const connectorsSearchSchema = z.object({
  page: z.number().catch(1),
  outlook_auth: z.string().optional(),
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
  // Check if this is an Outlook connector
  const isOutlook = connector.name.toLowerCase() === 'outlook';
  
  // Determine if the connector is connected based on actual data
  // For Outlook: check if meta_data has email or display_name (indicates it's connected)
  // For other connectors: check if function exists
  const isConnected = isOutlook ? 
    Boolean(connector.meta_data && (connector.meta_data.email || connector.meta_data.display_name)) :
    Boolean(connector.function);
  
  // Set user info if the connector is connected and has metadata
  const userInfo = isConnected && isOutlook && connector.meta_data ? {
    email: connector.meta_data.email || undefined,
    display_name: connector.meta_data.display_name || undefined
  } : null;
    
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
              {isConnected ? (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center space-x-2">
                    <FiCheck className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Connected</span>
                  </div>
                  {/* Show any available user information */}
                  {userInfo && (userInfo.display_name || userInfo.email) && (
                    <div className="text-xs text-gray-500">
                      {userInfo.display_name || userInfo.email}
                    </div>
                  )}
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

function ConnectorsGrid() {
  const queryClient = useQueryClient()
  const { page, outlook_auth } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const showToast = useCustomToast()
  const [isConnecting, setIsConnecting] = useState(false)
  
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

  // Handle Outlook OAuth callback
  useEffect(() => {
    const handleOutlookCallback = async () => {
      if (outlook_auth === 'success' && !isConnecting) {
        setIsConnecting(true)
        try {
          // Get the auth token from localStorage
          const token = localStorage.getItem("access_token")
          
          // Call the connect endpoint to save the connector
          const response = await fetch('/api/v1/outlook/connect', {
            method: 'POST',
            credentials: 'include', // Important for session cookies
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`, // Add authentication token
            },
          })
          
          if (response.ok) {
            const data = await response.json()
            showToast("Success", `Outlook connected: ${data.email}`, "success")
            // Refresh the connectors list
            queryClient.invalidateQueries({ queryKey: ["connectors"] })
          } else {
            const error = await response.json()
            showToast("Error", error.detail || "Failed to connect Outlook", "error")
          }
        } catch (error) {
          showToast("Error", "Failed to connect Outlook account", "error")
          console.error("Error connecting Outlook:", error)
        } finally {
          setIsConnecting(false)
          // Remove the outlook_auth parameter from URL
          navigate({ search: { page } })
        }
      }
    }
    
    handleOutlookCallback()
  }, [outlook_auth, isConnecting, showToast, queryClient, navigate, page])

  useEffect(() => {
    if (hasNextPage) {
      queryClient.prefetchQuery(getConnectorsQueryOptions({ page: page + 1 }))
    }
  }, [page, queryClient, hasNextPage])

  const filteredConnectors = connectors?.data || []

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
              No connectors yet
            </h3>
            <p className="text-center text-gray-600 dark:text-gray-400">
              Available connectors will appear here
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
  return (
    <div className="h-screen bg-gray-50 dark:bg-chat-bg w-full transition-colors flex flex-col overflow-hidden">
      <div className="px-8 pt-8 w-full flex-1 flex flex-col overflow-hidden">
        {/* Header Section - Fixed */}
        <div className="mb-6 flex-shrink-0">
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
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto pb-8">
          <ConnectorsGrid />
        </div>
      </div>
    </div>
  )
}
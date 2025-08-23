import { Link, useRouterState } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  FiEdit, FiSearch, FiArchive, FiGrid
} from "react-icons/fi"
import { PiSparkle } from "react-icons/pi"
import { AiOutlineLoading3Quarters } from "react-icons/ai"
import { useState } from "react"
import {v4} from "uuid"
import { ChatsService } from "../../client"

interface SidebarItemsProps {
  onClose?: () => void
  isCollapsed?: boolean
}

const topMenuItems = [
  { icon: FiEdit, label: "New chat", action: "new" },
  { icon: FiSearch, label: "Search chats", action: "search" },
  { icon: FiArchive, label: "Knowledges", path: "/knowledges" },
  { icon: PiSparkle, label: "Templates", path: "/templates" },
  { icon: FiGrid, label: "Connectors", path: "/connectors" },
]

const SidebarItems = ({ onClose, isCollapsed = false }: SidebarItemsProps) => {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  // Fetch all chats from API
  const { data: chatsData, isLoading, error } = useQuery({
    queryKey: ["all-chats"],
    queryFn: () => ChatsService.readChats({ skip: 0, limit: 100 }), // Fetch up to 100 chats
  })

  const handleTopMenuClick = (action: string) => {
    if (action === "new") {
      window.location.href = `/chat/${v4()}`
      onClose?.()
    } else if (action === "search") {
      setSearchOpen(!searchOpen)
    }
  }

  const chats = chatsData?.data || []
  const filteredChats = chats.filter(chat => 
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col space-y-0 h-full">
      {/* Top Menu Items */}
      <div className={`flex flex-col space-y-0.5 ${isCollapsed ? 'px-1' : 'px-2'} py-2`}>
        {topMenuItems.map((item) => {
          const isActive = item.path ? currentPath === item.path : 
                          item.activePath ? currentPath === item.activePath : false
          
          return item.path ? (
            <Link
              key={item.label}
              to={item.path}
              className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-start px-3'} py-2.5 rounded-md text-sm transition-all duration-150 hover:no-underline ${
                isActive 
                  ? 'bg-gray-200 dark:bg-chat-hover text-gray-900 dark:text-chat-text-primary font-medium' 
                  : 'text-gray-700 dark:text-chat-text-secondary hover:bg-gray-100 dark:hover:bg-chat-hover hover:text-gray-900 dark:hover:text-chat-text-primary'
              }`}
              onClick={onClose}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={`w-4 h-4 ${
                isActive 
                  ? 'text-gray-900 dark:text-chat-text-primary' 
                  : 'text-gray-600 dark:text-chat-text-muted'
              }`} />
              {!isCollapsed && <span className="ml-3">{item.label}</span>}
            </Link>
          ) : (
            <button
              key={item.label}
              className={`flex items-center w-full text-left ${isCollapsed ? 'justify-center px-2' : 'justify-start px-3'} py-2.5 rounded-md text-sm transition-all duration-150 ${
                isActive 
                  ? 'bg-gray-200 dark:bg-chat-hover text-gray-900 dark:text-chat-text-primary font-medium' 
                  : 'text-gray-700 dark:text-chat-text-secondary hover:bg-gray-100 dark:hover:bg-chat-hover hover:text-gray-900 dark:hover:text-chat-text-primary'
              }`}
              onClick={() => handleTopMenuClick(item.action!)}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={`w-4 h-4 ${
                isActive 
                  ? 'text-gray-900 dark:text-chat-text-primary' 
                  : 'text-gray-600 dark:text-chat-text-muted'
              }`} />
              {!isCollapsed && <span className="ml-3">{item.label}</span>}
            </button>
          )
        })}
      </div>

      {/* Search Input (appears when search is clicked) */}
      {searchOpen && !isCollapsed && (
        <div className="px-2 pb-2">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-chat-text-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-sm bg-gray-100 dark:bg-chat-surface border border-gray-300 dark:border-chat-border rounded-md text-gray-900 dark:text-chat-text-secondary placeholder-gray-500 dark:placeholder-chat-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {!isCollapsed && <hr className="border-gray-300 dark:border-chat-border" />}

      {/* Chats Section */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <p className="text-xs font-semibold text-gray-600 dark:text-chat-text-muted px-3 pb-2">
            Chats
          </p>
          <div className="flex flex-col space-y-0.5">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <AiOutlineLoading3Quarters className="animate-spin w-4 h-4 text-gray-500 dark:text-chat-text-muted" />
              </div>
            ) : error ? (
              <p className="text-xs text-gray-600 dark:text-chat-text-muted px-3">
                Failed to load chats
              </p>
            ) : filteredChats.length === 0 ? (
              <p className="text-xs text-gray-600 dark:text-chat-text-muted px-3">
                {searchQuery ? "No chats found" : "No chats yet"}
              </p>
            ) : (
              filteredChats.map((chat) => {
                const isChatActive = currentPath === `/chat/${chat.id}`
                return (
                  <Link
                    key={chat.id}
                    to={`/chat/${chat.id}`}
                    className={`flex items-center px-3 py-2 rounded-md text-sm transition-all duration-150 hover:no-underline truncate ${
                      isChatActive 
                        ? 'bg-gray-200 dark:bg-chat-hover text-gray-900 dark:text-chat-text-primary font-medium' 
                        : 'text-gray-700 dark:text-chat-text-secondary hover:bg-gray-100 dark:hover:bg-chat-hover hover:text-gray-900 dark:hover:text-chat-text-primary'
                    }`}
                    onClick={onClose}
                  >
                    <span className="truncate w-full">{chat.title}</span>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SidebarItems
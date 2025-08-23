import { useState, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { FiLogOut, FiMenu, FiUser, FiChevronLeft, FiX, FiSettings, FiHelpCircle, FiZap, FiEdit3, FiMail } from "react-icons/fi"

import type { UserPublic } from "../../client"
import useAuth from "../../hooks/useAuth"
import SidebarItems from "./SidebarItems"

const Sidebar = () => {
  const queryClient = useQueryClient()
  const currentUser = queryClient.getQueryData<UserPublic>(["currentUser"])
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const { logout } = useAuth()
  const sidebarRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  
  // Handle outside click for mobile drawer
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    
    if (isOpen || isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, isUserMenuOpen])
  
  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const handleLogout = async () => {
    logout()
  }

  const handleSettingsClick = () => {
    setIsUserMenuOpen(false)
    navigate({ to: '/settings' })
  }

  return (
    <>
      {/* Desktop */}
      <div
        className={`hidden md:flex flex-col bg-white dark:bg-chat-sidebar border-r border-gray-200 dark:border-chat-border h-screen transition-all duration-200 ease-in-out ${
          isCollapsed ? 'w-15' : 'w-[259px]'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo Section */}
          <div className={`flex items-center px-3 py-4 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isCollapsed && (
              <div className="text-lg font-semibold text-gray-900 dark:text-chat-text-primary">
                GenAlima
              </div>
            )}
            <button 
              className="w-8 h-8 border border-gray-300 dark:border-chat-border rounded-md flex items-center justify-center cursor-pointer hover:bg-gray-100 dark:hover:bg-chat-hover transition-all duration-150"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <FiMenu className="w-4 h-4 text-gray-600 dark:text-chat-text-secondary" />
              ) : (
                <FiChevronLeft className="w-4 h-4 text-gray-600 dark:text-chat-text-secondary" />
              )}
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto">
            <SidebarItems isCollapsed={isCollapsed} />
          </div>
          
          {/* User Profile Section */}
          {currentUser?.email && (
            <div className="border-t border-gray-200 dark:border-chat-border p-2">
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className={`w-full ${isCollapsed ? 'px-1' : 'px-2'} py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-150`}
                >
                  <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-white">
                        {currentUser.email.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {!isCollapsed && (
                      <div className="text-left flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {currentUser.full_name || currentUser.email.split('@')[0]}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Free
                        </p>
                      </div>
                    )}
                  </div>
                </button>
                {isUserMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-60 bg-white dark:bg-[#2f2f2f] border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl py-2 z-50">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-2">
                        <FiMail className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{currentUser.email}</span>
                      </div>
                    </div>
                    
                    <div className="py-1">
                      <button 
                        disabled
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed transition-colors"
                      >
                        <FiZap className="w-4 h-4" />
                        <span>Upgrade plan</span>
                      </button>
                      
                      <button 
                        disabled
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed transition-colors"
                      >
                        <FiEdit3 className="w-4 h-4" />
                        <span>Customize GenAlima</span>
                      </button>
                      
                      <button 
                        onClick={handleSettingsClick}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <FiSettings className="w-4 h-4" />
                        <span>Settings</span>
                      </button>
                      
                      <button 
                        disabled
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed transition-colors"
                      >
                        <FiHelpCircle className="w-4 h-4" />
                        <span>Help</span>
                        <FiChevronLeft className="w-3 h-3 ml-auto rotate-180 text-gray-400" />
                      </button>
                    </div>
                    
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-1">
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <FiLogOut className="w-4 h-4" />
                        <span>Log out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Sidebar